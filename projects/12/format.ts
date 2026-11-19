import * as DString from "@duplojs/lang/string";

export function formatPrice(amount: number) {
	const rounded = Math.round(amount * 100) / 100;

	return `${DString.to(rounded)} €`;
}

export function formatCustomer(customer: string) {
	return DString.padStart(DString.toUpperCase(customer), 8, ".");
}
