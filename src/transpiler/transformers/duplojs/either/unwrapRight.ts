import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { bindOnce, getInstantiatedSignature } from "../../shared";
import { convertToType, transformCheckerType, type GoType } from "../../type/union";
import { createCurriedFunction } from "../curried";
import { chainBranches, flattenChain, getRightValueType, getVariants, type Branch } from "./dispatch";
import { hasEitherVariantKind, valueFieldIdentifier } from "./sharedDependency";

interface ApplyUnwrapParams {
	node: TsAST.Node;
	input: GoAST.Expression;
	inputType: GoType;
	outputType: GoType;
}

/**
 * Une branche par variante : un Right donne sa valeur, toute autre variante reste telle
 * quelle (comme `unwrapRight` à l'exécution), chacune convertie vers le type de sortie.
 */
function applyUnwrap({ node, input, inputType, outputType }: ApplyUnwrapParams, context: BuildContext) {
	const boundInput = bindOnce(input, context);
	const output = context.generateIdentifier();

	const branches = DArray.map(getVariants(boundInput.result, inputType), (variant) => {
		const isRight = hasEitherVariantKind(variant.type, "right");

		const value = convertToType(
			{
				node,
				expression: isRight
					? GoAST.createSelectorExpression({
						target: variant.access,
						identifier: valueFieldIdentifier,
					})
					: variant.access,
				sourceType: isRight ? getRightValueType(variant.type) : variant.type,
				targetType: outputType,
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		return DEither.right("branch", {
			test: variant.tagTest,
			statements: [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([output]),
					values: DCommon.cast([DEither.unwrapRight(value)]),
				}),
			],
		} satisfies Branch);
	});

	const failed = DArray.find(branches, DEither.isLeft);

	if (failed) {
		return failed;
	}

	return DEither.right("unwrap-applied", {
		before: DArray.concat(
			boundInput.before,
			[
				GoAST.createVariableDeclarationZeroValue({
					identifier: output,
					typeReference: outputType,
				}),
			],
			flattenChain(chainBranches(DArray.map(DArray.filter(branches, DEither.isRight), DEither.unwrapRight))),
		),
		result: output as GoAST.Expression,
	});
}

/**
 * `DEither.unwrapRight(x)` : la valeur d'un Right, sinon `x` tel quel. Le type de sortie
 * (`string | Error<null> | Left<…>`) vient du checker.
 *
 * Passé en valeur (`pipe(x, DEither.unwrapRight)`) : une fonction Go
 * `func(input In) Out { … }`, typée par la signature que le contexte instancie.
 */
export async function unwrapRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (TsAST.isIdentifier(node) || TsAST.isPropertyAccessExpression(node)) {
		const signature = await getInstantiatedSignature(node, context);

		if (!signature) {
			return context.error(node, "un-support-unwrapRight-without-instantiation");
		}

		const reference = await createCurriedFunction(
			node,
			context,
			(input, inputType, outputType) => applyUnwrap(
				{
					node,
					input,
					inputType,
					outputType,
				},
				context,
			),
			signature,
		);

		if (DEither.isLeft(reference)) {
			return reference;
		}

		return context.success({ result: DEither.unwrapRight(reference) });
	}

	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-unwrapRight-reference");
	}

	const [inputNode] = node.arguments;

	if (!inputNode || !DArray.lengthEqual(node.arguments, 1)) {
		return context.error(node, "un-support-unwrapRight-arguments");
	}

	const input = await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(input)) {
		return input;
	}

	const { typeChecker } = context.transpilation;

	const inputType = await transformCheckerType(await typeChecker.getTypeAtLocation(inputNode), inputNode, context);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const applied = applyUnwrap(
		{
			node,
			input: input.result,
			inputType: DEither.unwrapRight(inputType),
			outputType: DEither.unwrapRight(outputType),
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return context.success({
		before: DArray.concat(input.before, before),
		result,
	});
}
