import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { transformFunctionReturnType } from "../declaration/function";
import { createBindings } from "./binding";
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
/**
 * Paramètre Go d'un paramètre TS, et les instructions qui lient ses noms quand il est
 * déstructuré (`([one, two]) => …` : paramètre généré, puis `one := p[0]`…).
 */
export async function transformParameter(parameter: TsAST.ParameterDeclaration, context: BuildContext) {
	if (
		!TsAST.isIdentifier(parameter.name)
		&& !TsAST.isArrayBindingPattern(parameter.name)
		&& !TsAST.isObjectBindingPattern(parameter.name)
	) {
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

	const identifier = TsAST.isIdentifier(parameter.name)
		? context.createSourceIdentifier(parameter.name.text)
		: context.generateIdentifier();

	// Un tableau TS (`number[]`, slice Go) trop court donne `undefined` en JS, une panique
	// en Go : seule la déstructuration d'un tuple (`[N]T`, longueur garantie) est traduite.
	if (
		TsAST.isArrayBindingPattern(parameter.name)
		&& !DModeling.hasTagValue(DEither.unwrapRight(type), "[node][type]array")
	) {
		return context.error(parameter, "un-support-binding-from-array");
	}

	const bindings = TsAST.isIdentifier(parameter.name)
		? DEither.right("bindings", [] as readonly GoAST.Statement[])
		: createBindings(parameter.name, identifier, context);

	if (DEither.isLeft(bindings)) {
		return bindings;
	}

	return DEither.right("parameter", {
		argument: GoAST.createFunctionArgument({
			identifier,
			type: DEither.unwrapRight(type),
		}),
		bindings: DEither.unwrapRight(bindings) as readonly GoAST.Statement[],
	});
}

/**
 * Corps d'une fonction fléchée à expression (`() => [-12]`) : `return` de l'expression,
 * convertie vers le type de retour.
 */
async function transformExpressionBody(
	body: TsAST.Expression,
	returnType: GoAST.Type | GoAST.TypeReference | undefined,
	context: BuildContext,
) {
	const expression = await DCommon.asyncPipe(
		context.transform(body, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(expression)) {
		return expression;
	}

	// `() => action()` dans une fonction `void` : l'expression est seulement évaluée.
	if (!returnType) {
		return DEither.right(
			"function-body",
			GoAST.createBlockStatement({
				statements: DArray.concat(
					expression.before,
					[
						DModeling.hasTagValue(expression.result, "[node][expression][statement]call")
							? expression.result
							: GoAST.createAssignmentStatement({
								targets: DCommon.cast([GoAST.createIdentifier("_")]),
								values: DCommon.cast([expression.result]),
							}),
					],
				),
			}),
		);
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
		// Une méthode d'objet littéral (`{ findAll() { … } }`) est un champ de type fonction.
		if (
			!TsAST.isArrowFunction(node)
			&& !TsAST.isFunctionExpression(node)
			&& !(TsAST.isMethodDeclaration(node) && TsAST.isObjectLiteralExpression(node.parent))
			&& !(TsAST.isFunctionDeclaration(node) && TsAST.isBlock(node.parent))
		) {
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

		if (!node.body) {
			return context.error(node, "un-support-function-without-body");
		}

		const body = TsAST.isBlock(node.body)
			? await transformBlockBody(node.body, context)
			: await transformExpressionBody(node.body, DEither.unwrapRight(returnType), context);

		if (DEither.isLeft(body)) {
			return body;
		}

		const transformedParameters = DArray.map(
			DArray.filter(parameters, DEither.isRight),
			DEither.unwrapRight,
		);

		return context.success({
			result: GoAST.createFunctionLiteral({
				arguments: DArray.map(transformedParameters, ({ argument }) => argument),
				returnTypes: DCommon.pipe(DEither.unwrapRight(returnType), (type) => (type ? [type] : [])),
				body: GoAST.createBlockStatement({
					statements: DArray.concat(
						DArray.flatMap(transformedParameters, ({ bindings }) => bindings),
						DEither.unwrapRight(body).statements,
					),
				}),
			}),
		});
	},
);
