import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { convertToType, goTypeKey, transformCheckerType } from "../type/union";

/**
 * Type Go déclaré d'une variable ou d'un paramètre (celui de sa variable Go), ou
 * `undefined` si l'identifiant désigne autre chose (fonction, import…).
 */
async function getDeclaredGoType(node: TsAST.Identifier, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const declarationHandle = (await typeChecker.getSymbolAtLocation(node))?.valueDeclaration;

	if (
		!declarationHandle
		|| (
			declarationHandle.kind !== TsAST.SyntaxKind.VariableDeclaration
			&& declarationHandle.kind !== TsAST.SyntaxKind.Parameter
		)
	) {
		return undefined;
	}

	const declaration = await declarationHandle.resolve();

	if (
		!declaration
		|| (!TsAST.isVariableDeclaration(declaration) && !TsAST.isParameterDeclaration(declaration))
		|| !TsAST.isIdentifier(declaration.name)
	) {
		return undefined;
	}

	// Comme `statement/variable.ts` : un type littéral est élargi (`10` → `number`).
	const declaredType = await typeChecker.getBaseTypeOfLiteralType(
		await typeChecker.getTypeAtLocation(declaration.name),
	);

	return transformCheckerType(declaredType, declaration, context);
}

/**
 * Rétrécissement : après `if (isLeft(x)) return x;`, TS sait que `x` n'est plus qu'une
 * `string`, alors que la variable Go reste l'union déclarée. À chaque lecture, la valeur
 * est convertie vers le type que le checker donne à cet endroit (`x.V2`, ou union vers
 * union plus étroite) : tous les consommateurs reçoivent le type attendu.
 */
async function narrow(node: TsAST.Identifier, expression: GoAST.Expression, context: BuildContext) {
	const declaredType = await getDeclaredGoType(node, context);

	if (!declaredType) {
		return context.success({ result: expression });
	}

	if (DEither.isLeft(declaredType)) {
		return declaredType;
	}

	const { typeChecker } = context.transpilation;

	const locationType = await transformCheckerType(
		await typeChecker.getBaseTypeOfLiteralType(await typeChecker.getTypeAtLocation(node)),
		node,
		context,
	);

	if (DEither.isLeft(locationType)) {
		return locationType;
	}

	const sourceType = DEither.unwrapRight(declaredType);
	const targetType = DEither.unwrapRight(locationType);

	if (goTypeKey(sourceType) === goTypeKey(targetType)) {
		return context.success({ result: expression });
	}

	const narrowed = convertToType(
		{
			node,
			expression,
			sourceType,
			targetType,
		},
		context,
	);

	if (DEither.isLeft(narrowed)) {
		return narrowed;
	}

	return context.success({ result: DEither.unwrapRight(narrowed) });
}

export const identifierTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIdentifier(node)) {
			return context.notSupport();
		}

		return DCommon.pipe(
			await context.resolveDependencyFile(node),
			DEither.matchInformation({
				none: () => narrow(node, context.createSourceIdentifier(node.text), context),
				some: (dependencyFile) => {
					const packageIdentifier = context.registerDependencyFile(dependencyFile);
					const memberIdentifier = context.createSourceIdentifier(node.text);

					return narrow(
						node,
						GoAST.createSelectorExpression({
							target: packageIdentifier,
							identifier: memberIdentifier,
						}),
						context,
					);
				},
			}),
		);
	},
);
