import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { createMapGet } from "../duplojs/array/collection";
import { sequenceEvaluations } from "../shared";
import { expandAliases } from "../type/alias";
import { convertToType, createUnionType, getUnionType, transformCheckerType } from "../type/union";
import { createNullishReference } from "./nullish";

/**
 * `dictionnaire[clé]` (`Record<string, T>`) → `MapGet(dictionnaire, clé)` : `undefined` si
 * la clé est absente, comme en JS (`noUncheckedIndexedAccess` type la lecture
 * `T | undefined`). Converti ensuite vers le type que le checker donne à la lecture.
 *
 * Limite connue : accès par index d'un tableau (`tableau[i]`).
 */
export const elementAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isElementAccessExpression(node)) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const objectType = await transformCheckerType(
			await typeChecker.getTypeAtLocation(node.expression),
			node.expression,
			context,
		);

		if (DEither.isLeft(objectType)) {
			return objectType;
		}

		const map = expandAliases(DEither.unwrapRight(objectType));

		if (!DModeling.hasTagValue(map, "[node][type]map")) {
			return context.error(node, "un-support-element-access");
		}

		const target = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(target)) {
			return target;
		}

		const key = await DCommon.asyncPipe(
			context.transform(node.argumentExpression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(key)) {
			return key;
		}

		const resultType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

		if (DEither.isLeft(resultType)) {
			return resultType;
		}

		const { before, results: [map0, key0] } = sequenceEvaluations([target, key], context);

		if (!map0 || !key0) {
			return context.error(node, "un-support-element-access");
		}

		// `MapGet` renvoie `Union2[JSUndefined, V]` (`undefined` est toujours la variante 0).
		const readType = createUnionType([createNullishReference("undefined", context), map.valueType], context);
		const converted = getUnionType(DEither.unwrapRight(resultType)) && readType
			? convertToType(
				{
					node,
					expression: createMapGet(map0, key0, context),
					sourceType: readType,
					targetType: DEither.unwrapRight(resultType),
				},
				context,
			)
			: DEither.success(GoAST.createIndexExpression({
				target: map0,
				index: key0,
			}) as GoAST.Expression);

		return DEither.isLeft(converted)
			? converted
			: context.success({
				before,
				result: DEither.unwrapRight(converted),
			});
	},
);
