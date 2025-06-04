// DISABLED: Apply patch parsing disabled for log analysis mode
// Original apply patch functionality has been removed for log analysis mode

// Placeholder exports to prevent import errors
export type ApplyPatchCreateFileOp = Record<string, unknown>;
export type ApplyPatchDeleteFileOp = Record<string, unknown>;
export type ApplyPatchUpdateFileOp = Record<string, unknown>;
export type ApplyPatchOp = Record<string, unknown>;

export const PATCH_PREFIX = "*** Begin Patch\n";
export const PATCH_SUFFIX = "\n*** End Patch";
export const ADD_FILE_PREFIX = "*** Add File: ";
export const DELETE_FILE_PREFIX = "*** Delete File: ";
export const UPDATE_FILE_PREFIX = "*** Update File: ";
export const MOVE_FILE_TO_PREFIX = "*** Move to: ";
export const END_OF_FILE_PREFIX = "*** End of File";
export const HUNK_ADD_LINE_PREFIX = "+";

export function parseApplyPatch(_patch: string): Array<ApplyPatchOp> | null {
  // Function disabled for log analysis mode
  return null;
}
