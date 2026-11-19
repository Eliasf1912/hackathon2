import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { functionExpressionTransformer } from "../expression/function";

/**
 * Fonction déclarée dans une fonction (`function helper() { … }` dans un corps) :
 *
 * ```go
 * var helper func(…) R
 * helper = func(…) R { … }
 * ```
 *
 * La variable est déclarée avant d'être affectée : la fonction peut s'appeler elle-même.
 *
 * shortcut: JS « remonte » la déclaration en tête du bloc (appelable avant sa ligne) ; ici
 * elle n'existe qu'à partir de sa position. À traiter en déplaçant les déclarations en tête
 * du bloc si un programme appelle une fonction locale avant de la déclarer.
 */
export const localFunctionTransformer: Transformer<GoAST.AssignmentStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isFunctionDeclaration(node) || !node.name || !TsAST.isBlock(node.parent)) {
			return context.notSupport();
		}

		const literal = await DCommon.asyncPipe(
			context.transform(node, [functionExpressionTransformer]),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(literal)) {
			return literal;
		}

		const identifier = context.createSourceIdentifier(node.name.text);

		return context.success({
			before: DCommon.pipe(literal.before, (before) => [
				...before,
				GoAST.createVariableDeclarationZeroValue({
					identifier,
					typeReference: GoAST.createFunctionType({
						arguments: literal.result.arguments,
						returnTypes: literal.result.returnTypes,
					}),
				}),
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([identifier]),
					values: DCommon.cast([literal.result]),
				}),
			]),
			// `_ = f` : Go refuse une variable jamais lue, TS accepte une fonction jamais appelée.
			result: GoAST.createAssignmentStatement({
				targets: DCommon.cast([GoAST.createIdentifier("_")]),
				values: DCommon.cast([identifier]),
			}),
		});
	},
);
