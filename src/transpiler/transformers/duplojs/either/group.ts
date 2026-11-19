import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { convertToType, getUnionType, transformCheckerType, type GoType } from "../../type/union";
import { chainBranches, flattenChain, getRightValueType, getVariants, type Branch } from "./dispatch";
import { bindOnce } from "./isRight";
import { hasEitherVariantKind, valueFieldIdentifier } from "./sharedDependency";
import { eitherSuccessDependency, successFunctionIdentifier } from "./success/sharedDependency";

/**
 * Type des valeurs regroupées : l'argument de la variante `Success` du résultat
 * (`Success<number[]>` → `[]float64` ; un tuple donne un tableau `[N]T`).
 */
function getGroupValuesType(outputType: GoType) {
	const successType = DArray.find(
		getUnionType(outputType)?.typeArguments ?? [outputType],
		(type) => hasEitherVariantKind(type, "success"),
	);

	return successType && DModeling.hasTagValue(successType, "[node]type-reference-generic")
		? DArray.first(successType.typeArguments)
		: undefined;
}

/**
 * `DEither.group([e1, e2…])` : le premier `Left` devient le résultat, sinon
 * `success([valeur1, valeur2…])`, comme DuploJS à l'exécution.
 *
 * La longueur n'est connue qu'à l'exécution : une boucle, dans une fonction appelée sur
 * place (le `return` arrête au premier `Left`).
 *
 * ```go
 * out := func() Out {
 *     values := make([]T, len(group))      // ou `var values [N]T` pour un tuple
 *     for index, element := range group {
 *         if element.Tag == 0 { return Out{…element.V0} }   // Left : arrêt
 *         else { values[index] = element.V1.Value }        // Right : sa valeur
 *     }
 *     return Out{…EitherSuccessOf(values)}
 * }()
 * ```
 *
 * Un élément « getter » (`() => calcul()`) est appelé dans la boucle. `asyncGroup` est le
 * même parcours séquentiel (modèle synchrone : `Promise<T>` → `T`).
 *
 * Limite connue : la forme objet (`group({ a, b })`).
 */
export async function groupExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-group-as-value");
	}

	const [groupNode] = node.arguments;

	if (!groupNode || !DArray.lengthEqual(node.arguments, 1)) {
		return context.error(node, "un-support-group-arguments");
	}

	const { typeChecker } = context.transpilation;

	const group = await DCommon.asyncPipe(
		context.transform(groupNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(group)) {
		return group;
	}

	const groupType = await transformCheckerType(await typeChecker.getTypeAtLocation(groupNode), groupNode, context);

	if (DEither.isLeft(groupType)) {
		return groupType;
	}

	const goGroupType = DEither.unwrapRight(groupType);

	if (!DModeling.hasTagValue(goGroupType, "[node][type]slice") && !DModeling.hasTagValue(goGroupType, "[node][type]array")) {
		return context.error(groupNode, "un-support-group-object");
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const goOutputType = DEither.unwrapRight(outputType);
	const valuesType = getGroupValuesType(goOutputType);

	if (!valuesType) {
		return context.error(node, "un-support-group-values-type");
	}

	const boundGroup = bindOnce(group.result, context);
	const values = context.generateIdentifier();
	const index = context.generateIdentifier();
	const element = context.generateIdentifier();

	const convertOutput = (expression: GoAST.Expression, sourceType: GoType) => convertToType(
		{
			node,
			expression,
			sourceType,
			targetType: goOutputType,
		},
		context,
	);

	// Élément « getter » (`() => calcul()`) : appelé dans la boucle, donc seulement si les
	// précédents ont réussi, comme DuploJS.
	const getterType = DModeling.hasTagValue(goGroupType.elementType, "[node][type]function")
		? goGroupType.elementType
		: undefined;
	const itemType = getterType ? DArray.first(getterType.returnTypes) : goGroupType.elementType;

	if (!itemType) {
		return context.error(groupNode, "un-support-group-getter-type");
	}

	const item = getterType ? context.generateIdentifier() : element;

	const callGetter: readonly GoAST.Statement[] = getterType
		? [
			GoAST.createShortVariableDeclarationStatement({
				identifier: item,
				initializer: GoAST.createCallExpression({
					callee: element,
					arguments: [],
				}),
			}),
		]
		: [];

	const valueElementType = "elementType" in valuesType ? valuesType.elementType : undefined;

	if (!valueElementType) {
		return context.error(node, "un-support-group-values-type");
	}

	const branches = DArray.map(getVariants(item, itemType), (variant) => {
		if (hasEitherVariantKind(variant.type, "right")) {
			// Une valeur d'un type plus étroit que les valeurs regroupées (`number` dans
			// `(number | string)[]`) est convertie.
			const value = convertToType(
				{
					node,
					expression: GoAST.createSelectorExpression({
						target: variant.access,
						identifier: valueFieldIdentifier,
					}),
					sourceType: getRightValueType(variant.type),
					targetType: valueElementType,
				},
				context,
			);

			if (DEither.isLeft(value)) {
				return value;
			}

			return DEither.right("branch", {
				test: variant.tagTest,
				statements: [
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([
							GoAST.createIndexExpression({
								target: values,
								index,
							}),
						]),
						values: DCommon.cast([DEither.unwrapRight(value)]),
					}),
				],
			} satisfies Branch);
		}

		// Left (ou valeur qui n'est pas un Either) : devient le résultat, comme DuploJS.
		const converted = convertOutput(variant.access, variant.type);

		if (DEither.isLeft(converted)) {
			return converted;
		}

		return DEither.right("branch", {
			test: variant.tagTest,
			statements: [GoAST.createReturnStatement({ values: [DEither.unwrapRight(converted)] })],
		} satisfies Branch);
	});

	const failedBranch = DArray.find(branches, DEither.isLeft);

	if (failedBranch) {
		return failedBranch;
	}

	const successPackage = context.registerSharedDependency(eitherSuccessDependency.value);

	const success = convertOutput(
		GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: successPackage,
					identifier: successFunctionIdentifier,
				}),
				typeArguments: DCommon.cast([valuesType]),
			}),
			arguments: [values],
		}),
		GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName: successPackage,
				identifier: GoAST.createIdentifier("EitherSuccess"),
			}),
			typeArguments: DCommon.cast([valuesType]),
		}),
	);

	if (DEither.isLeft(success)) {
		return success;
	}

	const valuesDeclaration = DModeling.hasTagValue(valuesType, "[node][type]slice")
		? GoAST.createShortVariableDeclarationStatement({
			identifier: values,
			initializer: GoAST.createCallExpression({
				callee: GoAST.createIdentifier("make"),
				typeArgument: valuesType,
				arguments: [
					GoAST.createCallExpression({
						callee: GoAST.createIdentifier("len"),
						arguments: [boundGroup.result],
					}),
				],
			}),
		})
		: GoAST.createVariableDeclarationZeroValue({
			identifier: values,
			typeReference: valuesType,
		});

	return context.success({
		before: DArray.concat(group.before, boundGroup.before),
		result: GoAST.createCallExpression({
			callee: GoAST.createFunctionLiteral({
				arguments: [],
				returnTypes: [goOutputType],
				body: GoAST.createBlockStatement({
					statements: [
						valuesDeclaration,
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: index,
								value: element,
							}),
							expression: boundGroup.result,
							body: GoAST.createBlockStatement({
								statements: DArray.concat(
									callGetter,
									flattenChain(chainBranches(
										DArray.map(DArray.filter(branches, DEither.isRight), DEither.unwrapRight),
									)),
								),
							}),
						}),
						GoAST.createReturnStatement({ values: [DEither.unwrapRight(success)] }),
					],
				}),
			}),
			arguments: [],
		}),
	});
}
