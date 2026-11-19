import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const toFunctionIdentifier = GoAST.createIdentifier("StringTo");

/**
 * Mirrors `DString.to` (`${value}`): converts the value to its text
 * representation with `fmt.Sprint`.
 */
export const stringToDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const value = GoAST.createIdentifier("value");

	return createSharedDependency({
		imports: [GoAST.createImportDeclaration({ path: "fmt" })],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: toFunctionIdentifier,
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
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createCallExpression({
									callee: GoAST.createSelectorExpression({
										target: GoAST.createIdentifier("fmt"),
										identifier: GoAST.createIdentifier("Sprint"),
									}),
									arguments: [value],
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
