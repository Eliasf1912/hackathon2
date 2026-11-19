import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";

export const objectLiteralTransformer: Transformer<GoAST.MapLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isObjectLiteralExpression(node)) {
			return context.notSupport();
		}

		const propertiesResult = await DCommon.asyncPipe(
			node.properties,
			DArray.map(
				async(prop) => {
					if (!TsAST.isPropertyAssignment(prop)) {
						return context.notSupport();
					}

					const keyText = TsAST.isIdentifier(prop.name) || TsAST.isStringLiteral(prop.name)
						? prop.name.text
						: undefined;

					if (keyText === undefined) {
						return context.notSupport();
					}

					const initResult = await DCommon.asyncPipe(
						context.transform(prop.initializer, expressionTransformers.value),
						DEither.unwrapRight,
					);

					if (DEither.isLeft(initResult)) {
						return initResult;
					}

					return DEither.right("prop-success", {
						before: initResult.before,
						element: GoAST.createKeyedElement({
							key: GoAST.createStringLiteral({ value: keyText }),
							value: initResult.result,
						}),
					});
				},
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<{
					before: readonly GoAST.Statement[];
					elements: readonly GoAST.KeyedElement[];
				}>({
					before: [],
					elements: [],
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					const unwrapped = DEither.unwrapRight(element);

					return next({
						before: DArray.concat(lastValue.before, unwrapped.before),
						elements: DArray.push(lastValue.elements, unwrapped.element),
					});
				},
			),
		);

		if (DEither.isLeft(propertiesResult)) {
			return propertiesResult;
		}

		const mapType = GoAST.createMapType({
			keyType: GoAST.builtinTypeReferences.string,
			valueType: GoAST.builtinTypeReferences.any,
		});

		return context.success({
			before: propertiesResult.before,
			result: GoAST.createMapLiteral({
				typeReference: mapType,
				elements: propertiesResult.elements,
			}),
		});
	},
);

