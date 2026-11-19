import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherRightInterfaceIdentifier } from "../isRight/sharedDependency";

export const matchInformationFunctionIdentifier = GoAST.createIdentifier("EitherMatchInformation");
export const eitherInformationInterfaceIdentifier = GoAST.createIdentifier("EitherInformation");

export const eitherMatchInformationDependency = DCommon.memo(() => {
	const mapStringAnyType = GoAST.createMapType({
		keyType: GoAST.builtinTypeReferences.string,
		valueType: GoAST.builtinTypeReferences.any,
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: eitherInformationInterfaceIdentifier,
				type: GoAST.createInterfaceType({
					elements: [
						GoAST.createInterfaceMethod({
							identifier: GoAST.createIdentifier("GetEitherInformation"),
							arguments: [],
							returnTypes: [GoAST.builtinTypeReferences.string],
						}),
					],
				}),
			}),
			GoAST.createFunctionDeclaration({
				identifier: matchInformationFunctionIdentifier,
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
								operator: "<",
								left: GoAST.createCallExpression({
									callee: GoAST.createIdentifier("len"),
									arguments: [GoAST.createIdentifier("args")],
								}),
								right: GoAST.createIntegerLiteral({ value: 2n }),
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
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("matcher"),
							initializer: GoAST.createIndexExpression({
								target: GoAST.createIdentifier("args"),
								index: GoAST.createIntegerLiteral({ value: 1n }),
							}),
						}),
						GoAST.createVariableDeclarationInitialized({
							identifier: GoAST.createIdentifier("info"),
							typeReference: GoAST.builtinTypeReferences.string,
							initializer: GoAST.createStringLiteral({ value: "" }),
						}),
						GoAST.createVariableDeclarationInitialized({
							identifier: GoAST.createIdentifier("value"),
							typeReference: GoAST.builtinTypeReferences.any,
							initializer: GoAST.createNilLiteral({}),
						}),
						GoAST.createTypeSwitchStatementWithoutDefault({
							identifier: GoAST.createIdentifier("v"),
							expression: GoAST.createIdentifier("input"),
							cases: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([eitherInformationInterfaceIdentifier]),
									statements: [
										GoAST.createAssignmentStatement({
											targets: DCommon.cast([GoAST.createIdentifier("info")]),
											values: DCommon.cast([
												GoAST.createCallExpression({
													callee: GoAST.createSelectorExpression({
														target: GoAST.createIdentifier("v"),
														identifier: GoAST.createIdentifier("GetEitherInformation"),
													}),
													arguments: [],
												}),
											]),
										}),
									],
								}),
							],
						}),
						GoAST.createTypeSwitchStatementWithoutDefault({
							identifier: GoAST.createIdentifier("v"),
							expression: GoAST.createIdentifier("input"),
							cases: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([eitherRightInterfaceIdentifier]),
									statements: [
										GoAST.createAssignmentStatement({
											targets: DCommon.cast([GoAST.createIdentifier("value")]),
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
							],
						}),
						GoAST.createTypeSwitchStatementWithoutDefault({
							identifier: GoAST.createIdentifier("m"),
							expression: GoAST.createIdentifier("matcher"),
							cases: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([mapStringAnyType]),
									statements: [
										GoAST.createShortVariableDeclarationStatement({
											identifier: GoAST.createIdentifier("fn"),
											initializer: GoAST.createIndexExpression({
												target: GoAST.createIdentifier("m"),
												index: GoAST.createIdentifier("info"),
											}),
										}),
										GoAST.createTypeSwitchStatementWithoutDefault({
											identifier: GoAST.createIdentifier("f"),
											expression: GoAST.createIdentifier("fn"),
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
														GoAST.createReturnStatement({
															values: [
																GoAST.createCallExpression({
																	callee: GoAST.createIdentifier("f"),
																	arguments: [GoAST.createIdentifier("value")],
																}),
															],
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
														GoAST.createReturnStatement({
															values: [
																GoAST.createCallExpression({
																	callee: GoAST.createIdentifier("f"),
																	arguments: [GoAST.createIdentifier("value")],
																}),
															],
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
														GoAST.createReturnStatement({
															values: [
																GoAST.createCallExpression({
																	callee: GoAST.createIdentifier("f"),
																	arguments: [],
																}),
															],
														}),
													],
												}),
											],
										}),
									],
								}),
							],
						}),
						GoAST.createReturnStatement({
							values: [GoAST.createNilLiteral({})],
						}),
					],
				}),
			}),
		],
	});
});
