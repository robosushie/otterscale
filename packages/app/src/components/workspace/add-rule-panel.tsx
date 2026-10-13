import type { FormEvent } from "react";
import { api } from "@/api/client";
import { AddPanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function AddRulePanel({
  groups,
  tags,
}: {
  groups: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}) {
  return (
    <AddPanel buttonLabel="Add rule" title="Add rule">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void api.createRule({
            groupId: String(form.get("groupId")),
            tagId: String(form.get("tagId") ?? ""),
            ports: String(form.get("ports") ?? "*"),
          });
        }}
      >
        <Field label="Workspace">
          <Select name="groupId" required>
            <option value="">Select workspace</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tag" hint="Optional. Grants the workspace access to machines with this tag.">
          <Select name="tagId">
            <option value="">None</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ports">
          <Input name="ports" defaultValue="*" />
        </Field>
        <Button type="submit">Add rule</Button>
      </form>
    </AddPanel>
  );
}
