import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DPattern from "@duplojs/lang/pattern";
import { GoAST } from "@go";
import { sharedDependencyPackageName } from "@transformer";
import { goTypeNotSupported, goTypeResolved, type CheckerTypeResolver } from "../../../resolveGoType";
import { eitherSuccessDependency, successTypeIdentifier } from "./success/sharedDependency";
import { eitherLeftTypeDependency, leftTypeIdentifier } from "./left/sharedDependency";
import { eitherFailTypeDependency, failTypeIdentifier } from "./fail/sharedDependency";

/**
 * Either types of DuploJS, recognised by their resolved symbol:
 * `Success<T>` → `EitherSuccess[T]`, `Left<information, T>` → `EitherLeft[T]`,
 * `Fail` → `EitherFail`. The value type `T` is resolved recursively.
 */
export const eitherCheckerTypeResolver: CheckerTypeResolver = async(type, node, context) => {
	const symbol = await type.getSymbol();
	const moduleReference = symbol && await DCommon.asyncPipe(
		context.resolveReferenceModule(symbol, "@duplojs/lang", /^dist\/either\//),
		DEither.unwrapRight,
	);

	if (!moduleReference || DEither.isLeft(moduleReference)) {
		return goTypeNotSupported();
	}

	const typeArguments = type.isTypeReference()
		? await context.transpilation.typeChecker.getTypeArguments(type)
		: [];

	const genericEither = async(
		identifier: GoAST.Identifier,
		valueType: typeof typeArguments[number] | undefined,
		dependency: typeof eitherLeftTypeDependency.value,
	) => {
		if (!valueType) {
			return goTypeNotSupported();
		}

		const value = await DCommon.asyncPipe(context.resolveGoType(valueType, node), DEither.unwrapRight);

		if (DEither.isLeft(value)) {
			return value;
		}

		return goTypeResolved(
			GoAST.createGenericTypeReference({
				typeReference: GoAST.createPackageTypeReference({
					packageName: sharedDependencyPackageName,
					identifier,
				}),
				typeArguments: DCommon.cast([value.type]),
			}),
			DArray.push(value.dependencies, dependency),
		);
	};

	return DCommon.pipe(
		moduleReference.symbol.name,
		DPattern.match(
			DCommon.equal("Success"),
			() => genericEither(successTypeIdentifier, DArray.at(typeArguments, 0), eitherSuccessDependency.value),
		),
		DPattern.match(
			DCommon.equal("Left"),
			() => genericEither(leftTypeIdentifier, DArray.at(typeArguments, 1), eitherLeftTypeDependency.value),
		),
		DPattern.match(
			DCommon.equal("Fail"),
			() => goTypeResolved(
				GoAST.createPackageTypeReference({
					packageName: sharedDependencyPackageName,
					identifier: failTypeIdentifier,
				}),
				[eitherFailTypeDependency.value],
			),
		),
		DPattern.otherwise(() => goTypeNotSupported()),
	);
};
