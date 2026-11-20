import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";
import * as DGenerator from "@duplojs/lang/generator";
import * as DPath from "@duplojs/lang/path";
import * as DSCommon from "@duplojs/server/common";
import { build, createTypescriptInstance } from "@transpiler";

interface TestCase {
	name: string;
	description: string;
	code: string;
	category: string;
	// Ajouté après `code` pour la comparaison des sorties Go / TS : appelle et affiche.
	call?: string;
}

const printImport = "import * as DCommon from \"@duplojs/lang/common\";\n";

const testCases: TestCase[] = [
	{
		name: "01_primitive_types_annotations",
		category: "Types",
		description: "Types primitifs en annotations de paramètres (string, boolean)",
		code: `
export function test(a: string, b: boolean): string {
	return a;
}
`,
		call: printImport + "DCommon.print(test(\"hello\", true));\n",
	},
	{
		name: "02_boolean_literals_and_logical_ops",
		category: "Expressions",
		description: "Booléens littéraux et opérateurs logiques (true, false, &&, ||)",
		code: `
export function test(): boolean {
	const a = true;
	const b = false;
	return a && b;
}
`,
		call: printImport + "DCommon.print(test());\n",
	},
	{
		name: "03_for_of_loop",
		category: "Statements",
		description: "Boucle impérative for...of",
		code: `
import * as DCommon from "@duplojs/lang/common";
export function test(items: number[]): void {
	for (const x of items) {
		DCommon.print(x);
	}
}
`,
		call: "test([1, 2, 3]);\n",
	},
	{
		name: "04_switch_statement",
		category: "Statements",
		description: "Instruction switch/case",
		code: `
export function test(x: number): number {
	switch (x) {
		case 1:
			return 10;
		default:
			return 0;
	}
}
`,
		call: printImport + "DCommon.print(test(1));\nDCommon.print(test(5));\n",
	},
	{
		name: "05_deeply_nested_pipe",
		category: "DuploJS",
		description: "Chaînage pipe à 5 étapes",
		code: `
import * as DCommon from "@duplojs/lang/common";
export const result = DCommon.pipe(
	1,
	(x: number) => x + 1,
	(x: number) => x * 2,
	(x: number) => x - 3,
	(x: number) => x + 10,
);
`,
		call: "DCommon.print(result);\n",
	},
	{
		name: "06_property_access_on_object",
		category: "Expressions",
		description: "Accès à une propriété statique (user.name)",
		code: `
export const user = { name: "Alice", age: 30 };
export const name = user.name;
`,
		call: printImport + "DCommon.print(name);\nDCommon.print(user);\n",
	},
	{
		name: "07_object_destructuring",
		category: "Statements",
		description: "Déstructuration d'objet dans const { a, b }",
		code: `
export function test() {
	const { a, b } = { a: 1, b: 2 };
	return a + b;
}
`,
		call: printImport + "DCommon.print(test());\n",
	},
	{
		name: "08_template_literal",
		category: "Expressions",
		description: "Template string avec interpolation `Hello ${name}`",
		code: `
export function test(name: string) {
	return \`Hello \${name}\`;
}
`,
		call: printImport + "DCommon.print(test(\"Bob\"));\n",
	},
	{
		name: "09_typeof_operator",
		category: "Expressions",
		description: "Opérateur unaire typeof",
		code: `
export function test(x: any) {
	return typeof x;
}
`,
	},
	{
		name: "10_multiple_return_branches_if_else",
		category: "Statements",
		description: "Plusieurs branches if / else if / else avec return",
		code: `
export function test(x: number): number {
	if (x > 0) {
		return 1;
	} else if (x < 0) {
		return -1;
	} else {
		return 0;
	}
}
`,
		call: printImport + "DCommon.print(test(5));\nDCommon.print(test(-5));\nDCommon.print(test(0));\n",
	},
	{
		name: "11_darray_coalescing",
		category: "DuploJS",
		description: "DArray.coalescing avec tableau de Either",
		code: `
import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
export const res = DArray.coalescing([
	DEither.fail("not-found"),
	DEither.success(42),
]);
`,
	},
	{
		name: "12_deither_group_mixed_types",
		category: "DuploJS",
		description: "DEither.group avec types hétérogènes (number et string)",
		code: `
import * as DEither from "@duplojs/lang/either";
export const res = DEither.group([
	DEither.success(10),
	DEither.success("ok"),
]);
`,
	},
	{
		name: "13_native_array_methods",
		category: "Exécution",
		description: "Méthode native JS .map() sur tableau",
		code: `
export const res = [1, 2, 3].map((x) => x * 2);
`,
	},
	{
		name: "14_throw_and_try_catch",
		category: "Statements",
		description: "Gestion d'exception par try / catch / throw",
		code: `
export function test() {
	try {
		throw new Error("fail");
	} catch (e) {
		return 0;
	}
}
`,
	},
	{
		name: "15_nested_ternary_conditional",
		category: "Expressions",
		description: "Opérateur conditionnel ternaire imbriqué",
		code: `
export function test(a: number, b: number) {
	return a > 0 ? (b > 0 ? 1 : 2) : 3;
}
`,
		call: printImport + "DCommon.print(test(1, 1));\nDCommon.print(test(1, -1));\nDCommon.print(test(-1, 0));\n",
	},
	{
		name: "16_destructuring_tuple_in_pipe",
		category: "DuploJS",
		description: "Déstructuration de tuple ([a, b]) dans une fonction de pipe",
		code: `
import * as DCommon from "@duplojs/lang/common";
export const res = DCommon.pipe(
	[10, 20] as const,
	([a, b]) => a + b,
);
`,
	},
	{
		name: "17_empty_array_literal",
		category: "Expressions",
		description: "Littéral de tableau vide []",
		code: `
export const empty = [];
`,
		call: printImport + "DCommon.print(empty);\n",
	},
	{
		name: "18_object_method_declaration",
		category: "Expressions",
		description: "Objet littéral contenant une méthode add() {}",
		code: `
export const calc = {
	add(a: number, b: number) {
		return a + b;
	},
};
`,
		call: printImport + "DCommon.print(calc.add(2, 3));\n",
	},
	{
		name: "19_deither_match_information_complex",
		category: "DuploJS",
		description: "DEither.matchInformation avec plusieurs branches",
		code: `
import * as DEither from "@duplojs/lang/either";
export const res = DEither.matchInformation(DEither.fail("not-found"), {
	"not-found": () => 404,
	"unauthorized": () => 401,
	_: () => 500,
});
`,
	},
	{
		name: "20_curried_darray_map_in_pipe",
		category: "DuploJS",
		description: "DArray.map currié dans DCommon.pipe avec déstructuration",
		code: `
import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
export const res = DCommon.pipe(
	[[1, 2], [3, 4]],
	DArray.map(([a, b]) => a + b),
);
`,
		call: "DCommon.print(res);\n",
	},
];

const BASE_TEST_DIR = path.resolve(os.tmpdir(), "duplojs_stress_tests_temp");

async function runTests() {
	await fs.rm(BASE_TEST_DIR, { recursive: true, force: true });
	await fs.mkdir(BASE_TEST_DIR, { recursive: true });

	// Symlink node_modules into tmpdir so module resolution matches the project environment
	try {
		await fs.symlink(
			path.join(process.cwd(), "node_modules"),
			path.join(BASE_TEST_DIR, "node_modules"),
			"dir",
		);
	} catch {
		// Ignore if already exists
	}

	const tsconfigContent = JSON.stringify({
		extends: "@duplojs/code-config/tsconfig/base.json",
		include: ["*.ts"],
	}, null, "\t");

	const results: {
		name: string;
		category: string;
		description: string;
		status: "PASS" | "FAIL";
		details?: string;
		reason?: string;
		output?: string;
	}[] = [];

	for (const testCase of testCases) {
		const testDir = path.join(BASE_TEST_DIR, testCase.name);
		await fs.mkdir(testDir, { recursive: true });

		const tsconfigPath = path.join(testDir, "tsconfig.json");
		const inputPath = path.join(testDir, "index.ts");

		await fs.writeFile(tsconfigPath, tsconfigContent);
		await fs.writeFile(inputPath, testCase.code);

		try {
			const workDirectory = DSCommon.getCurrentWorkDirectoryOrThrow();
			const resolvedTsconfig = DPath.resolveFrom(workDirectory, [DPath.createOrThrow(tsconfigPath)]);
			const resolvedInput = DPath.resolveFrom(workDirectory, [DPath.createOrThrow(inputPath)]);

			if (!resolvedTsconfig || !resolvedInput) {
				results.push({
					name: testCase.name,
					category: testCase.category,
					description: testCase.description,
					status: "FAIL",
					details: "Could not resolve paths",
				});
				continue;
			}

			const instanceEither = await createTypescriptInstance({
				tsconfigPath: resolvedTsconfig,
			});

			if (DEither.isLeft(instanceEither)) {
				results.push({
					name: testCase.name,
					category: testCase.category,
					description: testCase.description,
					status: "FAIL",
					details: "Failed to create TypescriptInstance",
				});
				continue;
			}

			const typescriptInstance = DEither.unwrapRight(instanceEither);
			const buildGenerator = build(typescriptInstance, resolvedInput);

			let buildError: any = null;

			await DGenerator.asyncReduce(
				DGenerator.reduceFrom(null),
				async({ item, exit, next }) => {
					if (DEither.isLeft(item)) {
						buildError = item;
						return exit(item);
					}
					return next(null);
				},
			)(buildGenerator);

			typescriptInstance.api.close();

			if (buildError) {
				const info = buildError["@duplojs/lang/kind/@DuplojsLangEither/information"] || buildError.information || "unknown-error";
				const val = buildError["@duplojs/lang/kind/@DuplojsLangEither/value"] || buildError.value;
				let extra = "";
				if (val && typeof val === "object") {
					extra = `Node: ${val.kind || ""} | text: "${val.text || ""}"`;
				}
				results.push({
					name: testCase.name,
					category: testCase.category,
					description: testCase.description,
					status: "FAIL",
					reason: info,
					details: extra,
				});
			} else {
				results.push({
					name: testCase.name,
					category: testCase.category,
					description: testCase.description,
					status: "PASS",
				});
			}
		} catch (err: any) {
			results.push({
				name: testCase.name,
				category: testCase.category,
				description: testCase.description,
				status: "FAIL",
				reason: "Exception",
				details: err.message || String(err),
			});
		}
	}

	// Cas acceptés : le programme (code + appel) est traduit, compilé et exécuté en Go, puis
	// sa sortie est comparée à celle de TypeScript par le banc .commands/test-outputs.sh.
	const passedCases = testCases.filter(
		(testCase) => results.some((r) => r.name === testCase.name && r.status === "PASS"),
	);

	for (const testCase of passedCases) {
		await fs.writeFile(
			path.join(BASE_TEST_DIR, testCase.name, "index.ts"),
			testCase.code + (testCase.call ?? ""),
		);
	}

	if (passedCases.length > 0) {
		const bench = spawnSync(
			"bash",
			[
				path.join(process.cwd(), ".commands", "test-outputs.sh"),
				...passedCases.map((testCase) => path.join(BASE_TEST_DIR, testCase.name)),
			],
			{
				encoding: "utf8",
				// Sans le tsconfig du transpileur que tsx transmet aux processus enfants :
				// chaque cas s'exécute avec son propre tsconfig.json.
				env: Object.fromEntries(
					Object.entries(process.env).filter(([key]) => key !== "TSX_TSCONFIG_PATH"),
				),
			},
		);

		for (const line of bench.stdout.split("\n")) {
			const match = /^(IDENTIQUE|DIFFÉRENT|GO KO|TRADUCTION KO)\s+cas (\S+)$/.exec(line);
			const result = match && results.find((r) => r.name === match[2]);

			if (match && result) {
				result.output = match[1];
			}
		}
	}

	await fs.rm(BASE_TEST_DIR, { recursive: true, force: true });

	console.log("\n==================== RÉSULTATS DU STRESS TEST ====================\n");
	for (const r of results) {
		const tag = r.status === "PASS" ? "✅ PASS" : "❌ FAIL";
		console.log(`${tag} [${r.category}] ${r.name}`);
		console.log(`     Desc: ${r.description}`);
		if (r.status === "PASS") {
			console.log(`     Go : ${r.output ?? "non comparé"}`);
		}
		if (r.status === "FAIL") {
			console.log(`     Raison: ${r.reason}`);
			if (r.details) {
				console.log(`     Détails: ${r.details}`);
			}
		}
		console.log("");
	}

	const passCount = results.filter((r) => r.status === "PASS").length;
	const failCount = results.filter((r) => r.status === "FAIL").length;
	const identicalCount = results.filter((r) => r.output === "IDENTIQUE").length;
	console.log(`TOTAL: ${results.length} tests | ${passCount} Réussis (compilation TS->Go validée) | ${failCount} Échecs | Go identique à TS : ${identicalCount}/${passCount}`);
	console.log(`Note: PASS valide l'acceptation par le transpileur ; « Go identique à TS » compare en plus la sortie du Go compilé et exécuté à celle de TypeScript.\n`);
}

runTests().catch(console.error);
