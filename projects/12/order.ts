import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { findProduct, type Product } from "./catalog";

export interface OrderLine {
	readonly productId: string;
	readonly quantity: number;
}

export interface Order {
	readonly customer: string;
	readonly lines: readonly OrderLine[];
	readonly discountCode?: string;
}

export interface PricedLine {
	readonly product: Product;
	readonly quantity: number;
	readonly total: number;
}

export function priceLine(line: OrderLine) {
	return DEither.rightPipe(
		findProduct(line.productId),
		(product) => {
			if (line.quantity > product.stock) {
				return DEither.left("out-of-stock", {
					productId: product.id,
					requested: line.quantity,
					available: product.stock,
				});
			}

			return DEither.success({
				product,
				quantity: line.quantity,
				total: product.price * line.quantity,
			});
		},
	);
}

export function computeSubtotal(lines: readonly PricedLine[]) {
	return DArray.reduce(
		lines,
		0,
		({ element, lastValue, next }) => next(lastValue + element.total),
	);
}

const discountRates: Readonly<Record<string, number>> = {
	WELCOME10: 0.1,
	VIP25: 0.25,
};

export function applyDiscount(subtotal: number, discountCode?: string) {
	const rate = discountRates[discountCode ?? ""] ?? 0;

	return subtotal - (subtotal * rate);
}
