import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency, createTransformer, sharedDependencyPackageName, type SharedDependency, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { translatePattern } from "./regularExpressionPattern";

interface CompiledRegularExpression {
	identifier: GoAST.Identifier;
	dependency: SharedDependency;
}

// Une variable de paquet par expression Go : chaque motif n'est compilé qu'une fois.
const compiledExpressions = new Map<string, CompiledRegularExpression>();

/**
 * Drapeaux JS → drapeaux en ligne Go. `s` est traduit avec `.` (`translatePattern`).
 * `g` et `y` rendent `test` dépendant de `lastIndex` (état) : refusés, comme les
 * drapeaux inconnus.
 */
const inlineFlags: ReadonlyMap<string, string> = new Map([
	["i", "i"],
	["m", "m"],
	["s", ""],
	["u", ""],
]);

function getCompiledExpression(goPattern: string) {
	const known = compiledExpressions.get(goPattern);

	if (known) {
		return known;
	}

	const identifier = GoAST.createIdentifier(`RegularExpression${compiledExpressions.size}`);
	const compiled: CompiledRegularExpression = {
		identifier,
		dependency: createSharedDependency({
			imports: [GoAST.createImportDeclaration({ path: "regexp" })],
			init: [],
			declarations: [
				GoAST.createVariableDeclarationInitialized({
					identifier,
					initializer: GoAST.createCallExpression({
						callee: GoAST.createSelectorExpression({
							target: GoAST.createIdentifier("regexp"),
							identifier: GoAST.createIdentifier("MustCompile"),
						}),
						arguments: [GoAST.createStringLiteral({ value: goPattern })],
					}),
				}),
			],
		}),
	};

	compiledExpressions.set(goPattern, compiled);

	return compiled;
}

/**
 * `/motif/drapeaux` → `shard_dependencies.RegularExpressionN`, une variable de paquet
 * `regexp.MustCompile("(?drapeaux)motif")` : compilée une seule fois, au démarrage. Le motif
 * est traduit avec le sens JS (`translatePattern` : `.`, `\s`, `[^]`, `\u`…).
 *
 * Limite connue : RE2 travaille sur des runes, JS (sans `u`) sur des unités UTF-16 : un
 * caractère hors plan multilingue de base compte pour un en Go, pour deux en JS.
 */
export const regularExpressionTransformer: Transformer<GoAST.SelectorExpression> = createTransformer(
	(node, context) => {
		if (node.kind !== TsAST.SyntaxKind.RegularExpressionLiteral || !("text" in node)) {
			return context.notSupport();
		}

		const text = DCommon.pipe(node, ({ text: literal }) => String(literal));
		const lastSlash = text.lastIndexOf("/");
		const pattern = text.slice(1, lastSlash);
		const flags = [...text.slice(lastSlash + 1)];

		const translation = translatePattern(pattern, flags.includes("s"));

		if (translation.kind === "unsupported") {
			return context.error(node, {
				reason: "un-support-regular-expression-syntax",
				syntax: translation.reason,
			});
		}

		const goFlags = flags.map((flag) => inlineFlags.get(flag));

		if (goFlags.some((flag) => flag === undefined)) {
			return context.error(node, "un-support-regular-expression-flag");
		}

		const prefix = goFlags.join("");
		const compiled = getCompiledExpression(
			prefix ? `(?${prefix})${translation.pattern}` : translation.pattern,
		);

		context.registerSharedDependency(compiled.dependency);

		return context.success({
			result: GoAST.createSelectorExpression({
				target: sharedDependencyPackageName,
				identifier: compiled.identifier,
			}),
		});
	},
);
