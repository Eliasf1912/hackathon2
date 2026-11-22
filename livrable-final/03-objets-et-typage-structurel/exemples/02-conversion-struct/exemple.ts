// Ce qu'il faut regarder : TS accepte les trois affectations vers Command.
// Le transpileur convertit la 1re et refuse les deux autres (JSON différent en Go).
import * as DCommon from "@duplojs/lang/common";

interface Command { readonly customerId: string; readonly discountCode?: string }

const raw = { customerId: "bob", discountCode: "VIP" };
const converted: Command = raw; // converti champ par champ
DCommon.print(JSON.stringify(converted)); // {"customerId":"bob","discountCode":"VIP"}

const reversed = { discountCode: "VIP", customerId: "carol" };
const fromReversed: Command = reversed; // → un-support-object-key-order
DCommon.print(JSON.stringify(fromReversed)); // {"discountCode":"VIP","customerId":"carol"}

const extra = { customerId: "dave", note: "urgent" };
const fromExtra: Command = extra; // → un-support-object-extra-field
DCommon.print(JSON.stringify(fromExtra)); // {"customerId":"dave","note":"urgent"}
