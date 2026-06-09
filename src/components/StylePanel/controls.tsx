import type {StyleItem} from "../../themes/themeModel.ts";

interface CtrlProps {
  item: StyleItem;
  onChange: (value: string) => void;
}

const inputClass =
  "w-full h-7 text-[13px] px-1.5 border border-border rounded-sm bg-bg outline-none focus:border-accent";

// 数值+单位（fontSize/lineHeight/letterSpacing）。文本框，保留原单位写法。
function TextControl({item, onChange}: CtrlProps) {
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

// rgba 取色器：文本框存原始 rgba/hex 写法。
function ColorControl({item, onChange}: CtrlProps) {
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="rgba(0,0,0,1)"
      className={inputClass}
    />
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
  const opts = ["left", "center", "right"];
  return (
    <div style={{display: "flex", gap: 4}}>
      {opts.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={toggleButtonClass(item.value === o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function WeightControl({item, onChange}: CtrlProps) {
  return (
    <div style={{display: "flex", gap: 4}}>
      {["normal", "bold"].map((o) => (
        <button key={o} onClick={() => onChange(o)} className={toggleButtonClass(item.value === o)}>
          {o}
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
      className="w-full text-xs font-mono p-1.5 border border-border rounded-sm bg-bg outline-none focus:border-accent"
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
