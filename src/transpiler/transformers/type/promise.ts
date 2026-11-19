import type { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DEither from "@duplojs/lang/either";
import { useGoType } from "../../resolveGoType";

/**
 * Asynchronism is translated synchronously: an async function runs to its end
 * before returning, so `Promise<T>` written in the source is represented by
 * `T` in Go. The checker recognises the promise: its awaited type differs from
 * the type itself, and the awaited type is translated by `resolveGoType`.
 */
export const promiseTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeReferenceNode(node) || node.pos < 0) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const type = await typeChecker.getTypeFromTypeNode(node);
		const awaitedType = await typeChecker.getAwaitedType(type);

		if (!awaitedType || awaitedType === type) {
			return context.notSupport();
		}

		const goType = await useGoType(awaitedType, node, context);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		return context.success({ result: goType });
	},
);
