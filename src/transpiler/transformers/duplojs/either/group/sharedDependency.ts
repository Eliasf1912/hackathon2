import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherRightInterfaceIdentifier } from "../isRight/sharedDependency";
import { successFunctionIdentifier } from "../success/sharedDependency";

export const groupFunctionIdentifier = GoAST.createIdentifier("EitherGroup");

export const eitherGroupDependency = DCommon.memo(() => {
	const sliceAnyType = GoAST.createSliceType({
		elementType: GoAST.builtinTypeReferences.any,
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: groupFunctionIdentifier,
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
										values: [
											GoAST.createCallExpression({
												callee: successFunctionIdentifier,
												arguments: [
													GoAST.createSliceLiteral({
														typeReference: sliceAnyType,
														elements: [],
													}),
												],
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
							identifier: GoAST.createIdentifier("slice"),
							initializer: GoAST.createSliceLiteral({
								typeReference: sliceAnyType,
								elements: [],
							}),
						}),
						GoAST.createTypeSwitchStatementWithDefault({
							identifier: GoAST.createIdentifier("s"),
							expression: GoAST.createIdentifier("input"),
							casesBeforeDefault: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([sliceAnyType]),
									statements: [
										GoAST.createAssignmentStatement({
											targets: DCommon.cast([GoAST.createIdentifier("slice")]),
											values: DCommon.cast([GoAST.createIdentifier("s")]),
										}),
									],
								}),
							],
							defaultCase: GoAST.createDefaultCase({
								statements: [
									GoAST.createReturnStatement({
										values: [
											GoAST.createCallExpression({
												callee: successFunctionIdentifier,
												arguments: [GoAST.createIdentifier("input")],
											}),
										],
									}),
								],
							}),
							casesAfterDefault: [],
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("values"),
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								typeArgument: sliceAnyType,
								arguments: [
									GoAST.createIntegerLiteral({ value: 0n }),
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("len"),
										arguments: [GoAST.createIdentifier("slice")],
									}),
								],
							}),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: GoAST.createIdentifier("_"),
								value: GoAST.createIdentifier("item"),
							}),
							expression: GoAST.createIdentifier("slice"),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: GoAST.createIdentifier("elem"),
										initializer: GoAST.createIdentifier("item"),
									}),
									GoAST.createTypeSwitchStatementWithoutDefault({
										identifier: GoAST.createIdentifier("f"),
										expression: GoAST.createIdentifier("elem"),
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
														targets: DCommon.cast([GoAST.createIdentifier("elem")]),
														values: DCommon.cast([
															GoAST.createCallExpression({
																callee: GoAST.createIdentifier("f"),
																arguments: [],
															}),
														]),
													}),
												],
											}),
											GoAST.createTypeSwitchCase({
												types: DCommon.cast([
													GoAST.createFunctionType({
														arguments: [],
														returnTypes: [GoAST.builtinTypeReferences.any],
													}),
												]),
												statements: [
													GoAST.createAssignmentStatement({
														targets: DCommon.cast([GoAST.createIdentifier("elem")]),
														values: DCommon.cast([
															GoAST.createCallExpression({
																callee: GoAST.createIdentifier("f"),
																arguments: [],
															}),
														]),
													}),
												],
											}),
										],
									}),
									GoAST.createTypeSwitchStatementWithDefault({
										identifier: GoAST.createIdentifier("v"),
										expression: GoAST.createIdentifier("elem"),
										casesBeforeDefault: [
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
																	values: [GoAST.createIdentifier("elem")],
																}),
															],
														}),
													}),
													GoAST.createAssignmentStatement({
														targets: DCommon.cast([GoAST.createIdentifier("values")]),
														values: DCommon.cast([
															GoAST.createCallExpression({
																callee: GoAST.createIdentifier("append"),
																arguments: [
																	GoAST.createIdentifier("values"),
																	GoAST.createCallExpression({
																		callee: GoAST.createSelectorExpression({
																			target: GoAST.createIdentifier("v"),
																			identifier: GoAST.createIdentifier("GetEitherValue"),
																		}),
																		arguments: [],
																	}),
																],
															}),
														]),
													}),
												],
											}),
										],
										defaultCase: GoAST.createDefaultCase({
											statements: [
												GoAST.createAssignmentStatement({
													targets: DCommon.cast([GoAST.createIdentifier("values")]),
													values: DCommon.cast([
														GoAST.createCallExpression({
															callee: GoAST.createIdentifier("append"),
															arguments: [
																GoAST.createIdentifier("values"),
																GoAST.createIdentifier("elem"),
															],
														}),
													]),
												}),
											],
										}),
										casesAfterDefault: [],
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [
								GoAST.createCallExpression({
									callee: successFunctionIdentifier,
									arguments: [GoAST.createIdentifier("values")],
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});

