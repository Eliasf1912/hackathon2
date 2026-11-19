export interface Product {
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly stock: number;
}

export function hasStock(product: Product, quantity: number) {
	return product.stock >= quantity;
}

export function withdrawStock(product: Product, quantity: number): Product {
	return {
		...product,
		stock: product.stock - quantity,
	};
}
