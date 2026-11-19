import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DPattern from "@duplojs/lang/pattern";
import { type BuildContext } from "../../../context/build";
import { successExpressionHandler, successTypeHandler } from "./success";
import { failExpressionHandler, failTypeHandler } from "./fail";
import { isLeftExpressionHandler, isRightExpressionHandler } from "./isRight";
import { whenIsRightExpressionHandler, whenIsRightOtherwiseExpressionHandler } from "./whenIsRight";
import { matchInformationExpressionHandler } from "./matchInformation";
import { rightPipeExpressionHandler } from "./rightPipe";
import { groupExpressionHandler } from "./group";
import { unwrapRightExpressionHandler } from "./unwrapRight";
import { eitherVariantExpressionHandler, eitherVariantTypeHandler, eitherVariants } from "./variant";

type TransformerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;

type ExpressionHandler = (
	node: TsAST.Node,
	context: BuildContext,
) => TransformerResult | Promise<TransformerResult>;

/**
 * Fonctions du domaine `@duplojs/lang/either`, par nom exporté. Une fonction absente est
 * signalée explicitement (`transformation-error`).
 */
const expressionHandlers = new Map<string, ExpressionHandler>([
	["success", successExpressionHandler],
	["fail", failExpressionHandler],
	["isRight", isRightExpressionHandler],
	["isLeft", isLeftExpressionHandler],
	["whenIsRight", whenIsRightExpressionHandler],
	["whenIsRightOtherwise", whenIsRightOtherwiseExpressionHandler],
	["unwrapRight", unwrapRightExpressionHandler],
	["matchInformation", matchInformationExpressionHandler],
	["rightPipe", rightPipeExpressionHandler],
	// Modèle synchrone (`Promise<T>` → `T`) : mêmes parcours séquentiels que DuploJS.
	["rightAsyncPipe", rightPipeExpressionHandler],
	["group", groupExpressionHandler],
	["asyncGroup", groupExpressionHandler],
	["left", (node, context) => eitherVariantExpressionHandler(node, eitherVariants.left, context)],
	["right", (node, context) => eitherVariantExpressionHandler(node, eitherVariants.right, context)],
	["error", (node, context) => eitherVariantExpressionHandler(node, eitherVariants.error, context)],
]);

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

		const handler = expressionHandlers.get(moduleReference.symbol.name);

		return handler
			? handler(node, context)
			: context.error(node);
	},
);

export const duploJSEitherTypeTransformer: Transformer<
	GoAST.GenericTypeReference | GoAST.PackageTypeReference
> = createTransformer(
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
				() => failTypeHandler(context),
			),
			DPattern.match(
				DCommon.equal("Left"),
				() => eitherVariantTypeHandler(node, eitherVariants.left, context),
			),
			DPattern.match(
				DCommon.equal("Right"),
				() => eitherVariantTypeHandler(node, eitherVariants.right, context),
			),
			DPattern.match(
				DCommon.equal("Error"),
				() => eitherVariantTypeHandler(node, eitherVariants.error, context),
			),
			DPattern.otherwise(
				() => context.notSupport(),
			),
		);
	},
);
