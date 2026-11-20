import { TsAST } from "@typescript";
import { NodeBuilderFlags } from "typescript/async";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
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
 * Une variable `const` / `let`.
 *
 * - Variable de module (enfant direct du fichier) : `var x T` au niveau du package,
 *   pour être visible des fonctions et des autres fichiers. L'affectation de la valeur
 *   part dans les `before`, que `transformSourceFile` place dans `func init()`.
 * - Variable locale : `x := valeur`.
 */
export async function transformVariableDeclaration(
	declaration: TsAST.VariableDeclaration,
	isModuleVariable: boolean,
	context: BuildContext,
) {
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
}

/**
 * `const` / `let`, une ou plusieurs variables.
 *
 * Plusieurs variables dans une fonction (`const a = 1, b = a + 1`) : une déclaration Go
 * par variable, dans l'ordre du source (chacune voit les précédentes, comme en JS).
 * Au niveau du fichier, `transformSourceFile` traduit chaque variable avec
 * `transformVariableDeclaration` (une `var` par variable).
 *
 * Limite connue (erreur explicite) : déstructuration au niveau du fichier.
 */
export const variableStatementTransformer: Transformer<
	GoAST.VariableDeclarationZeroValue | GoAST.ShortVariableDeclarationStatement | GoAST.AssignmentStatement
> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node)) {
			return context.notSupport();
		}

		const declarations = node.declarationList.declarations;
		const isModuleVariable = TsAST.isSourceFile(node.parent);
		const declaration = DArray.first(declarations);

		if (declaration && DArray.lengthEqual(declarations, 1)) {
			return transformVariableDeclaration(declaration, isModuleVariable, context);
		}

		// Garde : au niveau du fichier, une `var` ne peut pas aller dans les `before` (placés
		// dans `func init()`) ; ce cas est traité en amont par `transformSourceFile`.
		if (!declaration || isModuleVariable) {
			return context.error(node, "un-support-multiple-variable-declarations");
		}

		const statements = await DCommon.asyncPipe(
			declarations,
			DGenerator.asyncReduce(
				DGenerator.reduceFrom<readonly GoAST.Statement[]>([]),
				async({ item, lastValue, next, exit }) => {
					const transformed = await transformVariableDeclaration(item, isModuleVariable, context);

					if (DEither.isLeft(transformed)) {
						return exit(transformed);
					}

					const { before, result } = DEither.unwrapRight(transformed);

					return next(DArray.concat(lastValue, before, [result]));
				},
			),
		);

		if (DEither.isLeft(statements)) {
			return statements;
		}

		const last = DArray.last(statements);

		// Dernière instruction : `x := …`, ou l'affectation finale d'une déstructuration.
		if (
			!last
			|| (
				!DModeling.hasTagValue(last, "[node][statement]variable-short")
				&& !DModeling.hasTagValue(last, "[node][statement]assignment")
			)
		) {
			return context.error(node, "un-support-multiple-variable-declarations");
		}

		return context.success({
			before: DArray.slice(statements, 0, -1),
			result: last,
		});
	},
);
