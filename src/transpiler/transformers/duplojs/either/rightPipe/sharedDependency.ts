import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherRightInterfaceIdentifier } from "../isRight/sharedDependency";
import { successFunctionIdentifier } from "../success/sharedDependency";

export const rightPipeFunctionIdentifier = GoAST.createIdentifier("EitherRightPipe");

export const eitherRightPipeDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createFunctionDeclaration({
			identifier: rightPipeFunctionIdentifier,
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
						identifier: GoAST.createIdentifier("input"),
						initializer: GoAST.createIndexExpression({
							target: GoAST.createIdentifier("args"),
							index: GoAST.createIntegerLiteral({ value: 0n }),
						}),
					}),
					GoAST.createTypeSwitchStatementWithoutDefault({
						identifier: GoAST.createIdentifier("v"),
						expression: GoAST.createIdentifier("input"),
						cases: [
							GoAST.createTypeSwitchCase({
								types: DCommon.cast([eitherRightInterfaceIdentifier]),
								statements: [
									GoAST.createIfStatement({
										condition: GoAST.createUnaryExpression({
											operator: "!",
											operand: GoAST.createCallExpression({
												callee: GoAST.createSelectorExpression({
													target: GoAST.createIdentifier("v"),
													identifier: GoAST.createIdentifier("IsRight"),
												}),
												arguments: [],
											}),
										}),
										body: GoAST.createBlockStatement({
											statements: [
												GoAST.createReturnStatement({
													values: [GoAST.createIdentifier("input")],
												}),
											],
										}),
									}),
								],
							}),
						],
					}),
					GoAST.createShortVariableDeclarationStatement({
						identifier: GoAST.createIdentifier("acc"),
						initializer: GoAST.createIdentifier("input"),
					}),
					GoAST.createTypeSwitchStatementWithoutDefault({
						identifier: GoAST.createIdentifier("v"),
						expression: GoAST.createIdentifier("acc"),
						cases: [
							GoAST.createTypeSwitchCase({
								types: DCommon.cast([eitherRightInterfaceIdentifier]),
								statements: [
									GoAST.createIfStatement({
										condition: GoAST.createCallExpression({
											callee: GoAST.createSelectorExpression({
												target: GoAST.createIdentifier("v"),
												identifier: GoAST.createIdentifier("IsRight"),
											}),
											arguments: [],
										}),
										body: GoAST.createBlockStatement({
											statements: [
												GoAST.createAssignmentStatement({
													targets: DCommon.cast([GoAST.createIdentifier("acc")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createSelectorExpression({
																target: GoAST.createIdentifier("v"),
																identifier: GoAST.createIdentifier("GetEitherValue"),
															}),
															arguments: [],
														}),
													]),
												}),
											],
										}),
									}),
								],
							}),
						],
					}),
					GoAST.createRangeStatement({
						binding: GoAST.createRangeDeclaration({
							key: GoAST.createIdentifier("_"),
							value: GoAST.createIdentifier("pipe"),
						}),
						expression: GoAST.createSliceExpression({
							target: GoAST.createIdentifier("args"),
							low: GoAST.createIntegerLiteral({ value: 1n }),
						}),
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createShortVariableDeclarationStatement({
									identifier: GoAST.createIdentifier("valToPass"),
									initializer: GoAST.createIdentifier("acc"),
								}),
								GoAST.createTypeSwitchStatementWithoutDefault({
									identifier: GoAST.createIdentifier("v"),
									expression: GoAST.createIdentifier("valToPass"),
									cases: [
										GoAST.createTypeSwitchCase({
											types: DCommon.cast([eitherRightInterfaceIdentifier]),
											statements: [
												GoAST.createIfStatement({
													condition: GoAST.createCallExpression({
														callee: GoAST.createSelectorExpression({
															target: GoAST.createIdentifier("v"),
															identifier: GoAST.createIdentifier("IsRight"),
														}),
														arguments: [],
													}),
													body: GoAST.createBlockStatement({
														statements: [
															GoAST.createAssignmentStatement({
																targets: DCommon.cast([GoAST.createIdentifier("valToPass")]),
																values: DCommon.cast([
																	GoAST.createCallExpression({
																		callee: GoAST.createSelectorExpression({
																			target: GoAST.createIdentifier("v"),
																			identifier: GoAST.createIdentifier("GetEitherValue"),
																		}),
																		arguments: [],
																	}),
																]),
															}),
														],
													}),
												}),
											],
										}),
									],
								}),
								GoAST.createVariableDeclarationInitialized({
									identifier: GoAST.createIdentifier("next"),
									typeReference: GoAST.builtinTypeReferences.any,
									initializer: GoAST.createNilLiteral({}),
								}),
								GoAST.createTypeSwitchStatementWithoutDefault({
									identifier: GoAST.createIdentifier("f"),
									expression: GoAST.createIdentifier("pipe"),
									cases: [
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
													targets: DCommon.cast([GoAST.createIdentifier("next")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createIdentifier("f"),
															arguments: [GoAST.createIdentifier("valToPass")],
														}),
													]),
												}),
											],
										}),
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
													targets: DCommon.cast([GoAST.createIdentifier("next")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createIdentifier("f"),
															arguments: [GoAST.createIdentifier("valToPass")],
														}),
													]),
												}),
											],
										}),
									],
								}),
								GoAST.createAssignmentStatement({
									targets: DCommon.cast([GoAST.createIdentifier("acc")]),
									values: DCommon.cast([GoAST.createIdentifier("next")]),
								}),
								GoAST.createTypeSwitchStatementWithoutDefault({
									identifier: GoAST.createIdentifier("v"),
									expression: GoAST.createIdentifier("acc"),
									cases: [
										GoAST.createTypeSwitchCase({
											types: DCommon.cast([eitherRightInterfaceIdentifier]),
											statements: [
												GoAST.createIfStatement({
													condition: GoAST.createUnaryExpression({
														operator: "!",
														operand: GoAST.createCallExpression({
															callee: GoAST.createSelectorExpression({
																target: GoAST.createIdentifier("v"),
																identifier: GoAST.createIdentifier("IsRight"),
															}),
															arguments: [],
														}),
													}),
													body: GoAST.createBlockStatement({
														statements: [
															GoAST.createReturnStatement({
																values: [GoAST.createIdentifier("acc")],
															}),
														],
													}),
												}),
											],
										}),
									],
								}),
							],
						}),
					}),
					GoAST.createTypeSwitchStatementWithoutDefault({
						identifier: GoAST.createIdentifier("v"),
						expression: GoAST.createIdentifier("acc"),
						cases: [
							GoAST.createTypeSwitchCase({
								types: DCommon.cast([eitherRightInterfaceIdentifier]),
								statements: [
									GoAST.createReturnStatement({
										values: [GoAST.createIdentifier("v")],
									}),
								],
							}),
						],
					}),
					GoAST.createReturnStatement({
						values: [
							GoAST.createCallExpression({
								callee: successFunctionIdentifier,
								arguments: [GoAST.createIdentifier("acc")],
							}),
						],
					}),
				],
			}),
		}),
	],
}));

