import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import { blockStatementTransformer } from "../statement/block";
import { typeTransformers } from "../type";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";

export const arrowFunctionTransformer: Transformer<GoAST.FunctionLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrowFunction(node) && !TsAST.isFunctionExpression(node)) {
			return context.notSupport();
		}

		const extraStatements: GoAST.Statement[] = [];
		const functionArguments: GoAST.FunctionArgument[] = [];

		for (const parameter of node.parameters) {
			if (TsAST.isIdentifier(parameter.name)) {
				let paramType: GoAST.Type | GoAST.TypeReference = GoAST.builtinTypeReferences.any;

				if (parameter.type) {
					const transformedType = await DCommon.asyncPipe(
						context.transform(parameter.type, typeTransformers.value),
						DEither.unwrapRight,
					);
					if (!DEither.isLeft(transformedType) && DArray.lengthEqual(transformedType.before, 0)) {
						paramType = transformedType.result;
					}
				}

				functionArguments.push(
					GoAST.createFunctionArgument({
						identifier: context.createSourceIdentifier(parameter.name.text),
						type: paramType,
					}),
				);
			} else if (TsAST.isArrayBindingPattern(parameter.name)) {
				const paramIdentifier = context.generateIdentifier();
				functionArguments.push(
					GoAST.createFunctionArgument({
						identifier: paramIdentifier,
						type: GoAST.builtinTypeReferences.any,
					}),
				);

				const sliceAnyType = GoAST.createSliceType({
					elementType: GoAST.builtinTypeReferences.any,
				});

				parameter.name.elements.forEach((element, index) => {
					if (TsAST.isBindingElement(element) && element.name && TsAST.isIdentifier(element.name)) {
						extraStatements.push(
							GoAST.createShortVariableDeclarationStatement({
								identifier: context.createSourceIdentifier(element.name.text),
								initializer: GoAST.createIndexExpression({
									target: GoAST.createTypeAssertionExpression({
										target: paramIdentifier,
										typeReference: sliceAnyType,
									}),
									index: GoAST.createIntegerLiteral({ value: BigInt(index) }),
								}),
							}),
						);
					}
				});
			}
		}

		let bodyStatements: readonly GoAST.Statement[] = [];

		if (TsAST.isBlock(node.body)) {
			const bodyResult = await DCommon.asyncPipe(
				context.transform(node.body, [blockStatementTransformer]),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(bodyResult)) {
				return bodyResult;
			}

			bodyStatements = DArray.concat(
				extraStatements,
				bodyResult.before,
				bodyResult.result.statements,
			);
		} else {
			const expressionResult = await DCommon.asyncPipe(
				context.transform(node.body, expressionTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(expressionResult)) {
				return expressionResult;
			}

			bodyStatements = DArray.concat(
				extraStatements,
				expressionResult.before,
				[
					GoAST.createReturnStatement({
						values: [expressionResult.result],
					}),
				],
			);
		}

		return context.success({
			result: GoAST.createFunctionLiteral({
				arguments: functionArguments,
				variadicArgument: functionArguments.length === 0
					? GoAST.createFunctionArgument({
						identifier: GoAST.createIdentifier("_"),
						type: GoAST.builtinTypeReferences.any,
					})
					: undefined,
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: bodyStatements,
				}),
			}),
		});
	},
);
