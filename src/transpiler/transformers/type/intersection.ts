import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { typeTransformers } from ".";

/**
 * Une contrainte DuploJS (`DNumber.Positive`, `DArray.LengthEqual<1>`, `DString.Number`…)
 * n'existe que pour TS : elle est déclarée dans `dist/<domaine>/constraints/`.
 */
async function isDuploJSConstraint(node: TsAST.TypeNode, context: BuildContext) {
	if (!TsAST.isTypeReferenceNode(node) && !TsAST.isImportTypeNode(node)) {
		return false;
	}

	const reference = await context.resolveReferenceModule(
		TsAST.isTypeReferenceNode(node) ? node.typeName : node,
		"@duplojs/lang",
		/^dist\/[^/]+\/constraints\//,
	);

	return DEither.isRight(reference);
}

/**
 * `number & DNumber.Positive` → `float64` : les contraintes DuploJS sont retirées,
 * il doit rester exactement un type, qui donne le type Go.
 */
export const intersectionTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIntersectionTypeNode(node)) {
			return context.notSupport();
		}

		const constraints = await DCommon.asyncPipe(
			node.types,
			DArray.map((member) => isDuploJSConstraint(member, context)),
			DCommon.promiseAll,
		);

		const [valueType, ...others] = DArray.filter(
			node.types,
			(_member, { index }) => !DArray.at(constraints, index),
		);

		if (!valueType || !DArray.lengthEqual(others, 0)) {
			return context.error(node, "un-support-intersection-type");
		}

		return context.transform(valueType, typeTransformers.value);
	},
);
