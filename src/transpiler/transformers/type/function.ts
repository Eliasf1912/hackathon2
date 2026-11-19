import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { typeTransformers } from ".";

/**
 * Type fonction `(a: A, b: B) => R` → `func(_ A, _ B) R` (les noms des paramètres
 * n'ont pas de sens dans un type Go).
 *
 * Limite connue : paramètre rest ou optionnel, type de retour `void`.
 */
export const functionTypeTransformer: Transformer<GoAST.FunctionType> = createTransformer(
	async(node, context) => {
		if (!TsAST.isFunctionTypeNode(node)) {
			return context.notSupport();
		}

		if (node.typeParameters?.length) {
			return context.error(node, "un-support-generic-function-type");
		}

		const returnsVoid = node.type?.kind === TsAST.SyntaxKind.VoidKeyword;
		const types = await DCommon.asyncPipe(
			DArray.concat(
				DArray.map(node.parameters, (parameter) => parameter.type),
				returnsVoid ? [] : [node.type],
			),
			DArray.map(async(typeNode) => {
				if (!typeNode) {
					return context.error(node, "un-support-function-type-without-annotation");
				}

				return DCommon.asyncPipe(
					context.transform(typeNode, typeTransformers.value),
					DEither.unwrapRight,
				);
			}),
			DCommon.promiseAll,
		);

		const failed = DArray.find(types, DEither.isLeft);

		if (failed) {
			return failed;
		}

		if (DArray.some(node.parameters, (parameter) => !!parameter.dotDotDotToken || !!parameter.questionToken)) {
			return context.error(node, "un-support-function-type-parameter");
		}

		const transformedTypes = DArray.filter(
			types,
			(type): type is Exclude<typeof type, DEither.Left> => !DEither.isLeft(type),
		);

		const returnType = returnsVoid ? undefined : DArray.last(transformedTypes);
		const parameterTypes = returnsVoid ? transformedTypes : DArray.slice(transformedTypes, 0, -1);

		if (!returnsVoid && !returnType) {
			return context.error(node, "un-support-function-type");
		}

		return context.success({
			before: DArray.flatMap(transformedTypes, ({ before }) => before),
			result: GoAST.createFunctionType({
				arguments: DArray.map(
					parameterTypes,
					({ result }) => GoAST.createFunctionArgument({
						identifier: GoAST.createIdentifier("_"),
						type: result,
					}),
				),
				returnTypes: returnType ? [returnType.result] : [],
			}),
		});
	},
);
