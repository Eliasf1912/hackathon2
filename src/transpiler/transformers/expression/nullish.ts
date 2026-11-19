import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { nullShardDependency, undefinedShardDependency } from "../../sharedDependency/defaults";
import { type BuildContext } from "../../context/build";

/**
 * `null` / `undefined` → valeur des types partagés `JSNull{}` / `JSUndefined{}`
 * (JSON : `null` ; `undefined` est omis comme en JS là où son `IsZero` est utilisé).
 */
export function createNullishReference(kind: "null" | "undefined", context: BuildContext) {
	return GoAST.createPackageTypeReference({
		packageName: context.registerSharedDependency(
			kind === "null" ? nullShardDependency.value : undefinedShardDependency.value,
		),
		identifier: GoAST.createIdentifier(kind === "null" ? "JSNull" : "JSUndefined"),
	});
}

function getNullishKind(node: TsAST.Node) {
	if (node.kind === TsAST.SyntaxKind.NullKeyword) {
		return "null";
	}

	return TsAST.isIdentifier(node) && node.text === "undefined"
		? "undefined"
		: undefined;
}

export const nullishLiteralTransformer: Transformer<GoAST.StructLiteral> = createTransformer(
	(node, context) => {
		const kind = getNullishKind(node);

		if (!kind) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createStructLiteral({
				typeReference: createNullishReference(kind, context),
				elements: [],
			}),
		});
	},
);
