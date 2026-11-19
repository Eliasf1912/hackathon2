import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { getFieldIdentifier } from "../type/object";

/**
 * Un nom lié par une déstructuration : `name := valeur`, puis `_ = name` (Go refuse une
 * variable locale jamais lue, TS l'accepte).
 */
function bindName(name: TsAST.Identifier, value: GoAST.Expression, context: BuildContext) {
	const identifier = context.createSourceIdentifier(name.text);

	return [
		GoAST.createShortVariableDeclarationStatement({
			identifier,
			initializer: value,
		}),
		GoAST.createAssignmentStatement({
			targets: DCommon.cast([GoAST.createIdentifier("_")]),
			values: DCommon.cast([identifier]),
		}),
	] as readonly GoAST.Statement[];
}

/**
 * Déstructuration de `source` (une variable Go) :
 * - `[a, , b]` → `a := source[0]`, `b := source[2]` (élément omis : sans nom en TS 7) ;
 * - `{ a, b: renamed }` → `a := source.A`, `renamed := source.B`.
 *
 * Limite connue : motifs imbriqués (`[[a]]`, `{ a: { b } }`), valeur par défaut
 * (`[a = 1]`), reste (`[...a]`, `{ ...rest }`).
 */
export function createBindings(
	pattern: TsAST.ArrayBindingPattern | TsAST.ObjectBindingPattern,
	source: GoAST.Identifier,
	context: BuildContext,
) {
	const bindings = DArray.map(pattern.elements, (element, { index }) => {
		if (TsAST.isOmittedExpression(element) || !element.name) {
			return DEither.right("binding", [] as readonly GoAST.Statement[]);
		}

		if (!TsAST.isIdentifier(element.name) || element.initializer || element.dotDotDotToken) {
			return context.error(element, "un-support-binding-element");
		}

		if (TsAST.isArrayBindingPattern(pattern)) {
			return DEither.right("binding", bindName(
				element.name,
				GoAST.createIndexExpression({
					target: source,
					index: GoAST.createIntegerLiteral({ value: BigInt(index) }),
				}),
				context,
			));
		}

		// `{ b: renamed }` : le champ est `b`, le nom lié `renamed`.
		const property = element.propertyName ?? element.name;

		if (!TsAST.isIdentifier(property) && !TsAST.isStringLiteral(property)) {
			return context.error(element, "un-support-binding-element");
		}

		return DEither.right("binding", bindName(
			element.name,
			GoAST.createSelectorExpression({
				target: source,
				identifier: getFieldIdentifier(property.text, context),
			}),
			context,
		));
	});

	const failed = DArray.find(bindings, DEither.isLeft);

	if (failed) {
		return failed;
	}

	return DEither.right(
		"bindings",
		DArray.flatMap(DArray.filter(bindings, DEither.isRight), DEither.unwrapRight),
	);
}
