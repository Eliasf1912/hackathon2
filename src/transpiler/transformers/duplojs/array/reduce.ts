import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createSharedDependency, createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../context/build";
import { typeTransformers } from "../../type";
import { expandAliases } from "../../type/alias";
import { simpleFunctionHandler } from "../simpleFunction";

const reduceParamsIdentifier = GoAST.createIdentifier("ReduceParams");
const reduceStepIdentifier = GoAST.createIdentifier("ReduceStep");
const reduceIdentifier = GoAST.createIdentifier("Reduce");

/**
 * `DArray.reduce` comme DuploJS : le rappel reçoit `{ element, index, lastValue, next,
 * exit }` et renvoie `next(valeur)` (élément suivant) ou `exit(valeur)` (arrêt).
 *
 * ```go
 * type ReduceStep[A any] struct { Value A; Exit bool }
 * type ReduceParams[T any, A any] struct {
 *     Element T; Index float64; LastValue A
 *     Next func(A) ReduceStep[A]; Exit func(A) ReduceStep[A]
 * }
 * func Reduce[T any, A any](array []T, accumulator A, callback func(ReduceParams[T, A]) ReduceStep[A]) A
 * ```
 *
 * shortcut: `nextPush`, `nextWithObject`, `self` et un `exit` d'un autre type que
 * l'accumulateur ne sont pas fournis (erreur de compilation Go) ; à ajouter quand un
 * programme les utilisera.
 */
const reduceDependency = DCommon.memo(() => {
	const element = GoAST.createIdentifier("T");
	const output = GoAST.createIdentifier("A");
	const elementParameter = GoAST.createTypeParameter({
		identifier: element,
		constraint: GoAST.builtinTypeReferences.any,
	});
	const outputParameter = GoAST.createTypeParameter({
		identifier: output,
		constraint: GoAST.builtinTypeReferences.any,
	});
	const step = GoAST.createGenericTypeReference({
		typeReference: reduceStepIdentifier,
		typeArguments: DCommon.cast([output]),
	});
	const params = GoAST.createGenericTypeReference({
		typeReference: reduceParamsIdentifier,
		typeArguments: DCommon.cast([element, output]),
	});
	const value = GoAST.createIdentifier("value");
	const accumulator = GoAST.createIdentifier("accumulator");
	const array = GoAST.createIdentifier("array");
	const callback = GoAST.createIdentifier("callback");
	const index = GoAST.createIdentifier("index");
	const item = GoAST.createIdentifier("element");
	const result = GoAST.createIdentifier("result");
	const stepFunction = GoAST.createFunctionType({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: value,
				type: output,
			}),
		],
		returnTypes: [step],
	});
	const field = (name: string, type: GoAST.Type | GoAST.TypeReference) => GoAST.createStructField({
		identifier: GoAST.createIdentifier(name),
		typeReference: type,
	});
	const keyed = (name: string, keyedValue: GoAST.Expression) => GoAST.createKeyedElement({
		key: GoAST.createIdentifier(name),
		value: keyedValue,
	});
	const createStep = (exit: boolean) => GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: value,
				type: output,
			}),
		],
		returnTypes: [step],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [
						GoAST.createStructLiteral({
							typeReference: step,
							elements: [keyed("Value", value), keyed("Exit", GoAST.createBooleanLiteral({ value: exit }))],
						}),
					],
				}),
			],
		}),
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: reduceStepIdentifier,
				generic: [outputParameter],
				type: GoAST.createStructType({
					fields: [field("Value", output), field("Exit", GoAST.builtinTypeReferences.bool)],
				}),
			}),
			GoAST.createTypeDefinition({
				identifier: reduceParamsIdentifier,
				generic: [elementParameter, outputParameter],
				type: GoAST.createStructType({
					fields: [
						field("Element", element),
						field("Index", GoAST.builtinTypeReferences.float64),
						field("LastValue", output),
						field("Next", stepFunction),
						field("Exit", stepFunction),
					],
				}),
			}),
			GoAST.createFunctionDeclaration({
				identifier: reduceIdentifier,
				generic: [elementParameter, outputParameter],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: array,
						type: GoAST.createSliceType({ elementType: element }),
					}),
					GoAST.createFunctionArgument({
						identifier: accumulator,
						type: output,
					}),
					GoAST.createFunctionArgument({
						identifier: callback,
						type: GoAST.createFunctionType({
							arguments: [
								GoAST.createFunctionArgument({
									identifier: GoAST.createIdentifier("params"),
									type: params,
								}),
							],
							returnTypes: [step],
						}),
					}),
				],
				returnTypes: [output],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: index,
								value: item,
							}),
							expression: array,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: result,
										initializer: GoAST.createCallExpression({
											callee: callback,
											arguments: [
												GoAST.createStructLiteral({
													typeReference: params,
													elements: [
														keyed("Element", item),
														keyed("Index", GoAST.createConversionExpression({
															typeReference: GoAST.builtinTypeReferences.float64,
															operand: index,
														})),
														keyed("LastValue", accumulator),
														keyed("Next", createStep(false)),
														keyed("Exit", createStep(true)),
													],
												}),
											],
										}),
									}),
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([accumulator]),
										values: DCommon.cast([
											GoAST.createSelectorExpression({
												target: result,
												identifier: GoAST.createIdentifier("Value"),
											}),
										]),
									}),
									GoAST.createIfStatement({
										condition: GoAST.createSelectorExpression({
											target: result,
											identifier: GoAST.createIdentifier("Exit"),
										}),
										body: GoAST.createBlockStatement({
											statements: [GoAST.createBreakStatement({})],
										}),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({ values: [accumulator] }),
					],
				}),
			}),
		],
	});
});

function sharedReference(identifier: GoAST.Identifier, context: BuildContext) {
	return GoAST.createPackageTypeReference({
		packageName: context.registerSharedDependency(reduceDependency.value),
		identifier,
	});
}

/**
 * `DArray.reduce(tableau, départ, rappel)` → `shard_dependencies.Reduce(…)` ;
 * `DArray.reduceFrom(x)` → `x`.
 */
export function reduceExpressionHandler(node: TsAST.Node, name: string, context: BuildContext) {
	if (name === "reduceFrom") {
		return simpleFunctionHandler(
			{
				node,
				name,
				arity: 1,
				build: ([value]) => value,
			},
			context,
		);
	}

	return simpleFunctionHandler(
		{
			node,
			name,
			arity: 3,
			build: ([array, initial, callback]) => array && initial && callback && GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: context.registerSharedDependency(reduceDependency.value),
					identifier: reduceIdentifier,
				}),
				arguments: [array, initial, callback],
			}),
		},
		context,
	);
}

async function transformTypeArgument(node: TsAST.TypeNode | undefined, context: BuildContext) {
	if (!node) {
		return undefined;
	}

	const type = await DCommon.asyncPipe(
		context.transform(node, typeTransformers.value),
		DEither.unwrapRight,
	);

	return DEither.isLeft(type) ? undefined : type.result;
}

/**
 * Types de `reduce` : `ReduceTheFunctionParams<Tableau, A>` → `ReduceParams[T, A]`,
 * `ReduceNext<A>` / `ReduceExit<A>` → `ReduceStep[A]`, `ReduceFromResult<V>` → `V`.
 */
async function reduceTypeHandler(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	name: string,
	context: BuildContext,
) {
	const [first, second] = node.typeArguments ?? [];

	if (name === "ReduceFromResult") {
		return first
			? context.transform(first, typeTransformers.value)
			: context.error(node, "un-support-reduce-type");
	}

	if (name === "ReduceNext" || name === "ReduceExit") {
		const output = await transformTypeArgument(first, context);

		return output
			? context.success({
				result: GoAST.createGenericTypeReference({
					typeReference: sharedReference(reduceStepIdentifier, context),
					typeArguments: DCommon.cast([output]),
				}),
			})
			: context.error(node, "un-support-reduce-type");
	}

	const array = await transformTypeArgument(first, context);
	const output = await transformTypeArgument(second, context);
	const expanded = array && expandAliases(array);
	const isArray = expanded && (
		DModeling.hasTagValue(expanded, "[node][type]slice")
		|| DModeling.hasTagValue(expanded, "[node][type]array")
	);

	return isArray && output && "elementType" in expanded
		? context.success({
			result: GoAST.createGenericTypeReference({
				typeReference: sharedReference(reduceParamsIdentifier, context),
				typeArguments: DCommon.cast([expanded.elementType, output]),
			}),
		})
		: context.error(node, "un-support-reduce-type");
}

const reduceTypeNames = new Set(["ReduceTheFunctionParams", "ReduceNext", "ReduceExit", "ReduceFromResult"]);

/**
 * Types du domaine `@duplojs/lang/array` (ceux de `reduce`).
 */
export const duploJSArrayTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeReferenceNode(node) && !TsAST.isImportTypeNode(node)) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(
				TsAST.isTypeReferenceNode(node) ? node.typeName : node,
				"@duplojs/lang",
				/^dist\/array\//,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference) || !reduceTypeNames.has(moduleReference.symbol.name)) {
			return context.notSupport();
		}

		return reduceTypeHandler(node, moduleReference.symbol.name, context);
	},
);
