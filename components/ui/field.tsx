import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const controlClassName =
  "mt-1 h-9 w-full rounded-[100px] border border-ash bg-parchment px-3.5 text-[13px] font-normal tracking-[-0.28px] text-off-black placeholder:text-smoke";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
      {label}
      {children}
      {hint ? <span className="mt-1 text-[12px] font-normal normal-case tracking-[-0.4px] text-smoke">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${controlClassName} ${className}`} {...rest} />;
  },
);

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`${controlClassName} ${className}`} {...rest}>
      {children}
    </select>
  );
}
