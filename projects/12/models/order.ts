import * as DArray from "@duplojs/lang/array";
import { type Product } from "./product";

export interface OrderLine {
	readonly productId: string;
	readonly quantity: number;
}

export interface PricedLine {
	readonly product: Product;
	readonly quantity: number;
	readonly total: number;
}

export type OrderStatus = "confirmed" | "pending";

export interface Order {
	readonly reference: string;
	readonly customerId: string;
	readonly lines: readonly PricedLine[];
	readonly subtotal: number;
	readonly total: number;
	readonly status: OrderStatus;
}

const discountRates: Readonly<Record<string, number>> = {
	WELCOME10: 0.1,
	VIP: 0.25,
};

export function priceLine(product: Product, quantity: number): PricedLine {
	return {
		product,
		quantity,
		total: product.price * quantity,
	};
}

export function computeSubtotal(lines: readonly PricedLine[]) {
	return DArray.reduce(
		lines,
		0,
		({ element, lastValue, next }) => next(lastValue + element.total),
	);
}

export function applyDiscount(subtotal: number, discountCode?: string) {
	const rate = discountRates[discountCode ?? ""] ?? 0;

	return subtotal - (subtotal * rate);
}
