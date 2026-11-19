import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import { type OrderService, type PlaceOrderCommand } from "../services/orderService";
import { renderError } from "../views/errorView";
import { renderOrder, renderOrderList } from "../views/orderView";
import { created, failure, ok } from "./response";

export function createOrderController(orderService: OrderService) {
	return {
		async place(command: PlaceOrderCommand) {
			const result = await orderService.placeOrder(command);

			// Chaque erreur métier devient un statut HTTP et un message.
			return DEither.matchInformation(result, {
				"customer-not-found": (customerId) => failure(
					404,
					renderError("customer-not-found", `client inconnu : ${customerId}`),
				),
				"empty-order": () => failure(
					400,
					renderError("empty-order", "la commande ne contient aucune ligne"),
				),
				"product-not-found": (productId) => failure(
					404,
					renderError("product-not-found", `produit inconnu : ${productId}`),
				),
				"out-of-stock": ({ productId, requested, available }) => failure(
					409,
					renderError(
						"out-of-stock",
						`stock insuffisant pour ${productId} : ${DString.to(requested)} demandés, ${DString.to(available)} disponibles`,
					),
				),
				success: (order) => created(renderOrder(order)),
			});
		},
		async listForCustomer(customerId: string) {
			return ok(renderOrderList(await orderService.listCustomerOrders(customerId)));
		},
	};
}
