import type {StyleItem} from "../../themes/themeModel.ts";

interface CtrlProps {
  item: StyleItem;
  onChange: (value: string) => void;
  compact?: boolean;
}

function inputClass(compact: boolean): string {
  return [
    "h-[26px] w-full appearance-none rounded-sm border-0 bg-bg-tertiary text-[12px] shadow-none outline-none transition-colors duration-fast hover:bg-bg-secondary focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
    compact ? "px-1.5" : "px-2",
  ].join(" ");
}

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

function TextControl({item, onChange, compact = false}: CtrlProps) {
  const numeric = parseNumericValue(item.value);
  if (numeric) {
    return <NumericControl value={numeric} compact={compact} onChange={onChange} />;
  }
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass(compact)}
    />
  );
}

function NumericControl({
  value,
  onChange,
  compact,
}: {
  value: NumericValue;
  onChange: (value: string) => void;
  compact: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center overflow-hidden rounded-sm border-0 bg-bg-tertiary shadow-none transition-colors duration-fast hover:bg-bg-secondary focus-within:bg-bg focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
      <input
        type="number"
        step={value.unit === "em" || value.unit === "rem" ? "0.1" : "1"}
        value={value.amount}
        onChange={(e) => onChange(`${e.target.value}${value.unit}`)}
        className={`h-[26px] min-w-0 flex-1 appearance-none border-0 bg-transparent text-[12px] shadow-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${compact ? "px-1.5" : "px-2"}`}
      />
      <span
        className={`flex h-[26px] flex-none items-center justify-center bg-transparent text-[9px] text-text-muted ${compact ? "min-w-7 px-1" : "min-w-9 px-2"}`}
      >
        {value.unit || "值"}
      </span>
    </div>
  );
}

function ColorControl({item, onChange, compact = false}: CtrlProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        type="color"
        value={colorValueToHex(item.value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-[26px] w-8 flex-none cursor-pointer appearance-none rounded-sm border-0 bg-bg-tertiary p-1 shadow-none transition-colors duration-fast hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:border-0"
        aria-label="选择颜色"
      />
      <input
        type="text"
        value={item.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="rgba(0,0,0,1)"
        className={inputClass(compact)}
      />
    </div>
  );
}

function toggleButtonClass(active: boolean): string {
  return [
    "h-[26px] flex-1 cursor-pointer appearance-none rounded-sm border-0 text-[11px] shadow-none transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
    active
      ? "bg-bg-secondary text-text"
      : "bg-bg-tertiary text-text-muted hover:bg-bg-secondary hover:text-text",
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
      {opts.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={toggleButtonClass(item.value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function WeightControl({item, onChange}: CtrlProps) {
  const options = [
    {value: "normal", label: "常规"},
    {value: "bold", label: "加粗"},
  ];
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={toggleButtonClass(item.value === option.value)}
        >
          {option.label}
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
      className="w-full appearance-none resize-y rounded-sm border-0 bg-bg-tertiary p-1.5 font-mono text-[11px] leading-5 shadow-none outline-none transition-colors duration-fast hover:bg-bg-secondary focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    />
  );
}

export function StyleControl({item, onChange, compact = false}: CtrlProps) {
  const id = item.id;
  if (/Color$/i.test(id) || id === "fontColor") {
    return <ColorControl item={item} compact={compact} onChange={onChange} />;
  }
  if (id === "textAlign") return <AlignControl item={item} onChange={onChange} />;
  if (id === "fontWeight") return <WeightControl item={item} onChange={onChange} />;
  if (id === "common") return <CommonControl item={item} onChange={onChange} />;
  return <TextControl item={item} compact={compact} onChange={onChange} />;
}
