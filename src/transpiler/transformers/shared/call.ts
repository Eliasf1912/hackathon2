import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import { expressionTransformers } from "../expression";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../context/build";
import { canBeUndefined } from "../expression/object";
import { convertExpressionToType, getUnionType, transformCheckerType } from "../type/union";

/**
 * Référence simple : `f` ou `pkg.F` (sélecteur sur un identifiant), sans calcul préalable.
 * La lire n'a pas d'effet de bord : on peut l'utiliser directement dans l'appel, sans
 * variable temporaire, sans changer l'ordre d'évaluation.
 *
 * Appeler directement permet à Go de déduire lui-même les types d'une fonction générique
 * à partir des arguments. Rangée dans une variable, elle devrait être instanciée.
 *
 * Limite connue : si un argument réaffecte la variable qui contient la fonction
 * (`f(f = g)`), l'ordre JS (fonction lue avant les arguments) n'est plus respecté.
 */
interface TransformedCallee {
	before: readonly GoAST.Statement[];
	result: GoAST.Expression;
}

function isSimpleReference(callee: TransformedCallee) {
	if (!DArray.lengthEqual(callee.before, 0)) {
		return false;
	}

	if (DModeling.hasTagValue(callee.result, "[node]identifier")) {
		return true;
	}

	return DModeling.hasTagValue(callee.result, "[node][expression]selector")
		&& DModeling.hasTagValue(callee.result.target, "[node]identifier");
}

/**
 * Arguments convertis vers le type des paramètres de la signature résolue (`b?: number`
 * est une union avec `undefined`) ; un paramètre optionnel absent reçoit `undefined`
 * (valeur zéro de l'union, variante 0).
 */
async function convertArguments(
	node: TsAST.CallExpression,
	transformed: readonly GoAST.Expression[],
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(node);

	if (!signature || signature.hasRestParameter) {
		return DEither.right("arguments", transformed);
	}

	const converted: GoAST.Expression[] = [];

	for (const index of signature.parameters.keys()) {
		const parameterType = await transformCheckerType(
			await typeChecker.getParameterType(signature, index),
			node,
			context,
		);

		// shortcut: paramètre sans type Go (type calculé d'une bibliothèque) : arguments
		// laissés tels quels, à revoir si Go les refuse.
		if (DEither.isLeft(parameterType)) {
			return DEither.right("arguments", transformed);
		}

		const targetType = DEither.unwrapRight(parameterType);
		const argument = node.arguments[index];
		const expression = transformed[index];

		if (!argument || !expression) {
			const union = getUnionType(targetType);

			if (!union || !canBeUndefined(union)) {
				return context.error(node, "un-support-missing-argument");
			}

			converted.push(GoAST.createStructLiteral({
				typeReference: union,
				elements: [],
			}));
			continue;
		}

		const value = await convertExpressionToType(
			{
				node: argument,
				expression,
				targetType,
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		converted.push(DEither.unwrapRight(value));
	}

	return DEither.right("arguments", converted as readonly GoAST.Expression[]);
}

export const callExpressionTransformer: Transformer<GoAST.CallExpression> = createTransformer(
	async(rawNode, context) => {
		const node = TsAST.isExpressionStatement(rawNode)
			? rawNode.expression
			: rawNode;
		if (!TsAST.isCallExpression(node)) {
			return context.notSupport();
		}

		const callee = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(callee)) {
			return callee;
		}

		const functionVariableStatement = GoAST.createShortVariableDeclarationStatement({
			identifier: context.generateIdentifier(),
			initializer: callee.result,
		});

		const calledDirectly = isSimpleReference(callee);

		const argumentsResult = await DCommon.asyncPipe(
			node.arguments,
			DArray.map(
				async(tsArgument) => DCommon.asyncPipe(
					context.transform(tsArgument, expressionTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<{
					before: readonly GoAST.Statement[];
					arguments: readonly GoAST.Expression[];
				}>({
					before: [],
					arguments: [],
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					const argumentVariableStatement = GoAST.createShortVariableDeclarationStatement({
						identifier: context.generateIdentifier(),
						initializer: element.result,
					});

					return next({
						before: DArray.concat(
							lastValue.before,
							element.before,
							[argumentVariableStatement],
						),
						arguments: DArray.push(
							lastValue.arguments,
							argumentVariableStatement.identifier,
						),
					});
				},
			),
		);

		if (DEither.isLeft(argumentsResult)) {
			return argumentsResult;
		}

		const callArguments = await convertArguments(node, argumentsResult.arguments, context);

		if (DEither.isLeft(callArguments)) {
			return callArguments;
		}

		return context.success({
			before: calledDirectly
				? argumentsResult.before
				: DArray.concat(
					callee.before,
					[functionVariableStatement],
					argumentsResult.before,
				),
			result: GoAST.createCallExpression({
				callee: calledDirectly
					? callee.result
					: functionVariableStatement.identifier,
				arguments: DEither.unwrapRight(callArguments),
			}),
		});
	},
);
