export type * from "@/lib/form-db/types";
export {
  analyzeTableToFormFields,
  missingFormFields,
  widgetToInputKind,
} from "@/lib/form-db/analyzer";
export {
  forwardLookups,
  findReverseForeignKeys,
  lookupFromForeignKey,
  pickLabelColumn,
  pickValueColumn,
  resolveCellLabel,
  filterRowsBySearch,
  relatedChildRows,
} from "@/lib/form-db/relationships";
export {
  createStubAuthAdapter,
  getAuthAdapter,
  setAuthAdapter,
  stubHashPassword,
  stubVerifyPassword,
  stubRegisterUser,
} from "@/lib/form-db/auth-adapter";
export {
  usersTableRecipe,
  catalogTablesRecipe,
  applyUsersRecipe,
  applyCatalogRecipe,
} from "@/lib/form-db/recipes";
export {
  buildFormPageFromTable,
  buildFormFieldNodes,
  buildHintLines,
  appendMissingFields,
  collectBoundColumnIds,
} from "@/lib/form-db/build-form-page";
export {
  planAdminPack,
  buildAdminPack,
  applyAdminPackPages,
  findAuthTable,
  defaultListColumns,
  listColumnLabel,
} from "@/lib/form-db/admin-pack";
export {
  findAncestorForm,
  collectFormFields,
  prepareSubmitValues,
  tableByForm,
} from "@/lib/form-db/submit";
export { generateWbDbRuntimeSource, adminProtectedPaths } from "@/lib/form-db/export-handlers";
export { handlePreviewDbSubmit } from "@/lib/form-db/preview-bridge";
export type { DbSubmitMessage } from "@/lib/form-db/preview-bridge";
export { ensureTestDbOpen } from "@/lib/form-db/ensure-test-db";
export { handleDbQuery } from "@/lib/form-db/db-query-host";
export type { DbQueryRequest, DbQueryResult } from "@/lib/form-db/db-query-host";
export { rowsPageToMaps, listColumnDefs, lookupTableIds } from "@/lib/form-db/row-utils";
