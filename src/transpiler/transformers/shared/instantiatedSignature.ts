import * as DArray from "@duplojs/lang/array";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";

/**
 * Signature instanciée d'une fonction (souvent générique) là où elle est utilisée :
 * appelée (`f(x)`) ou passée en valeur (`whenIsRight(r, f)`, `pipe(x, f)`), où TS
 * déduit son type du paramètre qui la reçoit.
 */
export async function getInstantiatedSignature(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const { parent } = node;

	if (TsAST.isCallExpression(parent) && parent.expression === node) {
		return typeChecker.getResolvedSignature(parent);
	}

	const contextualType = await typeChecker.getContextualType(node);

	return contextualType && DArray.first(await contextualType.getCallSignatures());
}
