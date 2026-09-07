/** Pure diff between a task's current assignee set and the desired set, used to compute
 * which TaskAssignee rows to create/delete and which ASSIGNED/UNASSIGNED history entries
 * to write. No I/O. */
export function computeAssigneeDiff(
  currentUserIds: string[],
  desiredUserIds: string[],
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentUserIds);
  const desired = new Set(desiredUserIds);
  return {
    toAdd: [...desired].filter((id) => !current.has(id)),
    toRemove: [...current].filter((id) => !desired.has(id)),
  };
}
