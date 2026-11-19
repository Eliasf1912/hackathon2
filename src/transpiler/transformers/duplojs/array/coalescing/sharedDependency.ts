import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const coalescingValueIdentifier = GoAST.createIdentifier("CoalescingValue");
export const coalescingArrayIdentifier = GoAST.createIdentifier("CoalescingArray");

/**
 * `DArray.coalescing` : un tableau reste tel quel, une autre valeur devient `[valeur]`.
 * JS choisit à l'exécution (`instanceof Array`) ; le type TS de l'argument le dit déjà,
 * donc le transpileur choisit la fonction Go à la compilation :
 *
 * ```go
 * func CoalescingValue[T any](value T) [1]T { return [1]T{value} }
 * func CoalescingArray[A any](value A) A { return value }
 * ```
 *
 * `[valeur]` est un tuple TS (`readonly [number]`), donc un tableau Go `[1]T`.
 * `CoalescingArray` ne fait rien : générique sur le type entier, il vaut pour une slice
 * comme pour un tableau `[N]T`.
 */
export const coalescingDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const value = GoAST.createIdentifier("value");
	const tupleType = GoAST.createArrayType({
		length: GoAST.createIntegerLiteral({ value: 1n }),
		elementType: generic,
	});
	const typeParameter = GoAST.createTypeParameter({
		identifier: generic,
		constraint: GoAST.builtinTypeReferences.any,
	});

	const createFunction = (
		identifier: GoAST.Identifier,
		argumentType: GoAST.Identifier,
		returnType: GoAST.Identifier | GoAST.ArrayType,
		result: GoAST.Expression,
	) => GoAST.createFunctionDeclaration({
		identifier,
		generic: [typeParameter],
		arguments: [
			GoAST.createFunctionArgument({
				identifier: value,
				type: argumentType,
			}),
		],
		returnTypes: [returnType],
		body: GoAST.createBlockStatement({
			statements: [GoAST.createReturnStatement({ values: [result] })],
		}),
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			createFunction(
				coalescingValueIdentifier,
				generic,
				tupleType,
				GoAST.createArrayLiteral({
					typeReference: tupleType,
					elements: [value],
				}),
			),
			createFunction(coalescingArrayIdentifier, generic, generic, value),
		],
	});
});
