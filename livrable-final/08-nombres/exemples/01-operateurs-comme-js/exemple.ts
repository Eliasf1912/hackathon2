// Ce qu'il faut regarder : trois opérateurs qui existent en Go, mais avec un autre sens.
// Sortie Node en commentaire.
import * as DCommon from "@duplojs/lang/common";

const zero = 0;

DCommon.print(-7 % 3);          // -1 : le reste garde le signe du dividende
DCommon.print(-0);              // -0
DCommon.print(-zero);           // -0
DCommon.print(Math.round(2.5)); // 3
DCommon.print(Math.round(-2.5)); // -2 : les demis vont vers +∞
