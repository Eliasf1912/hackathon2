import { TsAST } from "@typescript";
import { NodeBuilderFlags } from "typescript/async";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { typeTransformers } from "../type";
import { expressionTransformers } from ".";

interface ArrayElements {
	before: readonly GoAST.Statement[];
	elements: readonly GoAST.Identifier[];
}

/**
 * An array literal becomes a Go slice literal typed with the array type given
 * by the checker. Elements are evaluated in order into temporaries.
 */
export const arrayLiteralTransformer: Transformer<GoAST.SliceLiteral> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isArrayLiteralExpression(node)
			|| DArray.some(node.elements, TsAST.isSpreadElement)
		) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const typeNode = await typeChecker.typeToTypeNode(
			await typeChecker.getTypeAtLocation(node),
			node,
			NodeBuilderFlags.NoTruncation,
		);

		if (!typeNode) {
			return context.error(node, "unresolved-array-literal-type");
		}

		const sliceType = await DCommon.asyncPipe(
			context.transform(typeNode, typeTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(sliceType)) {
			return sliceType;
		}

		const sliceTypeResult = sliceType.result;

		if (!DModeling.hasTagValue(sliceTypeResult, "[node][type]slice")) {
			return context.error(node, "array-literal-is-not-a-slice");
		}

		const elements = await DCommon.asyncPipe(
			node.elements,
			DArray.map(
				(element) => DCommon.asyncPipe(
					context.transform(element, expressionTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<ArrayElements>({
					before: sliceType.before,
					elements: [],
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					const elementStatement = GoAST.createShortVariableDeclarationStatement({
						identifier: context.generateIdentifier(),
						initializer: element.result,
					});

					return next({
						before: DArray.concat(lastValue.before, element.before, [elementStatement]),
						elements: DArray.push(lastValue.elements, elementStatement.identifier),
					});
				},
			),
		);

		if (DEither.isLeft(elements)) {
			return elements;
		}

		return context.success({
			before: elements.before,
			result: GoAST.createSliceLiteral({
				typeReference: sliceTypeResult,
				elements: elements.elements,
			}),
		});
	},
);
