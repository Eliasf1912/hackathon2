import { type ProductRepository } from "../repositories/productRepository";
import { renderProductList } from "../views/productView";
import { ok } from "./response";

export function createProductController(products: ProductRepository) {
	return {
		async list() {
			return ok(renderProductList(await products.findAll()));
		},
	};
}
