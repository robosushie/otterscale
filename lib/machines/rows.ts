export type MachineRow = {
  machineId: string;
  name: string;
  addresses: string;
  lastSeen: string;
  online: boolean;
  workspaceNames: string[];
  tagNames: string[];
  selectedWorkspaceIds: string[];
  selectedTagIds: string[];
  addedBy: string;
};
