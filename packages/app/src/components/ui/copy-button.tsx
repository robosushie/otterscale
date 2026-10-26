import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
  icon = false,
}: {
  text: string;
  label?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (icon) {
    return (
      <button
        type="button"
        aria-label={copied ? "Copied" : label}
        title={copied ? "Copied" : label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-parchment text-off-black transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--color-parchment)_70%,var(--color-ash))]"
        onClick={() => void onCopy()}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    );
  }

  return (
    <Button type="button" variant="ghost" className="!min-h-0 !normal-case tracking-normal" onClick={() => void onCopy()}>
      {copied ? "Copied" : label}
    </Button>
  );
}
