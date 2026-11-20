import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency, type SharedDependency } from "@transformer";

export const unionTagFieldIdentifier = GoAST.createIdentifier("Tag");

export const unionActiveVariantIdentifier = GoAST.createIdentifier("ActiveVariant");

export function unionTypeIdentifier(arity: number) {
	return GoAST.createIdentifier(`Union${arity}`);
}

export function unionValueFieldIdentifier(index: number) {
	return GoAST.createIdentifier(`V${index}`);
}

const dependencies = new Map<number, SharedDependency>();

/**
 * Union taguée à autant de variantes que `members`, déclarée une fois par arité :
 *
 * ```go
 * type Union2[T0 any, T1 any] struct {
 *     Tag uint8
 *     V0  T0
 *     V1  T1
 * }
 *
 * func (union Union2[T0, T1]) MarshalJSON() ([]byte, error) {
 *     if union.Tag == 0 {
 *         return json.Marshal(union.V0)
 *     }
 *     return json.Marshal(union.V1)
 * }
 * ```
 *
 * Générique : toutes les unions de même arité partagent ce type, instancié avec les
 * types concrets des variantes. Pas de `any` à l'exécution, pas d'allocation.
 * `MarshalJSON` affiche la variante active, comme JS affiche la valeur elle-même.
 */
export function unionDependency(members: readonly unknown[] & DArray.MinElements<2>) {
	const arity = members.length;
	const cached = dependencies.get(arity);

	if (cached) {
		return cached;
	}

	const indexes = DArray.map(members, (_member, { index }) => index);
	const generics = DArray.map(indexes, (index) => GoAST.createIdentifier(`T${index}`));
	const receiver = GoAST.createIdentifier("union");
	const json = GoAST.createIdentifier("json");

	const unionTypeReference = GoAST.createGenericTypeReference({
		typeReference: unionTypeIdentifier(arity),
		typeArguments: DCommon.cast(generics),
	});

	const returnVariant = (index: number) => GoAST.createReturnStatement({
		values: [
			GoAST.createSelectorExpression({
				target: receiver,
				identifier: unionValueFieldIdentifier(index),
			}),
		],
	});

	const marshalVariant = (index: number) => GoAST.createReturnStatement({
		values: [
			GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: json,
					identifier: GoAST.createIdentifier("Marshal"),
				}),
				arguments: [
					GoAST.createSelectorExpression({
						target: receiver,
						identifier: unionValueFieldIdentifier(index),
					}),
				],
			}),
		],
	});

	const dependency = createSharedDependency({
		imports: [GoAST.createImportDeclaration({ path: "encoding/json" })],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: unionTypeIdentifier(arity),
				generic: DArray.map(
					generics,
					(identifier) => GoAST.createTypeParameter({
						identifier,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				),
				type: GoAST.createStructType({
					fields: [
						GoAST.createStructField({
							identifier: unionTagFieldIdentifier,
							typeReference: GoAST.builtinTypeReferences.uint8,
						}),
						...DArray.map(
							generics,
							(typeReference, { index }) => GoAST.createStructField({
								identifier: unionValueFieldIdentifier(index),
								typeReference,
							}),
						),
					],
				}),
			}),
			GoAST.createMethodDeclaration({
				identifier: GoAST.createIdentifier("MarshalJSON"),
				receiver: [receiver, unionTypeReference],
				generic: [],
				arguments: [],
				returnTypes: [
					GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.byte }),
					GoAST.builtinTypeReferences.error,
				],
				body: GoAST.createBlockStatement({
					statements: [
						...DArray.map(
							DArray.slice(indexes, 0, -1),
							(index) => GoAST.createIfStatement({
								condition: GoAST.createBinaryExpression({
									operator: "==",
									left: GoAST.createSelectorExpression({
										target: receiver,
										identifier: unionTagFieldIdentifier,
									}),
									right: GoAST.createIntegerLiteral({ value: BigInt(index) }),
								}),
								body: GoAST.createBlockStatement({ statements: [marshalVariant(index)] }),
							}),
						),
						marshalVariant(arity - 1),
					],
				}),
			}),
			// Variante active, pour `print` qui affiche la valeur elle-même comme `MarshalJSON`.
			GoAST.createMethodDeclaration({
				identifier: unionActiveVariantIdentifier,
				receiver: [receiver, unionTypeReference],
				generic: [],
				arguments: [],
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: [
						...DArray.map(
							DArray.slice(indexes, 0, -1),
							(index) => GoAST.createIfStatement({
								condition: GoAST.createBinaryExpression({
									operator: "==",
									left: GoAST.createSelectorExpression({
										target: receiver,
										identifier: unionTagFieldIdentifier,
									}),
									right: GoAST.createIntegerLiteral({ value: BigInt(index) }),
								}),
								body: GoAST.createBlockStatement({ statements: [returnVariant(index)] }),
							}),
						),
						returnVariant(arity - 1),
					],
				}),
			}),
		],
	});

	dependencies.set(arity, dependency);

	return dependency;
}
