import * as DArray from "@duplojs/lang/array";
import * as DString from "@duplojs/lang/string";
import { type Order } from "../models/order";
import { formatPrice } from "./format";

export function renderOrder(order: Order) {
	return {
		reference: order.reference,
		status: order.status,
		items: DArray.map(
			order.lines,
			({ product, quantity, total }) => `${DString.to(quantity)} x ${product.name} = ${formatPrice(total)}`,
		),
		subtotal: formatPrice(order.subtotal),
		total: formatPrice(order.total),
	};
}

export function renderOrderList(orders: readonly Order[]) {
	return {
		count: orders.length,
		references: DArray.map(orders, (order) => order.reference),
	};
}
