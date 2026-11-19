import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { bindOnce, getInstantiatedSignature, sequenceEvaluations } from "../shared";
import { createCurriedFunction } from "./curried";

/**
 * Fonction DuploJS qui est une simple fonction de ses arguments (`DString.includes`,
 * `DString.length`…), traduite sous ses trois formes :
 * - appel direct `f(data, ...args)` → `build([data, ...args])` ;
 * - forme curryfiée `f(...args)` (DuploJS met la donnée en premier) → closure
 *   `func(data In) Out { return build([data, ...args]) }`, les arguments évalués avant ;
 * - référence passée en valeur (`pipe(x, DString.length)`, un seul paramètre) → closure
 *   typée par la signature que le contexte instancie.
 *
 * `build` reçoit des expressions déjà évaluées, dans l'ordre JS.
 */
export async function simpleFunctionHandler(
	params: {
		node: TsAST.Node;
		name: string;
		arity: number;
		build(callArguments: readonly GoAST.Expression[]): GoAST.Expression | undefined;
	},
	context: BuildContext,
) {
	const { node, name, arity, build } = params;

	if (TsAST.isIdentifier(node) || TsAST.isPropertyAccessExpression(node)) {
		const signature = arity === 1 ? await getInstantiatedSignature(node, context) : undefined;

		if (!signature) {
			return context.error(node, `un-support-${name}-as-value`);
		}

		const reference = await createCurriedFunction(
			node,
			context,
			(input) => {
				const result = build([input]);

				return result
					? DEither.right("applied", {
						before: [],
						result,
					})
					: context.error(node, `un-support-${name}-type`);
			},
			signature,
		);

		return DEither.isLeft(reference)
			? reference
			: context.success({ result: DEither.unwrapRight(reference) });
	}

	if (!TsAST.isCallExpression(node)) {
		return context.error(node, `un-support-${name}-reference`);
	}

	const isCurried = DArray.lengthEqual(node.arguments, arity - 1);

	if (!isCurried && !DArray.lengthEqual(node.arguments, arity)) {
		return context.error(node, `un-support-${name}-arguments`);
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

	const evaluations = DArray.filter(
		transformed,
		(evaluation): evaluation is Exclude<typeof evaluation, DEither.Left> => !DEither.isLeft(evaluation),
	);

	if (!isCurried) {
		const { before, results } = sequenceEvaluations(evaluations, context);
		const result = build(results);

		return result
			? context.success({
				before,
				result,
			})
			: context.error(node, `un-support-${name}-type`);
	}

	// Forme curryfiée : les arguments sont évalués une fois, à la création de la fonction.
	const bound = DArray.map(evaluations, ({ before, result }) => {
		const once = bindOnce(result, context);

		return {
			before: DArray.concat(before, once.before),
			result: once.result,
		};
	});

	const curried = await createCurriedFunction(
		node,
		context,
		(input) => {
			const result = build(DArray.concat([input], DArray.map(bound, ({ result: argument }) => argument)));

			return result
				? DEither.right("applied", {
					before: [],
					result,
				})
				: context.error(node, `un-support-${name}-type`);
		},
	);

	return DEither.isLeft(curried)
		? curried
		: context.success({
			before: DArray.flatMap(bound, ({ before }) => before),
			result: DEither.unwrapRight(curried),
		});
}
