import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import {
	createIsRightMethod,
	declareEitherVariant,
	informationFieldIdentifier,
	valueFieldIdentifier,
	type EitherVariantKind,
} from "../sharedDependency";

const kindTagPrefix = "@duplojs/lang/kind/@DuplojsLangEither";

interface EitherVariantDefinition {
	typeIdentifier: GoAST.Identifier;
	constructorIdentifier: GoAST.Identifier;
	side: "left" | "right";
	// Information fixe (`Error` : "error") ; absente, elle est un argument du constructeur.
	information?: string;
	// Genre supplémentaire, écrit en dernier champ JSON (`Error` : "error").
	extraKind?: EitherVariantKind;
}

function capitalize(value: string) {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Variante générique d'Either qui porte une valeur : `Left<I, T>`, `Right<I, T>`,
 * `Error<T>`. Même forme JSON que DuploJS (vérifiée avec `JSON.stringify`) :
 *
 * ```go
 * type EitherLeft[T any] struct {
 *     Left        JSNull `json:"…/left"`
 *     Information string `json:"…/information"`
 *     Value       T      `json:"…/value"`
 * }
 * func EitherLeftOf[T any](information string, value T) EitherLeft[T] { … }
 * ```
 *
 * L'information d'un `Left` / `Right` est une valeur à l'exécution : deux `Left` de même
 * type de valeur ont le même type Go, et `matchInformation` lit le champ `Information`.
 */
export function createEitherVariantDependency(definition: EitherVariantDefinition) {
	declareEitherVariant(definition.typeIdentifier, {
		kinds: definition.extraKind
			? [definition.side, definition.extraKind]
			: [definition.side],
		information: definition.information,
		hasValue: true,
	});

	return DCommon.memo(() => {
		const generic = GoAST.createIdentifier("T");
		const nullType = GoAST.createIdentifier("JSNull");
		const information = GoAST.createIdentifier("information");
		const value = GoAST.createIdentifier("value");
		const nullLiteral = GoAST.createStructLiteral({
			typeReference: nullType,
			elements: [],
		});

		const typeParameter = GoAST.createTypeParameter({
			identifier: generic,
			constraint: GoAST.builtinTypeReferences.any,
		});

		const typeReference = GoAST.createGenericTypeReference({
			typeReference: definition.typeIdentifier,
			typeArguments: DCommon.cast([generic]),
		});

		const sideIdentifier = GoAST.createIdentifier(capitalize(definition.side));
		const extraIdentifier = definition.extraKind && GoAST.createIdentifier(capitalize(definition.extraKind));

		const fields = DArray.concat(
			[
				GoAST.createStructField({
					identifier: sideIdentifier,
					typeReference: nullType,
					tag: `json:"${kindTagPrefix}/${definition.side}"`,
				}),
				GoAST.createStructField({
					identifier: informationFieldIdentifier,
					typeReference: GoAST.builtinTypeReferences.string,
					tag: `json:"${kindTagPrefix}/information"`,
				}),
				GoAST.createStructField({
					identifier: valueFieldIdentifier,
					typeReference: generic,
					tag: `json:"${kindTagPrefix}/value"`,
				}),
			],
			extraIdentifier && definition.extraKind
				? [
					GoAST.createStructField({
						identifier: extraIdentifier,
						typeReference: nullType,
						tag: `json:"${kindTagPrefix}/${definition.extraKind}"`,
					}),
				]
				: [],
		);

		const elements = DArray.concat(
			[
				GoAST.createKeyedElement({
					key: sideIdentifier,
					value: nullLiteral,
				}),
				GoAST.createKeyedElement({
					key: informationFieldIdentifier,
					value: definition.information === undefined
						? information
						: GoAST.createStringLiteral({ value: definition.information }),
				}),
				GoAST.createKeyedElement({
					key: valueFieldIdentifier,
					value,
				}),
			],
			extraIdentifier
				? [
					GoAST.createKeyedElement({
						key: extraIdentifier,
						value: nullLiteral,
					}),
				]
				: [],
		);

		return createSharedDependency({
			imports: [],
			init: [],
			declarations: [
				GoAST.createTypeDefinition({
					identifier: definition.typeIdentifier,
					generic: [typeParameter],
					type: GoAST.createStructType({ fields }),
				}),
				createIsRightMethod(typeReference, definition.side === "right"),
				GoAST.createFunctionDeclaration({
					identifier: definition.constructorIdentifier,
					generic: [typeParameter],
					arguments: DArray.concat(
						definition.information === undefined
							? [
								GoAST.createFunctionArgument({
									identifier: information,
									type: GoAST.builtinTypeReferences.string,
								}),
							]
							: [],
						[
							GoAST.createFunctionArgument({
								identifier: value,
								type: generic,
							}),
						],
					),
					returnTypes: [typeReference],
					body: GoAST.createBlockStatement({
						statements: [
							GoAST.createReturnStatement({
								values: [
									GoAST.createStructLiteral({
										typeReference,
										elements,
									}),
								],
							}),
						],
					}),
				}),
			],
		});
	});
}

export interface EitherVariant {
	typeIdentifier: GoAST.Identifier;
	constructorIdentifier: GoAST.Identifier;
	dependency: ReturnType<typeof createEitherVariantDependency>;
	// Position du type de la valeur dans les arguments de type TS (`Left<I, T>` : 1).
	valueTypeArgumentIndex: number;
}

function defineVariant(
	definition: EitherVariantDefinition,
	valueTypeArgumentIndex: number,
): EitherVariant {
	return {
		typeIdentifier: definition.typeIdentifier,
		constructorIdentifier: definition.constructorIdentifier,
		dependency: createEitherVariantDependency(definition),
		valueTypeArgumentIndex,
	};
}

/**
 * Variantes génériques, par nom DuploJS : type (`Left`) et fonction (`left`).
 */
export const eitherVariants = {
	left: defineVariant(
		{
			typeIdentifier: GoAST.createIdentifier("EitherLeft"),
			constructorIdentifier: GoAST.createIdentifier("EitherLeftOf"),
			side: "left",
		},
		1,
	),
	right: defineVariant(
		{
			typeIdentifier: GoAST.createIdentifier("EitherRight"),
			constructorIdentifier: GoAST.createIdentifier("EitherRightOf"),
			side: "right",
		},
		1,
	),
	error: defineVariant(
		{
			typeIdentifier: GoAST.createIdentifier("EitherError"),
			constructorIdentifier: GoAST.createIdentifier("EitherErrorOf"),
			side: "left",
			information: "error",
			extraKind: "error",
		},
		0,
	),
};
