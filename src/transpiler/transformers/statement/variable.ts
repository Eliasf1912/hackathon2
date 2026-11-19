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
import { createBindings } from "../expression/binding";
import * as DModeling from "@duplojs/lang/modeling";

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
 * `const { a, b } = valeur` / `const [a, b] = valeur` dans une fonction : la valeur est
 * rangée une fois, puis chaque nom est lié (`a := valeur.A`).
 *
 * Limite connue : au niveau du module (il faudrait une déclaration de paquet par nom).
 */
async function transformLocalDestructuring(
	declaration: TsAST.VariableDeclaration,
	pattern: TsAST.ObjectBindingPattern | TsAST.ArrayBindingPattern,
	isModuleVariable: boolean,
	context: BuildContext,
) {
	if (isModuleVariable || !declaration.initializer) {
		return context.error(declaration, "un-support-variable-destructuring");
	}

	const initializer = await DCommon.asyncPipe(
		context.transform(declaration.initializer, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(initializer)) {
		return initializer;
	}

	const source = context.generateIdentifier();
	const bindings = createBindings(pattern, source, context);

	if (DEither.isLeft(bindings)) {
		return bindings;
	}

	const statements = DEither.unwrapRight(bindings);
	const last = DArray.last(statements);

	if (!last || !DModeling.hasTagValue(last, "[node][statement]assignment")) {
		return context.error(declaration, "un-support-variable-destructuring");
	}

	return context.success({
		before: DArray.concat(
			initializer.before,
			[
				GoAST.createShortVariableDeclarationStatement({
					identifier: source,
					initializer: initializer.result,
				}),
			],
			DArray.slice(statements, 0, -1),
		),
		result: last,
	});
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
	GoAST.VariableDeclarationZeroValue | GoAST.ShortVariableDeclarationStatement | GoAST.AssignmentStatement
> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node)) {
			return context.notSupport();
		}

		const declaration = DArray.first(node.declarationList.declarations);

		if (!declaration || !DArray.lengthEqual(node.declarationList.declarations, 1)) {
			return context.error(node, "un-support-multiple-variable-declarations");
		}

		const isModuleVariable = TsAST.isSourceFile(node.parent);

		if (!TsAST.isIdentifier(declaration.name)) {
			return transformLocalDestructuring(declaration, declaration.name, isModuleVariable, context);
		}

		const identifier = context.createSourceIdentifier(declaration.name.text);

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
