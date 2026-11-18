import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import { expressionTransformers } from "../expression";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";

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
				arguments: argumentsResult.arguments,
			}),
		});
	},
);
