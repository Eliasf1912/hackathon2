import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const toFunctionIdentifier = GoAST.createIdentifier("StringTo");

export const stringToDependency = DCommon.memo(() => createSharedDependency({
	imports: [GoAST.createImportDeclaration({ path: "fmt" })],
	init: [],
	declarations: [
		GoAST.createFunctionDeclaration({
			identifier: toFunctionIdentifier,
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
									values: [GoAST.createStringLiteral({ value: "" })],
								}),
							],
						}),
					}),
					GoAST.createReturnStatement({
						values: [
							GoAST.createCallExpression({
								callee: GoAST.createSelectorExpression({
									target: GoAST.createIdentifier("fmt"),
									identifier: GoAST.createIdentifier("Sprint"),
								}),
								arguments: [
									GoAST.createIndexExpression({
										target: GoAST.createIdentifier("args"),
										index: GoAST.createIntegerLiteral({ value: 0n }),
									}),
								],
							}),
						],
					}),
				],
			}),
		}),
	],
}));

