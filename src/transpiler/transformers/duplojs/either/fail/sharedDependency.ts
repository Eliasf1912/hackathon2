import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const failFunctionIdentifier = GoAST.createIdentifier("EitherFailOf");
export const failTypeIdentifier = GoAST.createIdentifier("EitherFail");

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
			GoAST.createTypeAlias({
				identifier: failTypeIdentifier,
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
							typeReference: nullType,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/value\"",
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
											key: GoAST.createIdentifier("Information"),
											value: GoAST.createStringLiteral({ value: "fail" }),
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Value"),
											value: nullLiteral,
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
			GoAST.createMethodDeclaration({
				identifier: GoAST.createIdentifier("IsRight"),
				receiver: [
					GoAST.createIdentifier("e"),
					failTypeIdentifier,
				],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.bool],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [GoAST.createBooleanLiteral({ value: false })],
						}),
					],
				}),
			}),
			GoAST.createMethodDeclaration({
				identifier: GoAST.createIdentifier("GetEitherInformation"),
				receiver: [
					GoAST.createIdentifier("e"),
					failTypeIdentifier,
				],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [GoAST.createStringLiteral({ value: "fail" })],
						}),
					],
				}),
			}),
			GoAST.createMethodDeclaration({
				identifier: GoAST.createIdentifier("GetEitherValue"),
				receiver: [
					GoAST.createIdentifier("e"),
					failTypeIdentifier,
				],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [GoAST.createNilLiteral({})],
						}),
					],
				}),
			}),
		],
	});
});

