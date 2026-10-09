"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { controlClassName } from "@/components/ui/field";

export function CheckMenu({
  name,
  options,
  defaultSelected = [],
  placeholder,
  form,
}: {
  name: string;
  options: { id: string; label: string }[];
  defaultSelected?: string[];
  placeholder: string;
  form?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((option) => option.id === selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${controlClassName.replace("mt-1", "")} mt-0 flex items-center justify-between text-left`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={selected.length === 0 ? "text-smoke" : ""}>{summary}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-smoke transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute z-50 mt-1 max-h-48 w-full min-w-[12rem] overflow-auto rounded-[6px] border border-ash bg-parchment p-2"
        >
          {options.length === 0 ? (
            <p className="px-1 py-1 text-sm text-smoke normal-case">None yet</p>
          ) : (
            options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-2 px-1 py-1 text-sm font-normal normal-case tracking-normal"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.id}
                  form={form}
                  checked={selected.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                {option.label}
              </label>
            ))
          )}
        </div>
      ) : (
        selected.map((id) => (
          <input key={id} type="hidden" name={name} value={id} form={form} />
        ))
      )}
    </div>
  );
}
