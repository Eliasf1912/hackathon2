import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import { applyDiscount, computeSubtotal, priceLine, type Order, type OrderLine } from "../models/order";
import { hasStock, withdrawStock } from "../models/product";
import { type CustomerRepository } from "../repositories/customerRepository";
import { type OrderRepository } from "../repositories/orderRepository";
import { type ProductRepository } from "../repositories/productRepository";

export interface PlaceOrderCommand {
	readonly customerId: string;
	readonly lines: readonly OrderLine[];
	readonly discountCode?: string;
}

interface OrderServiceDependencies {
	readonly products: ProductRepository;
	readonly customers: CustomerRepository;
	readonly orders: OrderRepository;
}

export function createOrderService({ products, customers, orders }: OrderServiceDependencies) {
	async function priceCommandLine(line: OrderLine) {
		const product = await products.findById(line.productId);

		if (product === undefined) {
			return DEither.left("product-not-found", line.productId);
		}

		if (!hasStock(product, line.quantity)) {
			return DEither.left("out-of-stock", {
				productId: product.id,
				requested: line.quantity,
				available: product.stock,
			});
		}

		return DEither.success(priceLine(product, line.quantity));
	}

	async function placeOrder(command: PlaceOrderCommand) {
		const customer = await customers.findById(command.customerId);

		if (customer === undefined) {
			return DEither.left("customer-not-found", command.customerId);
		}

		if (DArray.lengthEqual(command.lines, 0)) {
			return DEither.left("empty-order");
		}

		// Chaque ligne n'est vérifiée que si les précédentes sont valides.
		const pricedLines = await DEither.asyncGroup(
			DArray.map(command.lines, (line) => () => priceCommandLine(line)),
		);

		if (DEither.isLeft(pricedLines)) {
			return pricedLines;
		}

		const lines = DEither.unwrapRight(pricedLines);
		const subtotal = computeSubtotal(lines);
		const discountCode = customer.vip ? "VIP" : command.discountCode;
		const sequence = await orders.count();

		const order: Order = {
			reference: `CMD-${DString.padStart(DString.to(sequence + 1), 3, "0")}`,
			customerId: customer.id,
			lines,
			subtotal,
			total: applyDiscount(subtotal, discountCode),
			status: "confirmed",
		};

		for (const { product, quantity } of lines) {
			await products.save(withdrawStock(product, quantity));
		}

		return DEither.success(await orders.save(order));
	}

	return {
		placeOrder,
		listCustomerOrders: (customerId: string) => orders.findByCustomer(customerId),
	};
}

export type OrderService = ReturnType<typeof createOrderService>;
