import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";

export function TagsPage() {
  const [tags, setTags] = useState<{ id: string; name: string; aclTag: string }[] | null>(null);
  const load = () => {
    void api.tags().then((rows) => setTags(rows.filter((tag) => tag.aclTag !== "tag:edge" && tag.name.toLowerCase() !== "edge"))).catch(() => setTags([]));
  };
  useEffect(load, []);
  if (!tags) return <p className="text-sm text-smoke">Loading…</p>;
  return (
    <div>
      <PageHeader
        title="Tags"
        description="Labels such as prod or uat. They do not isolate peers."
        action={
          <AddPanel buttonLabel="Add tag" title="Add tag">
            <form
              className="flex flex-col gap-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const name = String(new FormData(event.currentTarget).get("name") ?? "");
                void api.createTag(name).then(load);
              }}
            >
              <Field label="Name" hint="Stored as an ACL tag such as tag:prod.">
                <Input name="name" placeholder="prod" required />
              </Field>
              <Button type="submit">Add tag</Button>
            </form>
          </AddPanel>
        }
      />
      <p className="mb-3 text-[12px] text-smoke">{tags.length} {tags.length === 1 ? "tag" : "tags"}</p>
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Name</th>
            <th>ACL tag</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => (
            <tr key={tag.id} className="border-b border-ash">
              <td><div className="cell">{tag.name}</div></td>
              <td><div className="cell font-mono text-xs">{tag.aclTag}</div></td>
            </tr>
          ))}
          {tags.length === 0 ? (
            <tr>
              <td colSpan={2}><div className="cell text-smoke">No tags yet.</div></td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
