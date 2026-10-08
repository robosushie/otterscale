import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "min-h-10 rounded-[100px] bg-lake-blue px-6 py-2.5 text-parchment hover:bg-[color-mix(in_srgb,var(--color-lake-blue)_88%,black)] disabled:bg-periwinkle-mist disabled:text-smoke",
  secondary:
    "min-h-10 rounded-[100px] bg-off-black px-6 py-2.5 text-parchment hover:bg-[color-mix(in_srgb,var(--color-off-black)_80%,white)] disabled:bg-periwinkle-mist disabled:text-smoke",
  ghost:
    "min-h-10 rounded-[100px] border border-off-black bg-transparent px-6 py-2.5 text-off-black hover:bg-[color-mix(in_srgb,var(--color-parchment)_70%,var(--color-ash))]",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 text-[14px] font-medium uppercase tracking-[-0.025em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-100 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
