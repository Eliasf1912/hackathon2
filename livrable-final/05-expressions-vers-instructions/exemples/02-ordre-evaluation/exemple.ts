// Ce qu'il faut regarder : JS évalue de gauche à droite, donc affiche 1 puis 2.
// C'est le cas réel trouvé par la revue 02-10 (constat 1).
import * as DCommon from "@duplojs/lang/common";

function p(value: number) {
	DCommon.print(value);
	return value;
}

function flag() {
	return true;
}

const values = [p(1), flag() ? p(2) : 0];

DCommon.print(values); // [1, 2]
