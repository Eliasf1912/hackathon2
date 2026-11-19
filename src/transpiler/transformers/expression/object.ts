import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { type BuildContext } from "../../context/build";
import { bindOnce, sequenceEvaluations, type Evaluation } from "../shared";
import { expandAliases } from "../type/alias";
import { getFieldIdentifier } from "../type/object";
import { convertToType, getExpressionGoType, getUnionType, goTypeKey, transformCheckerType, type GoType } from "../type/union";

/**
 * Valeur d'une propriété du littéral : son expression transformée et son type Go.
 */
interface PropertyValue {
	name: string;
	evaluation: Evaluation;
	type: GoType;
	// Champ d'une décomposition qui peut valoir `undefined` : il ne remplace la valeur
	// précédente que s'il est défini (une clé absente n'est pas copiée en JS).
	mergesIfDefined: boolean;
}

interface LastValue {
	result: GoAST.Expression;
	type: GoType;
}

function getPropertyName(name: TsAST.PropertyName) {
	return TsAST.isIdentifier(name) || TsAST.isStringLiteral(name) || TsAST.isNumericLiteral(name)
		? name.text
		: undefined;
}

async function transformValue(valueNode: TsAST.Expression | TsAST.MethodDeclaration, context: BuildContext) {
	const value = await DCommon.asyncPipe(
		context.transform(valueNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(value)) {
		return value;
	}

	// Le type de la valeur Go produite (un littéral imbriqué est produit dans son type attendu).
	const type = TsAST.isMethodDeclaration(valueNode)
		? await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(valueNode),
			valueNode,
			context,
		)
		: await getExpressionGoType(valueNode, context);

	return DEither.isLeft(type)
		? type
		: DEither.right("value", {
			evaluation: value,
			type: DEither.unwrapRight(type),
		});
}

export function canBeUndefined(type: GoType) {
	const members = getUnionType(type)?.typeArguments ?? [type];

	return DArray.some(members, (member) => goTypeKey(member).endsWith(".JSUndefined"));
}

function getStructFields(struct: GoAST.StructType) {
	return DArray.filter(
		struct.fields,
		(field): field is GoAST.StructField => DModeling.hasTagValue(field, "[node]struct-field"),
	);
}

/**
 * Les propriétés du littéral, dans l'ordre JS. Une décomposition `...source` donne une
 * propriété par champ de `source` (lue dans une variable : `source` n'est évalué qu'une
 * fois) ; une propriété écrite plus loin remplace la précédente, comme en JS.
 */
async function collectProperties(node: TsAST.ObjectLiteralExpression, context: BuildContext) {
	const properties: PropertyValue[] = [];

	for (const property of node.properties) {
		if (TsAST.isSpreadAssignment(property)) {
			const spread = await transformValue(property.expression, context);

			if (DEither.isLeft(spread)) {
				return spread;
			}

			const { evaluation, type } = DEither.unwrapRight(spread);
			const struct = expandAliases(type);

			if (!DModeling.hasTagValue(struct, "[node][type]struct")) {
				return context.error(property, "un-support-object-spread-type");
			}

			const bound = bindOnce(evaluation.result, context);

			for (const [index, field] of getStructFields(struct).entries()) {
				const name = /"([^"]+)"/u.exec(field.tag ?? "")?.[1]?.split(",")[0];

				if (name === undefined) {
					return context.error(property, "un-support-object-spread-type");
				}

				properties.push({
					name,
					// Les calculs préalables de la décomposition, une seule fois, avant son premier champ.
					evaluation: {
						before: index === 0 ? DArray.concat(evaluation.before, bound.before) : [],
						result: GoAST.createSelectorExpression({
							target: bound.result,
							identifier: field.identifier,
						}),
					},
					type: field.typeReference,
					mergesIfDefined: canBeUndefined(field.typeReference),
				});
			}

			continue;
		}

		// `{ a: valeur }`, `{ a }` (raccourci de `{ a: a }`) ou `{ a() { … } }` (méthode).
		const valueNode = DCommon.pipe(undefined, (): TsAST.Expression | TsAST.MethodDeclaration | undefined => {
			if (TsAST.isPropertyAssignment(property)) {
				return property.initializer;
			}

			if (TsAST.isShorthandPropertyAssignment(property) && TsAST.isIdentifier(property.name)) {
				return property.name;
			}

			return TsAST.isMethodDeclaration(property) ? property : undefined;
		});
		const name = valueNode ? getPropertyName(property.name) : undefined;

		if (!valueNode || name === undefined) {
			return context.error(property, "un-support-object-property");
		}

		const value = await transformValue(valueNode, context);

		if (DEither.isLeft(value)) {
			return value;
		}

		properties.push({
			name,
			...DEither.unwrapRight(value),
			mergesIfDefined: false,
		});
	}

	return DEither.right("properties", properties);
}

/**
 * `{ a: 1, b, ...source }` → littéral Go du type que le checker donne à l'objet :
 * - struct (type d'objet) : `struct { … }{A: 1, B: b, …}`, chaque valeur convertie vers
 *   le type de son champ ;
 * - map (`Record<string, T>`) : `map[string]T{"a": 1, …}`.
 *
 * Les propriétés sont évaluées dans l'ordre JS.
 *
 * Limite connue : méthodes et accesseurs (`get x()`), noms calculés (`[clé]`).
 */
export const objectLiteralTransformer: Transformer<GoAST.StructLiteral | GoAST.MapLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isObjectLiteralExpression(node)) {
			return context.notSupport();
		}

		const objectType = await getExpressionGoType(node, context);

		if (DEither.isLeft(objectType)) {
			return objectType;
		}

		const goType = expandAliases(DEither.unwrapRight(objectType));
		const collected = await collectProperties(node, context);

		if (DEither.isLeft(collected)) {
			return collected;
		}

		const properties = DEither.unwrapRight(collected);

		// Pour chaque nom, la dernière valeur qui remplace à coup sûr : les valeurs d'avant sont
		// quand même évaluées, comme en JS (`_ = f()` à leur place) ; celles d'après sont des
		// champs décomposés optionnels, fusionnés s'ils sont définis.
		const resetIndexes = new Map<string, number>();

		for (const [index, { name, mergesIfDefined }] of properties.entries()) {
			if (!mergesIfDefined || !resetIndexes.has(name)) {
				resetIndexes.set(name, index);
			}
		}

		const evaluations = DArray.map(properties, ({ name, evaluation }, { index }) => (
			index >= (resetIndexes.get(name) ?? 0)
				? evaluation
				: {
					before: DArray.concat(
						evaluation.before,
						[
							GoAST.createAssignmentStatement({
								targets: DCommon.cast([GoAST.createIdentifier("_")]),
								values: DCommon.cast([evaluation.result]),
							}),
						],
					),
					// Jamais utilisé : un identifiant n'est pas réévalué par `sequenceEvaluations`.
					result: GoAST.createIdentifier("_"),
				}
		));

		const { before, results } = sequenceEvaluations(evaluations, context);

		// Valeurs gardées de chaque propriété, dans l'ordre : la valeur qui remplace, puis les
		// champs décomposés optionnels à fusionner. L'ordre des clés est celui de la première
		// apparition (une clé remplacée garde sa place en JS).
		const lastValues = new Map<string, readonly LastValue[]>();

		for (const [index, property] of properties.entries()) {
			const result = DArray.at(results, index);

			if (result && index >= (resetIndexes.get(property.name) ?? 0)) {
				lastValues.set(property.name, DArray.concat(lastValues.get(property.name) ?? [], [
					{
						result,
						type: property.type,
					},
				]));
			} else if (!lastValues.has(property.name)) {
				lastValues.set(property.name, []);
			}
		}

		const mergeBefore: GoAST.Statement[] = [];

		/**
		 * Valeur finale d'un champ : la valeur qui remplace, puis chaque champ décomposé
		 * optionnel s'il est défini (`if source.F.Tag != 0 { acc = source.F }`).
		 */
		const mergeValues = (values: readonly LastValue[], targetType: GoType) => {
			const [first, ...merges] = values;

			if (!first) {
				return undefined;
			}

			const converted = convertToType(
				{
					node,
					expression: first.result,
					sourceType: first.type,
					targetType,
				},
				context,
			);

			if (DEither.isLeft(converted) || DArray.lengthEqual(merges, 0)) {
				return converted;
			}

			const accumulator = context.generateIdentifier();

			mergeBefore.push(GoAST.createShortVariableDeclarationStatement({
				identifier: accumulator,
				initializer: DEither.unwrapRight(converted),
			}));

			for (const merge of merges) {
				const mergeUnion = getUnionType(merge.type);
				const mergeValue = convertToType(
					{
						node,
						expression: merge.result,
						sourceType: merge.type,
						targetType,
					},
					context,
				);

				if (DEither.isLeft(mergeValue)) {
					return mergeValue;
				}

				// Toujours `undefined` (type `undefined` seul) : jamais copié.
				if (!mergeUnion) {
					continue;
				}

				mergeBefore.push(GoAST.createIfStatement({
					condition: GoAST.createBinaryExpression({
						operator: "!=",
						left: GoAST.createSelectorExpression({
							target: merge.result,
							identifier: GoAST.createIdentifier("Tag"),
						}),
						right: GoAST.createIntegerLiteral({ value: 0n }),
					}),
					body: GoAST.createBlockStatement({
						statements: [
							GoAST.createAssignmentStatement({
								targets: DCommon.cast([accumulator]),
								values: DCommon.cast([DEither.unwrapRight(mergeValue)]),
							}),
						],
					}),
				}));
			}

			return DEither.success(accumulator as GoAST.Expression);
		};

		if (DModeling.hasTagValue(goType, "[node][type]map")) {
			const elements: GoAST.KeyedElement[] = [];

			for (const [name, values] of lastValues) {
				const converted = mergeValues(values, goType.valueType);

				if (!converted) {
					continue;
				}

				if (DEither.isLeft(converted)) {
					return converted;
				}

				elements.push(GoAST.createKeyedElement({
					key: GoAST.createStringLiteral({ value: name }),
					value: DEither.unwrapRight(converted),
				}));
			}

			return context.success({
				before: DArray.concat(before, mergeBefore),
				result: GoAST.createMapLiteral({
					typeReference: goType,
					elements,
				}),
			});
		}

		if (!DModeling.hasTagValue(goType, "[node][type]struct")) {
			return context.error(node, "un-support-object-literal-type");
		}

		const fields = getStructFields(goType);
		const insertionOrder = DArray.filter(
			[...lastValues.keys()],
			(name) => !DArray.lengthEqual(lastValues.get(name) ?? [], 0),
		);
		const fieldOrder = DArray.map(
			insertionOrder,
			(name) => DArray.findIndex(
				fields,
				({ identifier }) => identifier.value === getFieldIdentifier(name, context).value,
			) ?? -1,
		);

		if (DArray.some(fieldOrder, (index) => index === -1)) {
			return context.error(node, "un-support-object-extra-field");
		}

		// Le JSON de Go suit l'ordre de la struct, celui de JS l'ordre d'insertion.
		const isInsertionOrder = DArray.every(
			fieldOrder,
			(index, { index: position }) => position === 0 || index > (DArray.at(fieldOrder, position - 1) ?? -1),
		);

		if (!isInsertionOrder) {
			return context.error(node, "un-support-object-key-order");
		}

		const elements: GoAST.KeyedElement<GoAST.Identifier>[] = [];

		for (const field of fields) {
			const values = DArray.find(
				[...lastValues.entries()],
				([name]) => getFieldIdentifier(name, context).value === field.identifier.value,
			)?.[1] ?? [];
			const converted = mergeValues(values, field.typeReference);

			if (!converted) {
				// Absent : la valeur zéro du champ, qui doit pouvoir valoir `undefined`.
				if (!canBeUndefined(field.typeReference)) {
					return context.error(node, "un-support-object-missing-field");
				}

				continue;
			}

			if (DEither.isLeft(converted)) {
				return converted;
			}

			elements.push(GoAST.createKeyedElement({
				key: field.identifier,
				value: DEither.unwrapRight(converted),
			}));
		}

		return context.success({
			before: DArray.concat(before, mergeBefore),
			result: GoAST.createStructLiteral({
				typeReference: goType,
				elements,
			}),
		});
	},
);
