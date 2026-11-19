import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const isFunctionIdentifier = GoAST.createIdentifier("EitherIs");

/**
 * `EitherIs[T](input)` tells whether a value held by an interface has the Go
 * type `T`, through a type switch checked by the Go compiler. The handlers
 * call it with the Either variants given by the TypeScript checker, for
 * example `EitherIs[EitherSuccess[float64]](result)` for `DEither.isRight`.
 */
export const eitherIsDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const input = GoAST.createIdentifier("input");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: isFunctionIdentifier,
				generic: [
					GoAST.createTypeParameter({
						identifier: generic,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: input,
						type: GoAST.builtinTypeReferences.any,
					}),
				],
				returnTypes: [GoAST.builtinTypeReferences.bool],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createTypeSwitchStatementWithoutDefault({
							expression: input,
							cases: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([generic]),
									statements: [
										GoAST.createReturnStatement({
											values: [GoAST.createBooleanLiteral({ value: true })],
										}),
									],
								}),
							],
						}),
						GoAST.createReturnStatement({
							values: [GoAST.createBooleanLiteral({ value: false })],
						}),
					],
				}),
			}),
		],
	});
});
