// Ce qu'il faut regarder : le type de `valeur` change selon l'endroit.
// Dans le if : un Left. Après le if : une string.
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import * as DCommon from "@duplojs/lang/common";

function verifier(nom: string) {
	return DString.includes(nom, "@") ? DEither.left("contient-arobase") : DEither.right("nom-valide", nom);
}

function mesurer(nom: string) {
	const valeur = DEither.unwrapRight(verifier(nom)); // Left<"contient-arobase", undefined> | string
	if (DEither.isLeft(valeur)) {
		return valeur;                                 // ici : Left
	}
	return DString.length(valeur);                     // ici : string
}

DCommon.print(mesurer("alice"));
DCommon.print(mesurer("a@b"));
