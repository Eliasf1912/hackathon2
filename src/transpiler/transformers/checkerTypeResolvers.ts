import * as DCommon from "@duplojs/lang/common";
import type { CheckerTypeResolver } from "../resolveGoType";
import { duploJSCheckerTypeResolvers } from "./duplojs";

/**
 * Domain resolvers used by `context.resolveGoType`, tried before the generic
 * translation of the checker types.
 */
export const checkerTypeResolvers = DCommon.memo(
	(): readonly CheckerTypeResolver[] => duploJSCheckerTypeResolvers.value,
);
