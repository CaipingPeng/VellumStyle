import {useState} from "react";
import {AudioLines} from "lucide-react";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  audioName: string;
  error: string | null;
  onCancel: () => void;
  onSubmit: (source: string) => void;
}

export default function AudioCodeBindDialog({
  open,
  audioName,
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
          <AudioLines size={16} />
          绑定音频代码
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
            解析并插入
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-6 text-text-secondary">
        <p>
          微信官方接口不提供音频素材的播放标识，需要一次该音频在后台源码模式下的代码。请在公众号后台完成以下操作：
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>新建图文 → 点工具栏「音频」插入「{audioName}」</li>
          <li>点编辑器右上角 <code className="rounded bg-bg-tertiary px-1">{"< >"}</code> 切换到源码模式</li>
          <li>
            复制 <code className="rounded bg-bg-tertiary px-1">{"<mpvoice ...>"}</code> 或{" "}
            <code className="rounded bg-bg-tertiary px-1">{"<section class=\"js_editor_audio ...\">"}</code> 整段，粘贴到下方
          </li>
        </ol>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'<mpvoice class="js_editor_audio audio_iframe js_uneditable" ... voice_encode_fileid="..."></mpvoice>'}
          className="block w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs leading-5 text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
        />
        {error && (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-danger">
            {error}
          </p>
        )}
        <p className="text-xs leading-5 text-text-muted">
          解析成功后软件会记住该音频的标识，下次从素材库直接插入，无需再复制。
        </p>
      </div>
    </Dialog>
  );
}
