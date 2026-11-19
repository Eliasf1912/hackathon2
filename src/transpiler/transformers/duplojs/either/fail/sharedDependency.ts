import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const failFunctionIdentifier = GoAST.createIdentifier("EitherFailOf");
export const failTypeIdentifier = GoAST.createIdentifier("EitherFail");

const nullType = GoAST.createIdentifier("JSNull");
const undefinedType = GoAST.createIdentifier("JSUndefined");

/**
 * `EitherFail`, the Go type of `DEither.Fail`: a standard Left with the `fail`
 * information and no value, held by the default `JSUndefined` type. Emitted
 * alone when the type is only mentioned, for example in a union.
 */
export const eitherFailTypeDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeAlias({
				identifier: failTypeIdentifier,
				generic: [],
				type: GoAST.createStructType({
					fields: [
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Left"),
							typeReference: nullType,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/left\"",
						}),
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Information"),
							typeReference: GoAST.builtinTypeReferences.string,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/information\"",
						}),
						GoAST.createStructField({
							identifier: GoAST.createIdentifier("Value"),
							typeReference: undefinedType,
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
 * `EitherFailOf()`, the Go constructor of `DEither.fail()`, emitted only when
 * a fail is created. Requires the `EitherFail` type dependency.
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
											key: GoAST.createIdentifier("Information"),
											value: GoAST.createStringLiteral({ value: "fail" }),
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Value"),
											value: GoAST.createStructLiteral({
												typeReference: undefinedType,
												elements: [],
											}),
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
