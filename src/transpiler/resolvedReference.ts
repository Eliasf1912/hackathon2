import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import * as DPath from "@duplojs/lang/path";
import * as DString from "@duplojs/lang/string";
import { TsAST } from "@typescript";
import { Symbol, SymbolFlags } from "typescript/async";
import type { BuildContext } from "./context/build";

export type DependencyReference =
	| TsAST.Identifier
	| TsAST.QualifiedName
	| TsAST.PropertyAccessExpression
	| TsAST.ElementAccessExpression;

export type ModuleReference = DependencyReference | TsAST.ImportTypeNode | Symbol;

export interface ResolvedReference extends DModeling.ObjectTag<"ResolvedReference"> {
	readonly node: DependencyReference | undefined;
	readonly symbol: Symbol;
}

export interface DependencyFile extends ResolvedReference {
	readonly filePath: string & DPath.Absolute;
}

export interface ResolvedModuleReference extends ResolvedReference {
	readonly packageName: string;
	readonly entry: string;
	readonly exportName: string;
}

const createResolvedReference = DModeling.createTaggedObjectFactory<ResolvedReference>(
	"ResolvedReference",
);

/**
 * Le nœud vient-il d'un fichier source ? Un nœud synthétisé par le checker
 * (`typeToTypeNode`) peut porter une position recopiée (`pos >= 0`) sans appartenir à un
 * fichier : le passer au checker le fait échouer. Seul un vrai nœud a un texte source.
 */
export function isSourceNode(node: TsAST.Node) {
	return DEither.isRight(DEither.safeCallback(() => node.getText()));
}

// Symbole de module par nom de paquet (`@duplojs/lang/either`), trouvé une fois par
// transpilation (un symbole n'a de sens que dans son programme).
const importedModules = new Map<string, Symbol | undefined>();

export function resetImportedModules() {
	importedModules.clear();
}

/**
 * Le checker écrit `import("@duplojs/lang/either").Left` même dans un fichier qui n'importe
 * pas ce module. Le module est alors cherché dans un autre fichier du projet qui l'importe
 * sous le même nom (un nom de paquet ne dépend pas du fichier, contrairement à `./x`).
 */
async function findImportedModule(path: string, context: BuildContext) {
	if (DString.startsWith(path, ".")) {
		return undefined;
	}

	if (importedModules.has(path)) {
		return importedModules.get(path);
	}

	const { program, typeChecker } = context.transpilation;
	let found: Symbol | undefined = undefined;

	for (const fileName of await program.getSourceFileNames()) {
		if (found || DString.includes(fileName, "/node_modules/")) {
			continue;
		}

		const sourceFile = await program.getSourceFile(fileName);
		const specifier = sourceFile && DArray.find(
			sourceFile.imports,
			(node) => TsAST.isStringLiteral(node) && node.text === path,
		);

		found = specifier && await typeChecker.getSymbolAtLocation(specifier);
	}

	importedModules.set(path, found);

	return found;
}

async function resolveReferenceTarget(target: ModuleReference, context: BuildContext) {
	const { typeChecker: checker } = context.transpilation;
	const { sourceFile } = context.file;

	const symbol = await DCommon.justExec(async() => {
		if (target instanceof Symbol) {
			return target;
		}

		if (isSourceNode(target)) {
			if (TsAST.isImportTypeNode(target)) {
				return (await checker.getTypeFromTypeNode(target)).getSymbol();
			}

			if (TsAST.isIdentifier(target) && TsAST.isShorthandPropertyAssignment(target.parent)) {
				return checker.getShorthandAssignmentValueSymbol(target.parent);
			}

			if (TsAST.isElementAccessExpression(target) && TsAST.isStringLiteral(target.argumentExpression)) {
				return checker.getSymbolAtLocation(target.argumentExpression);
			}

			return checker.getSymbolAtLocation(target);
		}

		if (TsAST.isIdentifier(target)) {
			return checker.resolveName(target.text, SymbolFlags.Type, sourceFile);
		}

		if (TsAST.isQualifiedName(target) && TsAST.isIdentifier(target.left)) {
			const namespace = await checker.resolveName(target.left.text, SymbolFlags.Namespace, sourceFile);
			const module = namespace && (namespace.flags & SymbolFlags.Alias
				? await checker.getAliasedSymbol(namespace)
				: namespace);
			return module && checker.getMemberInModuleExports(module, target.right.text);
		}

		if (
			TsAST.isImportTypeNode(target) && !target.isTypeOf
			&& target.qualifier && TsAST.isIdentifier(target.qualifier)
			&& TsAST.isLiteralTypeNode(target.argument) && TsAST.isStringLiteral(target.argument.literal)
		) {
			const path = target.argument.literal.text;
			const specifier = DArray.find(
				sourceFile.imports,
				(node) => TsAST.isStringLiteral(node) && node.text === path,
			);
			const module = specifier
				? await checker.getSymbolAtLocation(specifier)
				: await findImportedModule(path, context);
			return module && checker.getMemberInModuleExports(module, target.qualifier.text);
		}

		return undefined;
	});

	if (!symbol) {
		return DEither.none();
	}

	const resolved = symbol.flags & SymbolFlags.Alias
		? await checker.getAliasedSymbol(symbol)
		: symbol;

	if (await checker.isUnknownSymbol(resolved)) {
		return DEither.none();
	}

	return DEither.some(createResolvedReference({
		node: !(target instanceof Symbol) && isSourceNode(target) && !TsAST.isImportTypeNode(target)
			? target
			: undefined,
		symbol: resolved,
	}));
}

export async function resolveDependencyFile(
	target: DependencyReference | Symbol,
	context: BuildContext,
) {
	const reference = await DCommon.asyncPipe(
		resolveReferenceTarget(target, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(reference)) {
		return reference;
	}

	const declaration = reference.symbol.valueDeclaration;
	if (!declaration) {
		return DEither.none();
	}

	const filePath = DEither.unwrapRight(DPath.createAbsolute(declaration.path));
	if (
		DEither.isLeft(filePath)
		|| filePath === context.file.currentFilePath
		|| DString.includes(filePath, "/node_modules/")
	) {
		return DEither.none();
	}

	const { projectWorkDirectory } = context.transpilation;
	const relativePath = DPath.computeRelative(projectWorkDirectory, filePath);

	if (!DPath.resolveFrom(projectWorkDirectory, [relativePath], { stayInOrigin: true })) {
		return DEither.none();
	}

	return DEither.some({
		...reference,
		filePath,
	});
}

export async function resolveReferenceModule(
	target: ModuleReference,
	context: BuildContext,
	moduleName: string,
	entryPattern?: RegExp,
) {
	const reference = await DCommon.asyncPipe(
		resolveReferenceTarget(target, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(reference)) {
		return reference;
	}

	const { symbol } = reference;

	const declaration = symbol.valueDeclaration ?? DArray.first(symbol.declarations);

	const match = declaration && DString.extract(
		declaration.path,
		/.*\/node_modules\/(?<packageName>@[^/]+\/[^/]+|[^/]+)\/(?<entry>.+)$/,
	);
	const { packageName, entry } = match?.namedGroups ?? {};

	if (
		!packageName
		|| !entry
		|| packageName !== moduleName
		|| (
			entryPattern !== undefined
			&& DString.search(entry, entryPattern) === undefined
		)
	) {
		return DEither.none();
	}

	return DEither.some({
		...reference,
		packageName,
		entry,
		exportName: symbol.name,
	});
}

export type ObjectTypeDeclaration = TsAST.InterfaceDeclaration | TsAST.TypeAliasDeclaration;

export interface ResolvedTypeDeclaration {
	readonly declaration: ObjectTypeDeclaration;
	readonly filePath: string & DPath.Absolute;
}

function findTopLevelTypeDeclaration(sourceFile: TsAST.SourceFile, name: string) {
	return DArray.find(
		sourceFile.statements,
		(statement): statement is ObjectTypeDeclaration => (
			TsAST.isInterfaceDeclaration(statement) || TsAST.isTypeAliasDeclaration(statement)
		) && statement.name.text === name,
	);
}

/**
 * `import("../models/product").Product` : le checker écrit ainsi un type d'un autre
 * fichier, avec un chemin relatif au fichier courant, même quand celui-ci n'importe pas
 * ce module. Le fichier est lu dans le programme, puis la déclaration y est cherchée.
 */
async function resolveImportTypeDeclaration(node: TsAST.ImportTypeNode, context: BuildContext) {
	if (
		node.isTypeOf
		|| !node.qualifier
		|| !TsAST.isIdentifier(node.qualifier)
		|| !TsAST.isLiteralTypeNode(node.argument)
		|| !TsAST.isStringLiteral(node.argument.literal)
		|| !DString.startsWith(node.argument.literal.text, ".")
	) {
		return undefined;
	}

	const folder = DPath.getParentFolderPath(context.file.currentFilePath);
	const specifier = node.argument.literal.text;
	const name = node.qualifier.text;

	if (!folder) {
		return undefined;
	}

	// `./x` désigne `./x.ts` ou `./x/index.ts`.
	const candidates = DArray.flatMap(
		[`${specifier}.ts`, `${specifier}/index.ts`],
		(relative) => {
			const path = DEither.unwrapRight(DPath.create(relative));

			if (DEither.isLeft(path)) {
				return [];
			}

			const resolved = DPath.resolveFrom(folder, [path]);

			return resolved ? [resolved] : [];
		},
	);

	for (const candidate of candidates) {
		const sourceFile = await context.transpilation.program.getSourceFile(candidate);
		const declaration = sourceFile && findTopLevelTypeDeclaration(sourceFile, name);

		if (declaration) {
			return {
				declaration,
				filePath: candidate,
			};
		}
	}

	return undefined;
}

/**
 * Déclaration d'un type du projet (`interface`, `type X = …`) désignée par une référence
 * de type, ou `undefined` (type d'une bibliothèque, type global…).
 */
export async function resolveTypeDeclaration(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	context: BuildContext,
): Promise<ResolvedTypeDeclaration | undefined> {
	if (TsAST.isImportTypeNode(node)) {
		return resolveImportTypeDeclaration(node, context);
	}

	if (!TsAST.isIdentifier(node.typeName)) {
		return undefined;
	}

	const { typeChecker: checker } = context.transpilation;
	const found = isSourceNode(node.typeName)
		? await checker.getSymbolAtLocation(node.typeName)
		: await checker.resolveName(node.typeName.text, SymbolFlags.Type, context.file.sourceFile);
	const symbol = found && (found.flags & SymbolFlags.Alias ? await checker.getAliasedSymbol(found) : found);
	const handle = symbol && DArray.first(symbol.declarations);

	if (
		!handle
		|| (
			handle.kind !== TsAST.SyntaxKind.InterfaceDeclaration
			&& handle.kind !== TsAST.SyntaxKind.TypeAliasDeclaration
		)
		|| DString.includes(handle.path, "/node_modules/")
	) {
		return undefined;
	}

	const declaration = await handle.resolve();
	const filePath = DEither.unwrapRight(DPath.createAbsolute(handle.path));

	if (
		!declaration
		|| DEither.isLeft(filePath)
		|| (!TsAST.isInterfaceDeclaration(declaration) && !TsAST.isTypeAliasDeclaration(declaration))
	) {
		return undefined;
	}

	return {
		declaration,
		filePath,
	};
}
