import type {StyleItem} from "../../themes/themeModel.ts";

interface CtrlProps {
  item: StyleItem;
  onChange: (value: string) => void;
}

const inputClass =
  "w-full h-7 text-[13px] px-2 border border-border rounded-sm bg-bg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus:border-accent";

export interface NumericValue {
  amount: string;
  unit: string;
}

export function parseNumericValue(value: string | null | undefined): NumericValue | null {
  const match = (value ?? "").trim().match(/^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)?$/);
  if (!match) return null;
  return {amount: match[1], unit: match[2] ?? ""};
}

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

export function colorValueToHex(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return "#" + shortHex[1].split("").map((ch) => ch + ch).join("").toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const rgba = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgba) {
    return `#${toHexByte(Number(rgba[1]))}${toHexByte(Number(rgba[2]))}${toHexByte(Number(rgba[3]))}`;
  }
  return "#000000";
}

// 数值+单位（fontSize/lineHeight/letterSpacing）。文本框，保留原单位写法。
function TextControl({item, onChange}: CtrlProps) {
  const numeric = parseNumericValue(item.value);
  if (numeric) {
    return <NumericControl value={numeric} onChange={onChange} />;
  }
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

function NumericControl({value, onChange}: {value: NumericValue; onChange: (value: string) => void}) {
  return (
    <div className="flex items-center overflow-hidden rounded-sm border border-border bg-bg focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
      <input
        type="number"
        step={value.unit === "em" || value.unit === "rem" ? "0.1" : "1"}
        value={value.amount}
        onChange={(e) => onChange(`${e.target.value}${value.unit}`)}
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] outline-none"
      />
      <span className="flex h-7 min-w-9 items-center justify-center border-l border-border bg-bg-secondary px-2 text-[11px] text-text-muted">
        {value.unit || "数值"}
      </span>
    </div>
  );
}

// rgba 取色器：文本框存原始 rgba/hex 写法。
function ColorControl({item, onChange}: CtrlProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={colorValueToHex(item.value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 flex-none cursor-pointer rounded-sm border border-border bg-bg p-0.5"
        aria-label="选择颜色"
      />
      <input
        type="text"
        value={item.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="rgba(0,0,0,1)"
        className={inputClass}
      />
    </div>
  );
}

function toggleButtonClass(active: boolean): string {
  return [
    "flex-1 h-7 text-xs rounded-sm cursor-pointer transition-colors duration-fast",
    active
      ? "border border-accent bg-accent text-white"
      : "border border-border bg-bg text-text hover:border-accent",
  ].join(" ");
}

function AlignControl({item, onChange}: CtrlProps) {
  const opts = [
    {value: "left", label: "左"},
    {value: "center", label: "中"},
    {value: "right", label: "右"},
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={toggleButtonClass(item.value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function WeightControl({item, onChange}: CtrlProps) {
  return (
    <div className="flex gap-1">
      {[
        {value: "normal", label: "常规"},
        {value: "bold", label: "加粗"},
      ].map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={toggleButtonClass(item.value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CommonControl({item, onChange}: CtrlProps) {
  return (
    <textarea
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full text-xs font-mono p-2 border border-border rounded-sm bg-bg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus:border-accent"
    />
  );
}

// 按 style.id 选控件。作为真正的组件导出，保证 Fast Refresh 正常。
export function StyleControl({item, onChange}: CtrlProps) {
  const id = item.id;
  if (/Color$/i.test(id) || id === "fontColor") return <ColorControl item={item} onChange={onChange} />;
  if (id === "textAlign") return <AlignControl item={item} onChange={onChange} />;
  if (id === "fontWeight") return <WeightControl item={item} onChange={onChange} />;
  if (id === "common") return <CommonControl item={item} onChange={onChange} />;
  return <TextControl item={item} onChange={onChange} />;
}
