/**
 * Espaces de `\s` en JS (Unicode) ; le `\s` de Go n'en couvre que la partie ASCII.
 */
const javaScriptSpaces = String.raw`\t\n\x0B\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}`;

// Fins de ligne JS, que `.` ne reconnaît pas sans le drapeau `s` (Go n'exclut que `\n`).
const javaScriptLineTerminators = String.raw`\n\r\x{2028}\x{2029}`;

const anyCharacter = String.raw`[\x{0}-\x{10FFFF}]`;

interface TranslatedPattern {
	kind: "translated";
	pattern: string;
}

interface UnsupportedPattern {
	kind: "unsupported";
	reason: string;
}

export type PatternTranslation = TranslatedPattern | UnsupportedPattern;

function translateDot(dotAll: boolean) {
	return dotAll ? anyCharacter : `[^${javaScriptLineTerminators}]`;
}

/**
 * Motif d'une expression régulière JS → motif RE2 (Go) de même sens.
 *
 * - `.` → tout sauf les fins de ligne JS (`\n`, `\r`, U+2028, U+2029), ou tout avec `s` ;
 * - `\s` / `\S` → la liste explicite des espaces JS (Unicode) ;
 * - `[^]` → tout caractère, `[]` → aucun ;
 * - `\uXXXX`, `\u{X…}` → `\x{…}`.
 *
 * Refusé (pas d'équivalent RE2) : assertions avant / arrière, références arrière
 * (`\1`, `\k<nom>`), `\cX`, `\S` dans une classe.
 */
export function translatePattern(pattern: string, dotAll: boolean): PatternTranslation {
	const parts: string[] = [];
	let index = 0;
	let inClass = false;

	const unsupported = (reason: string): PatternTranslation => ({
		kind: "unsupported",
		reason,
	});

	while (index < pattern.length) {
		const character = pattern.charAt(index);
		const next = pattern.charAt(index + 1);

		if (character === "\\") {
			if (/[1-9kc]/u.test(next)) {
				return unsupported(`\\${next}`);
			}

			if (next === "s") {
				parts.push(inClass ? javaScriptSpaces : `[${javaScriptSpaces}]`);
				index += 2;
				continue;
			}

			if (next === "S") {
				if (inClass) {
					return unsupported("\\S in a class");
				}

				parts.push(`[^${javaScriptSpaces}]`);
				index += 2;
				continue;
			}

			if (next === "u") {
				const braced = /^\\u\{([0-9a-fA-F]+)\}/u.exec(pattern.slice(index));
				const fixed = /^\\u([0-9a-fA-F]{4})/u.exec(pattern.slice(index));
				const match = braced ?? fixed;

				if (!match?.[1]) {
					return unsupported("\\u");
				}

				parts.push(`\\x{${match[1]}}`);
				index += match[0].length;
				continue;
			}

			parts.push(character + next);
			index += 2;
			continue;
		}

		if (inClass) {
			inClass = character !== "]";
			parts.push(character);
			index += 1;
			continue;
		}

		if (pattern.startsWith("[^]", index)) {
			parts.push(anyCharacter);
			index += 3;
			continue;
		}

		if (pattern.startsWith("[]", index)) {
			parts.push("[^\\x{0}-\\x{10FFFF}]");
			index += 2;
			continue;
		}

		if (character === "[") {
			inClass = true;
			parts.push(character);
			index += 1;

			// `[^` puis `]` en premier : le `]` est littéral en Go, la classe vide en JS est
			// déjà traitée au-dessus.
			continue;
		}

		if (character === "(" && /^\(\?<?[=!]/u.test(pattern.slice(index))) {
			return unsupported("lookaround");
		}

		parts.push(character === "." ? translateDot(dotAll) : character);
		index += 1;
	}

	return {
		kind: "translated",
		pattern: parts.join(""),
	};
}
