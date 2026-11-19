import { GoAST } from "@go";
import { type BuildContext } from "../../../../context/build";
import { TsAST } from "@typescript";
import { eitherFailDependency, failFunctionIdentifier, failTypeIdentifier } from "./sharedDependency";

/**
 * Type `DEither.Fail` → `shard_dependencies.EitherFail`.
 */
export function failTypeHandler(context: BuildContext) {
	return context.success({
		result: GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(eitherFailDependency.value),
			identifier: failTypeIdentifier,
		}),
	});
}

/**
 * `DEither.fail()` → `shard_dependencies.EitherFailOf()`.
 */
export function failExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-fail-as-value");
	}

	if (node.arguments.length !== 0) {
		return context.error(node, "un-support-fail-arguments");
	}

	return context.success({
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(eitherFailDependency.value),
				identifier: failFunctionIdentifier,
			}),
			arguments: [],
		}),
	});
}
