import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { getDeclaredGoType } from "../common/identifier";
import { expressionTransformers } from "../expression";
import { convertExpressionToType } from "../type/union";

/**
 * `variable = valeur;` → `variable = valeur`, la valeur convertie vers le type déclaré de
 * la variable (pas le type rétréci : c'est la variable elle-même qui change). Une
 * fermeture qui capture la variable voit la nouvelle valeur, comme en JS.
 *
 * Refusé (conception des objets : valeurs, pas de références) : modifier un champ
 * (`objet.champ = …`), affectation composée (`+=`).
 */
export const assignmentStatementTransformer: Transformer<GoAST.AssignmentStatement> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isExpressionStatement(node)
			|| !TsAST.isBinaryExpression(node.expression)
			|| node.expression.operatorToken.kind !== TsAST.SyntaxKind.EqualsToken
		) {
			return context.notSupport();
		}

		const { left, right } = node.expression;

		if (!TsAST.isIdentifier(left)) {
			return context.error(node, "un-support-field-assignment");
		}

		const declaredType = await getDeclaredGoType(left, context);

		if (!declaredType) {
			return context.error(node, "un-support-assignment-target");
		}

		if (DEither.isLeft(declaredType)) {
			return declaredType;
		}

		const value = await DCommon.asyncPipe(
			context.transform(right, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		const converted = await convertExpressionToType(
			{
				node: right,
				expression: value.result,
				targetType: DEither.unwrapRight(declaredType),
			},
			context,
		);

		if (DEither.isLeft(converted)) {
			return converted;
		}

		return context.success({
			before: value.before,
			result: GoAST.createAssignmentStatement({
				targets: DCommon.cast([context.createSourceIdentifier(left.text)]),
				values: DCommon.cast([DEither.unwrapRight(converted)]),
			}),
		});
	},
);
