import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";

export interface Product {
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly stock: number;
	readonly tags: readonly string[];
}

export const catalog: readonly Product[] = [
	{
		id: "kbd",
		name: "Clavier",
		price: 49.9,
		stock: 12,
		tags: ["bureau", "usb"],
	},
	{
		id: "mse",
		name: "Souris",
		price: 19.5,
		stock: 0,
		tags: ["bureau"],
	},
	{
		id: "scr",
		name: "Écran 27\"",
		price: 249,
		stock: 3,
		tags: ["bureau", "hdmi"],
	},
];

export function findProduct(productId: string) {
	const product = DArray.find(catalog, (candidate) => candidate.id === productId);

	if (product === undefined) {
		return DEither.left("product-not-found", productId);
	}

	return DEither.success(product);
}
