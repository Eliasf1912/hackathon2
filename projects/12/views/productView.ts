import * as DArray from "@duplojs/lang/array";
import * as DString from "@duplojs/lang/string";
import { type Product } from "../models/product";
import { formatPrice } from "./format";

export function renderProduct(product: Product) {
	return {
		id: product.id,
		name: product.name,
		price: formatPrice(product.price),
		availability: product.stock > 0 ? `${DString.to(product.stock)} en stock` : "épuisé",
	};
}

export function renderProductList(products: readonly Product[]) {
	return DArray.map(products, renderProduct);
}
