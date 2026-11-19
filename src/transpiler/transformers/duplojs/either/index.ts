import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DPattern from "@duplojs/lang/pattern";
import { successExpressionHandler, successTypeHandler } from "./success";
import { isRightExpressionHandler } from "./isRight";
import { whenIsRightExpressionHandler } from "./whenIsRight";
import { whenIsRightOtherwiseExpressionHandler } from "./whenIsRightOtherwise";
import { failExpressionHandler, failTypeHandler } from "./fail";
import { leftExpressionHandler } from "./left";
import { matchInformationExpressionHandler } from "./matchInformation";
import { rightPipeExpressionHandler } from "./rightPipe";
import { groupExpressionHandler } from "./group";

export const duploJSEitherDeclarationTransformer: Transformer<GoAST.Declaration> = createTransformer(
	(_node, context) => context.notSupport(),
);

export const duploJSEitherExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (
			!TsAST.isIdentifier(reference)
			&& !TsAST.isPropertyAccessExpression(reference)
		) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/either\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		return DCommon.pipe(
			moduleReference.symbol.name,
			DPattern.match(
				DCommon.equal("success"),
				() => successExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("isRight"),
				() => isRightExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("whenIsRight"),
				() => whenIsRightExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("whenIsRightOtherwise"),
				() => whenIsRightOtherwiseExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("fail"),
				() => failExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("left"),
				() => leftExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("matchInformation"),
				() => matchInformationExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("rightPipe"),
				() => rightPipeExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("rightAsyncPipe"),
				() => rightPipeExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("group"),
				() => groupExpressionHandler(
					node,
					context,
				),
			),
			DPattern.match(
				DCommon.equal("asyncGroup"),
				() => groupExpressionHandler(
					node,
					context,
				),
			),
			DPattern.otherwise(
				() => context.error(node),
			),
		);
	},
);

export const duploJSEitherTypeTransformer: Transformer<GoAST.TypeReference | GoAST.Type> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeReferenceNode(node) && !TsAST.isImportTypeNode(node)) {
			return context.notSupport();
		}

		const reference = TsAST.isTypeReferenceNode(node) ? node.typeName : node;

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/either\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		return DCommon.pipe(
			moduleReference.symbol.name,
			DPattern.match(
				DCommon.equal("Success"),
				() => successTypeHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("Fail"),
				() => failTypeHandler(node, context),
			),
			DPattern.otherwise(
				() => context.notSupport(),
			),
		);
	},
);
