export type DependencyValidationResult =
  | { legal: true }
  | { legal: false; code: 'SELF_DEPENDENCY' | 'CROSS_PROJECT_DEPENDENCY'; reason: string };

/** Pure validation for PROJECT_SPEC.md 1.4: a task cannot block itself, and a blocker must
 * belong to the same project as the task it blocks. */
export function validateDependency(
  blockerTaskId: string,
  blockedTaskId: string,
  blockerProjectId: string,
  blockedProjectId: string,
): DependencyValidationResult {
  if (blockerTaskId === blockedTaskId) {
    return { legal: false, code: 'SELF_DEPENDENCY', reason: 'A task cannot block itself.' };
  }
  if (blockerProjectId !== blockedProjectId) {
    return {
      legal: false,
      code: 'CROSS_PROJECT_DEPENDENCY',
      reason: 'A blocker task must belong to the same project as the task it blocks.',
    };
  }
  return { legal: true };
}
