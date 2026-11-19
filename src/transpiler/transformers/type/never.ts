import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency, createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

export const neverTypeIdentifier = GoAST.createIdentifier("JSNever");

/**
 * Type `never` : aucune valeur ne l'a. Il n'apparaît guère qu'en élément d'un tableau
 * vide (`[]` est un `never[]`), converti ensuite vers le tableau attendu.
 */
export const neverDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createTypeDefinition({
			identifier: neverTypeIdentifier,
			type: GoAST.createStructType({ fields: [] }),
		}),
	],
}));

export const neverTypeTransformer: Transformer<GoAST.PackageTypeReference> = createTransformer(
	(node, context) => {
		if (node.kind !== TsAST.SyntaxKind.NeverKeyword) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(neverDependency.value),
				identifier: neverTypeIdentifier,
			}),
		});
	},
);
