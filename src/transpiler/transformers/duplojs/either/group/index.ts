import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { eitherGroupDependency, groupFunctionIdentifier } from "./sharedDependency";
import { eitherSuccessDependency } from "../success/sharedDependency";

export async function groupExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	context.registerSharedDependency(eitherSuccessDependency.value);
	const packageName = context.registerSharedDependency(eitherGroupDependency.value);

	return context.success({
		result: GoAST.createSelectorExpression({
			target: packageName,
			identifier: groupFunctionIdentifier,
		}),
	});
}

