import { AsyncLocalStorage } from "node:async_hooks";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, transform, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { NodeBuilderFlags, SymbolFlags } from "typescript/async";
import { type BuildContext } from "../../context/build";
import { isSourceNode, resolveTypeDeclaration } from "../../resolvedReference";
import { typeTransformers } from ".";
import { createNullishReference } from "../expression/nullish";
import { createUnionType, getUnionType, goTypeKey, type GoType } from "./union";
import { registerAlias } from "./alias";

const goIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

// Déclarations en cours de résolution sur ce chemin d'appel (détection des types récursifs).
// Propre à chaque chemin asynchrone : deux champs de même type résolus en parallèle ne
// sont pas une récursion.
const resolvingDeclarations = new AsyncLocalStorage<ReadonlySet<TsAST.Node>>();

/**
 * Nom Go d'un champ : le nom TS avec une majuscule (`stock` → `Stock`), exporté pour que
 * `encoding/json` le voie. Un nom qui n'est pas un identifiant Go (`"out-of-stock"`) est
 * échappé. Le nom exact est gardé dans le tag JSON.
 */
export function getFieldIdentifier(name: string, context: BuildContext) {
	return goIdentifierPattern.test(name)
		? GoAST.createIdentifier(`${name.charAt(0).toUpperCase()}${name.slice(1)}`)
		: context.createSourceIdentifier(name);
}

/**
 * Le type Go peut-il valoir `undefined` (`JSUndefined`, ou union qui le contient) ?
 * Alors la clé disparaît du JSON quand elle vaut `undefined`, comme en JS.
 */
function canBeUndefined(type: GoType) {
	// Par l'écriture du type : construire `JSUndefined` ici enregistrerait une dépendance
	// (et un import) inutilisée.
	const members = getUnionType(type)?.typeArguments ?? [type];

	return DArray.some(members, (member) => goTypeKey(member).endsWith(".JSUndefined"));
}

function getMemberName(name: TsAST.PropertyName) {
	return TsAST.isIdentifier(name) || TsAST.isStringLiteral(name)
		? name.text
		: undefined;
}

type ObjectMember = TsAST.PropertySignatureDeclaration | TsAST.MethodSignatureDeclaration;

async function transformMemberType(member: ObjectMember, context: BuildContext) {
	// Méthode d'un objet (`findAll(): Promise<…>`) : un champ de type fonction.
	const typeNode = TsAST.isMethodSignatureDeclaration(member)
		? member.type && TsAST.factory.createFunctionTypeNode(undefined, member.parameters, member.type)
		: member.type;

	if (!typeNode) {
		return context.error(member, "un-support-object-member");
	}

	const type = await DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(type) || member.postfixToken?.kind !== TsAST.SyntaxKind.QuestionToken) {
		return type;
	}

	// Champ optionnel (`discountCode?: string`) : il peut valoir `undefined`.
	const optional = createUnionType([type.result, createNullishReference("undefined", context)], context);

	return optional
		? context.success({
			before: type.before,
			result: optional,
		})
		: context.error(member, "un-support-object-member");
}

/**
 * Membres d'un type d'objet (`{ a: string; b?: number }`, `interface`) → struct Go
 * anonyme. Deux structs anonymes de mêmes champs sont le même type en Go : comme en TS,
 * l'identité est structurelle, sans conversion.
 *
 * ```go
 * struct {
 *     Id    string                          `json:"id"`
 *     Code  Union2[JSUndefined, string]     `json:"code,omitzero"`
 * }
 * ```
 */
export async function createStructFromMembers(
	node: TsAST.Node,
	members: readonly TsAST.TypeElement[],
	context: BuildContext,
) {
	const fields = await DCommon.asyncPipe(
		members,
		DArray.map(async(member) => {
			if (!TsAST.isPropertySignatureDeclaration(member) && !TsAST.isMethodSignatureDeclaration(member)) {
				return context.error(member, "un-support-object-member");
			}

			const name = getMemberName(member.name);

			if (name === undefined) {
				return context.error(member, "un-support-object-member");
			}

			const type = await transformMemberType(member, context);

			if (DEither.isLeft(type)) {
				return type;
			}

			const { result } = DEither.unwrapRight(type);

			return DEither.right("field", GoAST.createStructField({
				identifier: getFieldIdentifier(name, context),
				typeReference: result,
				tag: `json:"${name}${canBeUndefined(result) ? ",omitzero" : ""}"`,
			}));
		}),
		DCommon.promiseAll,
	);

	const failed = DArray.find(fields, DEither.isLeft);

	if (failed) {
		return failed;
	}

	const structFields = DArray.map(DArray.filter(fields, DEither.isRight), DEither.unwrapRight);
	const names = DArray.map(structFields, ({ identifier }) => identifier.value);

	if (new Set(names).size !== names.length) {
		return context.error(node, "un-support-object-field-name-collision");
	}

	return DEither.right("struct", GoAST.createStructType({ fields: structFields }));
}

/**
 * `{ [key: string]: T }` (et `Record<string, T>`) → `map[string]T` : un dictionnaire,
 * pas une forme fixe.
 *
 * shortcut: le JSON d'une map Go trie ses clés, celui de JS suit l'ordre d'insertion (clés
 * entières d'abord) ; afficher un `Record` peut donc différer. À traiter (map ordonnée
 * partagée avec son `MarshalJSON`) quand un programme affichera un dictionnaire.
 */
async function createMapType(valueNode: TsAST.TypeNode, context: BuildContext) {
	const valueType = await DCommon.asyncPipe(
		context.transform(valueNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	return context.success({
		before: valueType.before,
		result: GoAST.createMapType({
			keyType: GoAST.builtinTypeReferences.string,
			valueType: valueType.result,
		}),
	});
}

/**
 * Type d'objet anonyme `{ … }` → struct anonyme ; signature d'index seule → `map`.
 */
export const objectLiteralTypeTransformer: Transformer<GoAST.Type> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeLiteralNode(node)) {
			return context.notSupport();
		}

		const [indexSignature] = DArray.filter(node.members, TsAST.isIndexSignatureDeclaration);

		if (indexSignature) {
			const [keyParameter] = indexSignature.parameters;

			if (
				!DArray.lengthEqual(node.members, 1)
				|| keyParameter?.type?.kind !== TsAST.SyntaxKind.StringKeyword
			) {
				return context.error(node, "un-support-index-signature");
			}

			return createMapType(indexSignature.type, context);
		}

		const struct = await createStructFromMembers(node, node.members, context);

		return DEither.isLeft(struct)
			? struct
			: context.success({ result: DEither.unwrapRight(struct) });
	},
);

/**
 * `Record<string, T>` → `map[string]T`.
 */
export const recordTypeTransformer: Transformer<GoAST.MapType> = createTransformer(
	(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| node.typeName.text !== "Record"
		) {
			return context.notSupport();
		}

		const [keyNode, valueNode] = node.typeArguments ?? [];

		if (keyNode?.kind !== TsAST.SyntaxKind.StringKeyword || !valueNode) {
			return context.error(node, "un-support-record-key");
		}

		return createMapType(valueNode, context);
	},
);

/**
 * Déclaration qui nomme un type d'objet (`interface X`, `type X = { … }`) : elle devient un
 * alias Go `type X = struct { … }`. Les autres alias (`type S = "a" | "b"`) sont dépliés.
 */
export function namesObjectType(declaration: TsAST.InterfaceDeclaration | TsAST.TypeAliasDeclaration) {
	return TsAST.isInterfaceDeclaration(declaration) || TsAST.isTypeLiteralNode(declaration.type);
}

/**
 * Référence à un type déclaré dans le projet (`Product`, `import("./x").Product`) :
 * - type d'objet : son alias Go, dans le paquet du fichier qui le déclare ;
 * - autre alias : son type, déplié.
 *
 * Alias générique (`interface Response<T>`) : `Response[X]`.
 *
 * Limite connue : `interface … extends …`.
 */
export const declaredTypeTransformer: Transformer<GoType> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeReferenceNode(node) && !TsAST.isImportTypeNode(node)) {
			return context.notSupport();
		}

		const resolved = await resolveTypeDeclaration(node, context);

		if (!resolved) {
			return context.notSupport();
		}

		const { declaration, filePath } = resolved;

		const typeParameters = declaration.typeParameters ?? [];
		const typeArgumentNodes = node.typeArguments ?? [];

		if (!DArray.lengthEqual(typeParameters, typeArgumentNodes.length)) {
			return context.error(node, "un-support-generic-type-arguments");
		}

		if (TsAST.isInterfaceDeclaration(declaration) && declaration.heritageClauses?.length) {
			return context.error(node, "un-support-interface-extends");
		}

		if (!namesObjectType(declaration)) {
			if (!DArray.lengthEqual(typeParameters, 0)) {
				return context.error(node, "un-support-generic-type");
			}

			if (!TsAST.isTypeAliasDeclaration(declaration)) {
				return context.notSupport();
			}

			const aliasChain = resolvingDeclarations.getStore() ?? new Set<TsAST.Node>();

			if (aliasChain.has(declaration)) {
				return context.error(node, "un-support-recursive-type");
			}

			// Le type que le checker a calculé pour l'alias (`ReturnType<typeof f>`, union…),
			// déplié (`InTypeAlias` : sinon il serait réécrit par le nom de l'alias).
			const { typeChecker } = context.transpilation;
			const aliasedNode = await typeChecker.typeToTypeNode(
				await typeChecker.getTypeAtLocation(declaration.name),
				declaration,
				NodeBuilderFlags.NoTruncation | NodeBuilderFlags.InTypeAlias,
			);

			return aliasedNode
				? resolvingDeclarations.run(
					new Set([...aliasChain, declaration]),
					() => context.transform(aliasedNode, typeTransformers.value),
				)
				: context.error(node, "un-support-type-alias");
		}

		const typeArguments = await DCommon.asyncPipe(
			typeArgumentNodes,
			DArray.map((argument) => DCommon.asyncPipe(
				context.transform(argument, typeTransformers.value),
				DEither.unwrapRight,
			)),
			DCommon.promiseAll,
		);

		const failedArgument = DArray.find(typeArguments, DEither.isLeft);

		if (failedArgument) {
			return failedArgument;
		}

		const identifier = context.createSourceIdentifier(declaration.name.text);
		const reference: GoType = filePath === context.file.currentFilePath
			? identifier
			: GoAST.createPackageTypeReference({
				packageName: context.registerDependencyFile({ filePath } as Parameters<BuildContext["registerDependencyFile"]>[0]),
				identifier,
			});

		// La struct de l'alias, pour comparer les types alias dépliés (voir `alias.ts`).
		const members = TsAST.isInterfaceDeclaration(declaration)
			? declaration.members
			: TsAST.isTypeLiteralNode(declaration.type) && declaration.type.members;
		const chain = resolvingDeclarations.getStore() ?? new Set<TsAST.Node>();

		// Type récursif (`interface Node { next?: Node }`) : un alias Go vers une struct ne
		// peut pas se contenir ; sans ce garde, la résolution ne finirait jamais.
		if (chain.has(declaration)) {
			return context.error(node, "un-support-recursive-type");
		}

		// Calculée seulement pour le registre : ce fichier ne référence que l'alias, les
		// paquets des types de ses champs n'y sont pas importés (un import inutilisé est une
		// erreur Go). Contexte dérivé, sans effet sur les traductions qui tournent en parallèle.
		const registryContext: BuildContext = {
			...context,
			transform: (data, transformers) => transform(data, transformers, registryContext),
			registerDependencyFile: ({ filePath }) => context.createSourceIdentifier(filePath),
		};
		const struct = members && await resolvingDeclarations.run(
			new Set([...chain, declaration]),
			() => createStructFromMembers(declaration, members, registryContext),
		);

		if (struct && DEither.isLeft(struct)) {
			return struct;
		}

		if (struct) {
			registerAlias(
				reference,
				DEither.unwrapRight(struct),
				DArray.map(typeParameters, ({ name }) => context.createSourceIdentifier(name.text).value),
			);
		}

		const goTypeArguments = DArray.map(
			DArray.filter(
				typeArguments,
				(argument): argument is Exclude<typeof argument, DEither.Left> => !DEither.isLeft(argument),
			),
			({ result }) => result,
		);

		// Alias générique (`Response<X>`) : `Response[X]` (alias génériques, Go 1.24).
		return context.success({
			result: DArray.minElements(goTypeArguments, 1)
				? GoAST.createGenericTypeReference({
					typeReference: reference,
					typeArguments: goTypeArguments,
				})
				: reference,
		});
	},
);

// Noms des paramètres de type déclarés dans chaque fichier (`<GenericBody>`).
const fileTypeParameters = new WeakMap<TsAST.SourceFile, ReadonlySet<string>>();

function getFileTypeParameters(sourceFile: TsAST.SourceFile) {
	const known = fileTypeParameters.get(sourceFile);

	if (known) {
		return known;
	}

	const names = new Set<string>();
	const visit = (node: TsAST.Node): void => {
		if (TsAST.isTypeParameterDeclaration(node)) {
			names.add(node.name.text);
		}

		node.forEachChild((child) => {
			visit(child);
		});
	};

	visit(sourceFile);
	fileTypeParameters.set(sourceFile, names);

	return names;
}

/**
 * Référence à un paramètre de type (`GenericBody` dans `interface Response<GenericBody>`
 * ou `function ok<GenericBody>`) → le paramètre de type Go du même nom.
 *
 * Dans un type synthétisé par le checker (le type d'un objet à l'intérieur d'une fonction
 * générique), le nœud n'a pas de portée : un nom qui ne désigne rien au niveau du fichier
 * mais qu'un paramètre de type du fichier porte est pris pour ce paramètre. Si ce choix
 * était faux, Go refuserait de compiler (jamais de résultat faux en silence).
 */
export const typeParameterTransformer: Transformer<GoAST.Identifier> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeReferenceNode(node) || !TsAST.isIdentifier(node.typeName) || node.typeArguments?.length) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const name = node.typeName.text;

		if (isSourceNode(node.typeName)) {
			const symbol = await typeChecker.getSymbolAtLocation(node.typeName);
			const declaration = symbol && DArray.first(symbol.declarations);

			return declaration?.kind === TsAST.SyntaxKind.TypeParameter
				? context.success({ result: context.createSourceIdentifier(name) })
				: context.notSupport();
		}

		const fileSymbol = await typeChecker.resolveName(name, SymbolFlags.Type, context.file.sourceFile);

		return !fileSymbol && getFileTypeParameters(context.file.sourceFile).has(name)
			? context.success({ result: context.createSourceIdentifier(name) })
			: context.notSupport();
	},
);

/**
 * `Readonly<T>` → `T`, `ReadonlyArray<T>` → `[]T` : l'immutabilité est vérifiée par TS,
 * elle n'existe pas à l'exécution.
 */
export const readonlyUtilityTypeTransformer: Transformer<GoType> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| (node.typeName.text !== "Readonly" && node.typeName.text !== "ReadonlyArray")
			|| node.typeArguments?.length !== 1
		) {
			return context.notSupport();
		}

		const [argument] = node.typeArguments;

		if (!argument) {
			return context.notSupport();
		}

		const type = await DCommon.asyncPipe(
			context.transform(argument, typeTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(type)) {
			return type;
		}

		return context.success({
			before: type.before,
			result: node.typeName.text === "Readonly"
				? type.result
				: GoAST.createSliceType({ elementType: type.result }),
		});
	},
);

const computedUtilityTypes = new Set(["ReturnType", "Awaited", "Parameters", "InstanceType", "NonNullable"]);

/**
 * Type utilitaire de TS calculé par le checker (`ReturnType<typeof f>`, `Awaited<T>`…) :
 * le type qu'il désigne, demandé au checker puis traduit.
 */
export const computedUtilityTypeTransformer: Transformer<GoType> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| !computedUtilityTypes.has(node.typeName.text)
			|| !isSourceNode(node)
		) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const computed = await typeChecker.typeToTypeNode(
			await typeChecker.getTypeFromTypeNode(node),
			node,
			NodeBuilderFlags.NoTruncation | NodeBuilderFlags.InTypeAlias,
		);

		// Le checker réécrit parfois le type par lui-même : ne pas boucler.
		const isUnchanged = computed
			&& TsAST.isTypeReferenceNode(computed)
			&& TsAST.isIdentifier(computed.typeName)
			&& computedUtilityTypes.has(computed.typeName.text);

		if (!computed || isUnchanged) {
			return context.error(node, "un-support-utility-type");
		}

		return context.transform(computed, typeTransformers.value);
	},
);
