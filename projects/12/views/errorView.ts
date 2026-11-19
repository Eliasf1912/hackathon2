export function renderError(code: string, message: string) {
	return {
		error: code,
		message,
	};
}
