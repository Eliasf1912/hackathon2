import * as DArray from "@duplojs/lang/array";
import { type Order } from "../models/order";

export function createOrderRepository() {
	let orders: readonly Order[] = [];

	return {
		count() {
			return Promise.resolve(orders.length);
		},
		save(order: Order) {
			orders = DArray.concat(orders, [order]);

			return Promise.resolve(order);
		},
		findByCustomer(customerId: string) {
			return Promise.resolve(DArray.filter(orders, (order) => order.customerId === customerId));
		},
	};
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
