import {useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {Minus, Plus, RotateCcw, Type, X} from "lucide-react";
import {panelPositionForRect, type PanelRect} from "./fontSizePanel.ts";
import {
  canStepScale,
  FONT_ROLE_BY_KEY,
  formatScale,
  GLOBAL_MAX,
  GLOBAL_MIN,
  ROLE_MAX,
  ROLE_MIN,
  ROOT_ROLE,
  SCALE_STEP,
  roleScale,
  stepScale,
  type TypographyState,
} from "../../themes/typography.ts";

interface Props {
  /** 当前选中的角色（ROOT_ROLE 表示「全文」，只显示全局控制） */
  roleKey: string;
  /** 锚点元素在视口里的矩形，随预览滚动/重渲染更新 */
  anchorRect: PanelRect;
  typography: TypographyState;
  onRoleScale: (roleKey: string, scale: number) => void;
  onGlobalScale: (scale: number) => void;
  onReset: () => void;
  onClose: () => void;
}

interface ScaleRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (scale: number) => void;
  /** 已经是默认值时不显示「复位」 */
  defaultValue?: number;
}

function ScaleRow({label, value, min, max, onChange, defaultValue = 1}: ScaleRowProps) {
  const down = canStepScale(value, -1, min, max);
  const up = canStepScale(value, 1, min, max);
  const dirty = Math.abs(value - defaultValue) > 1e-6;

  const stepButton = (direction: 1 | -1) => {
    const enabled = direction === 1 ? up : down;
    const Icon = direction === 1 ? Plus : Minus;
    return (
      <button
        type="button"
        className="vs-font-size-step"
        disabled={!enabled}
        aria-label={`${label}${direction === 1 ? "放大" : "缩小"}`}
        onClick={() => onChange(stepScale(value, direction, SCALE_STEP, min, max))}
      >
        <Icon size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="vs-font-size-row">
      <span className="vs-font-size-row-label">{label}</span>
      {stepButton(-1)}
      <span className="vs-font-size-value" aria-live="polite">
        {formatScale(value)}
      </span>
      {stepButton(1)}
      <button
        type="button"
        className="vs-font-size-reset"
        disabled={!dirty}
        aria-label={`${label}恢复默认`}
        onClick={() => onChange(defaultValue)}
      >
        <RotateCcw size={12} strokeWidth={1.9} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * 字号面板：点击预览里的元素后浮在它旁边。
 * 上半部分是「本元素」——只作用于该角色（例：全部二级标题）；
 * 下半部分是「全局」——整篇文章一起缩放。
 */
export default function FontSizePanel({
  roleKey,
  anchorRect,
  typography,
  onRoleScale,
  onGlobalScale,
  onReset,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{left: number; top: number} | null>(null);

  const role = FONT_ROLE_BY_KEY[roleKey];
  const isRoot = roleKey === ROOT_ROLE;
  const current = roleScale(typography, roleKey);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setPosition(
      panelPositionForRect(
        anchorRect,
        {width: rect.width, height: rect.height},
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [anchorRect]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const style = useMemo(
    () => ({
      position: "fixed" as const,
      left: position?.left ?? anchorRect.left,
      top: position?.top ?? anchorRect.top + anchorRect.height + 10,
      visibility: position ? ("visible" as const) : ("hidden" as const),
    }),
    [anchorRect, position],
  );

  const title = isRoot ? "全文排版" : (role?.label ?? "元素");
  const hint = isRoot
    ? "整篇文章一起缩放，主题的比例关系保持不变"
    : `${role?.hint ?? ""} · 作用于全部${role?.label ?? ""}`;

  return createPortal(
    <div
      ref={panelRef}
      className="vs-font-size-panel"
      style={style}
      role="dialog"
      aria-label="字号调整"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="vs-font-size-head">
        <Type size={14} strokeWidth={1.9} className="flex-none text-accent" aria-hidden="true" />
        <span className="vs-font-size-title">{title}</span>
        <button type="button" className="vs-font-size-close" aria-label="关闭字号面板" onClick={onClose}>
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <p className="vs-font-size-hint">{hint}</p>

      {!isRoot && (
        <ScaleRow
          label="本元素"
          value={current}
          min={ROLE_MIN}
          max={ROLE_MAX}
          onChange={(scale) => onRoleScale(roleKey, scale)}
        />
      )}

      <ScaleRow
        label="全局"
        value={typography.global}
        min={GLOBAL_MIN}
        max={GLOBAL_MAX}
        onChange={onGlobalScale}
      />

      <button type="button" className="vs-font-size-reset-all" onClick={onReset}>
        全部恢复默认
      </button>
    </div>,
    document.body,
  );
}
