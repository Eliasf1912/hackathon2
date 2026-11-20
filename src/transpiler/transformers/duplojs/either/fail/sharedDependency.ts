import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { declareEitherVariant, informationFieldIdentifier, valueFieldIdentifier } from "../sharedDependency";

export const failTypeIdentifier = GoAST.createIdentifier("EitherFail");
export const failFunctionIdentifier = GoAST.createIdentifier("EitherFailOf");

declareEitherVariant(failTypeIdentifier, {
	kinds: ["left", "fail"],
	information: "fail",
	hasValue: false,
});

const nullType = GoAST.createIdentifier("JSNull");

/**
 * Type `DEither.Fail`. Forme JSON DuploJS (vérifiée avec `JSON.stringify(DEither.fail())`) :
 * `{ left: null, information: "fail", fail: null }`. Émis seul quand le type est seulement
 * mentionné (une union de retour, par exemple), sans le constructeur.
 */
export const eitherFailTypeDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: failTypeIdentifier,
				type: GoAST.createStructType({
					fields: [
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Left"),
							typeReference: nullType,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/left\"",
						}),
						GoAST.createStructField({
							identifier: informationFieldIdentifier,
							typeReference: GoAST.builtinTypeReferences.string,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/information\"",
						}),
						// `fail()` garde la clé `value` à `undefined` (affichée par Node) :
						// `JSUndefined` + `omitzero` l'omet du JSON, comme `JSON.stringify`.
						GoAST.createStructField({
							identifier: valueFieldIdentifier,
							typeReference: GoAST.createIdentifier("JSUndefined"),
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/value,omitzero\"",
						}),
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Fail"),
							typeReference: nullType,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/fail\"",
						}),
					],
				}),
			}),
		],
	}),
);

/**
 * `EitherFailOf()`, le constructeur de `DEither.fail()`, émis seulement quand un échec
 * est créé. Nécessite la dépendance du type `EitherFail`.
 */
export const eitherFailDependency = DCommon.memo(() => {
	const nullLiteral = GoAST.createStructLiteral({
		typeReference: nullType,
		elements: [],
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: failFunctionIdentifier,
				generic: [],
				arguments: [],
				returnTypes: [failTypeIdentifier],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createStructLiteral({
									typeReference: failTypeIdentifier,
									elements: [
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Left"),
											value: nullLiteral,
										}),
										GoAST.createKeyedElement({
											key: informationFieldIdentifier,
											value: GoAST.createStringLiteral({ value: "fail" }),
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Fail"),
											value: nullLiteral,
										}),
									],
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
