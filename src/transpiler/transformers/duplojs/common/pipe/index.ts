import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { convertToType, transformCheckerType } from "../../../type/union";
import { bindOnce } from "../../either/isRight";

/**
 * `DCommon.pipe(input, step1, step2…)` → `step2(step1(input))`.
 *
 * Comme en JS, tous les arguments (l'entrée puis chaque étape) sont évalués une fois,
 * dans l'ordre, avant le premier appel : chacun est rangé dans une variable s'il n'est
 * pas un simple identifiant. Une étape peut être n'importe quelle fonction : référence,
 * fonction générique instanciée d'après le contexte, forme curryfiée (`whenIsRight(f)`).
 *
 * Entre deux étapes, la valeur est convertie vers le type du paramètre de l'étape suivante
 * (type donné par la signature résolue, donc instanciée).
 */
export async function pipeExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-pipe-as-value");
	}

	const [inputNode, ...stepNodes] = node.arguments;

	if (!inputNode || !DArray.minElements(stepNodes, 1)) {
		return context.error(node, "un-support-pipe-arguments");
	}

	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(node);

	const transformedArguments = await DCommon.asyncPipe(
		node.arguments,
		DArray.map(
			(argument) => DCommon.asyncPipe(
				context.transform(argument, expressionTransformers.value),
				DEither.unwrapRight,
			),
		),
		DCommon.promiseAll,
	);

	const failedArgument = DArray.find(transformedArguments, DEither.isLeft);

	if (failedArgument) {
		return failedArgument;
	}

	const [input, ...steps] = DArray.map(
		DArray.filter(
			transformedArguments,
			(argument): argument is Exclude<typeof argument, DEither.Left> => !DEither.isLeft(argument),
		),
		({ before, result }) => {
			const bound = bindOnce(result, context);

			return {
				before: DArray.concat(before, bound.before),
				result: bound.result,
			};
		},
	);

	if (!input) {
		return context.error(node, "un-support-pipe-arguments");
	}

	const initialType = await transformCheckerType(
		await typeChecker.getTypeAtLocation(inputNode),
		inputNode,
		context,
	);

	if (DEither.isLeft(initialType)) {
		return initialType;
	}

	let value: GoAST.Expression = input.result;
	let valueType = DEither.unwrapRight(initialType);

	for (const [index, step] of steps.entries()) {
		const stepNode = DArray.at(stepNodes, index) ?? node;

		const stepSignature = DArray.first(
			await (await typeChecker.getParameterType(signature, index + 1)).getCallSignatures(),
		);

		if (!stepSignature) {
			return context.error(stepNode, "un-support-pipe-step-type");
		}

		const parameterType = await transformCheckerType(
			await typeChecker.getParameterType(stepSignature, 0),
			stepNode,
			context,
		);

		if (DEither.isLeft(parameterType)) {
			return parameterType;
		}

		const returnType = await transformCheckerType(
			await typeChecker.getReturnTypeOfSignature(stepSignature),
			stepNode,
			context,
		);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		const argument = convertToType(
			{
				node: stepNode,
				expression: value,
				sourceType: valueType,
				targetType: DEither.unwrapRight(parameterType),
			},
			context,
		);

		if (DEither.isLeft(argument)) {
			return argument;
		}

		value = GoAST.createCallExpression({
			callee: step.result,
			arguments: [DEither.unwrapRight(argument)],
		});
		valueType = DEither.unwrapRight(returnType);
	}

	return context.success({
		before: DArray.flatMap(DArray.concat([input], steps), ({ before }) => before),
		result: value,
	});
}
