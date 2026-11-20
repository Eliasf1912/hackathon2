import { GoAST } from "@go";
import { type BuildContext } from "../../../../context/build";
import { TsAST } from "@typescript";
import { eitherFailDependency, eitherFailTypeDependency, failFunctionIdentifier, failTypeIdentifier } from "./sharedDependency";

/**
 * Type `DEither.Fail` → `shard_dependencies.EitherFail`, sans le constructeur `EitherFailOf`.
 */
export function failTypeHandler(context: BuildContext) {
	return context.success({
		result: GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(eitherFailTypeDependency.value),
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

	context.registerSharedDependency(eitherFailTypeDependency.value);

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
