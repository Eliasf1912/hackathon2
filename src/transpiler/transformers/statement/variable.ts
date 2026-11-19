import { TsAST } from "@typescript";
import { NodeBuilderFlags } from "typescript/async";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { typeTransformers } from "../type";
import { convertExpressionToType } from "../type/union";

/**
 * Type Go d'une variable : l'annotation si elle existe, sinon le type déduit par le checker.
 * Un type littéral (`const base = 10` → `10`) est élargi à son type de base (`number`),
 * car c'est le type de la valeur à l'exécution.
 */
async function transformVariableType(declaration: TsAST.VariableDeclaration, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	const typeNode = declaration.type ?? await typeChecker.typeToTypeNode(
		await typeChecker.getBaseTypeOfLiteralType(
			await typeChecker.getTypeAtLocation(declaration.name),
		),
		declaration,
		NodeBuilderFlags.NoTruncation,
	);

	if (!typeNode) {
		return context.error(declaration, "un-support-variable-type");
	}

	const variableType = await DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(variableType)) {
		return variableType;
	}

	if (!DArray.lengthEqual(variableType.before, 0)) {
		return context.error(declaration, "un-support-before-on-variable-type");
	}

	return DEither.success(variableType.result);
}

/**
 * `const` / `let`.
 *
 * - Variable de module (enfant direct du fichier) : `var x T` au niveau du package,
 *   pour être visible des fonctions et des autres fichiers. L'affectation de la valeur
 *   part dans les `before`, que `transformSourceFile` place dans `func init()`.
 * - Variable locale : `x := valeur`.
 *
 * Limites connues (erreurs explicites) : plusieurs variables dans une même instruction,
 * déstructuration.
 */
export const variableStatementTransformer: Transformer<
	GoAST.VariableDeclarationZeroValue | GoAST.ShortVariableDeclarationStatement
> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node)) {
			return context.notSupport();
		}

		const declaration = DArray.first(node.declarationList.declarations);

		if (!declaration || !DArray.lengthEqual(node.declarationList.declarations, 1)) {
			return context.error(node, "un-support-multiple-variable-declarations");
		}

		if (!TsAST.isIdentifier(declaration.name)) {
			return context.error(declaration, "un-support-variable-destructuring");
		}

		const identifier = context.createSourceIdentifier(declaration.name.text);
		const isModuleVariable = TsAST.isSourceFile(node.parent);

		if (!declaration.initializer) {
			if (!isModuleVariable) {
				return context.error(declaration, "un-support-local-variable-without-initializer");
			}

			const variableType = await transformVariableType(declaration, context);

			if (DEither.isLeft(variableType)) {
				return variableType;
			}

			return context.success({
				result: GoAST.createVariableDeclarationZeroValue({
					identifier,
					typeReference: DEither.unwrapRight(variableType),
				}),
			});
		}

		const initializer = await DCommon.asyncPipe(
			context.transform(declaration.initializer, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(initializer)) {
			return initializer;
		}

		// Variable locale sans annotation : `:=` prend le type de la valeur, comme TS.
		if (!isModuleVariable && !declaration.type) {
			return context.success({
				before: initializer.before,
				result: GoAST.createShortVariableDeclarationStatement({
					identifier,
					initializer: initializer.result,
				}),
			});
		}

		const variableType = await transformVariableType(declaration, context);

		if (DEither.isLeft(variableType)) {
			return variableType;
		}

		// La valeur est convertie vers le type de la variable (un membre dans une union).
		const value = await convertExpressionToType(
			{
				node: declaration.initializer,
				expression: initializer.result,
				targetType: DEither.unwrapRight(variableType),
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		if (!isModuleVariable) {
			return context.success({
				before: initializer.before,
				result: GoAST.createShortVariableDeclarationStatement({
					identifier,
					initializer: DEither.unwrapRight(value),
				}),
			});
		}

		return context.success({
			before: DArray.concat(
				initializer.before,
				[
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([identifier]),
						values: DCommon.cast([DEither.unwrapRight(value)]),
					}),
				],
			),
			result: GoAST.createVariableDeclarationZeroValue({
				identifier,
				typeReference: DEither.unwrapRight(variableType),
			}),
		});
	},
);
