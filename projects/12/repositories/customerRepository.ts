import * as DArray from "@duplojs/lang/array";
import { type Customer } from "../models/customer";

export function createCustomerRepository(customers: readonly Customer[]) {
	return {
		findById(customerId: string) {
			return Promise.resolve(DArray.find(customers, (customer) => customer.id === customerId));
		},
	};
}

export type CustomerRepository = ReturnType<typeof createCustomerRepository>;
