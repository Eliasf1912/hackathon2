import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { typeTransformers } from ".";
import { goTypeKey } from "./union";

/**
 * Une contrainte DuploJS (`DNumber.Positive`, `DArray.LengthEqual<1>`, `DString.Number`…)
 * n'existe que pour TS : elle est déclarée dans `dist/<domaine>/constraints/`.
 */
async function isDuploJSConstraint(node: TsAST.TypeNode, context: BuildContext) {
	if (!TsAST.isTypeReferenceNode(node) && !TsAST.isImportTypeNode(node)) {
		return false;
	}

	const reference = await context.resolveReferenceModule(
		TsAST.isTypeReferenceNode(node) ? node.typeName : node,
		"@duplojs/lang",
		/^dist\/[^/]+\/constraints\//,
	);

	if (DEither.isRight(reference)) {
		return true;
	}

	// shortcut: le checker écrit `import("@duplojs/lang/number").Positive` pour un module que
	// le fichier n'importe pas, et la résolution passe par les imports du fichier. Un tel
	// membre d'intersection venant de DuploJS est pris pour une contrainte ; à remplacer
	// par une résolution du module depuis le checker quand l'API le permettra.
	return TsAST.isImportTypeNode(node)
		&& TsAST.isLiteralTypeNode(node.argument)
		&& TsAST.isStringLiteral(node.argument.literal)
		&& (node.argument.literal.text === "@duplojs/lang"
			|| node.argument.literal.text.startsWith("@duplojs/lang/"));
}

/**
 * `number & DNumber.Positive` → `float64` : les contraintes DuploJS sont retirées ;
 * les membres restants doivent tous donner le même type Go, qui est le résultat.
 */
export const intersectionTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIntersectionTypeNode(node)) {
			return context.notSupport();
		}

		const constraints = await DCommon.asyncPipe(
			node.types,
			DArray.map((member) => isDuploJSConstraint(member, context)),
			DCommon.promiseAll,
		);

		const members = DArray.filter(
			node.types,
			(_member, { index }) => !DArray.at(constraints, index),
		);

		const transformed = await DCommon.asyncPipe(
			members,
			DArray.map((member) => DCommon.asyncPipe(
				context.transform(member, typeTransformers.value),
				DEither.unwrapRight,
			)),
			DCommon.promiseAll,
		);

		const failed = DArray.find(transformed, DEither.isLeft);

		if (failed) {
			return failed;
		}

		const goTypes = DArray.filter(
			transformed,
			(member): member is Exclude<typeof member, DEither.Left> => !DEither.isLeft(member),
		);

		const [first] = goTypes;

		// Membres qui donnent tous le même type Go (`string` et un gabarit de chaîne) : ce type.
		if (!first || !DArray.every(goTypes, ({ result }) => goTypeKey(result) === goTypeKey(first.result))) {
			return context.error(node, "un-support-intersection-type");
		}

		return context.success({
			before: DArray.flatMap(goTypes, ({ before }) => before),
			result: first.result,
		});
	},
);
