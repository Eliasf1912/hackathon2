// Ce qu'il faut regarder : Product et CatalogItem ont deux noms mais la même forme.
// TS accepte un CatalogItem là où un Product est attendu : il compare la forme, pas le nom.
import * as DCommon from "@duplojs/lang/common";

interface Product { readonly id: string; readonly price: number }

type CatalogItem = { readonly id: string; readonly price: number };

function describe(product: Product) {
	return `${product.id} : ${product.price} €`;
}

const item: CatalogItem = { id: "keyboard", price: 49.9 };

DCommon.print(describe(item));
DCommon.print(item);
