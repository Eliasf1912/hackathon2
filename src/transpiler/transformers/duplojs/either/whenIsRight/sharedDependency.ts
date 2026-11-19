import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherRightInterfaceIdentifier } from "../isRight/sharedDependency";

export const whenIsRightFunctionIdentifier = GoAST.createIdentifier("EitherWhenIsRight");

const curryArg0 = GoAST.createIndexExpression({
	target: GoAST.createIdentifier("curryArgs"),
	index: GoAST.createIntegerLiteral({ value: 0n }),
});

const getEitherValueCall = GoAST.createCallExpression({
	callee: GoAST.createSelectorExpression({
		target: GoAST.createIdentifier("v"),
		identifier: GoAST.createIdentifier("GetEitherValue"),
	}),
	arguments: [],
});

export const eitherWhenIsRightDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createFunctionDeclaration({
			identifier: whenIsRightFunctionIdentifier,
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
							right: GoAST.createIntegerLiteral({ value: 1n }),
						}),
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createShortVariableDeclarationStatement({
									identifier: GoAST.createIdentifier("fn"),
									initializer: GoAST.createIndexExpression({
										target: GoAST.createIdentifier("args"),
										index: GoAST.createIntegerLiteral({ value: 0n }),
									}),
								}),
								GoAST.createReturnStatement({
									values: [
										GoAST.createFunctionLiteral({
											arguments: [],
											variadicArgument: GoAST.createFunctionArgument({
												identifier: GoAST.createIdentifier("curryArgs"),
												type: GoAST.builtinTypeReferences.any,
											}),
											returnTypes: [GoAST.builtinTypeReferences.any],
											body: GoAST.createBlockStatement({
												statements: [
													GoAST.createReturnStatement({
														values: [
															GoAST.createCallExpression({
																callee: whenIsRightFunctionIdentifier,
																arguments: [
																	curryArg0,
																	GoAST.createIdentifier("fn"),
																],
															}),
														],
													}),
												],
											}),
										}),
									],
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
					GoAST.createShortVariableDeclarationStatement({
						identifier: GoAST.createIdentifier("fn"),
						initializer: GoAST.createIndexExpression({
							target: GoAST.createIdentifier("args"),
							index: GoAST.createIntegerLiteral({ value: 1n }),
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
										condition: GoAST.createCallExpression({
											callee: GoAST.createSelectorExpression({
												target: GoAST.createIdentifier("v"),
												identifier: GoAST.createIdentifier("IsRight"),
											}),
											arguments: [],
										}),
										body: GoAST.createBlockStatement({
											statements: [
												GoAST.createTypeSwitchStatementWithoutDefault({
													identifier: GoAST.createIdentifier("f"),
													expression: GoAST.createIdentifier("fn"),
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
																GoAST.createReturnStatement({
																	values: [
																		GoAST.createCallExpression({
																			callee: GoAST.createIdentifier("f"),
																			arguments: [getEitherValueCall],
																		}),
																	],
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
																GoAST.createReturnStatement({
																	values: [
																		GoAST.createCallExpression({
																			callee: GoAST.createIdentifier("f"),
																			arguments: [getEitherValueCall],
																		}),
																	],
																}),
															],
														}),
													],
												}),
											],
										}),
									}),
								],
							}),
						],
					}),
					GoAST.createReturnStatement({
						values: [GoAST.createIdentifier("input")],
					}),
				],
			}),
		}),
	],
}));
