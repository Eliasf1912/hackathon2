import * as DArray from "@duplojs/lang/array";
import { type Product } from "../models/product";

/**
 * Stockage en mémoire, derrière une API asynchrone comme une vraie base de données.
 */
export function createProductRepository(initialProducts: readonly Product[]) {
	let products = initialProducts;

	return {
		findAll() {
			return Promise.resolve(products);
		},
		findById(productId: string) {
			return Promise.resolve(DArray.find(products, (product) => product.id === productId));
		},
		save(updated: Product) {
			products = DArray.map(
				products,
				(product) => (product.id === updated.id ? updated : product),
			);

			return Promise.resolve(updated);
		},
	};
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
