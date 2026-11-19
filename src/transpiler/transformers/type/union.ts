import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { typeTransformers } from ".";

/**
 * Go has no union value type. A TypeScript union becomes the empty interface:
 * the Go interface value still carries the concrete type and value of the
 * variant at runtime, which shared dependencies inspect when they need it.
 *
 * When every member has the same Go type (`"a" | "b"`, `"text" | string`),
 * the union keeps that type.
 */
export const unionTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isUnionTypeNode(node)) {
			return context.notSupport();
		}

		const memberTypes = await DCommon.asyncPipe(
			node.types,
			DArray.map(
				(member) => DCommon.asyncPipe(
					context.transform(member, typeTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
		);

		const firstMemberType = DArray.first(memberTypes);

		const sharedType = firstMemberType
			&& !DEither.isLeft(firstMemberType)
			&& DArray.lengthEqual(firstMemberType.before, 0)
			&& DArray.every(
				memberTypes,
				(memberType) => !DEither.isLeft(memberType)
					&& DArray.lengthEqual(memberType.before, 0)
					&& DCommon.equal(
						GoPrinter.renderNode(memberType.result),
						GoPrinter.renderNode(firstMemberType.result),
					),
			)
			? firstMemberType.result
			: undefined;

		return context.success({
			result: sharedType ?? GoAST.builtinTypeReferences.any,
		});
	},
);
