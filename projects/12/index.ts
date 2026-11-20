import * as DCommon from "@duplojs/lang/common";
import { createOrderController } from "./controllers/orderController";
import { createProductController } from "./controllers/productController";
import { createCustomerRepository } from "./repositories/customerRepository";
import { createOrderRepository } from "./repositories/orderRepository";
import { createProductRepository } from "./repositories/productRepository";
import { createRouter, type Request } from "./router";
import { createOrderService } from "./services/orderService";

// Composition : chaque couche reçoit ses dépendances.
const productRepository = createProductRepository([
	{
		id: "kbd",
		name: "Clavier",
		price: 49.9,
		stock: 3,
	},
	{
		id: "mse",
		name: "Souris",
		price: 19.5,
		stock: 0,
	},
	{
		id: "scr",
		name: "Écran 27\"",
		price: 249,
		stock: 2,
	},
]);

const customerRepository = createCustomerRepository([
	{
		id: "alice",
		name: "Alice",
		vip: false,
	},
	{
		id: "bob",
		name: "Bob",
		vip: true,
	},
]);

const orderService = createOrderService({
	products: productRepository,
	customers: customerRepository,
	orders: createOrderRepository(),
});

const handle = createRouter({
	products: createProductController(productRepository),
	orders: createOrderController(orderService),
});

// Scénario : une suite de requêtes, comme un client HTTP les enverrait.
const requests: readonly Request[] = [
	{ route: "list-products" },
	{
		route: "place-order",
		body: {
			customerId: "alice",
			lines: [
				{
					productId: "kbd",
					quantity: 2,
				},
				{
					productId: "scr",
					quantity: 1,
				},
			],
			discountCode: "WELCOME10",
		},
	},
	{
		route: "place-order",
		body: {
			customerId: "bob",
			lines: [
				{
					productId: "kbd",
					quantity: 2,
				},
			],
		},
	},
	{
		route: "place-order",
		body: {
			customerId: "bob",
			lines: [
				{
					productId: "scr",
					quantity: 1,
				},
			],
		},
	},
	{
		route: "place-order",
		body: {
			customerId: "carla",
			lines: [
				{
					productId: "kbd",
					quantity: 1,
				},
			],
		},
	},
	{
		route: "place-order",
		body: {
			customerId: "alice",
			lines: [],
		},
	},
	{
		route: "customer-orders",
		customerId: "bob",
	},
	{ route: "list-products" },
];

for (const request of requests) {
	DCommon.print(await handle(request));
}
