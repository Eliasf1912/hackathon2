import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createUnionTagTest, createUnionVariantAccess, getUnionType, type GoType } from "../../type/union";

export interface Variant {
	type: GoType;
	access: GoAST.Expression;
	tagTest?: GoAST.Expression;
}

export interface Branch {
	test?: GoAST.Expression;
	statements: readonly GoAST.Statement[];
}

/**
 * Les variantes d'une valeur Go : chaque membre d'une union (`UnionN`), avec son accès
 * (`x.V1`) et son test (`x.Tag == 1`) ; sinon la valeur elle-même, sans test.
 * `value` doit pouvoir être relue sans être réévaluée (identifiant).
 */
export function getVariants(value: GoAST.Expression, type: GoType): readonly Variant[] {
	const unionType = getUnionType(type);

	if (!unionType) {
		return [
			{
				type,
				access: value,
			},
		];
	}

	return DArray.map(unionType.typeArguments, (memberType, { index }) => ({
		type: memberType,
		access: createUnionVariantAccess(value, index),
		tagTest: createUnionTagTest(value, index),
	}));
}

/**
 * `if test0 {…} else if test1 {…} else {…}` ; la dernière branche sert de `else`
 * (TS garantit qu'une des branches s'applique).
 */
export function chainBranches(branches: readonly Branch[]) {
	const last = DArray.last(branches);

	return DArray.reduceRight(
		DArray.slice(branches, 0, -1),
		DArray.reduceFrom<GoAST.BlockStatement | GoAST.IfStatement | undefined>(
			last && GoAST.createBlockStatement({ statements: last.statements }),
		),
		({ element, lastValue, next }) => next(
			GoAST.createIfStatement({
				condition: element.test ?? GoAST.createBooleanLiteral({ value: true }),
				body: GoAST.createBlockStatement({ statements: element.statements }),
				elseBranch: lastValue,
			}),
		),
	);
}

/**
 * Instructions d'une chaîne : le `if`, ou directement celles de l'unique branche.
 */
export function flattenChain(chain: GoAST.BlockStatement | GoAST.IfStatement | undefined): readonly GoAST.Statement[] {
	if (!chain) {
		return [];
	}

	return DModeling.hasTagValue(chain, "[node][statement]if")
		? [chain]
		: chain.statements;
}
