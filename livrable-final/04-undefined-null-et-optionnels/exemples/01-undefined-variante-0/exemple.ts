// Ce qu'il faut regarder : une chaîne vide n'est PAS undefined,
// et `??` ne calcule sa partie droite que si la gauche manque.
import * as DCommon from "@duplojs/lang/common";

function label(code: string | undefined) {
	if (code === undefined) {
		return "aucun code";
	}
	return `code ${code}`;
}

DCommon.print(label(undefined)); // aucun code
DCommon.print(label("VIP")); // code VIP
DCommon.print(label("")); // code   (chaîne vide présente)
DCommon.print(undefined ?? "SANS-CODE"); // SANS-CODE

// null et undefined : deux valeurs distinctes, toutes deux `null` en JSON.
DCommon.print(JSON.stringify([null, undefined])); // [null,null]
