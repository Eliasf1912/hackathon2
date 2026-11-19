import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { expressionTransformers } from "../expression";

interface VariableDeclarations {
	before: readonly GoAST.Statement[];
	current: GoAST.ShortVariableDeclarationStatement | undefined;
}

export const variableStatementTransformer: Transformer<GoAST.ShortVariableDeclarationStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node)) {
			return context.notSupport();
		}

		const isExported = DArray.some(
			node.modifiers ?? [],
			(modifier) => modifier.kind === TsAST.SyntaxKind.ExportKeyword,
		);

		const isSupported = DArray.every(
			node.declarationList.declarations,
			(declaration) => TsAST.isIdentifier(declaration.name) && declaration.initializer !== undefined,
		);

		if (isExported || !isSupported) {
			return context.notSupport();
		}

		const declarations = await DCommon.asyncPipe(
			node.declarationList.declarations,
			DArray.map(
				async(declaration) => {
					if (!TsAST.isIdentifier(declaration.name) || !declaration.initializer) {
						return context.error(declaration, "unsupported-variable-declaration");
					}

					const initializer = await DCommon.asyncPipe(
						context.transform(declaration.initializer, expressionTransformers.value),
						DEither.unwrapRight,
					);

					if (DEither.isLeft(initializer)) {
						return initializer;
					}

					return {
						before: initializer.before,
						statement: GoAST.createShortVariableDeclarationStatement({
							identifier: context.createSourceIdentifier(declaration.name.text),
							initializer: initializer.result,
						}),
					};
				},
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<VariableDeclarations>({
					before: [],
					current: undefined,
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					return next({
						before: DArray.concat(
							lastValue.before,
							lastValue.current ? [lastValue.current] : [],
							element.before,
						),
						current: element.statement,
					});
				},
			),
		);

		if (DEither.isLeft(declarations)) {
			return declarations;
		}

		if (!declarations.current) {
			return context.error(node, "missing-variable-declaration");
		}

		return context.success({
			before: declarations.before,
			result: declarations.current,
		});
	},
);
