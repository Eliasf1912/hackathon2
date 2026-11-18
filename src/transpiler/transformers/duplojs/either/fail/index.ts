import { GoAST } from "@go";
import { type BuildContext } from "../../../../context/build";
import { eitherFailDependency, failTypeIdentifier } from "./sharedDependency";

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
