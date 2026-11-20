import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const padStartIdentifier = GoAST.createIdentifier("PadStart");

/**
 * `DString.padStart(texte, longueur, remplissage)`, comme JS : longueurs en unités UTF-16,
 * remplissage répété puis coupé.
 *
 * ```go
 * func PadStart(value string, length float64, pad string) string {
 *     units := utf16.Encode([]rune(value))
 *     padUnits := utf16.Encode([]rune(pad))
 *     missing := int(length) - len(units)
 *     if missing <= 0 || len(padUnits) == 0 { return value }
 *     result := make([]uint16, 0, missing+len(units))
 *     for len(result) < missing { result = append(result, padUnits...) }
 *     return string(utf16.Decode(append(result[:missing], units...)))
 * }
 * ```
 */
export const padStartDependency = DCommon.memo(() => {
	const value = GoAST.createIdentifier("value");
	const length = GoAST.createIdentifier("length");
	const pad = GoAST.createIdentifier("pad");
	const units = GoAST.createIdentifier("units");
	const padUnits = GoAST.createIdentifier("padUnits");
	const missing = GoAST.createIdentifier("missing");
	const result = GoAST.createIdentifier("result");
	const utf16 = GoAST.createIdentifier("utf16");
	const call = (
		callee: GoAST.Expression,
		callArguments: readonly GoAST.Expression[],
		variadic?: GoAST.Expression,
	) => GoAST.createCallExpression({
		callee,
		arguments: callArguments,
		variadicArgument: variadic,
	});
	const lengthOf = (expression: GoAST.Expression) => call(GoAST.createIdentifier("len"), [expression]);
	const encode = (text: GoAST.Expression) => call(
		GoAST.createSelectorExpression({
			target: utf16,
			identifier: GoAST.createIdentifier("Encode"),
		}),
		[
			GoAST.createConversionExpression({
				typeReference: GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.rune }),
				operand: text,
			}),
		],
	);
	const unitSlice = GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.uint16 });

	return createSharedDependency({
		imports: [GoAST.createImportDeclaration({ path: "unicode/utf16" })],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: padStartIdentifier,
				generic: [],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: value,
						type: GoAST.builtinTypeReferences.string,
					}),
					GoAST.createFunctionArgument({
						identifier: length,
						type: GoAST.builtinTypeReferences.float64,
					}),
					GoAST.createFunctionArgument({
						identifier: pad,
						type: GoAST.builtinTypeReferences.string,
					}),
				],
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: units,
							initializer: encode(value),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: padUnits,
							initializer: encode(pad),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: missing,
							initializer: GoAST.createBinaryExpression({
								operator: "-",
								left: GoAST.createConversionExpression({
									typeReference: GoAST.builtinTypeReferences.int,
									operand: length,
								}),
								right: lengthOf(units),
							}),
						}),
						GoAST.createIfStatement({
							condition: GoAST.createBinaryExpression({
								operator: "||",
								left: GoAST.createBinaryExpression({
									operator: "<=",
									left: missing,
									right: GoAST.createIntegerLiteral({ value: 0n }),
								}),
								right: GoAST.createBinaryExpression({
									operator: "==",
									left: lengthOf(padUnits),
									right: GoAST.createIntegerLiteral({ value: 0n }),
								}),
							}),
							body: GoAST.createBlockStatement({
								statements: [GoAST.createReturnStatement({ values: [value] })],
							}),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: result,
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								typeArgument: unitSlice,
								arguments: [
									GoAST.createIntegerLiteral({ value: 0n }),
									GoAST.createBinaryExpression({
										operator: "+",
										left: missing,
										right: lengthOf(units),
									}),
								],
							}),
						}),
						GoAST.createForStatement({
							condition: GoAST.createBinaryExpression({
								operator: "<",
								left: lengthOf(result),
								right: missing,
							}),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([result]),
										values: DCommon.cast([call(GoAST.createIdentifier("append"), [result], padUnits)]),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [
								GoAST.createConversionExpression({
									typeReference: GoAST.builtinTypeReferences.string,
									operand: call(
										GoAST.createSelectorExpression({
											target: utf16,
											identifier: GoAST.createIdentifier("Decode"),
										}),
										[
											call(
												GoAST.createIdentifier("append"),
												[
													GoAST.createSliceExpression({
														target: result,
														high: missing,
													}),
												],
												units,
											),
										],
									),
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
