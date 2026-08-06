import {useState} from "react";
import {ClipboardPaste} from "lucide-react";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (source: string) => void;
}

export default function VoiceBatchBindDialog({
  open,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [source, setSource] = useState("");

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <ClipboardPaste size={16} />
          批量绑定音频
        </span>
      }
      onClose={onCancel}
      width={560}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>取消</Button>
          <Button
            type="button"
            variant="primary"
            disabled={!source.trim()}
            onClick={() => onSubmit(source)}
          >
            解析并绑定
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-6 text-text-secondary">
        <p>把公众号后台音频素材列表的接口响应粘贴到这里，一次绑定全部音频（含新上传的）。</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>浏览器打开公众号后台 → 素材库 → 音频</li>
          <li>按 <code className="rounded bg-bg-tertiary px-1">F12</code> 打开开发者工具 → Network（网络）→ 刷新页面</li>
          <li>找到音频列表请求（类型为 JSON，名字常含 <code className="break-all rounded bg-bg-tertiary px-1">appmsg</code>，响应里能看到 <code className="break-all rounded bg-bg-tertiary px-1">voice_encode_fileid</code>）</li>
          <li>右键该请求 → Copy → Copy response，粘贴到下方</li>
        </ol>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder='{"base_resp":..., "file_item":[{"name":"测试音频","voice_encode_fileid":"...",...}]}'
          className="box-border block w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs leading-5 text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
        />
        {error && (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-danger">
            {error}
          </p>
        )}
        <p className="text-xs leading-5 text-text-muted">
          软件会按音频名称与素材库列表自动匹配绑定；以后直接选择插入，无需再操作。
        </p>
      </div>
    </Dialog>
  );
}
