import {useState} from "react";
import {Copy} from "lucide-react";
import {solveHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {copyHtml} from "../../utils/clipboard.ts";
import Button, {type ButtonState} from "../ui/Button.tsx";
import {toast} from "../Toast/toast.ts";

const RESET_MS = 2000;

export default function CopyButton() {
  const [state, setState] = useState<ButtonState>("idle");

  const fail = (message: string) => {
    setState("error");
    toast.show(message, "error");
    window.setTimeout(() => setState("idle"), RESET_MS);
  };

  const handleCopy = async () => {
    setState("loading");
    try {
      await waitForMathJaxIdle();
      const html = solveHtml();
      if (!html) {
        fail("没有可复制的内容");
        return;
      }
      const ok = await copyHtml(html);
      if (ok) {
        setState("success");
        window.setTimeout(() => setState("idle"), RESET_MS);
      } else {
        fail("复制失败，请重试");
      }
    } catch (error) {
      console.error("复制前 MathJax 排版失败", error);
      fail("复制失败，公式排版异常");
    }
  };

  return (
    <Button
      variant="primary"
      state={state}
      loadingText="复制中…"
      successText="已复制"
      errorText="复制失败"
      onClick={handleCopy}
    >
      <Copy size={14} />
      复制到微信
    </Button>
  );
}
