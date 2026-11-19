import * as DArray from "@duplojs/lang/array";
import { GoAST } from "@go";
import { type BuildContext } from "../../context/build";

// Une déclaration par chemin : `file.imports` est un `Set`, l'import n'est ajouté qu'une fois.
const standardImports = new Map<string, GoAST.ImportDeclaration>();

/**
 * Ajoute l'import d'un paquet de la bibliothèque standard Go au fichier courant
 * (`strings`, `math`…) et renvoie son identifiant (`strings`).
 */
export function importStandardPackage(path: string, context: BuildContext) {
	const declaration = standardImports.get(path) ?? GoAST.createImportDeclaration({ path });

	standardImports.set(path, declaration);
	context.file.imports.add(declaration);

	return GoAST.createIdentifier(DArray.last(path.split("/")) ?? path);
}
