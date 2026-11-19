import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const numberToStringIdentifier = GoAST.createIdentifier("NumberToString");

/**
 * Conversion d'un `number` en texte comme JS (`${value}`, `String(value)`).
 *
 * ```go
 * func NumberToString(value float64) string {
 *     if value == 0 { return "0" }                       // aussi -0
 *     if math.IsNaN(value) { return "NaN" }
 *     if math.IsInf(value, 1) { return "Infinity" }
 *     if math.IsInf(value, -1) { return "-Infinity" }
 *     absolute := math.Abs(value)
 *     if absolute >= 1e-6 && absolute < 1e21 {
 *         return strconv.FormatFloat(value, 'f', -1, 64)
 *     }
 *     return strings.Replace(strconv.FormatFloat(value, 'e', -1, 64), "e-0", "e-", 1)
 * }
 * ```
 *
 * JS et Go écrivent tous deux le plus petit nombre de chiffres qui redonne la même valeur
 * (`-1`) ; JS passe en notation exponentielle hors de [1e-6, 1e21[, avec un exposant
 * sans zéro de tête (`1e-7`, Go écrit `1e-07`).
 */
export const numberToStringDependency = DCommon.memo(() => {
	const value = GoAST.createIdentifier("value");
	const absolute = GoAST.createIdentifier("absolute");
	const math = GoAST.createIdentifier("math");
	const strconv = GoAST.createIdentifier("strconv");
	const strings = GoAST.createIdentifier("strings");

	const callPackage = (
		packageName: GoAST.Identifier,
		name: string,
		callArguments: readonly GoAST.Expression[],
	) => GoAST.createCallExpression({
		callee: GoAST.createSelectorExpression({
			target: packageName,
			identifier: GoAST.createIdentifier(name),
		}),
		arguments: callArguments,
	});

	const returnWhen = (condition: GoAST.Expression, result: GoAST.Expression) => GoAST.createIfStatement({
		condition,
		body: GoAST.createBlockStatement({
			statements: [GoAST.createReturnStatement({ values: [result] })],
		}),
	});

	const formatFloat = (format: string) => callPackage(
		strconv,
		"FormatFloat",
		[
			value,
			GoAST.createRuneLiteral({ value: format }),
			GoAST.createIntegerLiteral({ value: -1n }),
			GoAST.createIntegerLiteral({ value: 64n }),
		],
	);

	return createSharedDependency({
		imports: [
			GoAST.createImportDeclaration({ path: "math" }),
			GoAST.createImportDeclaration({ path: "strconv" }),
			GoAST.createImportDeclaration({ path: "strings" }),
		],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: numberToStringIdentifier,
				generic: [],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: value,
						type: GoAST.builtinTypeReferences.float64,
					}),
				],
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({
					statements: [
						returnWhen(
							GoAST.createBinaryExpression({
								operator: "==",
								left: value,
								right: GoAST.createIntegerLiteral({ value: 0n }),
							}),
							GoAST.createStringLiteral({ value: "0" }),
						),
						returnWhen(
							callPackage(math, "IsNaN", [value]),
							GoAST.createStringLiteral({ value: "NaN" }),
						),
						returnWhen(
							callPackage(math, "IsInf", [value, GoAST.createIntegerLiteral({ value: 1n })]),
							GoAST.createStringLiteral({ value: "Infinity" }),
						),
						returnWhen(
							callPackage(math, "IsInf", [value, GoAST.createIntegerLiteral({ value: -1n })]),
							GoAST.createStringLiteral({ value: "-Infinity" }),
						),
						GoAST.createShortVariableDeclarationStatement({
							identifier: absolute,
							initializer: callPackage(math, "Abs", [value]),
						}),
						returnWhen(
							GoAST.createBinaryExpression({
								operator: "&&",
								left: GoAST.createBinaryExpression({
									operator: ">=",
									left: absolute,
									right: GoAST.createFloatLiteral({ value: "1e-6" }),
								}),
								right: GoAST.createBinaryExpression({
									operator: "<",
									left: absolute,
									right: GoAST.createFloatLiteral({ value: "1e21" }),
								}),
							}),
							formatFloat("f"),
						),
						GoAST.createReturnStatement({
							values: [
								callPackage(
									strings,
									"Replace",
									[
										formatFloat("e"),
										GoAST.createStringLiteral({ value: "e-0" }),
										GoAST.createStringLiteral({ value: "e-" }),
										GoAST.createIntegerLiteral({ value: 1n }),
									],
								),
							],
						}),
					],
				}),
			}),
		],
	});
});
