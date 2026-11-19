import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { reflectImportDependency } from "../../goImport/sharedDependency";
import { commonPrintDependency, printFunctionIdentifier } from "./sharedDependency";

export async function printExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		// Only the default console output is translated, not the print params.
		if (!DArray.lengthEqual(node.arguments, 1)) {
			return context.notSupport();
		}

		return context.transform(node, [callExpressionTransformer]);
	}

	context.registerSharedDependency(reflectImportDependency.value);
	const packageName = context.registerSharedDependency(commonPrintDependency.value);

	return context.success({
		result: GoAST.createSelectorExpression({
			target: packageName,
			identifier: printFunctionIdentifier,
		}),
	});
}
