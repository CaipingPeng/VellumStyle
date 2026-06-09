import type {ButtonHTMLAttributes, ReactNode} from "react";

type Variant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-3 text-[13px] font-medium " +
  "cursor-pointer transition-colors duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white border-0 hover:bg-accent-hover",
  secondary: "bg-bg text-text border border-border hover:bg-bg-tertiary",
  ghost: "bg-transparent text-text border-0 hover:bg-bg-tertiary",
};

export default function Button({variant = "secondary", className = "", children, ...rest}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
