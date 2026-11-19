import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { type TsAST } from "@typescript";
import { type Signature } from "typescript/async";
import { type NotfoundTransformer, type TransformationError } from "@transformer";
import { type BuildContext } from "../../context/build";
import { transformCheckerType, type GoType } from "../type/union";

export interface CurriedApplication {
	before: readonly GoAST.Statement[];
	result: GoAST.Expression;
}

export type CurriedApplyResult = (
	| TransformationError
	| NotfoundTransformer
	| DEither.Right<string, CurriedApplication>
);

/**
 * Forme curryfiée d'une fonction DuploJS (`whenIsRight(f)`, `DArray.map(f)`…) : l'appel
 * renvoie une fonction qui attend l'entrée. Elle devient une closure Go
 * `func(input In) Out { … }` ; `In` et `Out` viennent du type de l'appel, déjà instancié
 * par son contexte (paramètre de `pipe`…). `apply` produit le corps à partir du paramètre.
 *
 * Sert aussi à une fonction générique passée en valeur (`pipe(x, DEither.unwrapRight)`),
 * avec la signature que le contexte instancie.
 */
export async function createCurriedFunction(
	node: TsAST.Expression,
	context: BuildContext,
	apply: (
		input: GoAST.Identifier,
		inputType: GoType,
		outputType: GoType,
	) => Promise<CurriedApplyResult> | CurriedApplyResult,
	// Signature à utiliser (référence passée en valeur : celle que le contexte instancie) ;
	// par défaut, celle du type de l'appel curryfié.
	knownSignature?: Signature,
) {
	const { typeChecker } = context.transpilation;
	const signature = knownSignature
		?? DArray.first(await (await typeChecker.getTypeAtLocation(node)).getCallSignatures());

	if (!signature) {
		return context.error(node, "un-support-curried-function-type");
	}

	const inputType = await transformCheckerType(await typeChecker.getParameterType(signature, 0), node, context);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(await typeChecker.getReturnTypeOfSignature(signature), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const input = context.generateIdentifier();
	const applied = await apply(input, DEither.unwrapRight(inputType), DEither.unwrapRight(outputType));

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return DEither.right(
		"curried-function",
		GoAST.createFunctionLiteral({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: input,
					type: DEither.unwrapRight(inputType),
				}),
			],
			returnTypes: [DEither.unwrapRight(outputType)],
			body: GoAST.createBlockStatement({
				statements: DArray.concat(
					before,
					[GoAST.createReturnStatement({ values: [result] })],
				),
			}),
		}),
	);
}
