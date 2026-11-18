import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

/**
 * Ce que DuploJS sait d'un Either à l'exécution, commun à toutes ses variantes
 * (Success, Fail, Left<…>, Right<…>…). Toute union d'Either est traduite par cette interface.
 *
 * La méthode s'appelle `EitherInformation` et non `Information` : Go interdit qu'un champ
 * et une méthode d'un même type portent le même nom, et les variantes ont un champ `Information`.
 */
export const eitherInterfaceIdentifier = GoAST.createIdentifier("Either");
export const isRightMethodIdentifier = GoAST.createIdentifier("IsRight");
export const informationMethodIdentifier = GoAST.createIdentifier("EitherInformation");
export const informationFieldIdentifier = GoAST.createIdentifier("Information");

export const eitherInterfaceDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: eitherInterfaceIdentifier,
				type: GoAST.createInterfaceType({
					elements: [
						GoAST.createInterfaceMethod({
							identifier: isRightMethodIdentifier,
							arguments: [],
							returnTypes: [GoAST.builtinTypeReferences.bool],
						}),
						GoAST.createInterfaceMethod({
							identifier: informationMethodIdentifier,
							arguments: [],
							returnTypes: [GoAST.builtinTypeReferences.string],
						}),
					],
				}),
			}),
		],
	}),
);

/**
 * Les deux méthodes de l'interface `Either`, à déclarer pour chaque variante.
 */
export function createEitherMethods(
	receiverType: GoAST.MethodReceiverType,
	isRight: boolean,
) {
	const receiver = GoAST.createIdentifier("either");

	return [
		GoAST.createMethodDeclaration({
			identifier: isRightMethodIdentifier,
			receiver: [receiver, receiverType],
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
		}),
		GoAST.createMethodDeclaration({
			identifier: informationMethodIdentifier,
			receiver: [receiver, receiverType],
			generic: [],
			arguments: [],
			returnTypes: [GoAST.builtinTypeReferences.string],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createReturnStatement({
						values: [
							GoAST.createSelectorExpression({
								target: receiver,
								identifier: informationFieldIdentifier,
							}),
						],
					}),
				],
			}),
		}),
	] as const;
}
