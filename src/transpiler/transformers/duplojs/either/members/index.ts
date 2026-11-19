import { GoAST, GoPrinter } from "@go";
import type { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { SignatureKind, type Signature, type Type } from "typescript/async";
import type { SharedDependency } from "@transformer";
import type { BuildContext } from "../../../../context/build";
import type { GoType, GoTypeResolution } from "../../../../resolveGoType";
import { eitherIsDependency, isFunctionIdentifier } from "../isRight/sharedDependency";
import { successTypeIdentifier } from "../success/sharedDependency";
import { leftTypeIdentifier } from "../left/sharedDependency";
import { failTypeIdentifier } from "../fail/sharedDependency";

export interface EitherMember {
	readonly kind: "right" | "left";
	readonly goType: GoType;
	readonly valueType: GoType;

	/**
	 * Declarations of the Go type, registered only when the variant is emitted.
	 */
	readonly dependencies: readonly SharedDependency[];
}

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

function classify({ type: goType, dependencies }: GoTypeResolution): EitherMember | undefined {
	if (DModeling.hasTagValue(goType, "[node]type-reference-package")) {
		return goType.identifier === failTypeIdentifier
			? {
				kind: "left",
				goType,
				valueType: GoAST.createIdentifier("JSUndefined"),
				dependencies,
			}
			: undefined;
	}

	if (!DModeling.hasTagValue(goType, "[node]type-reference-generic")) {
		return undefined;
	}

	const { typeReference } = goType;
	const valueType = DArray.first(goType.typeArguments);

	if (!valueType || !DModeling.hasTagValue(typeReference, "[node]type-reference-package")) {
		return undefined;
	}

	if (typeReference.identifier === successTypeIdentifier) {
		return {
			kind: "right",
			goType,
			valueType,
			dependencies,
		};
	}

	if (typeReference.identifier === leftTypeIdentifier) {
		return {
			kind: "left",
			goType,
			valueType,
			dependencies,
		};
	}

	return undefined;
}

/**
 * Registers the declarations of the variants emitted in the generated code.
 */
function registerMembers(members: readonly EitherMember[], context: BuildContext) {
	return DArray.reduce(
		DArray.flat(DArray.map(members, (member) => member.dependencies)),
		DArray.reduceFrom(members),
		({ element, lastValue, next }) => {
			context.registerSharedDependency(element);

			return next(lastValue);
		},
	);
}

/**
 * Lists the Either variants a value can be, from its checker type: each union
 * member must be a `Success`, `Left` or `Fail`. Variants with the same Go type
 * are kept once. A member that is not an Either is an explicit error naming
 * its type: the runtime only recognises the Either structs by their Go type.
 */
export async function resolveEitherMembers(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;
	const awaitedType = await typeChecker.getAwaitedType(type) ?? type;
	const memberTypes = awaitedType.isUnionType()
		? await awaitedType.getTypes() ?? [awaitedType]
		: [awaitedType];

	return DCommon.asyncPipe(
		memberTypes,
		DArray.map(
			async(memberType) => {
				const resolution = await DCommon.asyncPipe(
					context.resolveGoType(memberType, node),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(resolution)) {
					return resolution;
				}

				const member = classify(resolution);

				if (!member) {
					return context.error(node, {
						reason: "unknown-either-member",
						type: await typeChecker.typeToString(memberType),
					});
				}

				return member;
			},
		),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<readonly EitherMember[]>([]),
			({ element, lastValue, next, exit }) => {
				if (DEither.isLeft(element)) {
					return exit(element);
				}

				const isKnown = DArray.some(
					lastValue,
					(member) => DCommon.equal(render(member.goType), render(element.goType)),
				);

				return next(isKnown ? lastValue : DArray.push(lastValue, element));
			},
		),
	);
}

/**
 * Adds the variants of `added` that are not already in `members`.
 */
export function mergeEitherMembers(
	members: readonly EitherMember[],
	added: readonly EitherMember[],
) {
	return DArray.reduce(
		added,
		DArray.reduceFrom(members),
		({ element, lastValue, next }) => next(
			DArray.some(
				lastValue,
				(member) => DCommon.equal(render(member.goType), render(element.goType)),
			)
				? lastValue
				: DArray.push(lastValue, element),
		),
	);
}

/**
 * Checker type of the input of a DuploJS function: its first parameter in the
 * direct form, the parameter of the returned function in the curried form.
 */
export async function resolveInputType(
	signature: Signature,
	isCurried: boolean,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;

	if (!isCurried) {
		return typeChecker.getParameterType(signature, 0);
	}

	const returnedSignature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getReturnTypeOfSignature(signature),
			SignatureKind.Call,
		),
	);

	return returnedSignature && typeChecker.getParameterType(returnedSignature, 0);
}

/**
 * Go type of the values of the given variants: their common type, or `any`.
 */
export function resolveMembersValueType(
	members: readonly EitherMember[],
	kind: EitherMember["kind"],
): GoType {
	const valueTypes = DArray.map(
		DArray.filter(members, (member) => member.kind === kind),
		(member) => member.valueType,
	);
	const firstValueType = DArray.first(valueTypes);

	return firstValueType && DArray.every(
		valueTypes,
		(valueType) => DCommon.equal(render(valueType), render(firstValueType)),
	)
		? firstValueType
		: GoAST.builtinTypeReferences.any;
}

/**
 * `EitherIs[T1](value) || EitherIs[T2](value)` over the variants of a kind,
 * or `false` when the value cannot be of that kind.
 */
export function createKindCheck(
	members: readonly EitherMember[],
	kind: EitherMember["kind"],
	value: GoAST.Expression,
	context: BuildContext,
): GoAST.Expression {
	const packageName = context.registerSharedDependency(eitherIsDependency.value);

	return DArray.reduce(
		registerMembers(DArray.filter(members, (member) => member.kind === kind), context),
		DArray.reduceFrom<GoAST.Expression | undefined>(undefined),
		({ element, lastValue, next }) => {
			const check = GoAST.createCallExpression({
				callee: GoAST.createInstantiationExpression({
					target: GoAST.createSelectorExpression({
						target: packageName,
						identifier: isFunctionIdentifier,
					}),
					typeArguments: DCommon.cast([element.goType]),
				}),
				arguments: [value],
			});

			return next(
				lastValue
					? GoAST.createBinaryExpression({
						operator: "||",
						left: lastValue,
						right: check,
					})
					: check,
			);
		},
	) ?? GoAST.createBooleanLiteral({ value: false });
}

/**
 * `func(input any) bool { return <kind check> }`.
 */
export function createKindPredicate(
	members: readonly EitherMember[],
	kind: EitherMember["kind"],
	context: BuildContext,
) {
	const input = GoAST.createIdentifier("input");

	return GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: input,
				type: GoAST.builtinTypeReferences.any,
			}),
		],
		returnTypes: [GoAST.builtinTypeReferences.bool],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [createKindCheck(members, kind, input, context)],
				}),
			],
		}),
	});
}

/**
 * `func(input any) V`: the value of the variants whose value has the type `V`
 * (every variant when `V` is `any`), read through a type switch. Any other
 * input is returned as a plain value, like `DEither.rightPipe` does.
 */
export function createValueGetter(
	members: readonly EitherMember[],
	valueType: GoType,
	context: BuildContext,
) {
	const input = GoAST.createIdentifier("input");
	const either = context.generateIdentifier();
	const acceptsAny = DCommon.equal(render(valueType), render(GoAST.builtinTypeReferences.any));

	const cases = DArray.map(
		registerMembers(
			DArray.filter(
				members,
				(member) => acceptsAny || DCommon.equal(render(member.valueType), render(valueType)),
			),
			context,
		),
		(member) => GoAST.createTypeSwitchCase({
			types: DCommon.cast([member.goType]),
			statements: [
				GoAST.createReturnStatement({
					values: [
						GoAST.createSelectorExpression({
							target: either,
							identifier: GoAST.createIdentifier("Value"),
						}),
					],
				}),
			],
		}),
	);

	const plainValue = GoAST.createReturnStatement({
		values: [
			GoAST.createTypeAssertionExpression({
				target: input,
				typeReference: valueType,
			}),
		],
	});

	return GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: input,
				type: GoAST.builtinTypeReferences.any,
			}),
		],
		returnTypes: [valueType],
		body: GoAST.createBlockStatement({
			statements: DArray.lengthEqual(cases, 0)
				? [plainValue]
				: [
					GoAST.createTypeSwitchStatementWithoutDefault({
						identifier: either,
						expression: input,
						cases,
					}),
					plainValue,
				],
		}),
	});
}

/**
 * `var information string` then a type switch reading the `Information` field
 * of every variant.
 */
export function createInformationStatements(
	members: readonly EitherMember[],
	value: GoAST.Expression,
	information: GoAST.Identifier,
	context: BuildContext,
): readonly GoAST.Statement[] {
	const either = context.generateIdentifier();

	return [
		GoAST.createVariableDeclarationZeroValue({
			identifier: information,
			typeReference: GoAST.builtinTypeReferences.string,
		}),
		GoAST.createTypeSwitchStatementWithoutDefault({
			identifier: either,
			expression: value,
			cases: DArray.map(
				registerMembers(members, context),
				(member) => GoAST.createTypeSwitchCase({
					types: DCommon.cast([member.goType]),
					statements: [
						GoAST.createAssignmentStatement({
							targets: DCommon.cast([information]),
							values: DCommon.cast([
								GoAST.createSelectorExpression({
									target: either,
									identifier: GoAST.createIdentifier("Information"),
								}),
							]),
						}),
					],
				}),
			),
		}),
	];
}
