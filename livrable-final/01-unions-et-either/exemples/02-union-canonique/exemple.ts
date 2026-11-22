// Ce qu'il faut regarder : trois règles qui donnent à chaque union TS UN SEUL type Go.
// Dédoublonner, trier, `undefined` toujours en case 0.
import * as DCommon from "@duplojs/lang/common";

type Couleur = "rouge" | "vert";            // 1. deux fois `string` en Go : pas d'union
type Identifiant = number | string;          // 2. trié en Go : float64 avant string
type IdentifiantInverse = string | number;   //    donc le même type Go que la ligne au-dessus
type Surnom = string | undefined;            // 3. undefined en case 0

const couleur: Couleur = "vert";
const id: Identifiant = 42;
const memeId: IdentifiantInverse = id; // aucune conversion nécessaire
let surnom: Surnom;                     // vaut undefined

DCommon.print(couleur);
DCommon.print(memeId);
DCommon.print(surnom === undefined);
