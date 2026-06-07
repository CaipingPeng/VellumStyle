import type {StyleItem} from "../../themes/themeModel.ts";

interface CtrlProps {
  item: StyleItem;
  onChange: (value: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 28,
  fontSize: 13,
  padding: "0 6px",
  border: "1px solid #d9d9d9",
  borderRadius: 4,
};

// 数值+单位（fontSize/lineHeight/letterSpacing）。文本框，保留原单位写法。
function TextControl({item, onChange}: CtrlProps) {
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
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
      style={inputStyle}
    />
  );
}

function toggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 28,
    fontSize: 12,
    border: "1px solid #d9d9d9",
    borderRadius: 4,
    background: active ? "#1e6bb8" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
  };
}

function AlignControl({item, onChange}: CtrlProps) {
  const opts = ["left", "center", "right"];
  return (
    <div style={{display: "flex", gap: 4}}>
      {opts.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={toggleButtonStyle(item.value === o)}>
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
        <button key={o} onClick={() => onChange(o)} style={toggleButtonStyle(item.value === o)}>
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
      style={{
        width: "100%",
        fontSize: 12,
        fontFamily: "monospace",
        border: "1px solid #d9d9d9",
        borderRadius: 4,
        padding: 6,
      }}
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
