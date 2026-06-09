import {useState} from "react";
import {solveHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {copyHtml} from "../../utils/clipboard.ts";
import Button from "../ui/Button.tsx";

export default function CopyButton() {
  const [status, setStatus] = useState<"idle" | "copying" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    setStatus("copying");
    try {
      await waitForMathJaxIdle();
      const html = solveHtml();
      if (!html) {
        setStatus("fail");
        window.setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      const ok = await copyHtml(html);
      setStatus(ok ? "ok" : "fail");
    } catch (error) {
      console.error("复制前 MathJax 排版失败", error);
      setStatus("fail");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  };

  const label = status === "ok" ? "✓ 已复制" : status === "fail" ? "复制失败" : status === "copying" ? "复制中…" : "复制到微信";

  return (
    <Button
      variant="primary"
      onClick={handleCopy}
      disabled={status === "copying"}
      className={status === "ok" ? "!bg-success hover:!bg-success" : ""}
    >
      {label}
    </Button>
  );
}
