import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { typeTransformers } from ".";

/**
 * A function type `(a: A) => R` becomes the Go function type `func(A) R`.
 */
export const functionTypeTransformer: Transformer<GoAST.FunctionType> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isFunctionTypeNode(node)
			|| !node.type
			|| node.typeParameters
			|| DArray.some(node.parameters, (parameter) => !parameter.type || !!parameter.dotDotDotToken)
		) {
			return context.notSupport();
		}

		const argumentTypes = await DCommon.asyncPipe(
			node.parameters,
			DArray.map(
				(parameter) => DCommon.asyncPipe(
					context.transform(
						parameter.type ?? TsAST.factory.createKeywordTypeNode(TsAST.SyntaxKind.AnyKeyword),
						typeTransformers.value,
					),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<readonly GoAST.FunctionArgument[]>([]),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					if (!DArray.lengthEqual(element.before, 0)) {
						return exit(context.error(node, "un-support-before-on-function-type"));
					}

					return next(
						DArray.push(
							lastValue,
							GoAST.createFunctionArgument({
								identifier: GoAST.createIdentifier("_"),
								type: element.result,
							}),
						),
					);
				},
			),
		);

		if (DEither.isLeft(argumentTypes)) {
			return argumentTypes;
		}

		const returnType = await DCommon.asyncPipe(
			context.transform(node.type, typeTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		if (!DArray.lengthEqual(returnType.before, 0)) {
			return context.error(node, "un-support-before-on-function-type");
		}

		return context.success({
			result: GoAST.createFunctionType({
				arguments: argumentTypes,
				returnTypes: [returnType.result],
			}),
		});
	},
);
