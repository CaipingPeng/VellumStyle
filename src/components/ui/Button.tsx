import type {ButtonHTMLAttributes, ReactNode} from "react";
import {AlertCircle, Check, Loader2} from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "toolbar";

/**
 * 按钮四态机：idle → loading → success / error。
 * 状态视觉下沉到组件层，调用方只传 state + 对应文案，不再各自手搓。
 * - loading：禁用 + spinner + 文案
 * - success：成功色 + 对勾 + 文案
 * - error：错误色 + 警告图标 + 抖动 + 文案
 * 默认 idle，不传 state 时与旧版行为完全一致。
 */
export type ButtonState = "idle" | "loading" | "success" | "error";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  state?: ButtonState;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  children: ReactNode;
}

const base =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[13px] font-medium leading-none " +
  "cursor-pointer transition-all duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "active:scale-[0.97] disabled:cursor-default disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white border-0 hover:bg-accent-hover",
  secondary:
    "border border-transparent bg-bg-secondary text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] hover:bg-bg-tertiary hover:text-text",
  ghost: "bg-transparent text-text border-0 hover:bg-bg-tertiary",
  toolbar: "bg-transparent text-text-secondary border-0 hover:bg-bg-tertiary hover:text-text",
};

// 非 idle 态覆盖 variant 的背景/文字色，确保态语义清晰
const stateTone: Record<Exclude<ButtonState, "idle">, string> = {
  loading: "cursor-progress",
  success: "bg-success text-white border-0 hover:bg-success",
  error: "bg-danger text-white border-0 hover:bg-danger",
};

export default function Button({
  variant = "secondary",
  state = "idle",
  loadingText,
  successText,
  errorText,
  className = "",
  disabled,
  children,
  ...rest
}: Props) {
  const tone = state !== "idle" ? stateTone[state] : variants[variant];
  const isDisabled = disabled || state === "loading";

  let content: ReactNode = children;
  if (state === "loading") {
    content = (
      <>
        <Loader2 size={14} className="animate-spin" />
        {loadingText ?? children}
      </>
    );
  } else if (state === "success") {
    content = (
      <>
        <Check size={14} />
        {successText ?? children}
      </>
    );
  } else if (state === "error") {
    content = (
      <>
        <AlertCircle size={14} />
        {errorText ?? children}
      </>
    );
  }

  return (
    <button
      className={`${base} ${tone} ${state === "error" ? "vs-shake" : ""} ${className}`}
      disabled={isDisabled}
      {...rest}
    >
      {content}
    </button>
  );
}
