import type { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import { typeTransformers } from ".";

const primitiveKinds: readonly TsAST.SyntaxKind[] = [
	TsAST.SyntaxKind.StringKeyword,
	TsAST.SyntaxKind.NumberKeyword,
	TsAST.SyntaxKind.BooleanKeyword,
];

function isBaseType(member: TsAST.TypeNode) {
	return DArray.includes(primitiveKinds, member.kind)
		|| TsAST.isArrayTypeNode(member)
		|| TsAST.isTupleTypeNode(member)
		|| (
			TsAST.isTypeOperatorNode(member)
			&& member.operator === TsAST.SyntaxKind.ReadonlyKeyword
		);
}

/**
 * DuploJS brands values with constraints that only exist for the type checker:
 * `string & DString.Number`, `number & DNumber.Positive`,
 * `readonly string[] & LengthEqual<3>`. The value stays the base primitive or
 * collection, so the Go type is the one of that single base member.
 * Other intersections (`A & B` of objects) are not translated.
 */
export const brandedTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (!TsAST.isIntersectionTypeNode(node)) {
			return context.notSupport();
		}

		const baseTypes = DArray.filter(node.types, isBaseType);
		const baseType = DArray.first(baseTypes);

		if (!baseType || !DArray.lengthEqual(baseTypes, 1)) {
			return context.notSupport();
		}

		return context.transform(baseType, typeTransformers.value);
	},
);
