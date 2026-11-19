import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer, getInstantiatedSignature } from "../../../shared";
import { typeTransformers } from "../../../type";
import { transformCheckerType } from "../../../type/union";
import { type EitherVariant } from "./sharedDependency";

export { eitherVariants } from "./sharedDependency";

/**
 * Type `DEither.Left<I, T>` / `Right<I, T>` / `Error<T>` → `shard_dependencies.EitherLeft[T]`…
 * L'information (`I`) n'est pas dans le type Go : c'est une valeur à l'exécution.
 */
export async function eitherVariantTypeHandler(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	variant: EitherVariant,
	context: BuildContext,
) {
	const valueTypeNode = node.typeArguments && DArray.at(node.typeArguments, variant.valueTypeArgumentIndex);

	if (!valueTypeNode) {
		return context.error(node, "un-support-either-variant-without-value-type");
	}

	const valueType = await DCommon.asyncPipe(
		context.transform(valueTypeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	return context.success({
		before: valueType.before,
		result: GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(variant.dependency.value),
				identifier: variant.typeIdentifier,
			}),
			typeArguments: DCommon.cast([valueType.result]),
		}),
	});
}

/**
 * `DEither.left(information, value)` → `shard_dependencies.EitherLeftOf[T](information, value)`
 * (de même pour `right` et `error(value)`).
 *
 * La référence est instanciée d'après le type de retour de la signature instanciée
 * (appelée, ou passée en valeur) ; l'appel passe par `callExpressionTransformer`.
 */
export async function eitherVariantExpressionHandler(
	node: TsAST.Node,
	variant: EitherVariant,
	context: BuildContext,
) {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	if (!TsAST.isIdentifier(node) && !TsAST.isPropertyAccessExpression(node)) {
		return context.error(node, "un-support-either-variant-reference");
	}

	const signature = await getInstantiatedSignature(node, context);

	if (!signature) {
		return context.error(node, "un-support-either-variant-without-instantiation");
	}

	const returnType = await transformCheckerType(
		await context.transpilation.typeChecker.getReturnTypeOfSignature(signature),
		node,
		context,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	const goType = DEither.unwrapRight(returnType);

	if (!DModeling.hasTagValue(goType, "[node]type-reference-generic")) {
		return context.error(node, "un-support-either-variant-type");
	}

	return context.success({
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(variant.dependency.value),
				identifier: variant.constructorIdentifier,
			}),
			typeArguments: goType.typeArguments,
		}),
	});
}
