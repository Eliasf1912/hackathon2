// Ce qu'il faut regarder : après isLeft, `valeur` passe de 3 membres à 2,
// puis `return valeur` doit redevenir le type de retour à 3 membres.
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import * as DCommon from "@duplojs/lang/common";

function verifier(nom: string) {
	if (DString.test(nom, /[0-9]/)) return DEither.left("contient-chiffre");
	if (DString.includes(nom, "@")) return DEither.error(null);
	return DEither.right("nom-valide", nom);
}

function mesurer(nom: string) {
	const valeur = DEither.unwrapRight(verifier(nom)); // Left | Error<null> | string
	if (DEither.isLeft(valeur)) return valeur;         // ici : Left | Error<null>
	return DEither.success(DString.length(valeur));    // ici : string
}

DCommon.print(mesurer("alice"));
DCommon.print(mesurer("a1"));
