import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { expressionTransformers } from "../expression";

export const variableStatementTransformer: Transformer<GoAST.ShortVariableDeclarationStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node)) {
			return context.notSupport();
		}

		const declaration = DArray.first(node.declarationList.declarations);

		if (!declaration || !TsAST.isIdentifier(declaration.name) || !declaration.initializer) {
			return context.notSupport();
		}

		const initializer = await DCommon.asyncPipe(
			context.transform(declaration.initializer,expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(initializer)) {
			return initializer;
		}

		return context.success({
			before: initializer.before,
			result: GoAST.createShortVariableDeclarationStatement({
				identifier: context.createSourceIdentifier(declaration.name.text),
				initializer: initializer.result,
			}),
		});
	},
);