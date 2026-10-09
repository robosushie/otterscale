"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SidePanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-off-black/30"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[24rem] flex-col border-l border-ash bg-paper"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ash p-5">
          <h2 id={titleId} className="text-[24px] leading-tight">
            {title}
          </h2>
          <Button ref={closeRef} type="button" variant="ghost" icon aria-label="Close" className="shrink-0" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function AddPanel({
  buttonLabel,
  title,
  children,
  buttonVariant = "primary",
}: {
  buttonLabel: string;
  title: string;
  children: ReactNode;
  buttonVariant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button type="button" variant={buttonVariant} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <SidePanel open={open} title={title} onClose={close}>
        {children}
      </SidePanel>
    </>
  );
}
