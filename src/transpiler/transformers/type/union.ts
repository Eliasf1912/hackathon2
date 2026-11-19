import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { eitherIsRightDependency, eitherRightInterfaceIdentifier } from "../duplojs/either/isRight/sharedDependency";

export const unionTypeTransformer: Transformer<GoAST.TypeReference | GoAST.Type> = createTransformer(
	(node, context) => {
		if (!TsAST.isUnionTypeNode(node)) {
			return context.notSupport();
		}

		const isEitherUnion = node.types.some((typeNode) => {
			if (TsAST.isTypeReferenceNode(typeNode)) {
				const name = TsAST.isIdentifier(typeNode.typeName)
					? typeNode.typeName.text
					: typeNode.typeName.right.text;
				return name === "Success" || name === "Fail" || name === "Left";
			}
			return false;
		});

		if (isEitherUnion) {
			const packageName = context.registerSharedDependency(eitherIsRightDependency.value);
			return context.success({
				result: GoAST.createPackageTypeReference({
					packageName,
					identifier: eitherRightInterfaceIdentifier,
				}),
			});
		}

		return context.success({
			result: GoAST.builtinTypeReferences.any,
		});
	},
);
