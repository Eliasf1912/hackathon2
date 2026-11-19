import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import type { TsAST } from "@typescript";
import { SignatureKind, TypeFlags, type Type } from "typescript/async";
import type { SharedDependency, TransformationError } from "@transformer";
import type { BuildContext } from "./context/build";

export type GoType = GoAST.Type | GoAST.TypeReference;

/**
 * A Go type translated from a checker type, with the shared dependencies that
 * declare it. Nothing is registered while resolving: the caller registers the
 * dependencies of the types it really emits.
 */
export interface GoTypeResolution {
	readonly type: GoType;
	readonly dependencies: readonly SharedDependency[];
}

export type GoTypeResolved = DEither.Right<"go-type-resolved", GoTypeResolution>;

export type GoTypeNotSupported = DEither.Left<"go-type-not-supported", undefined>;

/**
 * Extension point of the DuploJS domains: a resolver recognises the checker
 * types of its domain by their resolved symbol (for example the Either types)
 * and refuses the others.
 */
export type CheckerTypeResolver = (
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
) => Promise<GoTypeResolved | GoTypeNotSupported | TransformationError>;

export function goTypeResolved(
	type: GoType,
	dependencies: readonly SharedDependency[] = [],
): GoTypeResolved {
	return DEither.right("go-type-resolved", {
		type,
		dependencies,
	});
}

export function goTypeNotSupported(): GoTypeNotSupported {
	return DEither.left("go-type-not-supported", undefined);
}

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

const anyResolution = goTypeResolved(GoAST.builtinTypeReferences.any);

/**
 * Same Go type for every resolution: that type with all their dependencies,
 * otherwise `any` without dependency.
 */
function resolveCommonType(resolutions: readonly GoTypeResolution[]) {
	const first = DArray.first(resolutions);

	if (
		!first
		|| !DArray.every(
			resolutions,
			(resolution) => DCommon.equal(render(resolution.type), render(first.type)),
		)
	) {
		return anyResolution;
	}

	return goTypeResolved(
		first.type,
		DArray.flat(DArray.map(resolutions, (resolution) => resolution.dependencies)),
	);
}

async function resolveMembers(
	types: readonly Type[],
	node: TsAST.Node,
	context: BuildContext,
) {
	return DCommon.asyncPipe(
		types,
		DArray.map((member) => DCommon.asyncPipe(context.resolveGoType(member, node), DEither.unwrapRight)),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<readonly GoTypeResolution[]>([]),
			({ element, lastValue, next, exit }) => DEither.isLeft(element)
				? exit(element)
				: next(DArray.push(lastValue, element)),
		),
	);
}

async function isBaseMember(member: Type, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	return !!(member.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike))
		|| await typeChecker.isArrayType(member)
		|| await typeChecker.isTupleType(member);
}

/**
 * A DuploJS brand (`DString.Number`, `LengthEqual<3>`…) is a type whose
 * symbol is declared in `@duplojs/lang`.
 */
async function isDuploJSBrand(member: Type, context: BuildContext) {
	const symbol = await member.getSymbol();

	return !!symbol && DEither.isRight(await context.resolveReferenceModule(symbol, "@duplojs/lang"));
}

/**
 * Translates a checker type into a Go type by walking the checker types
 * directly, without rewriting them as TypeScript nodes:
 * primitives and literals, `any`, awaited `Promise`, domain types (Either…),
 * unions (common type or `any`), branded intersections, arrays, tuples and
 * function types. Any other type is an explicit error naming it.
 */
export async function resolveGoType(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	resolvers: readonly CheckerTypeResolver[],
): Promise<GoTypeResolved | TransformationError> {
	const { typeChecker } = context.transpilation;
	const unsupported = async() => context.error(node, {
		reason: "unsupported-checker-type",
		type: await typeChecker.typeToString(type),
	});

	if (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
		return anyResolution;
	}

	if (type.flags & TypeFlags.NumberLike) {
		return goTypeResolved(GoAST.builtinTypeReferences.float64);
	}

	if (type.flags & TypeFlags.StringLike) {
		return goTypeResolved(GoAST.builtinTypeReferences.string);
	}

	// `boolean` is the union `true | false`: checked before the unions.
	if (type.flags & TypeFlags.BooleanLike) {
		return goTypeResolved(GoAST.builtinTypeReferences.bool);
	}

	// Asynchronism is translated synchronously: `Promise<T>` is `T`.
	// A union or an intersection is not a promise: its members are unwrapped one by one.
	const awaitedType = type.isUnionType() || type.isIntersectionType()
		? undefined
		: await typeChecker.getAwaitedType(type);

	if (awaitedType && awaitedType !== type) {
		return context.resolveGoType(awaitedType, node);
	}

	const domainResolution = await DCommon.asyncPipe(
		resolvers,
		DArray.map((resolver) => resolver(type, node, context)),
		DCommon.promiseAll,
		(results) => DArray.find(
			results,
			(result) => !DEither.isLeft(result) || !DEither.hasInformation(result, "go-type-not-supported"),
		),
	);

	if (domainResolution && !DEither.isLeft(domainResolution)) {
		return domainResolution;
	}

	if (domainResolution && DEither.hasInformation(domainResolution, "transformation-error")) {
		return domainResolution;
	}

	if (type.isUnionType()) {
		const members = await resolveMembers(await type.getTypes() ?? [], node, context);

		// A union that Go cannot represent precisely stays an interface.
		return DEither.isLeft(members) ? anyResolution : resolveCommonType(members);
	}

	if (type.isIntersectionType()) {
		const members = await type.getTypes() ?? [];
		const memberKinds = await DCommon.asyncPipe(
			members,
			DArray.map(async(member) => ({
				member,
				isBase: await isBaseMember(member, context),
				isBrand: await isDuploJSBrand(member, context),
			})),
			DCommon.promiseAll,
		);
		const baseMembers = DArray.filter(memberKinds, ({ isBase }) => isBase);
		const baseMember = DArray.first(baseMembers);

		if (
			!baseMember
			|| !DArray.lengthEqual(baseMembers, 1)
			|| !DArray.every(memberKinds, ({ isBase, isBrand }) => isBase || isBrand)
		) {
			return unsupported();
		}

		return context.resolveGoType(baseMember.member, node);
	}

	const isArray = await typeChecker.isArrayType(type);
	const isTuple = await typeChecker.isTupleType(type);

	if ((isArray || isTuple) && type.isTypeReference()) {
		const elements = await resolveMembers(await typeChecker.getTypeArguments(type), node, context);

		if (DEither.isLeft(elements)) {
			return elements;
		}

		const element = DEither.unwrapRight(resolveCommonType(elements));

		return goTypeResolved(
			GoAST.createSliceType({ elementType: element.type }),
			element.dependencies,
		);
	}

	const signature = DArray.first(await typeChecker.getSignaturesOfType(type, SignatureKind.Call));

	if (signature) {
		const parameterTypes = await DCommon.asyncPipe(
			DArray.from({ length: DArray.length(signature.parameters) }),
			DArray.map((_element, { index }) => typeChecker.getParameterType(signature, index)),
			DCommon.promiseAll,
		);
		const parameters = await resolveMembers(parameterTypes, node, context);
		const returnType = await DCommon.asyncPipe(
			context.resolveGoType(await typeChecker.getReturnTypeOfSignature(signature), node),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(parameters)) {
			return parameters;
		}

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		return goTypeResolved(
			GoAST.createFunctionType({
				arguments: DArray.map(
					parameters,
					(parameter) => GoAST.createFunctionArgument({
						identifier: GoAST.createIdentifier("_"),
						type: parameter.type,
					}),
				),
				returnTypes: [returnType.type],
			}),
			DArray.concat(
				DArray.flat(DArray.map(parameters, (parameter) => parameter.dependencies)),
				returnType.dependencies,
			),
		);
	}

	return unsupported();
}

/**
 * Resolves a checker type, registers the dependencies of the Go type and
 * returns it: for a type that is emitted in the generated code.
 */
export async function useGoType(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
) {
	const resolution = await DCommon.asyncPipe(context.resolveGoType(type, node), DEither.unwrapRight);

	if (DEither.isLeft(resolution)) {
		return resolution;
	}

	return DArray.reduce(
		resolution.dependencies,
		DArray.reduceFrom(resolution.type),
		({ element, lastValue, next }) => {
			context.registerSharedDependency(element);

			return next(lastValue);
		},
	);
}
