import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const coalescingFunctionIdentifier = GoAST.createIdentifier("ArrayCoalescing");

export const arrayCoalescingDependency = DCommon.memo(() => {
	const sliceAnyType = GoAST.createSliceType({
		elementType: GoAST.builtinTypeReferences.any,
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: coalescingFunctionIdentifier,
				generic: [],
				arguments: [],
				variadicArgument: GoAST.createFunctionArgument({
					identifier: GoAST.createIdentifier("args"),
					type: GoAST.builtinTypeReferences.any,
				}),
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createIfStatement({
							condition: GoAST.createBinaryExpression({
								operator: "==",
								left: GoAST.createCallExpression({
									callee: GoAST.createIdentifier("len"),
									arguments: [GoAST.createIdentifier("args")],
								}),
								right: GoAST.createIntegerLiteral({ value: 0n }),
							}),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createReturnStatement({
										values: [
											GoAST.createSliceLiteral({
												typeReference: sliceAnyType,
												elements: [],
											}),
										],
									}),
								],
							}),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("value"),
							initializer: GoAST.createIndexExpression({
								target: GoAST.createIdentifier("args"),
								index: GoAST.createIntegerLiteral({ value: 0n }),
							}),
						}),
						GoAST.createTypeSwitchStatementWithDefault({
							identifier: GoAST.createIdentifier("v"),
							expression: GoAST.createIdentifier("value"),
							casesBeforeDefault: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([sliceAnyType]),
									statements: [
										GoAST.createReturnStatement({
											values: [GoAST.createIdentifier("v")],
										}),
									],
								}),
							],
							defaultCase: GoAST.createDefaultCase({
								statements: [
									GoAST.createReturnStatement({
										values: [
											GoAST.createSliceLiteral({
												typeReference: sliceAnyType,
												elements: [GoAST.createIdentifier("value")],
											}),
										],
									}),
								],
							}),
							casesAfterDefault: [],
						}),
					],
				}),
			}),
		],
	});
});

