import {useState} from "react";
import {solveHtml} from "../../markdown/converter.ts";
import {copyHtml} from "../../utils/clipboard.ts";

// 复制到微信：生成内联 HTML 并写入剪贴板（text/html）。
export default function CopyButton() {
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    const html = solveHtml();
    if (!html) {
      setStatus("fail");
      window.setTimeout(() => setStatus("idle"), 2000);
      return;
    }
    const ok = await copyHtml(html);
    setStatus(ok ? "ok" : "fail");
    window.setTimeout(() => setStatus("idle"), 2000);
  };

  const label = status === "ok" ? "✓ 已复制" : status === "fail" ? "复制失败" : "复制到微信";

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: "6px 16px",
        background: status === "ok" ? "#07c160" : "#1e6bb8",
        color: "#fff",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );
}
