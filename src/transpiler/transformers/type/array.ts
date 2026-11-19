import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { typeTransformers } from ".";
import { goTypeKey } from "./union";

/**
 * `readonly T` : l'immutabilité est vérifiée par TS, Go n'a rien à en garder.
 */
export const readonlyTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (!TsAST.isTypeOperatorNode(node) || node.operator !== TsAST.SyntaxKind.ReadonlyKeyword) {
			return context.notSupport();
		}

		return context.transform(node.type, typeTransformers.value);
	},
);

/**
 * `T[]` → `[]T`, et tuple dont tous les éléments ont le même type Go
 * (`[number, number, number]`) → tableau Go `[3]float64` : la cardinalité reste dans le
 * type, et la valeur ne demande pas d'allocation sur le tas.
 *
 * shortcut: un tuple hétérogène (`[number, string]`), vide ou à éléments optionnels / rest
 * est refusé ; à traduire en struct `TupleN[T0…]` (avec `MarshalJSON` en tableau) quand
 * un exercice en aura besoin.
 */
export const arrayTypeTransformer: Transformer<GoAST.SliceType | GoAST.ArrayType> = createTransformer(
	async(node, context) => {
		if (TsAST.isArrayTypeNode(node)) {
			const element = await DCommon.asyncPipe(
				context.transform(node.elementType, typeTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(element)) {
				return element;
			}

			return context.success({
				before: element.before,
				result: GoAST.createSliceType({ elementType: element.result }),
			});
		}

		if (!TsAST.isTupleTypeNode(node)) {
			return context.notSupport();
		}

		const elements = await DCommon.asyncPipe(
			node.elements,
			DArray.map(
				(element) => DCommon.asyncPipe(
					context.transform(element, typeTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
		);

		const failedElement = DArray.find(elements, DEither.isLeft);

		if (failedElement) {
			return failedElement;
		}

		const transformedElements = DArray.filter(
			elements,
			(element): element is Exclude<typeof element, DEither.Left> => !DEither.isLeft(element),
		);

		const first = DArray.first(transformedElements);

		const isHomogeneous = first && DArray.every(
			transformedElements,
			({ result }) => goTypeKey(result) === goTypeKey(first.result),
		);

		const hasVariableLength = DArray.some(
			node.elements,
			(element) => TsAST.isOptionalTypeNode(element) || TsAST.isRestTypeNode(element)
				|| (TsAST.isNamedTupleMember(element) && (!!element.questionToken || !!element.dotDotDotToken)),
		);

		if (!first || !isHomogeneous || hasVariableLength) {
			return context.error(node, "un-support-heterogeneous-or-empty-tuple");
		}

		return context.success({
			before: DArray.flatMap(transformedElements, ({ before }) => before),
			result: GoAST.createArrayType({
				length: GoAST.createIntegerLiteral({ value: BigInt(transformedElements.length) }),
				elementType: first.result,
			}),
		});
	},
);
