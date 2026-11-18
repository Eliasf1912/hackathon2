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

/**
 * Types Go des variantes Right, qui portent leur valeur dans le champ `Value`.
 * Les déclarer ici permet de savoir, sur le type Go seul, quels membres d'une union
 * sont des Right (DuploJS les marque par des clés symboles, que le checker n'expose pas
 * sous un nom lisible).
 */
const rightVariantTypeNames = new Set<string>();

export function declareRightVariantType(identifier: GoAST.Identifier) {
	rightVariantTypeNames.add(identifier.value);
}

export function isRightVariantType(type: GoType) {
	const reference = DModeling.hasTagValue(type, "[node]type-reference-generic")
		? type.typeReference
		: type;

	return DModeling.hasTagValue(reference, "[node]type-reference-package")
		&& reference.packageName.value === sharedDependencyPackageName.value
		&& rightVariantTypeNames.has(reference.identifier.value);
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
