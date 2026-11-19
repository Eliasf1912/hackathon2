import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer, getInstantiatedSignature, sequenceEvaluations } from "../../../shared";
import { typeTransformers } from "../../../type";
import { transformCheckerType, type GoType } from "../../../type/union";
import { expressionTransformers } from "../../../expression";
import { type EitherVariant, type EitherVariantForm } from "./sharedDependency";

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

	// `Left<"x", undefined>` : la forme sans valeur, dont le JSON n'a pas de clé `value`.
	if (valueTypeNode.kind === TsAST.SyntaxKind.UndefinedKeyword && variant.empty) {
		return context.success({
			result: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(variant.empty.dependency.value),
				identifier: variant.empty.typeIdentifier,
			}),
		});
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

function isEmptyForm(type: GoType, empty: EitherVariantForm) {
	return DModeling.hasTagValue(type, "[node]type-reference-package")
		&& type.identifier.value === empty.typeIdentifier.value;
}

/**
 * `left("x", undefined)` : forme sans valeur. Les arguments sont tous évalués dans l'ordre
 * (comme en JS), mais seule l'information est passée au constructeur ; la valeur
 * `undefined` est seulement évaluée (`_ = v`).
 */
async function emptyVariantCall(node: TsAST.CallExpression, empty: EitherVariantForm, context: BuildContext) {
	const transformed = await DCommon.asyncPipe(
		node.arguments,
		DArray.map((argument) => DCommon.asyncPipe(
			context.transform(argument, expressionTransformers.value),
			DEither.unwrapRight,
		)),
		DCommon.promiseAll,
	);

	const failed = DArray.find(transformed, DEither.isLeft);

	if (failed) {
		return failed;
	}

	const { before, results } = sequenceEvaluations(
		DArray.filter(
			transformed,
			(evaluation): evaluation is Exclude<typeof evaluation, DEither.Left> => !DEither.isLeft(evaluation),
		),
		context,
	);

	const [information, ...ignored] = results;

	if (!information) {
		return context.error(node, "un-support-either-variant-arguments");
	}

	return context.success({
		before: DArray.concat(
			before,
			DArray.map(ignored, (value) => GoAST.createAssignmentStatement({
				targets: DCommon.cast([GoAST.createIdentifier("_")]),
				values: DCommon.cast([value]),
			})),
		),
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(empty.dependency.value),
				identifier: empty.constructorIdentifier,
			}),
			arguments: [information],
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
		const { empty } = variant;
		const returnType = empty && await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(node),
			node,
			context,
		);

		if (
			!empty
			|| !returnType
			|| DEither.isLeft(returnType)
			|| !isEmptyForm(DEither.unwrapRight(returnType), empty)
		) {
			return context.transform(node, [callExpressionTransformer]);
		}

		return emptyVariantCall(node, empty, context);
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
	const { empty } = variant;

	if (empty && isEmptyForm(goType, empty)) {
		return context.success({
			result: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(empty.dependency.value),
				identifier: empty.constructorIdentifier,
			}),
		});
	}

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
