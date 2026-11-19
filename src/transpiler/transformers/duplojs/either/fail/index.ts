import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { eitherFailDependency, failFunctionIdentifier, failTypeIdentifier } from "./sharedDependency";

export async function failExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const packageName = context.registerSharedDependency(eitherFailDependency.value);

	return context.success({
		result: GoAST.createSelectorExpression({
			target: packageName,
			identifier: failFunctionIdentifier,
		}),
	});
}

export function failTypeHandler(
	node: TsAST.Node,
	context: BuildContext,
) {
	const packageName = context.registerSharedDependency(eitherFailDependency.value);

	return context.success({
		result: GoAST.createPackageTypeReference({
			packageName,
			identifier: failTypeIdentifier,
		}),
	});
}

