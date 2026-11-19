import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const stringLengthIdentifier = GoAST.createIdentifier("StringLength");

/**
 * `.length` d'une chaîne JS : un nombre d'**unités UTF-16**, pas d'octets (`len` en Go) ni
 * de runes. Un caractère hors plan multilingue de base (emoji…) compte pour 2.
 *
 * ```go
 * func StringLength(value string) float64 {
 *     length := 0
 *     for _, character := range value {
 *         if character >= 0x10000 { length = length + 2 } else { length = length + 1 }
 *     }
 *     return float64(length)
 * }
 * ```
 */
export const stringLengthDependency = DCommon.memo(() => {
	const value = GoAST.createIdentifier("value");
	const length = GoAST.createIdentifier("length");
	const character = GoAST.createIdentifier("character");

	const increment = (amount: bigint) => GoAST.createBlockStatement({
		statements: [
			GoAST.createAssignmentStatement({
				targets: DCommon.cast([length]),
				values: DCommon.cast([
					GoAST.createBinaryExpression({
						operator: "+",
						left: length,
						right: GoAST.createIntegerLiteral({ value: amount }),
					}),
				]),
			}),
		],
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: stringLengthIdentifier,
				generic: [],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: value,
						type: GoAST.builtinTypeReferences.string,
					}),
				],
				returnTypes: [GoAST.builtinTypeReferences.float64],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: length,
							initializer: GoAST.createIntegerLiteral({ value: 0n }),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: GoAST.createIdentifier("_"),
								value: character,
							}),
							expression: value,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createIfStatement({
										condition: GoAST.createBinaryExpression({
											operator: ">=",
											left: character,
											right: GoAST.createIntegerLiteral({ value: 0x10000n }),
										}),
										body: increment(2n),
										elseBranch: increment(1n),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [
								GoAST.createConversionExpression({
									typeReference: GoAST.builtinTypeReferences.float64,
									operand: length,
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
