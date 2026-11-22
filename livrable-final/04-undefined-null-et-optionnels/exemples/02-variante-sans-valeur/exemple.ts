// Ce qu'il faut regarder : Node affiche `value: undefined`, JSON.stringify omet la clé,
// mais un vrai 0 doit rester dans le JSON. (Clés simplifiées ; DuploJS les préfixe.)
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

const withValue = DEither.left("negative-operand", 0);
const withoutValue = DEither.left("must-be-not-contain-number");

DCommon.print(withValue); // { left: null, information: 'negative-operand', value: 0 }
DCommon.print(withoutValue); // { left: null, information: 'must-be-not-contain-number', value: undefined }
console.log(JSON.stringify(withoutValue)); // {"left":null,"information":"must-be-not-contain-number"}
