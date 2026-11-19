import * as DArray from "@duplojs/lang/array";
import { NodeBuilderFlags, type Type } from "typescript/async";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import { createTransformer, sharedDependencyPackageName, type TransformationError, type Transformer } from "@transformer";
import { type BuildContext } from "../../../context/build";
import { typeTransformers } from "..";
import { expandAliases } from "../alias";
import {
	unionDependency,
	unionTagFieldIdentifier,
	unionTypeIdentifier,
	unionValueFieldIdentifier,
} from "./sharedDependency";

export type GoType = GoAST.Type | GoAST.TypeReference;

/**
 * Clé d'identité d'un type Go : son écriture, alias dépliés (`Product` et sa struct sont le
 * même type pour Go).
 * Deux types TS différents (`Success<1>`, `Success<2>`) peuvent donner le même type Go.
 */
export function goTypeKey(type: GoType) {
	return GoPrinter.renderNode(expandAliases(type));
}

/**
 * Le type Go s'il est une union (`shard_dependencies.UnionN[…]`), sinon `undefined`.
 * Ses `typeArguments` sont les variantes, dans l'ordre des champs `V0…VN`.
 */
export function getUnionType(type: GoType) {
	if (!DModeling.hasTagValue(type, "[node]type-reference-generic")) {
		return undefined;
	}

	const target = type.typeReference;

	const isUnion = DModeling.hasTagValue(target, "[node]type-reference-package")
		&& target.packageName.value === sharedDependencyPackageName.value
		&& target.identifier.value === unionTypeIdentifier(type.typeArguments.length).value;

	return isUnion
		? type
		: undefined;
}

/**
 * Type Go d'une union TS, à partir des types Go de ses membres.
 *
 * - Les membres qui ont le même type Go sont fusionnés (`"a" | "b"` → `string`).
 * - Un seul type restant : pas d'union, c'est ce type.
 * - Sinon : `UnionN[…]`, membres triés par leur écriture Go. L'ordre des membres en TS
 *   ne change donc pas le type Go : `A | B` et `B | A` donnent le même.
 */
export function createUnionType(members: readonly GoType[], context: BuildContext) {
	const uniqueMembers = DCommon.pipe(
		new Map(DArray.map(members, (member) => [goTypeKey(member), member] as const)),
		(byKey) => DArray.from(byKey.entries()),
		// `undefined` d'abord : la valeur zéro de l'union (Tag 0) est alors `undefined`, et
		// un champ optionnel en `omitzero` disparaît du JSON comme en JS. Le reste par unités
		// de code : indépendant de la locale de la machine.
		DArray.sort(([first], [second]) => {
			const firstUndefined = first.endsWith(".JSUndefined");
			const secondUndefined = second.endsWith(".JSUndefined");

			if (firstUndefined !== secondUndefined) {
				return firstUndefined ? -1 : 1;
			}

			if (first === second) {
				return 0;
			}

			return first < second ? -1 : 1;
		}),
		DArray.map(([, member]) => member),
	);

	if (!DArray.minElements(uniqueMembers, 2)) {
		// `undefined` seulement pour une union vide, que TS ne produit pas.
		return DArray.first(uniqueMembers);
	}

	const packageName = context.registerSharedDependency(unionDependency(uniqueMembers));

	return GoAST.createGenericTypeReference({
		typeReference: GoAST.createPackageTypeReference({
			packageName,
			identifier: unionTypeIdentifier(uniqueMembers.length),
		}),
		typeArguments: DCommon.cast(uniqueMembers),
	});
}

/**
 * Valeur de la variante `index` d'une union : `UnionN[…]{Tag: index, Vindex: value}`.
 */
export function createUnionValue(unionType: GoAST.GenericTypeReference, index: number, value: GoAST.Expression) {
	return GoAST.createStructLiteral({
		typeReference: unionType,
		elements: [
			GoAST.createKeyedElement({
				key: unionTagFieldIdentifier,
				value: GoAST.createIntegerLiteral({ value: BigInt(index) }),
			}),
			GoAST.createKeyedElement({
				key: unionValueFieldIdentifier(index),
				value,
			}),
		],
	});
}

/**
 * `union.Tag == index`.
 */
export function createUnionTagTest(union: GoAST.Expression, index: number) {
	return GoAST.createBinaryExpression({
		operator: "==",
		left: GoAST.createSelectorExpression({
			target: union,
			identifier: unionTagFieldIdentifier,
		}),
		right: GoAST.createIntegerLiteral({ value: BigInt(index) }),
	});
}

/**
 * `union.Vindex`.
 */
export function createUnionVariantAccess(union: GoAST.Expression, index: number) {
	return GoAST.createSelectorExpression({
		target: union,
		identifier: unionValueFieldIdentifier(index),
	});
}

/**
 * Type Go d'un type calculé par le checker (`getTypeAtLocation`, type de retour…).
 * Un type littéral est élargi à son type de base, celui de la valeur à l'exécution.
 */
export async function transformCheckerType(
	type: Type,
	enclosing: TsAST.Node,
	context: BuildContext,
) {
	// Sans troncature : un type long serait sinon écrit `Left<...>`, sans ses arguments.
	const typeNode = await context.transpilation.typeChecker.typeToTypeNode(
		type,
		enclosing,
		NodeBuilderFlags.NoTruncation,
	);

	if (!typeNode) {
		return context.error(enclosing, "un-support-checker-type");
	}

	const goType = await DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(goType)) {
		return goType;
	}

	if (!DArray.lengthEqual(goType.before, 0)) {
		return context.error(enclosing, "un-support-before-on-checker-type");
	}

	return DEither.success(goType.result);
}

/**
 * Fait passer une valeur Go d'un type à un autre, là où TS l'accepte sans conversion.
 *
 * - Même type Go : rien à faire.
 * - Membre vers une union qui le contient : on construit la variante (`Union{Tag: i, Vi: x}`).
 * - Union vers un de ses membres (rétrécissement : TS sait que seule cette variante est
 *   possible ici) : `x.Vi`.
 * - Union vers une autre union (plus large, ou rétrécie) : chaque variante source est
 *   recopiée dans la variante cible de même type, par une fonction appelée sur place qui
 *   reçoit la valeur (évaluée une fois). Une variante absente de la cible est impossible
 *   ici (TS l'a exclue) : `panic` si elle arrivait quand même.
 */
function getStructFields(struct: GoAST.StructType) {
	return DArray.filter(
		struct.fields,
		(field): field is GoAST.StructField => DModeling.hasTagValue(field, "[node]struct-field"),
	);
}

function isUndefinedable(type: GoType) {
	const members = getUnionType(type)?.typeArguments ?? [type];

	return DArray.some(members, (member) => goTypeKey(member).endsWith(".JSUndefined"));
}

/**
 * Struct vers struct de champs compatibles (objet littéral `{ code: "x" }` là où
 * `{ code?: string }` est attendu) : chaque champ est converti, par une fonction appelée
 * sur place qui reçoit la valeur (évaluée une fois).
 *
 * Refusé (erreur nommée) plutôt que traduit faux :
 * - un champ attendu absent qui ne peut pas valoir `undefined` ;
 * - un champ en trop : JS l'afficherait dans le JSON, Go le perdrait ;
 * - un ordre de clés différent : le JSON de JS suit l'ordre d'insertion, celui de Go
 *   l'ordre de la struct.
 */
type ConversionResult = TransformationError | DEither.Success<GoAST.Expression>;

function convertStruct(
	params: {
		node: TsAST.Node;
		expression: GoAST.Expression;
		sourceStruct: GoAST.StructType;
		targetStruct: GoAST.StructType;
		targetType: GoType;
	},
	context: BuildContext,
): ConversionResult {
	const { node, expression, sourceStruct, targetStruct, targetType } = params;
	const sourceFields = getStructFields(sourceStruct);
	const targetFields = getStructFields(targetStruct);
	const source = GoAST.createIdentifier("source");

	const isTargetField = (field: GoAST.StructField) => DArray.some(
		targetFields,
		({ identifier }) => identifier.value === field.identifier.value,
	);

	if (!DArray.every(sourceFields, isTargetField)) {
		return context.error(node, "un-support-object-extra-field");
	}

	const presentFields = DArray.filter(
		targetFields,
		(field) => DArray.some(sourceFields, ({ identifier }) => identifier.value === field.identifier.value),
	);

	const isSameOrder = DArray.every(
		presentFields,
		(field, { index }) => DArray.at(sourceFields, index)?.identifier.value === field.identifier.value,
	);

	if (!isSameOrder) {
		return context.error(node, "un-support-object-key-order");
	}

	const elements: GoAST.KeyedElement<GoAST.Identifier>[] = [];

	for (const field of targetFields) {
		const sourceField = DArray.find(sourceFields, ({ identifier }) => identifier.value === field.identifier.value);

		if (!sourceField) {
			// Absent : la valeur zéro du champ, qui doit être `undefined` (voir `createUnionType`).
			if (!isUndefinedable(field.typeReference)) {
				return context.error(node, "un-support-object-missing-field");
			}

			continue;
		}

		const value = convertToType(
			{
				node,
				expression: GoAST.createSelectorExpression({
					target: source,
					identifier: sourceField.identifier,
				}),
				sourceType: sourceField.typeReference,
				targetType: field.typeReference,
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		elements.push(GoAST.createKeyedElement({
			key: field.identifier,
			value: DEither.unwrapRight(value),
		}));
	}

	return DEither.success(
		GoAST.createCallExpression({
			callee: GoAST.createFunctionLiteral({
				arguments: [
					GoAST.createFunctionArgument({
						identifier: source,
						type: sourceStruct,
					}),
				],
				returnTypes: [targetType],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createStructLiteral({
									// La struct dépliée : le même type Go que l'alias attendu.
									typeReference: targetStruct,
									elements,
								}),
							],
						}),
					],
				}),
			}),
			arguments: [expression],
		}),
	);
}

interface VariantMapping {
	sourceIndex: number;
	targetIndex: number;
}

export function convertToType(
	params: {
		node: TsAST.Node;
		expression: GoAST.Expression;
		sourceType: GoType;
		targetType: GoType;
	},
	context: BuildContext,
): ConversionResult {
	const { node, expression, sourceType, targetType } = params;
	const sourceKey = goTypeKey(sourceType);
	const targetKey = goTypeKey(targetType);

	if (sourceKey === targetKey) {
		return DEither.success(expression);
	}

	const sourceStruct = expandAliases(sourceType);
	const targetStruct = expandAliases(targetType);

	// Un tableau de `never` est forcément vide (`[]`) : le tableau vide du type attendu.
	if (
		DModeling.hasTagValue(sourceStruct, "[node][type]slice")
		&& goTypeKey(sourceStruct.elementType).endsWith(".JSNever")
		&& DModeling.hasTagValue(targetStruct, "[node][type]slice")
	) {
		return DEither.success(GoAST.createSliceLiteral({
			typeReference: targetStruct,
			elements: [],
		}));
	}

	if (
		DModeling.hasTagValue(sourceStruct, "[node][type]struct")
		&& DModeling.hasTagValue(targetStruct, "[node][type]struct")
	) {
		return convertStruct(
			{
				node,
				expression,
				sourceStruct,
				targetStruct,
				targetType,
			},
			context,
		);
	}

	const sourceUnion = getUnionType(sourceType);
	const targetUnion = getUnionType(targetType);

	const findIndex = (union: GoAST.GenericTypeReference, key: string) => {
		const index = DArray.findIndex(union.typeArguments, (member) => goTypeKey(member) === key);

		return index === -1 ? undefined : index;
	};

	if (!sourceUnion && targetUnion) {
		const index = findIndex(targetUnion, sourceKey);

		if (index !== undefined) {
			return DEither.success(createUnionValue(targetUnion, index, expression));
		}

		// Objet vers union d'objets (union discriminée) : le premier membre vers lequel il
		// se convertit champ par champ. Les membres d'une union discriminée n'ont pas les
		// mêmes champs ; ceux qui ne diffèrent que par la valeur littérale du discriminant
		// ont le même type Go et sont déjà fusionnés.
		if (DModeling.hasTagValue(sourceStruct, "[node][type]struct")) {
			for (const [memberIndex, member] of targetUnion.typeArguments.entries()) {
				const memberStruct = expandAliases(member);

				if (!DModeling.hasTagValue(memberStruct, "[node][type]struct")) {
					continue;
				}

				const converted = convertStruct(
					{
						node,
						expression,
						sourceStruct,
						targetStruct: memberStruct,
						targetType: member,
					},
					context,
				);

				if (DEither.isRight(converted)) {
					return DEither.success(createUnionValue(targetUnion, memberIndex, DEither.unwrapRight(converted)));
				}
			}
		}
	}

	if (sourceUnion && !targetUnion) {
		const index = findIndex(sourceUnion, targetKey);

		if (index !== undefined) {
			return DEither.success(createUnionVariantAccess(expression, index));
		}
	}

	const mappings = sourceUnion && targetUnion
		? DArray.filter(
			DArray.map(sourceUnion.typeArguments, (member, { index }) => ({
				sourceIndex: index,
				targetIndex: findIndex(targetUnion, goTypeKey(member)),
			})),
			(mapping): mapping is VariantMapping => mapping.targetIndex !== undefined,
		)
		: [];

	if (!sourceUnion || !targetUnion || DArray.lengthEqual(mappings, 0)) {
		return context.error(node, {
			reason: "un-support-type-conversion",
			from: sourceKey,
			to: targetKey,
		});
	}

	const source = GoAST.createIdentifier("source");

	return DEither.success(
		GoAST.createCallExpression({
			callee: GoAST.createFunctionLiteral({
				arguments: [
					GoAST.createFunctionArgument({
						identifier: source,
						type: sourceUnion,
					}),
				],
				returnTypes: [targetUnion],
				body: GoAST.createBlockStatement({
					statements: DArray.concat(
						DArray.map(mappings, ({ sourceIndex, targetIndex }) => GoAST.createIfStatement({
							condition: createUnionTagTest(source, sourceIndex),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createReturnStatement({
										values: [
											createUnionValue(
												targetUnion,
												targetIndex,
												createUnionVariantAccess(source, sourceIndex),
											),
										],
									}),
								],
							}),
						})),
						[
							GoAST.createCallExpression({
								callee: GoAST.createIdentifier("panic"),
								arguments: [GoAST.createStringLiteral({ value: "unreachable union variant" })],
							}),
						],
					),
				}),
			}),
			arguments: [expression],
		}),
	);
}

/**
 * La valeur de type `sourceType` peut-elle être passée là où `targetType` est attendu ?
 * Mêmes règles que `convertToType` : même type, membre ↔ union, ou deux unions qui ont
 * au moins une variante en commun.
 */
export function canConvertToType(sourceType: GoType, targetType: GoType) {
	const sourceKey = goTypeKey(sourceType);
	const targetKey = goTypeKey(targetType);
	const sourceMembers = getUnionType(sourceType)?.typeArguments ?? [sourceType];
	const targetMembers = getUnionType(targetType)?.typeArguments ?? [targetType];

	return sourceKey === targetKey
		|| DArray.some(
			sourceMembers,
			(source) => DArray.some(targetMembers, (target) => goTypeKey(source) === goTypeKey(target)),
		);
}

/**
 * `A | B | …` → union taguée Go (voir `createUnionType`).
 */
export const unionTypeTransformer: Transformer<GoType> = createTransformer(
	async(node, context) => {
		if (!TsAST.isUnionTypeNode(node)) {
			return context.notSupport();
		}

		const members = await DCommon.asyncPipe(
			node.types,
			DArray.map(
				(member) => DCommon.asyncPipe(
					context.transform(member, typeTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
		);

		const failedMember = DArray.find(members, DEither.isLeft);

		if (failedMember) {
			return failedMember;
		}

		const transformedMembers = DArray.filter(
			members,
			(member): member is Exclude<typeof member, DEither.Left> => !DEither.isLeft(member),
		);

		const unionType = createUnionType(
			DArray.map(transformedMembers, ({ result }) => result),
			context,
		);

		if (!unionType) {
			return context.error(node, "un-support-empty-union");
		}

		return context.success({
			before: DArray.flatMap(transformedMembers, ({ before }) => before),
			result: unionType,
		});
	},
);

/**
 * `convertToType` pour la valeur Go d'une expression TS : le type source est celui que
 * le checker donne à l'expression.
 */
/**
 * Type Go de la valeur que produit une expression : le type que le checker lui donne, sauf
 * pour un littéral de tableau ou d'objet dans un contexte qui attend un tableau ou un objet
 * (`const requests: readonly Request[] = [ … ]`, `const p: Product = { … }`) : il est
 * produit directement dans le type attendu, chaque valeur convertie à sa place.
 */
export async function getExpressionGoType(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	if (TsAST.isArrayLiteralExpression(node) || TsAST.isObjectLiteralExpression(node)) {
		const contextualType = await typeChecker.getContextualType(node);
		const expectedType = contextualType && await transformCheckerType(contextualType, node, context);

		if (expectedType && DEither.isRight(expectedType)) {
			const expanded = expandAliases(DEither.unwrapRight(expectedType));
			const isExpected = TsAST.isArrayLiteralExpression(node)
				? DModeling.hasTagValue(expanded, "[node][type]slice") || DModeling.hasTagValue(expanded, "[node][type]array")
				: DModeling.hasTagValue(expanded, "[node][type]struct") || DModeling.hasTagValue(expanded, "[node][type]map");

			if (isExpected) {
				return expectedType;
			}
		}
	}

	return transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);
}

export async function convertExpressionToType(
	params: {
		node: TsAST.Expression;
		expression: GoAST.Expression;
		targetType: GoType;
	},
	context: BuildContext,
) {
	const sourceType = await getExpressionGoType(params.node, context);

	if (DEither.isLeft(sourceType)) {
		return sourceType;
	}

	return convertToType(
		{
			...params,
			sourceType: DEither.unwrapRight(sourceType),
		},
		context,
	);
}
