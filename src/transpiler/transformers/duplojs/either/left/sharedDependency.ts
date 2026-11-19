import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const leftFunctionIdentifier = GoAST.createIdentifier("EitherLeftOf");
export const leftTypeIdentifier = GoAST.createIdentifier("EitherLeft");

const generic = GoAST.createIdentifier("T");
const nullType = GoAST.createIdentifier("JSNull");

const typeParameter = GoAST.createTypeParameter({
	identifier: generic,
	constraint: GoAST.builtinTypeReferences.any,
});

const leftTypeReference = GoAST.createGenericTypeReference({
	typeReference: leftTypeIdentifier,
	typeArguments: DCommon.cast([generic]),
});

/**
 * `EitherLeft[T]`, the Go type of `DEither.Left<information, T>`: an
 * identified failure keeps its information as a field and its typed value as
 * context, never as a Go error. Emitted alone when the type is only mentioned.
 */
export const eitherLeftTypeDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeAlias({
				identifier: leftTypeIdentifier,
				generic: [typeParameter],
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
		],
	}),
);

/**
 * `EitherLeftOf(information, value)`, the Go constructor of
 * `DEither.left(information, value)`, emitted only when a Left is created.
 * Requires the `EitherLeft` type dependency.
 */
export const eitherLeftDependency = DCommon.memo(() => {
	const information = GoAST.createIdentifier("information");
	const value = GoAST.createIdentifier("value");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: leftFunctionIdentifier,
				generic: [typeParameter],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: information,
						type: GoAST.builtinTypeReferences.string,
					}),
					GoAST.createFunctionArgument({
						identifier: value,
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
											value: GoAST.createStructLiteral({
												typeReference: nullType,
												elements: [],
											}),
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Information"),
											value: information,
										}),
										GoAST.createKeyedElement({
											key: GoAST.createIdentifier("Value"),
											value,
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
