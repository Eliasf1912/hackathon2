import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const printFunctionIdentifier = GoAST.createIdentifier("Print");

/**
 * `DCommon.print(value)` : affiche la valeur et la renvoie.
 *
 * ```go
 * func Print[T any](value T) T {
 *     var encoded []byte
 *     var err error
 *     encoded, err = json.Marshal(value)
 *     if err != nil {
 *         panic(err)
 *     }
 *     fmt.Println(string(encoded))
 *     return value
 * }
 * ```
 *
 * Générique : marche pour toute valeur grâce aux tags JSON et aux `MarshalJSON` des types.
 * Affiche le JSON de la valeur (les tests comparent les valeurs JSON avec la sortie TS).
 *
 * Limite connue : `json.Marshal` refuse NaN et ±Infinity (JS les affiche, `JSON.stringify`
 * les remplace par `null`) → panique explicite pour l'instant.
 */
export const printDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const value = GoAST.createIdentifier("value");
	const encoded = GoAST.createIdentifier("encoded");
	const err = GoAST.createIdentifier("err");
	const json = GoAST.createIdentifier("json");
	const fmt = GoAST.createIdentifier("fmt");

	return createSharedDependency({
		imports: [
			GoAST.createImportDeclaration({ path: "encoding/json" }),
			GoAST.createImportDeclaration({ path: "fmt" }),
		],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: printFunctionIdentifier,
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
				returnTypes: [generic],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createVariableDeclarationZeroValue({
							identifier: encoded,
							typeReference: GoAST.createSliceType({
								elementType: GoAST.builtinTypeReferences.byte,
							}),
						}),
						GoAST.createVariableDeclarationZeroValue({
							identifier: err,
							typeReference: GoAST.builtinTypeReferences.error,
						}),
						GoAST.createAssignmentStatement({
							targets: DCommon.cast([encoded, err]),
							values: DCommon.cast([
								GoAST.createCallExpression({
									callee: GoAST.createSelectorExpression({
										target: json,
										identifier: GoAST.createIdentifier("Marshal"),
									}),
									arguments: [value],
								}),
							]),
						}),
						GoAST.createIfStatement({
							condition: GoAST.createBinaryExpression({
								operator: "!=",
								left: err,
								right: GoAST.createNilLiteral({}),
							}),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("panic"),
										arguments: [err],
									}),
								],
							}),
						}),
						GoAST.createCallExpression({
							callee: GoAST.createSelectorExpression({
								target: fmt,
								identifier: GoAST.createIdentifier("Println"),
							}),
							arguments: [
								GoAST.createConversionExpression({
									typeReference: GoAST.builtinTypeReferences.string,
									operand: encoded,
								}),
							],
						}),
						GoAST.createReturnStatement({
							values: [value],
						}),
					],
				}),
			}),
		],
	});
});
