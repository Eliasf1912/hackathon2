import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { sharedDependencyPackageName } from "@transformer";
import { type GoType } from "../../type/union";

/**
 * Ce que toutes les variantes d'Either (Success, Fail…) ont en commun en Go.
 * Une union d'Either est une union taguée générale (`UnionN`, voir `type/union`) :
 * ces variantes en sont des membres comme les autres.
 */
export const isRightMethodIdentifier = GoAST.createIdentifier("IsRight");
export const informationFieldIdentifier = GoAST.createIdentifier("Information");
export const valueFieldIdentifier = GoAST.createIdentifier("Value");

export type EitherVariantKind = "right" | "left" | "success" | "fail" | "error";

/**
 * Ce que le transpiler sait d'une variante Go d'Either, sur son seul type :
 * ses genres DuploJS (`EitherError` est un `left` et un `error`), son `information`
 * quand elle est fixe (`"success"`, `"fail"`, `"error"`), et si elle porte une valeur
 * (champ `Value` ; `EitherFail` n'en a pas).
 */
export interface EitherVariantDescription {
	kinds: readonly EitherVariantKind[];
	information?: string;
	hasValue: boolean;
}

/**
 * Registre des variantes, par nom de type Go dans `shard_dependencies`. Il le faut parce
 * que DuploJS marque ses variantes par des clés symboles, que le checker n'expose pas
 * sous un nom lisible. Chaque variante s'y déclare au chargement de son module.
 */
const eitherVariants = new Map<string, EitherVariantDescription>();

export function declareEitherVariant(identifier: GoAST.Identifier, description: EitherVariantDescription) {
	eitherVariants.set(identifier.value, description);
}

export function getEitherVariant(type: GoType) {
	const reference = DModeling.hasTagValue(type, "[node]type-reference-generic")
		? type.typeReference
		: type;

	if (
		!DModeling.hasTagValue(reference, "[node]type-reference-package")
		|| reference.packageName.value !== sharedDependencyPackageName.value
	) {
		return undefined;
	}

	return eitherVariants.get(reference.identifier.value);
}

export function hasEitherVariantKind(type: GoType, kind: EitherVariantKind) {
	return getEitherVariant(type)?.kinds.includes(kind) ?? false;
}

export function isRightVariantType(type: GoType) {
	return hasEitherVariantKind(type, "right");
}

/**
 * Méthode `IsRight()`, à déclarer pour chaque variante : `DEither.isRight` sur une
 * variante seule (hors union) devient un appel de méthode, sans test de type.
 */
export function createIsRightMethod(
	receiverType: GoAST.MethodReceiverType,
	isRight: boolean,
) {
	return GoAST.createMethodDeclaration({
		identifier: isRightMethodIdentifier,
		receiver: [GoAST.createIdentifier("_"), receiverType],
		generic: [],
		arguments: [],
		returnTypes: [GoAST.builtinTypeReferences.bool],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [GoAST.createBooleanLiteral({ value: isRight })],
				}),
			],
		}),
	});
}
