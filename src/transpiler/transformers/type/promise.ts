import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import { typeTransformers } from ".";

/**
 * `Promise<T>` → `T`. Modèle synchrone bloquant : une fonction `async` s'exécute jusqu'au
 * bout avant de rendre la main, et `await x` vaut `x` ; la promesse n'existe donc pas en Go.
 *
 * shortcut: reconnue par son nom (`Promise`, un argument de type) ; une classe utilisateur
 * nommée `Promise` serait confondue, à vérifier via la déclaration (lib TS) si cela arrive.
 */
export const promiseTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| node.typeName.text !== "Promise"
		) {
			return context.notSupport();
		}

		const valueType = node.typeArguments && DArray.lengthEqual(node.typeArguments, 1)
			? DArray.first(node.typeArguments)
			: undefined;

		if (!valueType) {
			return context.error(node, "un-support-promise-type");
		}

		return context.transform(valueType, typeTransformers.value);
	},
);
