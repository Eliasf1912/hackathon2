import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const printFunctionIdentifier = GoAST.createIdentifier("CommonPrint");

export const commonPrintDependency = DCommon.memo(() => createSharedDependency({
	imports: [GoAST.createImportDeclaration({ path: "fmt" })],
	init: [],
	declarations: [
		GoAST.createFunctionDeclaration({
			identifier: printFunctionIdentifier,
			generic: [],
			arguments: [
				GoAST.createFunctionArgument({
					identifier: GoAST.createIdentifier("input"),
					type: GoAST.builtinTypeReferences.any,
				}),
			],
			returnTypes: [GoAST.builtinTypeReferences.any],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createCallExpression({
						callee: GoAST.createSelectorExpression({
							target: GoAST.createIdentifier("fmt"),
							identifier: GoAST.createIdentifier("Println"),
						}),
						arguments: [GoAST.createIdentifier("input")],
					}),
					GoAST.createReturnStatement({
						values: [GoAST.createIdentifier("input")],
					}),
				],
			}),
		}),
	],
}));
