const EDGE_TAG = "tag:edge";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isEdgeMachine(machine: {
  name?: string | null;
  hostname?: string | null;
  tags?: string[] | null;
}): boolean {
  const name = normalize(machine.name);
  const hostname = normalize(machine.hostname);
  if (name === "edge" || hostname === "edge") return true;
  return (machine.tags ?? []).some((tag) => {
    const value = normalize(tag);
    return value === EDGE_TAG || value === "edge";
  });
}
