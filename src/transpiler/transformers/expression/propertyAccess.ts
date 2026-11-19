import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { type BuildContext } from "../../context/build";
import { stringLengthDependency, stringLengthIdentifier } from "../duplojs/string/length";
import { expandAliases } from "../type/alias";
import { getFieldIdentifier } from "../type/object";
import {
	convertToType,
	createUnionTagTest,
	createUnionVariantAccess,
	getUnionType,
	goTypeKey,
	transformCheckerType,
	type GoType,
} from "../type/union";

function findField(type: GoType, fieldIdentifier: GoAST.Identifier) {
	const struct = expandAliases(type);

	return DModeling.hasTagValue(struct, "[node][type]struct")
		? DArray.find(
			struct.fields,
			(field): field is GoAST.StructField => DModeling.hasTagValue(field, "[node]struct-field")
				&& field.identifier.value === fieldIdentifier.value,
		)
		: undefined;
}

/**
 * Lecture d'un champ sur une union d'objets qui ont tous ce champ (`request.route`) : une
 * fonction appelée sur place lit le champ de la variante active, converti vers le type
 * que le checker donne à la lecture.
 */
function readUnionField(
	params: {
		node: TsAST.Node;
		target: GoAST.Expression;
		union: GoAST.GenericTypeReference;
		fieldIdentifier: GoAST.Identifier;
		resultType: GoType;
	},
	context: BuildContext,
) {
	const { node, target, union, fieldIdentifier, resultType } = params;
	const source = GoAST.createIdentifier("source");
	const branches: GoAST.Statement[] = [];

	for (const [index, member] of union.typeArguments.entries()) {
		const field = findField(member, fieldIdentifier);

		if (!field) {
			return context.error(node, "un-support-property-access-on-union");
		}

		const value = convertToType(
			{
				node,
				expression: GoAST.createSelectorExpression({
					target: createUnionVariantAccess(source, index),
					identifier: fieldIdentifier,
				}),
				sourceType: field.typeReference,
				targetType: resultType,
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		branches.push(GoAST.createIfStatement({
			condition: createUnionTagTest(source, index),
			body: GoAST.createBlockStatement({
				statements: [GoAST.createReturnStatement({ values: [DEither.unwrapRight(value)] })],
			}),
		}));
	}

	return DEither.success(GoAST.createCallExpression({
		callee: GoAST.createFunctionLiteral({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: source,
					type: union,
				}),
			],
			returnTypes: [resultType],
			body: GoAST.createBlockStatement({
				statements: DArray.concat(
					branches,
					[
						GoAST.createCallExpression({
							callee: GoAST.createIdentifier("panic"),
							arguments: [GoAST.createStringLiteral({ value: "unreachable union variant" })],
						}),
					],
				),
			}),
		}),
		arguments: [target],
	}) as GoAST.Expression);
}

/**
 * `objet.champ` → `objet.Champ` (avec le rétrécissement : converti vers le type que le
 * checker donne à la lecture) ; `tableau.length` → `float64(len(tableau))` ;
 * `chaîne.length` → `StringLength(chaîne)` (unités UTF-16, comme JS) ; sur une union
 * d'objets qui ont tous le champ, le champ de la variante active.
 *
 * Les références DuploJS (`DArray.map`) et les API JS intégrées sont traitées avant.
 */
export const propertyAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPropertyAccessExpression(node) || !TsAST.isIdentifier(node.name)) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const objectType = await transformCheckerType(
			await typeChecker.getTypeAtLocation(node.expression),
			node.expression,
			context,
		);

		// Pas un type Go connu (module importé `* as X`, objet global…) : pas un champ.
		if (DEither.isLeft(objectType)) {
			return context.notSupport();
		}

		const target = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(target)) {
			return target;
		}

		const goObjectType = DEither.unwrapRight(objectType);
		const expanded = expandAliases(goObjectType);
		const name = node.name.text;

		if (name === "length") {
			if (DModeling.hasTagValue(expanded, "[node][type]slice") || DModeling.hasTagValue(expanded, "[node][type]array")) {
				return context.success({
					before: target.before,
					result: GoAST.createConversionExpression({
						typeReference: GoAST.builtinTypeReferences.float64,
						operand: GoAST.createCallExpression({
							callee: GoAST.createIdentifier("len"),
							arguments: [target.result],
						}),
					}),
				});
			}

			if (goTypeKey(expanded) === goTypeKey(GoAST.builtinTypeReferences.string)) {
				return context.success({
					before: target.before,
					result: GoAST.createCallExpression({
						callee: GoAST.createSelectorExpression({
							target: context.registerSharedDependency(stringLengthDependency.value),
							identifier: stringLengthIdentifier,
						}),
						arguments: [target.result],
					}),
				});
			}
		}

		const resultType = await transformCheckerType(
			await typeChecker.getTypeAtLocation(node),
			node,
			context,
		);

		if (DEither.isLeft(resultType)) {
			return resultType;
		}

		const fieldIdentifier = getFieldIdentifier(name, context);
		const union = getUnionType(goObjectType);

		if (union) {
			const value = readUnionField(
				{
					node,
					target: target.result,
					union,
					fieldIdentifier,
					resultType: DEither.unwrapRight(resultType),
				},
				context,
			);

			return DEither.isLeft(value)
				? value
				: context.success({
					before: target.before,
					result: DEither.unwrapRight(value),
				});
		}

		const field = findField(goObjectType, fieldIdentifier);

		if (!field) {
			return context.error(node, "un-support-property-access");
		}

		const value = convertToType(
			{
				node,
				expression: GoAST.createSelectorExpression({
					target: target.result,
					identifier: fieldIdentifier,
				}),
				sourceType: field.typeReference,
				targetType: DEither.unwrapRight(resultType),
			},
			context,
		);

		return DEither.isLeft(value)
			? value
			: context.success({
				before: target.before,
				result: DEither.unwrapRight(value),
			});
	},
);
