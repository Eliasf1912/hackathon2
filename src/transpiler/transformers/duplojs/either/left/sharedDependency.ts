import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const leftFunctionIdentifier = GoAST.createIdentifier("EitherLeftOf");
export const leftTypeIdentifier = GoAST.createIdentifier("EitherLeft");

export const eitherLeftDependency = DCommon.memo(() => {
	const generic = GoAST.createIdentifier("T");
	const nullType = GoAST.createIdentifier("JSNull");

	const leftTypeParameter = GoAST.createTypeParameter({
		identifier: generic,
		constraint: GoAST.builtinTypeReferences.any,
	});

	const leftTypeReference = GoAST.createGenericTypeReference({
		typeReference: leftTypeIdentifier,
		typeArguments: DCommon.cast([generic]),
	});

	const nullLiteral = GoAST.createStructLiteral({
		typeReference: nullType,
		elements: [],
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeAlias({
				identifier: leftTypeIdentifier,
				generic: [leftTypeParameter],
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
							typeReference: generic,
							tag: "json:\"@duplojs/lang/kind/@DuplojsLangEither/value\"",
						}),
					],
				}),
			}),
			GoAST.createFunctionDeclaration({
				identifier: leftFunctionIdentifier,
				generic: [leftTypeParameter],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: GoAST.createIdentifier("information"),
						type: GoAST.builtinTypeReferences.string,
					}),
					GoAST.createFunctionArgument({
						identifier: GoAST.createIdentifier("value"),
						type: generic,
					}),
				],
				returnTypes: [leftTypeReference],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createStructLiteral({
									typeReference: leftTypeReference,
									elements: [
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Left"),
											value: nullLiteral,
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Information"),
											value: GoAST.createIdentifier("information"),
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Value"),
											value: GoAST.createIdentifier("value"),
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
					leftTypeReference,
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
					leftTypeReference,
				],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createSelectorExpression({
									target: GoAST.createIdentifier("e"),
									identifier: GoAST.createIdentifier("Information"),
								}),
							],
						}),
					],
				}),
			}),
			GoAST.createMethodDeclaration({
				identifier: GoAST.createIdentifier("GetEitherValue"),
				receiver: [
					GoAST.createIdentifier("e"),
					leftTypeReference,
				],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createSelectorExpression({
									target: GoAST.createIdentifier("e"),
									identifier: GoAST.createIdentifier("Value"),
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});

