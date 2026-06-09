import type {ButtonHTMLAttributes, ReactNode} from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm border-0 " +
  "cursor-pointer transition-colors duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "active:scale-95 disabled:cursor-default disabled:opacity-50";

export default function IconButton({active = false, className = "", children, ...rest}: Props) {
  const tone = active ? "bg-accent-subtle text-accent" : "bg-transparent text-text hover:bg-bg-tertiary";
  return (
    <button type="button" className={`${base} ${tone} ${className}`} {...rest}>
      {children}
    </button>
  );
}
