import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { type BuildContext } from "../../context/build";
import { isSourceNode } from "../../resolvedReference";
import { importStandardPackage, sequenceEvaluations } from "../shared";

/**
 * L'identifiant désigne-t-il l'objet global de JS (`Math`, `Promise`), déclaré dans les
 * fichiers `lib` de TypeScript, et non un objet du programme qui porterait ce nom ?
 */
async function isGlobal(identifier: TsAST.Identifier, context: BuildContext) {
	if (!isSourceNode(identifier)) {
		return false;
	}

	const symbol = await context.transpilation.typeChecker.getSymbolAtLocation(identifier);
	const declaration = symbol && DArray.first(symbol.declarations);

	return declaration !== undefined && DString.test(declaration.path, /\/lib\.[^/]*\.d\.ts$/u);
}

function mathCall(name: string, callArguments: readonly GoAST.Expression[], context: BuildContext) {
	return GoAST.createCallExpression({
		callee: GoAST.createSelectorExpression({
			target: importStandardPackage("math", context),
			identifier: GoAST.createIdentifier(name),
		}),
		arguments: callArguments,
	});
}

type Builtin = (callArguments: readonly GoAST.Expression[], context: BuildContext) => GoAST.Expression | undefined;

/**
 * API JS intégrées, par `Objet.méthode`.
 */
const builtins = new Map<string, Builtin>([
	// Modèle synchrone (`Promise<T>` → `T`) : la valeur est déjà disponible.
	["Promise.resolve", ([value]) => value],
	// JS arrondit les demis vers le haut (`Math.round(-2.5)` vaut -2) ; `math.Round` de Go
	// les éloigne de zéro (-3).
	[
		"Math.round",
		([value], context) => value && mathCall(
			"Floor",
			[
				GoAST.createBinaryExpression({
					operator: "+",
					left: value,
					right: GoAST.createFloatLiteral({ value: "0.5" }),
				}),
			],
			context,
		),
	],
	["Math.floor", ([value], context) => value && mathCall("Floor", [value], context)],
	["Math.ceil", ([value], context) => value && mathCall("Ceil", [value], context)],
	["Math.abs", ([value], context) => value && mathCall("Abs", [value], context)],
]);

/**
 * Appel d'une API JS intégrée (`Promise.resolve(x)`, `Math.round(x)`), traduite vers son
 * équivalent Go. Les arguments sont évalués dans l'ordre JS.
 *
 * Limite connue : seules les fonctions de la table `builtins` sont traduites.
 */
export const builtinCallTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isCallExpression(node)
			|| !TsAST.isPropertyAccessExpression(node.expression)
			|| !TsAST.isIdentifier(node.expression.expression)
			|| !TsAST.isIdentifier(node.expression.name)
			|| !await isGlobal(node.expression.expression, context)
		) {
			return context.notSupport();
		}

		const name = `${node.expression.expression.text}.${node.expression.name.text}`;
		const builtin = builtins.get(name);

		if (!builtin) {
			return context.error(node, {
				reason: "un-support-builtin",
				name,
			});
		}

		const transformed = await DCommon.asyncPipe(
			node.arguments,
			DArray.map((argument) => DCommon.asyncPipe(
				context.transform(argument, expressionTransformers.value),
				DEither.unwrapRight,
			)),
			DCommon.promiseAll,
		);

		const failed = DArray.find(transformed, DEither.isLeft);

		if (failed) {
			return failed;
		}

		const { before, results } = sequenceEvaluations(
			DArray.filter(
				transformed,
				(evaluation): evaluation is Exclude<typeof evaluation, DEither.Left> => !DEither.isLeft(evaluation),
			),
			context,
		);

		const result = builtin(results, context);

		return result
			? context.success({
				before,
				result,
			})
			: context.error(node, {
				reason: "un-support-builtin-arguments",
				name,
			});
	},
);
