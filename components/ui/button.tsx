import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "min-h-9 rounded-[6px] bg-lake-blue px-4 py-2 text-parchment hover:bg-[color-mix(in_srgb,var(--color-lake-blue)_88%,black)] disabled:bg-periwinkle-mist disabled:text-smoke",
  secondary:
    "min-h-9 rounded-[6px] bg-off-black px-4 py-2 text-parchment hover:bg-[color-mix(in_srgb,var(--color-off-black)_80%,white)] disabled:bg-periwinkle-mist disabled:text-smoke",
  ghost:
    "min-h-9 rounded-[6px] border border-off-black bg-transparent px-4 py-2 text-off-black hover:bg-[color-mix(in_srgb,var(--color-parchment)_70%,var(--color-ash))] disabled:text-smoke disabled:border-ash",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    icon?: boolean;
    children: ReactNode;
  }
>(function Button({ variant = "primary", icon = false, className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex items-center justify-center gap-2 text-[14px] leading-none font-medium uppercase tracking-[-0.025em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-100 ${variants[variant]} ${icon ? "!h-9 !w-9 !min-h-9 !px-0 !py-0" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
