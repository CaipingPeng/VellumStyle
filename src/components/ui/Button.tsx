import type {ButtonHTMLAttributes, ReactNode} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "toolbar";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const base =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[13px] font-medium leading-none " +
  "cursor-pointer transition-colors duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white border-0 hover:bg-accent-hover",
  secondary:
    "border border-transparent bg-bg-secondary text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] hover:bg-bg-tertiary hover:text-text",
  ghost: "bg-transparent text-text border-0 hover:bg-bg-tertiary",
  toolbar: "bg-transparent text-text-secondary border-0 hover:bg-bg-tertiary hover:text-text",
};

export default function Button({variant = "secondary", className = "", children, ...rest}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
