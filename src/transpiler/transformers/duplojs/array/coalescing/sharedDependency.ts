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
 * func CoalescingValue[T any](value T) []T { return []T{value} }
 * func CoalescingArray[T any](value []T) []T { return value }
 * ```
 */
export const coalescingDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const value = GoAST.createIdentifier("value");
	const sliceType = GoAST.createSliceType({ elementType: generic });
	const typeParameter = GoAST.createTypeParameter({
		identifier: generic,
		constraint: GoAST.builtinTypeReferences.any,
	});

	const createFunction = (
		identifier: GoAST.Identifier,
		argumentType: GoAST.Identifier | GoAST.SliceType,
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
		returnTypes: [sliceType],
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
				GoAST.createSliceLiteral({
					typeReference: sliceType,
					elements: [value],
				}),
			),
			createFunction(coalescingArrayIdentifier, sliceType, value),
		],
	});
});
