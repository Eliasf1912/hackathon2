import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { convertToType, transformCheckerType, type GoType } from "../../type/union";
import { chainBranches, flattenChain, getVariants, type Branch } from "./dispatch";
import { bindOnce } from "./isRight";
import { hasEitherVariantKind, valueFieldIdentifier } from "./sharedDependency";
import { eitherSuccessDependency, successFunctionIdentifier } from "./success/sharedDependency";

/**
 * Type des valeurs regroupées : l'argument de la variante `Success` du résultat
 * (`Success<number[]>` → `[]float64` ; un tuple donne un tableau `[N]T`).
 */
function getGroupValuesType(outputType: GoType, context: BuildContext) {
	const successType = DArray.find(
		getVariants(context.generateIdentifier(), outputType),
		({ type }) => hasEitherVariantKind(type, "success"),
	)?.type;

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
 * Limites connues : la forme objet (`group({ a, b })`) et les éléments « getters »
 * (fonctions appelées pour obtenir l'Either).
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
		return context.error(groupNode, "un-support-group-object-or-getter");
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const goOutputType = DEither.unwrapRight(outputType);
	const valuesType = getGroupValuesType(goOutputType, context);

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

	const branches = DArray.map(getVariants(element, goGroupType.elementType), (variant) => {
		if (hasEitherVariantKind(variant.type, "right")) {
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
						values: DCommon.cast([
							GoAST.createSelectorExpression({
								target: variant.access,
								identifier: valueFieldIdentifier,
							}),
						]),
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
								statements: flattenChain(chainBranches(
									DArray.map(DArray.filter(branches, DEither.isRight), DEither.unwrapRight),
								)),
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
