import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { getInstantiatedSignature } from "../../../shared";
import { goTypeKey, transformCheckerType, type GoType } from "../../../type/union";
import { numberToStringDependency, numberToStringIdentifier } from "./sharedDependency";

const float64Key = goTypeKey(GoAST.builtinTypeReferences.float64);
const stringKey = goTypeKey(GoAST.builtinTypeReferences.string);

function numberToString(context: BuildContext) {
	return GoAST.createSelectorExpression({
		target: context.registerSharedDependency(numberToStringDependency.value),
		identifier: numberToStringIdentifier,
	});
}

/**
 * Conversion JS d'une valeur en texte (`${value}`), choisie d'après son type Go :
 * `string` telle quelle, `float64` par `NumberToString`. Partagée avec les gabarits.
 */
export function createToStringExpression(value: GoAST.Expression, type: GoType, context: BuildContext) {
	const key = goTypeKey(type);

	if (key === stringKey) {
		return value;
	}

	if (key !== float64Key) {
		return undefined;
	}

	return GoAST.createCallExpression({
		callee: numberToString(context),
		arguments: [value],
	});
}

/**
 * `DString.to(value)` : `${value}` en JS. La conversion dépend du type, connu à la
 * compilation :
 * - `float64` → `shard_dependencies.NumberToString(value)` (écriture JS des nombres) ;
 * - `string` → la valeur telle quelle.
 *
 * Passé en valeur (`DArray.map(DString.to)`), le type vient de la signature instanciée
 * par le contexte : `shard_dependencies.NumberToString`.
 *
 * Limite connue : booléens, `null`, `undefined` et objets ne sont pas encore pris en charge.
 */
export async function toExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (TsAST.isCallExpression(node)) {
		const [valueNode] = node.arguments;

		if (!valueNode || !DArray.lengthEqual(node.arguments, 1)) {
			return context.error(node, "un-support-to-arguments");
		}

		const value = await DCommon.asyncPipe(
			context.transform(valueNode, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		const valueType = await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(valueNode),
			valueNode,
			context,
		);

		if (DEither.isLeft(valueType)) {
			return valueType;
		}

		const converted = createToStringExpression(value.result, DEither.unwrapRight(valueType), context);

		if (!converted) {
			return context.error(node, "un-support-to-value-type");
		}

		return context.success({
			before: value.before,
			result: converted,
		});
	}

	if (!TsAST.isIdentifier(node) && !TsAST.isPropertyAccessExpression(node)) {
		return context.error(node, "un-support-to-reference");
	}

	const signature = await getInstantiatedSignature(node, context);

	if (!signature) {
		return context.error(node, "un-support-to-without-instantiation");
	}

	const parameterType = await transformCheckerType(
		await context.transpilation.typeChecker.getParameterType(signature, 0),
		node,
		context,
	);

	if (DEither.isLeft(parameterType)) {
		return parameterType;
	}

	const type: GoType = DEither.unwrapRight(parameterType);

	if (goTypeKey(type) !== float64Key) {
		return context.error(node, "un-support-to-value-type");
	}

	return context.success({ result: numberToString(context) });
}
