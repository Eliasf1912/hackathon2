import { TsAST } from "@typescript";
import { useGoType } from "../../resolveGoType";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { blockStatementTransformer } from "../statement/block";

export const functionDeclarationTransformer: Transformer<GoAST.FunctionDeclaration> = createTransformer(
	async(node, context) => {
		if (!TsAST.isFunctionDeclaration(node) || !node.name || !node.body) {
			return context.notSupport();
		}

		const functionIdentifier = context.createSourceIdentifier(node.name.text);
		const { typeChecker } = context.transpilation;

		// Types written in the source and inferred types both come from the checker.
		const functionArguments = await DCommon.asyncPipe(
			node.parameters,
			DArray.map(
				async(parameter) => {
					if (!TsAST.isIdentifier(parameter.name)) {
						return context.error(parameter, "params-name-is-not-identifier");
					}

					const parameterType = await useGoType(
						parameter.type
							? await typeChecker.getTypeFromTypeNode(parameter.type)
							: await typeChecker.getTypeAtLocation(parameter.name),
						parameter,
						context,
					);

					if (DEither.isLeft(parameterType)) {
						return parameterType;
					}

					return GoAST.createFunctionArgument({
						identifier: context.createSourceIdentifier(parameter.name.text),
						type: parameterType,
					});
				},
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<readonly GoAST.FunctionArgument[]>([]),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					return next(
						DArray.push(
							lastValue,
							element,
						),
					);
				},
			),
		);

		if (DEither.isLeft(functionArguments)) {
			return functionArguments;
		}

		const returnType = await useGoType(
			node.type
				? await typeChecker.getTypeFromTypeNode(node.type)
				: await typeChecker.getReturnTypeOfSignature(
					await typeChecker.getSignatureFromDeclaration(node),
				),
			node,
			context,
		);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		const body = await DCommon.asyncPipe(
			context.transform(node.body, [blockStatementTransformer]),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(body)) {
			return body;
		}

		if (!DArray.lengthEqual(body.before, 0)) {
			return context.error(node, "un-support-before-on-block-statement");
		}

		return context.success({
			result: GoAST.createFunctionDeclaration({
				identifier: functionIdentifier,
				arguments: functionArguments,
				returnTypes: [returnType],
				body: body.result,
				generic: [],
			}),
		});
	},
);
