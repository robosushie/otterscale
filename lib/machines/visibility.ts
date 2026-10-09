export function machineVisibleToViewer(
  machineWorkspaceIds: string[],
  viewer: { isPlatformAdmin: boolean; workspaceIds: string[] },
): boolean {
  if (viewer.isPlatformAdmin) return true;
  if (machineWorkspaceIds.length === 0) return false;
  const allowed = new Set(viewer.workspaceIds);
  return machineWorkspaceIds.some((id) => allowed.has(id));
}
