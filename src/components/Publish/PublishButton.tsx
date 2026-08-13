import {lazy, Suspense, useState} from "react";
import {Send} from "lucide-react";
import Button from "../ui/Button.tsx";

// 发布对话框懒加载 + 条件挂载：打开才下载 chunk，关闭即卸载。
const PublishDialog = lazy(() => import("./PublishDialog.tsx"));

interface Props {
  onNeedSettings: () => void;
}

export default function PublishButton({onNeedSettings}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Send size={14} />
        发布
      </Button>
      {open && (
        <Suspense fallback={null}>
          <PublishDialog onClose={() => setOpen(false)} onNeedSettings={onNeedSettings} />
        </Suspense>
      )}
    </>
  );
}
