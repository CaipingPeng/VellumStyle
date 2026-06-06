import {useState} from "react";
import ThemePickerDialog from "./ThemePickerDialog.tsx";

const btnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

// 点「主题」按钮打开无遮罩浮层选择器（网格缩略图 + 分页）。
export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(true)}>
        主题
      </button>
      {open && <ThemePickerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
