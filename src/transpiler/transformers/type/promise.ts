import type { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DString from "@duplojs/lang/string";
import { SymbolFlags } from "typescript/async";
import { typeTransformers } from ".";

const defaultLibraryPath = /\/node_modules\/(?:typescript|@typescript\/[^/]+)\/lib\/lib\.[^/]+\.d\.ts$/;

/**
 * Asynchronism is translated synchronously: an async function runs to its end
 * before returning, so `Promise<T>` is represented by `T` in Go.
 *
 * Only the global `Promise` of the TypeScript default library is recognised:
 * the symbol is resolved and its declaration file is checked.
 */
export const promiseTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| !node.typeArguments
			|| !DArray.lengthEqual(node.typeArguments, 1)
		) {
			return context.notSupport();
		}

		const symbol = await context.transpilation.typeChecker.resolveName(
			node.typeName.text,
			SymbolFlags.Type,
			context.file.sourceFile,
		);
		const declaration = symbol && DArray.first(symbol.declarations ?? []);
		const valueNode = DArray.first(node.typeArguments);

		if (
			symbol?.name !== "Promise"
			|| !declaration
			|| !DString.test(declaration.path, defaultLibraryPath)
			|| !valueNode
		) {
			return context.notSupport();
		}

		return context.transform(valueNode, typeTransformers.value);
	},
);
