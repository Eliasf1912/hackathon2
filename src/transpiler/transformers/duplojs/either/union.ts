import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { typeTransformers } from "../../type";
import { eitherInterfaceDependency, eitherInterfaceIdentifier } from "./sharedDependency";

/** Le type fait-il référence à un export du module either de DuploJS (`Success`, `Fail`…) ? */
async function isEitherTypeNode(node: TsAST.TypeNode, context: BuildContext) {
	if (TsAST.isTypeReferenceNode(node)) {
		return DEither.isRight(
			await context.resolveReferenceModule(node.typeName, "@duplojs/lang", /^dist\/either\//),
		);
	}

	if (TsAST.isImportTypeNode(node)) {
		return DEither.isRight(
			await context.resolveReferenceModule(node, "@duplojs/lang", /^dist\/either\//),
		);
	}

	return false;
}

/**
 * Union dont tous les membres sont des Either (`Success<T> | Fail | Left<…> …`)
 * → l'interface `shard_dependencies.Either`, partagée par toutes les variantes.
 *
 * Toutes les unions d'Either ont ainsi le même type Go, où qu'elles apparaissent.
 * Le checker TS a déjà prouvé quelles variantes sont possibles : Go n'a pas à le revérifier.
 *
 * Une union qui contient autre chose qu'un Either n'est pas pour ce transformer
 * (`notSupport`) : elle relève d'une représentation générale des unions, pas encore écrite.
 */
export async function eitherUnionTypeHandler(node: TsAST.UnionTypeNode, context: BuildContext) {
	const membersAreEither = await DCommon.asyncPipe(
		node.types,
		DArray.map((member) => isEitherTypeNode(member, context)),
		DCommon.promiseAll,
	);

	if (!DArray.every(membersAreEither, DCommon.equal(true))) {
		return context.notSupport();
	}

	// Chaque membre est traduit : vérifie qu'il est pris en charge, et enregistre sa variante Go.
	const members = await DCommon.asyncPipe(
		node.types,
		DArray.map(
			(member) => DCommon.asyncPipe(
				context.transform(member, typeTransformers.value),
				DEither.unwrapRight,
			),
		),
		DCommon.promiseAll,
	);

	const failedMember = DArray.find(members, DEither.isLeft);

	if (failedMember) {
		return failedMember;
	}

	return context.success({
		result: GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(eitherInterfaceDependency.value),
			identifier: eitherInterfaceIdentifier,
		}),
	});
}
