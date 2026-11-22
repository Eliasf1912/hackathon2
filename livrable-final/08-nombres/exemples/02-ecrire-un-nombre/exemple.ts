// Ce qu'il faut regarder : un nombre transformé en texte, et un calcul décimal.
// Sortie Node en commentaire (console.info affiche une chaîne sans guillemets).
import * as DCommon from "@duplojs/lang/common";
import * as DString from "@duplojs/lang/string";

DCommon.print(DString.to(1e20)); // 100000000000000000000
DCommon.print(DString.to(1e21)); // 1e+21
DCommon.print(DString.to(1e-7)); // 1e-7
DCommon.print(DString.to(-0));   // 0

DCommon.print(`total=${0.1 + 0.2}`); // total=0.30000000000000004
