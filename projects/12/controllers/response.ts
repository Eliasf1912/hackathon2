export interface Response<GenericBody> {
	readonly status: number;
	readonly body: GenericBody;
}

export function ok<GenericBody>(body: GenericBody): Response<GenericBody> {
	return {
		status: 200,
		body,
	};
}

export function created<GenericBody>(body: GenericBody): Response<GenericBody> {
	return {
		status: 201,
		body,
	};
}

export function failure<GenericBody>(status: number, body: GenericBody): Response<GenericBody> {
	return {
		status,
		body,
	};
}
