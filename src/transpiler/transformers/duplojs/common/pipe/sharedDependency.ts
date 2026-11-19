import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const pipeFunctionIdentifier = GoAST.createIdentifier("CommonPipe");

export const commonPipeDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createFunctionDeclaration({
			identifier: pipeFunctionIdentifier,
			generic: [],
			arguments: [],
			variadicArgument: GoAST.createFunctionArgument({
				identifier: GoAST.createIdentifier("args"),
				type: GoAST.builtinTypeReferences.any,
			}),
			returnTypes: [GoAST.builtinTypeReferences.any],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createIfStatement({
						condition: GoAST.createBinaryExpression({
							operator: "==",
							left: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("len"),
								arguments: [GoAST.createIdentifier("args")],
							}),
							right: GoAST.createIntegerLiteral({ value: 0n }),
						}),
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createReturnStatement({
									values: [GoAST.createNilLiteral({})],
								}),
							],
						}),
					}),
					GoAST.createShortVariableDeclarationStatement({
						identifier: GoAST.createIdentifier("acc"),
						initializer: GoAST.createIndexExpression({
							target: GoAST.createIdentifier("args"),
							index: GoAST.createIntegerLiteral({ value: 0n }),
						}),
					}),
					GoAST.createRangeStatement({
						binding: GoAST.createRangeDeclaration({
							key: GoAST.createIdentifier("_"),
							value: GoAST.createIdentifier("p"),
						}),
						expression: GoAST.createSliceExpression({
							target: GoAST.createIdentifier("args"),
							low: GoAST.createIntegerLiteral({ value: 1n }),
						}),
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createTypeSwitchStatementWithoutDefault({
									identifier: GoAST.createIdentifier("fn"),
									expression: GoAST.createIdentifier("p"),
									cases: [
										GoAST.createTypeSwitchCase({
											types: DCommon.cast([
												GoAST.createFunctionType({
													arguments: [],
													variadicArgument: GoAST.createFunctionArgument({
														identifier: GoAST.createIdentifier("a"),
														type: GoAST.builtinTypeReferences.any,
													}),
													returnTypes: [GoAST.builtinTypeReferences.any],
												}),
											]),
											statements: [
												GoAST.createAssignmentStatement({
													targets: DCommon.cast([GoAST.createIdentifier("acc")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createIdentifier("fn"),
															arguments: [GoAST.createIdentifier("acc")],
														}),
													]),
												}),
											],
										}),
										GoAST.createTypeSwitchCase({
											types: DCommon.cast([
												GoAST.createFunctionType({
													arguments: [
														GoAST.createFunctionArgument({
															identifier: GoAST.createIdentifier("a"),
															type: GoAST.builtinTypeReferences.any,
														}),
													],
													returnTypes: [GoAST.builtinTypeReferences.any],
												}),
											]),
											statements: [
												GoAST.createAssignmentStatement({
													targets: DCommon.cast([GoAST.createIdentifier("acc")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createIdentifier("fn"),
															arguments: [GoAST.createIdentifier("acc")],
														}),
													]),
												}),
											],
										}),
									],
								}),
							],
						}),
					}),
					GoAST.createReturnStatement({
						values: [GoAST.createIdentifier("acc")],
					}),
				],
			}),
		}),
	],
}));

