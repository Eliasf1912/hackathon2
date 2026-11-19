import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

/**
 * The build concatenates the imports of the shared dependencies without
 * deduplicating them: a Go package imported by several dependencies would be
 * imported twice and Go would refuse to compile. A standard package used by
 * several dependencies is therefore owned by a dependency that only holds its
 * import, registered by each user; the set of the build keeps it once.
 */
export const reflectImportDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [GoAST.createImportDeclaration({ path: "reflect" })],
		init: [],
		declarations: [],
	}),
);
