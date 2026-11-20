import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { type BuildContext } from "../../context/build";

export interface Evaluation<GenericResult extends GoAST.Expression = GoAST.Expression> {
	before: readonly GoAST.Statement[];
	result: GenericResult;
}

/**
 * Une expression Go qu'on peut relire sans la réévaluer : un identifiant tel quel,
 * sinon une variable temporaire (dans `before`).
 */
export function bindOnce(expression: GoAST.Expression, context: BuildContext) {
	// shortcut: un identifiant n'est pas copié ; si un calcul suivant le modifie, la valeur
	// lue change. Sans effet tant que l'affectation (`x = …`) n'est pas traduite ; copier
	// les variables mutables quand elle le sera.
	if (DModeling.hasTagValue(expression, "[node]identifier")) {
		return {
			before: [] as readonly GoAST.Statement[],
			result: expression as GoAST.Expression,
		};
	}

	const declaration = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: expression,
	});

	return {
		before: [declaration] as readonly GoAST.Statement[],
		result: declaration.identifier as GoAST.Expression,
	};
}

/**
 * Plusieurs expressions évaluées de gauche à droite, comme en JS (éléments d'un tableau,
 * morceaux d'un gabarit). Les calculs préalables (`before`) d'un élément s'exécutent
 * avant les résultats laissés en ligne : un élément suivi d'un élément qui a des calculs
 * préalables est donc d'abord rangé dans une variable.
 */
export function sequenceEvaluations(evaluations: readonly Evaluation[], context: BuildContext) {
	const sequenced = DArray.map(evaluations, (evaluation, { index }) => {
		const isFollowedByBefore = DArray.some(
			DArray.slice(evaluations, index + 1),
			({ before }) => !DArray.lengthEqual(before, 0),
		);

		if (!isFollowedByBefore) {
			return evaluation;
		}

		const bound = bindOnce(evaluation.result, context);

		return {
			before: DArray.concat(evaluation.before, bound.before),
			result: bound.result,
		};
	});

	return {
		before: DArray.flatMap(sequenced, ({ before }) => before),
		results: DArray.map(sequenced, ({ result }) => result),
	};
}
