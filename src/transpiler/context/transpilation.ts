import type { Checker, Program } from "typescript/async";
import type { SharedDependency } from "@transformer";
import type * as DPath from "@duplojs/lang/path";

export interface TranspilationContext {
	readonly typeChecker: Checker;
	// Pour lire une déclaration de type dans un autre fichier du projet.
	readonly program: Program;
	readonly projectWorkDirectory: string & DPath.Absolute;
	readonly sharedDependencies: Set<SharedDependency>;
	increment(): number;
}

export interface CreateTranspilationContextParams {
	typeChecker: Checker;
	program: Program;
	projectWorkDirectory: string & DPath.Absolute;
}

export function createTranspilationContext(
	params: CreateTranspilationContextParams,
) {
	let index = 0;

	const context: TranspilationContext = {
		typeChecker: params.typeChecker,
		program: params.program,
		projectWorkDirectory: params.projectWorkDirectory,
		sharedDependencies: new Set(),
		increment() {
			index += 1;

			return index;
		},
	};

	return context;
}
