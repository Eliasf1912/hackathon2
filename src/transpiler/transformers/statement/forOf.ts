import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from "../expression";
import { createBindings } from "../expression/binding";
import { expandAliases } from "../type/alias";
import { transformCheckerType } from "../type/union";
import { transformBranch } from "./if";

/**
 * `for (const x of tableau) { … }` → `for _, x := range tableau { … }`, et
 * `for (const { a, b } of tableau)` → la valeur, puis ses noms liés (`a := valeur.A`).
 *
 * Chaque nom lié reçoit `_ = nom` : Go refuse une variable de boucle jamais lue.
 *
 * Limite connue : `for await`, itération d'une chaîne, d'un générateur, d'une `Map`.
 */
export const forOfStatementTransformer: Transformer<GoAST.RangeStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isForOfStatement(node)) {
			return context.notSupport();
		}

		const [declaration] = TsAST.isVariableDeclarationList(node.initializer)
			? node.initializer.declarations
			: [];

		if (node.awaitModifier || !declaration) {
			return context.error(node, "un-support-for-of-form");
		}

		const iterableType = await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(node.expression),
			node.expression,
			context,
		);

		if (DEither.isLeft(iterableType)) {
			return iterableType;
		}

		const expanded = expandAliases(DEither.unwrapRight(iterableType));

		if (!DModeling.hasTagValue(expanded, "[node][type]slice") && !DModeling.hasTagValue(expanded, "[node][type]array")) {
			return context.error(node.expression, "un-support-for-of-iterable");
		}

		const iterable = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(iterable)) {
			return iterable;
		}

		const element = TsAST.isIdentifier(declaration.name)
			? context.createSourceIdentifier(declaration.name.text)
			: context.generateIdentifier();

		const bindings = TsAST.isIdentifier(declaration.name)
			? DEither.right("bindings", [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([element]),
				}),
			] as readonly GoAST.Statement[])
			: createBindings(declaration.name, element, context);

		if (DEither.isLeft(bindings)) {
			return bindings;
		}

		const body = await transformBranch(node.statement, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		return context.success({
			before: iterable.before,
			result: GoAST.createRangeStatement({
				binding: GoAST.createRangeDeclaration({
					key: GoAST.createIdentifier("_"),
					value: element,
				}),
				expression: iterable.result,
				body: GoAST.createBlockStatement({
					statements: DArray.concat(
						DEither.unwrapRight(bindings),
						body.before,
						body.result.statements,
					),
				}),
			}),
		});
	},
);
