import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { transformFunctionReturnType } from "../declaration/function";
import { blockStatementTransformer } from "../statement/block";
import { typeTransformers } from "../type";
import { convertExpressionToType, transformCheckerType } from "../type/union";
import { type BuildContext } from "../../context/build";

async function transformAnnotation(typeNode: TsAST.TypeNode, context: BuildContext) {
	const type = await DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(type)) {
		return type;
	}

	if (!DArray.lengthEqual(type.before, 0)) {
		return context.error(typeNode, "un-support-before-on-parameter");
	}

	return DEither.right("parameter-type", type.result);
}

/**
 * Paramètre d'une fonction anonyme : son annotation, sinon le type que le checker lui donne
 * (souvent déduit du contexte : `(value) => …` passé à `rightPipe`).
 */
async function transformParameter(parameter: TsAST.ParameterDeclaration, context: BuildContext) {
	if (!TsAST.isIdentifier(parameter.name)) {
		return context.error(parameter, "params-name-is-not-identifier");
	}

	const type = parameter.type
		? await transformAnnotation(parameter.type, context)
		: await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(parameter),
			parameter,
			context,
		);

	if (DEither.isLeft(type)) {
		return type;
	}

	return DEither.right(
		"parameter",
		GoAST.createFunctionArgument({
			identifier: context.createSourceIdentifier(parameter.name.text),
			type: DEither.unwrapRight(type),
		}),
	);
}

/**
 * Corps d'une fonction fléchée à expression (`() => [-12]`) : `return` de l'expression,
 * convertie vers le type de retour.
 */
async function transformExpressionBody(
	body: TsAST.Expression,
	returnType: GoAST.Type | GoAST.TypeReference,
	context: BuildContext,
) {
	const expression = await DCommon.asyncPipe(
		context.transform(body, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(expression)) {
		return expression;
	}

	const value = await convertExpressionToType(
		{
			node: body,
			expression: expression.result,
			targetType: returnType,
		},
		context,
	);

	if (DEither.isLeft(value)) {
		return value;
	}

	return DEither.right(
		"function-body",
		GoAST.createBlockStatement({
			statements: DArray.concat(
				expression.before,
				[GoAST.createReturnStatement({ values: [DEither.unwrapRight(value)] })],
			),
		}),
	);
}

async function transformBlockBody(body: TsAST.Block, context: BuildContext) {
	const block = await DCommon.asyncPipe(
		context.transform(body, [blockStatementTransformer]),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(block)) {
		return block;
	}

	return DEither.right("function-body", block.result);
}

/**
 * `(a) => …` et `function (a) { … }` → fonction anonyme Go `func(a T) R { … }`.
 * Les types viennent des annotations, sinon du checker ; le type de retour est celui de
 * `transformFunctionReturnType`, comme pour une déclaration de fonction.
 */
export const functionExpressionTransformer: Transformer<GoAST.FunctionLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrowFunction(node) && !TsAST.isFunctionExpression(node)) {
			return context.notSupport();
		}

		if (node.asteriskToken) {
			return context.error(node, "un-support-generator-function");
		}

		const parameters = await DCommon.asyncPipe(
			node.parameters,
			DArray.map((parameter) => transformParameter(parameter, context)),
			DCommon.promiseAll,
		);

		const failedParameter = DArray.find(parameters, DEither.isLeft);

		if (failedParameter) {
			return failedParameter;
		}

		const returnType = await transformFunctionReturnType(node, context);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		const body = TsAST.isBlock(node.body)
			? await transformBlockBody(node.body, context)
			: await transformExpressionBody(node.body, DEither.unwrapRight(returnType), context);

		if (DEither.isLeft(body)) {
			return body;
		}

		return context.success({
			result: GoAST.createFunctionLiteral({
				arguments: DArray.map(
					DArray.filter(parameters, DEither.isRight),
					DEither.unwrapRight,
				),
				returnTypes: [DEither.unwrapRight(returnType)],
				body: DEither.unwrapRight(body),
			}),
		});
	},
);
