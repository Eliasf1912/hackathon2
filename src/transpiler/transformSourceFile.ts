import { GoAST } from "@go";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import * as DModeling from "@duplojs/lang/modeling";
import { TsAST } from "@typescript";
import { createBuildContext, type BuildContext } from "./context/build";
import { createStructFromMembers, namesObjectType } from "./transformers/type/object";
import { createFileContext } from "./context/file";
import type { TranspilationContext } from "./context/transpilation";
import { sourceFileTransformers } from "./transformers";
import { createFile } from "./createFile";
import { createSourcePackageLayout } from "./sourcePackage";

interface TransformedFileContent {
	declarations: GoAST.GoFile["declarations"];
	init: readonly GoAST.Statement[];
}

/**
 * `interface X { … }` / `type X = { … }` → `type X = struct { … }`, ou `undefined` pour une
 * déclaration qui ne nomme pas un type d'objet. Un type générique ou qui étend une
 * interface n'est déclaré que s'il est utilisé (erreur nommée à l'usage).
 */
async function transformObjectTypeDeclaration(
	declaration: TsAST.InterfaceDeclaration | TsAST.TypeAliasDeclaration,
	context: BuildContext,
) {
	if (
		!namesObjectType(declaration)
		|| (TsAST.isInterfaceDeclaration(declaration) && declaration.heritageClauses?.length)
	) {
		return DEither.right("type-declaration", undefined);
	}

	const members = TsAST.isInterfaceDeclaration(declaration)
		? declaration.members
		: TsAST.isTypeLiteralNode(declaration.type) && declaration.type.members;

	if (!members) {
		return DEither.right("type-declaration", undefined);
	}

	const struct = await createStructFromMembers(declaration, members, context);

	if (DEither.isLeft(struct)) {
		return struct;
	}

	return DEither.right(
		"type-declaration",
		GoAST.createTypeAlias({
			identifier: context.createSourceIdentifier(declaration.name.text),
			generic: DArray.map(declaration.typeParameters ?? [], ({ name }) => GoAST.createTypeParameter({
				identifier: context.createSourceIdentifier(name.text),
				constraint: GoAST.builtinTypeReferences.any,
			})),
			type: DEither.unwrapRight(struct),
		}),
	);
}

function collectIdentifierValues(node: unknown, values = new Set<string>()): Set<string> {
	if (Array.isArray(node)) {
		for (const child of node as readonly unknown[]) {
			collectIdentifierValues(child, values);
		}
	} else if (typeof node === "object" && node !== null) {
		const identifier = node as GoAST.Identifier;

		if (DModeling.hasTagValue(identifier, "[node]identifier")) {
			values.add(identifier.value);
		}

		for (const child of Object.values(node) as readonly unknown[]) {
			collectIdentifierValues(child, values);
		}
	}

	return values;
}

export async function transformSourceFile(
	sourceFile: TsAST.SourceFile,
	transpilationContext: TranspilationContext,
) {
	const fileContext = DCommon.pipe(
		createFileContext(sourceFile),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(fileContext)) {
		return fileContext;
	}
	const context = createBuildContext(transpilationContext, fileContext);

	const content = await DCommon.asyncPipe(
		sourceFile.statements,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<TransformedFileContent>({
				declarations: [],
				init: [],
			}),
			async({ item, lastValue, next, exit }) => {
				// Un type d'objet nommé (`interface X`, `type X = { … }`) devient un alias Go
				// `type X = struct { … }` ; les autres déclarations de type (`type S = "a" | "b"`)
				// n'existent pas à l'exécution : leurs références sont dépliées.
				if (TsAST.isInterfaceDeclaration(item) || TsAST.isTypeAliasDeclaration(item)) {
					const alias = await transformObjectTypeDeclaration(item, context);

					if (DEither.isLeft(alias)) {
						return exit(alias);
					}

					const declaration = DEither.unwrapRight(alias);

					return next(
						declaration
							? {
								declarations: DArray.push(lastValue.declarations, declaration),
								init: lastValue.init,
							}
							: lastValue,
					);
				}

				// Rien à l'exécution : les imports, résolus à l'usage.
				if (TsAST.isImportDeclaration(item)) {
					return next(lastValue);
				}

				const statement = await DCommon.asyncPipe(
					context.transform(item, sourceFileTransformers.value),
					DEither.keepAsRightByInformation("transformation-success"),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(statement)) {
					return exit(statement);
				}

				const result = statement.result;
				const init = DArray.concat(lastValue.init, statement.before);

				if (DModeling.hasTagGroup(result, "declaration")) {
					return next({
						declarations: DArray.push(lastValue.declarations, result),
						init,
					});
				}

				return next({
					declarations: lastValue.declarations,
					init: DArray.push(init, result),
				});
			},
		),
	);

	if (DEither.isLeft(content)) {
		return content;
	}

	// Un type peut être calculé sans être écrit (rétrécissement, destructuration) : seuls
	// les paquets réellement nommés dans le code Go sont importés.
	const usedIdentifiers = collectIdentifierValues([
		content.declarations,
		content.init,
		DArray.from(fileContext.declarations),
	]);

	const dependencyImports = DCommon.pipe(
		DArray.filter(
			DArray.from(fileContext.dependencyFiles),
			(filePath) => usedIdentifiers.has(context.createSourceIdentifier(filePath).value),
		),
		DGenerator.reduce(
			DGenerator.reduceFrom<readonly GoAST.ImportDeclaration[]>([]),
			({ item, lastValue, next, exit }) => {
				const sourcePackage = DCommon.pipe(
					createSourcePackageLayout(transpilationContext.projectWorkDirectory, item),
					DEither.unwrapRight,
				);
				if (DEither.isLeft(sourcePackage)) {
					return exit(sourcePackage);
				}
				return next(DArray.push(lastValue, GoAST.createImportDeclaration({ path: sourcePackage.importPath })));
			},
		),
	);

	if (DEither.isLeft(dependencyImports)) {
		return dependencyImports;
	}

	return DEither.success({
		file: createFile({
			packageName: context.createSourceIdentifier(fileContext.currentFilePath),
			imports: DArray.concat(dependencyImports, DArray.from(fileContext.imports)),
			declarations: DArray.concat(
				content.declarations,
				DArray.from(fileContext.declarations),
			),
			init: content.init,
		}),
		context,
	});
}
