import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import {
	applyDiscount,
	catalog,
	computeSubtotal,
	formatCustomer,
	formatPrice,
	priceLine,
	type Order,
} from "./domain";

const storedOrders: readonly Order[] = [
	{
		customer: "alice",
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
	{
		customer: "bob",
		lines: [
			{
				productId: "mse",
				quantity: 1,
			},
		],
	},
	{
		customer: "carla",
		lines: [
			{
				productId: "kbd",
				quantity: 1,
			},
			{
				productId: "cam",
				quantity: 1,
			},
		],
	},
];

// Simule un chargement asynchrone (base de données, API…).
async function loadOrders() {
	const loaded = await Promise.resolve(storedOrders);

	return loaded;
}

function processOrder({ customer, lines, discountCode }: Order) {
	const pricedLines = DEither.group(DArray.map(lines, priceLine));

	return DEither.whenIsRightOtherwise(
		pricedLines,
		(validLines) => {
			const subtotal = computeSubtotal(validLines);

			return {
				customer: formatCustomer(customer),
				items: DArray.map(validLines, ({ product, quantity }) => `${DString.to(quantity)} x ${product.name}`),
				subtotal: formatPrice(subtotal),
				total: formatPrice(applyDiscount(subtotal, discountCode)),
			};
		},
		(failure) => ({
			customer: formatCustomer(customer),
			error: DEither.matchInformation(failure, {
				"product-not-found": (productId) => `produit inconnu : ${productId}`,
				"out-of-stock": ({ productId, requested, available }) => `stock insuffisant pour ${productId} (${DString.to(requested)} demandés, ${DString.to(available)} disponibles)`,
			}),
		}),
	);
}

const orders = await loadOrders();
const results = DArray.map(orders, processOrder);

DCommon.print(results);

const inStock = DArray.filter(catalog, (product) => product.stock > 0);
const hasHdmi = DArray.some(catalog, (product) => DArray.some(product.tags, (tag) => tag === "hdmi"));

DCommon.print(DArray.map(inStock, (product) => product.name));
DCommon.print(hasHdmi);
