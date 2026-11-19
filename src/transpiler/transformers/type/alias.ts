import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";

type GoType = GoAST.Type | GoAST.TypeReference;

/**
 * Struct de chaque alias Go émis (`type Product = struct { … }`), par écriture de la
 * référence (`Product`, `paquet.Product`). Pour Go, l'alias et sa struct sont le même
 * type : le transpileur les compare donc alias dépliés.
 */
interface RegisteredAlias {
	struct: GoAST.StructType;
	// Noms Go des paramètres de type d'un alias générique (`Response[GenericBody]`).
	typeParameters: readonly string[];
}

const aliasStructs = new Map<string, RegisteredAlias>();

/**
 * À appeler au début de chaque transpilation : deux projets peuvent déclarer un alias de
 * même nom (`Product`) avec des champs différents.
 */
export function resetAliases() {
	aliasStructs.clear();
}

export function registerAlias(
	reference: GoType,
	struct: GoAST.StructType,
	typeParameters: readonly string[] = [],
) {
	aliasStructs.set(GoPrinter.renderNode(reference), {
		struct,
		typeParameters,
	});
}

/**
 * Le type avec chaque paramètre de type (`GenericBody`) remplacé par son argument.
 */
function substitute(type: GoType, bindings: ReadonlyMap<string, GoType>): GoType {
	if (DModeling.hasTagValue(type, "[node]identifier")) {
		return bindings.get(type.value) ?? type;
	}

	return mapChildren(type, (child) => substitute(child, bindings));
}

/**
 * Le type avec chaque alias remplacé par sa struct, à toute profondeur.
 */
export function expandAliases(type: GoType): GoType {
	const alias = aliasStructs.get(GoPrinter.renderNode(type));

	if (alias) {
		return expandAliases(alias.struct);
	}

	// Alias générique instancié (`Response[X]`) : sa struct, paramètres remplacés.
	if (DModeling.hasTagValue(type, "[node]type-reference-generic")) {
		const generic = aliasStructs.get(GoPrinter.renderNode(type.typeReference));

		if (generic && DArray.lengthEqual(generic.typeParameters, type.typeArguments.length)) {
			const bindings = new Map(DArray.map(
				generic.typeParameters,
				(name, { index }) => [name, DArray.at(type.typeArguments, index) ?? type] as const,
			));

			return expandAliases(substitute(generic.struct, bindings));
		}
	}

	return mapChildren(type, expandAliases);
}

/**
 * Le même type, avec `transform` appliqué à chacun de ses types enfants.
 */
function mapChildren(type: GoType, transform: (child: GoType) => GoType): GoType {
	if (DModeling.hasTagValue(type, "[node]type-reference-generic")) {
		return GoAST.createGenericTypeReference({
			typeReference: type.typeReference,
			typeArguments: DCommon.cast(DArray.map(type.typeArguments, transform)),
		});
	}

	if (DModeling.hasTagValue(type, "[node][type]slice")) {
		return GoAST.createSliceType({ elementType: transform(type.elementType) });
	}

	if (DModeling.hasTagValue(type, "[node][type]array")) {
		return GoAST.createArrayType({
			length: type.length,
			elementType: transform(type.elementType),
		});
	}

	if (DModeling.hasTagValue(type, "[node][type]map")) {
		return GoAST.createMapType({
			keyType: type.keyType,
			valueType: transform(type.valueType),
		});
	}

	if (DModeling.hasTagValue(type, "[node][type]struct")) {
		return GoAST.createStructType({
			fields: DArray.map(
				type.fields,
				(field) => (DModeling.hasTagValue(field, "[node]struct-field")
					? GoAST.createStructField({
						identifier: field.identifier,
						typeReference: transform(field.typeReference),
						tag: field.tag,
					})
					: field),
			),
		});
	}

	if (DModeling.hasTagValue(type, "[node][type]function")) {
		return GoAST.createFunctionType({
			arguments: DArray.map(type.arguments, (argument) => GoAST.createFunctionArgument({
				identifier: argument.identifier,
				type: transform(argument.type),
			})),
			returnTypes: DArray.map(type.returnTypes, transform),
		});
	}

	return type;
}
