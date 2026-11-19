import { TsAST } from "@typescript";
import { NodeBuilderFlags } from "typescript/async";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import { typeTransformers } from "../type";
import * as DEither from "@duplojs/lang/either";
import { blockStatementTransformer } from "../statement/block";
import { transformParameter } from "../expression/function";
import { type BuildContext } from "../../context/build";

/**
 * Type Go de retour d'une fonction : l'annotation si elle existe, sinon le type déduit
 * par le checker. Partagé avec `return`, qui convertit la valeur renvoyée vers ce type.
 */
export async function transformFunctionReturnType(
	node: TsAST.SignatureDeclaration,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;

	const returnTypeNode = node.type ?? await typeChecker.typeToTypeNode(
		await typeChecker.getReturnTypeOfSignature(
			await typeChecker.getSignatureFromDeclaration(node),
		),
		node,
		NodeBuilderFlags.NoTruncation,
	) ?? TsAST.factory.createKeywordTypeNode(TsAST.SyntaxKind.AnyKeyword);

	// `void` : une fonction Go sans valeur de retour.
	if (returnTypeNode.kind === TsAST.SyntaxKind.VoidKeyword) {
		return DEither.success(undefined);
	}

	const returnType = await DCommon.asyncPipe(
		context.transform(returnTypeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	if (!DArray.lengthEqual(returnType.before, 0)) {
		return context.error(returnTypeNode, "un-support-before-on-return-type");
	}

	return DEither.success(returnType.result);
}

export const functionDeclarationTransformer: Transformer<GoAST.FunctionDeclaration> = createTransformer(
	async(node, context) => {
		if (!TsAST.isFunctionDeclaration(node) || !node.name || !node.body) {
			return context.notSupport();
		}

		const functionIdentifier = context.createSourceIdentifier(node.name.text);

		const parameters = await DCommon.asyncPipe(
			node.parameters,
			DArray.map((parameter) => transformParameter(parameter, context)),
			DCommon.promiseAll,
		);

		const failedParameter = DArray.find(parameters, DEither.isLeft);

		if (failedParameter) {
			return failedParameter;
		}

		const transformedParameters = DArray.map(DArray.filter(parameters, DEither.isRight), DEither.unwrapRight);

		const returnType = await transformFunctionReturnType(node, context);

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
				arguments: DArray.map(transformedParameters, ({ argument }) => argument),
				returnTypes: DCommon.pipe(DEither.unwrapRight(returnType), (type) => (type ? [type] : [])),
				// Paramètres déstructurés (`({ a, b }) =>`) : liés au début du corps.
				body: GoAST.createBlockStatement({
					statements: DArray.concat(
						DArray.flatMap(transformedParameters, ({ bindings }) => bindings),
						body.result.statements,
					),
				}),
				// `function ok<GenericBody>(…)` → `func ok[GenericBody any](…)`.
				generic: DArray.map(node.typeParameters ?? [], ({ name }) => GoAST.createTypeParameter({
					identifier: context.createSourceIdentifier(name.text),
					constraint: GoAST.builtinTypeReferences.any,
				})),
			}),
		});
	},
);
