import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const printFunctionIdentifier = GoAST.createIdentifier("CommonPrint");

const inspectIdentifier = GoAST.createIdentifier("commonInspect");
const reduceIdentifier = GoAST.createIdentifier("commonInspectReduce");
const quoteIdentifier = GoAST.createIdentifier("commonInspectQuote");
const keyIdentifier = GoAST.createIdentifier("commonInspectKey");
const numberIdentifier = GoAST.createIdentifier("commonInspectNumber");
const lengthIdentifier = GoAST.createIdentifier("commonInspectLength");

const identifier = GoAST.createIdentifier;
const types = GoAST.builtinTypeReferences;

function select(target: GoAST.Expression, name: string) {
	return GoAST.createSelectorExpression({
		target,
		identifier: identifier(name),
	});
}

function call(callee: GoAST.Expression, callArguments: readonly GoAST.Expression[] = []) {
	return GoAST.createCallExpression({
		callee,
		arguments: callArguments,
	});
}

function text(value: string) {
	return GoAST.createStringLiteral({ value });
}

function integer(value: bigint) {
	return GoAST.createIntegerLiteral({ value });
}

function binary(
	operator: GoAST.BinaryOperator,
	left: GoAST.Expression,
	right: GoAST.Expression,
) {
	return GoAST.createBinaryExpression({
		operator,
		left,
		right,
	});
}

function concat(...parts: readonly GoAST.Expression[]) {
	const [first, ...rest] = parts;

	return DArray.reduce(
		rest,
		DArray.reduceFrom<GoAST.Expression>(first ?? text("")),
		({ element, lastValue, next }) => next(binary("+", lastValue, element)),
	);
}

function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({ values: [value] });
}

function block(statements: readonly GoAST.Statement[]) {
	return GoAST.createBlockStatement({ statements });
}

function when(
	condition: GoAST.Expression,
	statements: readonly GoAST.Statement[],
	elseBranch?: GoAST.BlockStatement | GoAST.IfStatement,
) {
	return GoAST.createIfStatement({
		condition,
		body: block(statements),
		elseBranch,
	});
}

function assign(target: GoAST.AssignmentTarget, value: GoAST.Expression) {
	return GoAST.createAssignmentStatement({
		targets: DCommon.cast([target]),
		values: DCommon.cast([value]),
	});
}

function declare(name: GoAST.Identifier, value: GoAST.Expression) {
	return GoAST.createShortVariableDeclarationStatement({
		identifier: name,
		initializer: value,
	});
}

function argument(name: GoAST.Identifier, type: GoAST.FunctionArgumentType) {
	return GoAST.createFunctionArgument({
		identifier: name,
		type,
	});
}

function func(
	name: GoAST.Identifier,
	functionArguments: readonly GoAST.FunctionArgument[],
	returnType: GoAST.FunctionReturnType,
	statements: readonly GoAST.Statement[],
) {
	return GoAST.createFunctionDeclaration({
		identifier: name,
		generic: [],
		arguments: functionArguments,
		returnTypes: [returnType],
		body: block(statements),
	});
}

const strings = identifier("strings");
const strconv = identifier("strconv");
const math = identifier("math");
const reflect = identifier("reflect");
const stringSliceType = GoAST.createSliceType({ elementType: types.string });

/**
 * `func commonInspectNumber(value float64) string`: number as written by
 * JavaScript (`-0`, `NaN`, `Infinity`, exponent from `1e21` and below `1e-6`).
 */
function createNumberFunction() {
	const value = identifier("value");
	const absolute = identifier("absolute");
	const exponent = identifier("exponent");
	const formatFloat = (format: string) => call(select(strconv, "FormatFloat"), [
		value,
		GoAST.createRuneLiteral({ value: format }),
		GoAST.createUnaryExpression({
			operator: "-",
			operand: integer(1n),
		}),
		integer(64n),
	]);

	return func(numberIdentifier, [argument(value, types.float64)], types.string, [
		when(call(select(math, "IsNaN"), [value]), [returnValue(text("NaN"))]),
		when(call(select(math, "IsInf"), [value, integer(1n)]), [returnValue(text("Infinity"))]),
		when(
			call(select(math, "IsInf"), [
				value,
				GoAST.createUnaryExpression({
					operator: "-",
					operand: integer(1n),
				}),
			]),
			[returnValue(text("-Infinity"))],
		),
		when(binary("==", value, integer(0n)), [
			when(call(select(math, "Signbit"), [value]), [returnValue(text("-0"))]),
			returnValue(text("0")),
		]),
		declare(absolute, call(select(math, "Abs"), [value])),
		when(
			binary(
				"||",
				binary(">=", absolute, GoAST.createFloatLiteral({ value: "1e21" })),
				binary("<", absolute, GoAST.createFloatLiteral({ value: "1e-6" })),
			),
			[
				declare(exponent, formatFloat("e")),
				returnValue(
					call(select(strings, "Replace"), [
						call(select(strings, "Replace"), [exponent, text("e-0"), text("e-"), integer(1n)]),
						text("e+0"),
						text("e+"),
						integer(1n),
					]),
				),
			],
		),
		returnValue(formatFloat("f")),
	]);
}

/**
 * `func commonInspectQuote(value string) string`: quoted string like Node,
 * single quotes by default, double quotes or backticks when the text
 * contains single quotes.
 */
function createQuoteFunction() {
	const value = identifier("value");
	const quote = identifier("quote");
	const contains = (search: string) => call(select(strings, "Contains"), [value, text(search)]);
	const not = (operand: GoAST.Expression) => GoAST.createUnaryExpression({
		operator: "!",
		operand,
	});

	return func(quoteIdentifier, [argument(value, types.string)], types.string, [
		declare(quote, text("'")),
		when(contains("'"), [
			when(
				not(contains("\"")),
				[assign(quote, text("\""))],
				when(
					binary("&&", not(contains("`")), not(contains("${"))),
					[assign(quote, text("`"))],
				),
			),
		]),
		returnValue(
			concat(
				quote,
				call(
					select(
						call(select(strings, "NewReplacer"), [
							text("\\"),
							text("\\\\"),
							text("\n"),
							text("\\n"),
							text("\t"),
							text("\\t"),
							text("\r"),
							text("\\r"),
							text("\b"),
							text("\\b"),
							text("\f"),
							text("\\f"),
							text("\v"),
							text("\\x0B"),
							quote,
							concat(text("\\"), quote),
						]),
						"Replace",
					),
					[value],
				),
				quote,
			),
		),
	]);
}

/**
 * `func commonInspectKey(key string) string`: an identifier key is written
 * as is, any other key is quoted.
 */
function createKeyFunction() {
	const key = identifier("key");

	return func(keyIdentifier, [argument(key, types.string)], types.string, [
		when(
			call(
				select(
					call(select(identifier("regexp"), "MustCompile"), [text("^[a-zA-Z_][a-zA-Z_0-9]*$")]),
					"MatchString",
				),
				[key],
			),
			[returnValue(key)],
		),
		returnValue(call(quoteIdentifier, [key])),
	]);
}

/**
 * `func commonInspectLength(value string) int`: length in UTF-16 code units,
 * the unit used by JavaScript strings.
 */
function createLengthFunction() {
	const value = identifier("value");

	return func(lengthIdentifier, [argument(value, types.string)], types.int, [
		returnValue(
			call(identifier("len"), [
				call(select(identifier("utf16"), "Encode"), [
					GoAST.createConversionExpression({
						typeReference: GoAST.createSliceType({ elementType: types.rune }),
						operand: value,
					}),
				]),
			]),
		),
	]);
}

/**
 * `func commonInspectReduce(...) string`: Node keeps the entries on one line
 * when the three innermost levels fit in 80 characters, otherwise it writes
 * one entry per line with two more spaces of indentation.
 */
function createReduceFunction() {
	const entries = identifier("entries");
	const open = identifier("open");
	const close = identifier("close");
	const depth = identifier("depth");
	const indentation = identifier("indentation");
	const currentDepth = identifier("currentDepth");
	const total = identifier("total");
	const fits = identifier("fits");
	const entry = identifier("entry");
	const joined = identifier("joined");
	const padding = identifier("padding");
	const entriesLength = call(identifier("len"), [entries]);

	return func(
		reduceIdentifier,
		[
			argument(entries, stringSliceType),
			argument(open, types.string),
			argument(close, types.string),
			argument(depth, types.int),
			argument(indentation, types.int),
			argument(currentDepth, types.int),
		],
		types.string,
		[
			when(binary("==", entriesLength, integer(0n)), [returnValue(concat(open, close))]),
			when(binary("<", binary("-", currentDepth, depth), integer(3n)), [
				declare(
					total,
					concat(
						entriesLength,
						entriesLength,
						indentation,
						call(identifier("len"), [open]),
						integer(10n),
					),
				),
				declare(fits, binary("<=", binary("+", total, entriesLength), integer(80n))),
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: identifier("_"),
						value: entry,
					}),
					expression: entries,
					body: block([assign(total, binary("+", total, call(lengthIdentifier, [entry])))]),
				}),
				declare(joined, call(select(strings, "Join"), [entries, text(", ")])),
				when(
					binary(
						"&&",
						binary("&&", fits, binary("<=", total, integer(80n))),
						GoAST.createUnaryExpression({
							operator: "!",
							operand: call(select(strings, "Contains"), [joined, text("\n")]),
						}),
					),
					[returnValue(concat(open, text(" "), joined, text(" "), close))],
				),
			]),
			declare(
				padding,
				concat(text("\n"), call(select(strings, "Repeat"), [text(" "), indentation])),
			),
			returnValue(
				concat(
					open,
					padding,
					text("  "),
					call(select(strings, "Join"), [entries, concat(text(","), padding, text("  "))]),
					padding,
					close,
				),
			),
		],
	);
}

/**
 * `func commonInspect(...) string`: recursive formatting of a value like
 * Node `util.inspect` with the defaults of `console.info` (depth 2).
 * Struct keys come from the `json` tags that carry the DuploJS runtime keys.
 */
function createInspectFunction() {
	const value = identifier("value");
	const depth = identifier("depth");
	const indentation = identifier("indentation");
	const currentDepth = identifier("currentDepth");
	const entries = identifier("entries");
	const index = identifier("index");
	const field = identifier("field");
	const key = identifier("key");
	const kind = (name: string) => select(reflect, name);
	const typeOf = (name: string) => call(select(reflect, "TypeOf"), [
		GoAST.createStructLiteral({
			typeReference: identifier(name),
			elements: [],
		}),
	]);
	const valueType = call(select(value, "Type"));
	const recurse = (child: GoAST.Expression) => call(inspectIdentifier, [
		child,
		binary("+", depth, integer(1n)),
		binary("+", indentation, integer(2n)),
		currentDepth,
	]);
	const collect = (count: GoAST.Expression) => declare(
		entries,
		GoAST.createCallExpression({
			callee: identifier("make"),
			typeArgument: stringSliceType,
			arguments: [integer(0n), count],
		}),
	);
	const append = (entry: GoAST.Expression) => assign(
		entries,
		call(identifier("append"), [entries, entry]),
	);
	const reduce = (open: string, close: string) => returnValue(
		call(reduceIdentifier, [
			entries,
			text(open),
			text(close),
			depth,
			indentation,
			GoAST.createDereferenceExpression({ operand: currentDepth }),
		]),
	);
	const enter = assign(GoAST.createDereferenceExpression({ operand: currentDepth }), depth);
	const switchCase = (
		expressions: GoAST.ExpressionSwitchCase["expressions"],
		statements: readonly GoAST.Statement[],
	) => GoAST.createExpressionSwitchCase({
		expressions,
		statements,
	});
	const returnString = returnValue(call(quoteIdentifier, [call(select(value, "String"))]));
	const returnBool = returnValue(call(select(strconv, "FormatBool"), [call(select(value, "Bool"))]));
	const returnFloat = returnValue(call(numberIdentifier, [call(select(value, "Float"))]));
	const returnInt = returnValue(call(select(strconv, "FormatInt"), [call(select(value, "Int")), integer(10n)]));

	return func(
		inspectIdentifier,
		[
			argument(value, GoAST.createPackageTypeReference({
				packageName: reflect,
				identifier: identifier("Value"),
			})),
			argument(depth, types.int),
			argument(indentation, types.int),
			argument(currentDepth, GoAST.createPointerType({ typeReference: types.int })),
		],
		types.string,
		[
			GoAST.createExpressionSwitchStatementWithoutDefault({
				expression: call(select(value, "Kind")),
				cases: [
					switchCase(DCommon.cast([kind("Invalid")]), [returnValue(text("undefined"))]),
					switchCase(DCommon.cast([kind("Interface"), kind("Pointer")]), [
						when(call(select(value, "IsNil")), [returnValue(text("undefined"))]),
						returnValue(call(inspectIdentifier, [
							call(select(value, "Elem")),
							depth,
							indentation,
							currentDepth,
						])),
					]),
					switchCase(DCommon.cast([kind("String")]), [returnString]),
					switchCase(DCommon.cast([kind("Bool")]), [returnBool]),
					switchCase(DCommon.cast([kind("Float32"), kind("Float64")]), [returnFloat]),
					switchCase(DCommon.cast([kind("Int"), kind("Int8"), kind("Int16"), kind("Int32"), kind("Int64")]), [returnInt]),
					switchCase(DCommon.cast([kind("Slice"), kind("Array")]), [
						when(binary(">", depth, integer(2n)), [returnValue(text("[Array]"))]),
						enter,
						collect(call(select(value, "Len"))),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({ key: index }),
							expression: call(select(value, "Len")),
							body: block([append(recurse(call(select(value, "Index"), [index])))]),
						}),
						reduce("[", "]"),
					]),
					switchCase(DCommon.cast([kind("Struct")]), [
						when(binary("==", valueType, typeOf("JSNull")), [returnValue(text("null"))]),
						when(binary("==", valueType, typeOf("JSUndefined")), [returnValue(text("undefined"))]),
						when(binary(">", depth, integer(2n)), [returnValue(text("[Object]"))]),
						enter,
						collect(call(select(value, "NumField"))),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({ key: index }),
							expression: call(select(value, "NumField")),
							body: block([
								declare(field, call(select(valueType, "Field"), [index])),
								declare(
									key,
									GoAST.createIndexExpression({
										target: call(select(strings, "Split"), [
											call(select(select(field, "Tag"), "Get"), [text("json")]),
											text(","),
										]),
										index: integer(0n),
									}),
								),
								when(binary("==", key, text("")), [assign(key, select(field, "Name"))]),
								append(
									concat(
										call(keyIdentifier, [key]),
										text(": "),
										recurse(call(select(value, "Field"), [index])),
									),
								),
							]),
						}),
						reduce("{", "}"),
					]),
				],
			}),
			returnValue(call(select(value, "String"))),
		],
	);
}

/**
 * Mirrors `DCommon.print` with the default `console.info` output: a string is
 * written as is, any other value is formatted like Node `util.inspect`.
 * The value is returned unchanged. Requires the `reflect` import dependency.
 */
export const commonPrintDependency = DCommon.memo(() => {
	const input = identifier("input");
	const value = identifier("value");
	const currentDepth = identifier("currentDepth");
	const write = (content: GoAST.Expression) => call(
		select(select(identifier("os"), "Stdout"), "WriteString"),
		[concat(content, text("\n"))],
	);

	return createSharedDependency({
		imports: DArray.map(
			["math", "os", "regexp", "strconv", "strings", "unicode/utf16"],
			(path) => GoAST.createImportDeclaration({ path }),
		),
		init: [],
		declarations: [
			createNumberFunction(),
			createQuoteFunction(),
			createKeyFunction(),
			createLengthFunction(),
			createReduceFunction(),
			createInspectFunction(),
			GoAST.createFunctionDeclaration({
				identifier: printFunctionIdentifier,
				generic: [],
				arguments: [argument(input, types.any)],
				returnTypes: [types.any],
				body: block([
					declare(value, call(select(reflect, "ValueOf"), [input])),
					when(
						binary("==", call(select(value, "Kind")), select(reflect, "String")),
						[write(call(select(value, "String")))],
						block([
							declare(currentDepth, integer(0n)),
							write(
								call(inspectIdentifier, [
									value,
									integer(0n),
									integer(0n),
									GoAST.createAddressExpression({ operand: currentDepth }),
								]),
							),
						]),
					),
					returnValue(input),
				]),
			}),
		],
	});
});
