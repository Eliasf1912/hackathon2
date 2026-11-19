import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { declareEitherVariant, informationFieldIdentifier } from "../sharedDependency";

export const failTypeIdentifier = GoAST.createIdentifier("EitherFail");
export const failFunctionIdentifier = GoAST.createIdentifier("EitherFailOf");

declareEitherVariant(failTypeIdentifier, {
	kinds: ["left", "fail"],
	information: "fail",
	hasValue: false,
});

/**
 * `DEither.Fail`. Forme JSON DuploJS (vérifiée avec `JSON.stringify(DEither.fail())`) :
 * `{ left: null, information: "fail", fail: null }`, sans `value`.
 */
export const eitherFailDependency = DCommon.memo(() => {
	const nullType = GoAST.createIdentifier("JSNull");
	const nullLiteral = GoAST.createStructLiteral({
		typeReference: nullType,
		elements: [],
	});

	return createSharedDependency({
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
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Fail"),
							typeReference: nullType,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/fail\"",
						}),
					],
				}),
			}),
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
