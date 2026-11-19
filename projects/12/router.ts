import { type createOrderController } from "./controllers/orderController";
import { type createProductController } from "./controllers/productController";
import { type PlaceOrderCommand } from "./services/orderService";

export type Request =
	| {
		readonly route: "list-products";
	}
	| {
		readonly route: "place-order";
		readonly body: PlaceOrderCommand;
	}
	| {
		readonly route: "customer-orders";
		readonly customerId: string;
	};

interface Controllers {
	readonly products: ReturnType<typeof createProductController>;
	readonly orders: ReturnType<typeof createOrderController>;
}

export function createRouter({ products, orders }: Controllers) {
	return function handle(request: Request) {
		switch (request.route) {
			case "list-products":
				return products.list();
			case "place-order":
				return orders.place(request.body);
			case "customer-orders":
				return orders.listForCustomer(request.customerId);
		}
	};
}
