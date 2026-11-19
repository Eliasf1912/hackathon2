import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const eitherRightInterfaceIdentifier = GoAST.createIdentifier("EitherRight");
export const isRightFunctionIdentifier = GoAST.createIdentifier("EitherIsRight");

export const eitherIsRightDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createTypeDefinition({
			identifier: eitherRightInterfaceIdentifier,
			type: GoAST.createInterfaceType({
				elements: [
					GoAST.createInterfaceMethod({
						identifier: GoAST.createIdentifier("IsRight"),
						arguments: [],
						returnTypes: [GoAST.builtinTypeReferences.bool],
					}),
					GoAST.createInterfaceMethod({
						identifier: GoAST.createIdentifier("GetEitherValue"),
						arguments: [],
						returnTypes: [GoAST.builtinTypeReferences.any],
					}),
				],
			}),
		}),
		GoAST.createFunctionDeclaration({
			identifier: isRightFunctionIdentifier,
			generic: [],
			arguments: [
				GoAST.createFunctionArgument({
					identifier: GoAST.createIdentifier("input"),
					type: GoAST.builtinTypeReferences.any,
				}),
			],
			returnTypes: [GoAST.builtinTypeReferences.bool],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createTypeSwitchStatementWithDefault({
						identifier: GoAST.createIdentifier("v"),
						expression: GoAST.createIdentifier("input"),
						casesBeforeDefault: [
							GoAST.createTypeSwitchCase({
								types: DCommon.cast([eitherRightInterfaceIdentifier]),
								statements: [
									GoAST.createReturnStatement({
										values: [
											GoAST.createCallExpression({
												callee: GoAST.createSelectorExpression({
													target: GoAST.createIdentifier("v"),
													identifier: GoAST.createIdentifier("IsRight"),
												}),
												arguments: [],
											}),
										],
									}),
								],
							}),
						],
						defaultCase: GoAST.createDefaultCase({
							statements: [
								GoAST.createReturnStatement({
									values: [GoAST.createBooleanLiteral({ value: false })],
								}),
							],
						}),
						casesAfterDefault: [],
					}),
				],
			}),
		}),
	],
}));
