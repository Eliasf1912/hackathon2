import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const coalescingFunctionIdentifier = GoAST.createIdentifier("ArrayCoalescing");

/**
 * Mirrors `DArray.coalescing` for a value that is not an array: the value is
 * wrapped in a one-element slice.
 */
export const arrayCoalescingDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const value = GoAST.createIdentifier("value");
	const sliceType = GoAST.createSliceType({ elementType: generic });

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: coalescingFunctionIdentifier,
				generic: [
					GoAST.createTypeParameter({
						identifier: generic,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: value,
						type: generic,
					}),
				],
				returnTypes: [sliceType],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createSliceLiteral({
									typeReference: sliceType,
									elements: [value],
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
