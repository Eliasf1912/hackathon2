import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { printDependency, printFunctionIdentifier } from "./sharedDependency";

/** L'appel dont `node` est la fonction appelée, ou `node` lui-même s'il est un appel. */
function getCall(node: TsAST.Node) {
	if (TsAST.isCallExpression(node)) {
		return node;
	}

	return TsAST.isCallExpression(node.parent) && node.parent.expression === node
		? node.parent
		: undefined;
}

/**
 * `DCommon.print(value)` → `shard_dependencies.Print(value)`.
 *
 * L'appel passe par `callExpressionTransformer` : `shard_dependencies.Print` est une
 * référence simple, appelée directement, et Go déduit lui-même le type générique.
 *
 * Limite connue : le second paramètre de `print` (méthode de console, `columns`, `depth`)
 * n'est pas pris en charge.
 */
export function printExpressionHandler(node: TsAST.Node, context: BuildContext) {
	const call = getCall(node);

	if (call && !DArray.lengthEqual(call.arguments, 1)) {
		return context.error(call, "un-support-print-params");
	}

	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	return context.success({
		result: GoAST.createSelectorExpression({
			target: context.registerSharedDependency(printDependency.value),
			identifier: printFunctionIdentifier,
		}),
	});
}
