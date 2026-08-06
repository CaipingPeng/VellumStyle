import {useCallback, useEffect, useRef, useState} from "react";
import {Search, Smile, UploadCloud} from "lucide-react";
import {closeWechatBackend, openWechatBackend, searchRemoticon} from "../../utils/publish.ts";
import {uploadRemoteImage} from "../../utils/upload.ts";
import {toast} from "../Toast/toast.ts";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  canInsert: boolean;
  onClose: () => void;
  onPick: (markdown: string) => void;
  onNeedSettings?: () => void;
}

interface EmojiItem {
  docId: string;
  emojiUrl: string;
  thumbUrl: string;
}

const PAGE_SIZE = 40;

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function parseEmojiSearchResponse(source: string): EmojiItem[] | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    gen_emoji_result?: {items?: Array<Record<string, unknown>>};
    normal_emoji_result?: {items?: Array<Record<string, unknown>>};
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
    return null;
  }
  const toItems = (list: Array<Record<string, unknown>> | undefined): EmojiItem[] =>
    (list ?? []).filter((item) => typeof item.emoji_url === "string" && item.emoji_url).map((item) => ({
      docId: String(item.doc_id ?? ""),
      emojiUrl: item.emoji_url as string,
      thumbUrl: (item.thumb_url as string) || (item.emoji_url as string),
    }));
  return [
    ...toItems(data?.gen_emoji_result?.items),
    ...toItems(data?.normal_emoji_result?.items),
  ];
}

export default function EmojiPickerDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EmojiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const sessionRef = useRef(0);

  const runSearch = useCallback(async (keyword: string, session: number) => {
    if (!keyword.trim()) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await searchRemoticon(keyword.trim(), PAGE_SIZE, 0);
      if (session !== sessionRef.current) return;
      const parsed = parseEmojiSearchResponse(response);
      if (parsed === null) {
        let hint = "没有搜索到表情，请确认后台已登录";
        try {
          const data = JSON.parse(response) as {vs_error?: string; base_resp?: {ret?: number; err_msg?: string}};
          if (data.vs_error) {
            hint = "后台页面脚本未就绪，请稍后重试";
          } else if (data.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
            hint = `后台返回错误（${data.base_resp.ret}）：${data.base_resp.err_msg ?? "请确认已登录微信后台"}`;
          }
        } catch {
          // 保留默认提示
        }
        setItems([]);
        toast.show(hint, "error", 5000);
      } else {
        setItems(parsed);
      }
    } catch (error) {
      if (session !== sessionRef.current) return;
      const message = errorMessage(error);
      if (message.includes("WECHAT_BACKEND_NOT_OPENED")) {
        setItems([]);
        await openWechatBackend();
        toast.show("正在等待微信后台登录…", "info", 3000);
        const startedAt = Date.now();
        while (Date.now() - startedAt < 60_000) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (session !== sessionRef.current) return;
          try {
            const retryResponse = await searchRemoticon(keyword.trim(), PAGE_SIZE, 0);
            if (session !== sessionRef.current) return;
            const retried = parseEmojiSearchResponse(retryResponse);
            if (retried !== null) {
              setItems(retried);
              setLoading(false);
              try {
                await closeWechatBackend();
              } catch {
                // 窗口可能已被手动关闭，忽略
              }
              return;
            }
          } catch {
            // 窗口页面未就绪或未登录，继续等待
          }
        }
        if (session === sessionRef.current) {
          setLoading(false);
          toast.show("等待后台登录超时，请登录后重新搜索", "error");
        }
      } else {
        setItems([]);
        toast.show(`表情搜索失败：${message}`, "error");
      }
    } finally {
      if (session === sessionRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const session = ++sessionRef.current;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setItems([]);
    setLoading(false);
    if (!open) return;
    const keyword = query.trim();
    if (!keyword) return;
    searchTimer.current = window.setTimeout(() => void runSearch(keyword, session), 400);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [open, query, runSearch]);

  const insertEmoji = async (item: EmojiItem) => {
    if (!canInsert || inserting) return;
    setInserting(item.docId);
    try {
      const mmbizUrl = await uploadRemoteImage(item.emojiUrl, "正文图片");
      onPick(`![${item.docId}](${mmbizUrl})`);
      toast.show("已插入表情", "info");
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`表情插入失败：${message}`, "error");
      }
    } finally {
      setInserting(null);
    }
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Smile size={16} />
          表情
        </span>
      }
      onClose={onClose}
      closeDisabled={Boolean(inserting)}
      width="min(90vw,720px)"
      contentPadding={false}
    >
      <div className="flex h-[clamp(360px,calc(86vh-100px),560px)] min-h-0 flex-col">
        <div className="flex h-[46px] flex-none items-center gap-2 border-b border-border bg-bg-secondary px-4">
          <Search size={14} className="flex-none text-text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索表情，如：不嘻嘻、哈哈"
            spellCheck={false}
            className="box-border h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
          />
        </div>

        {loading ? (
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-3 overflow-hidden p-4 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from({length: 18}).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-bg-tertiary" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="grid auto-rows-max grid-cols-4 content-start gap-3 sm:grid-cols-5 lg:grid-cols-6">
              {items.map((item, index) => {
                const busy = inserting === item.docId;
                return (
                  <button
                    key={item.docId || index}
                    type="button"
                    disabled={Boolean(inserting) || !canInsert}
                    title={canInsert ? "点击插入表情" : "请先打开一篇文章"}
                    onClick={() => void insertEmoji(item)}
                    className="group relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-0 outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce hover:-translate-y-1 hover:bg-bg focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60"
                  >
                    <img
                      src={item.thumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-contain p-1"
                    />
                    {busy && (
                      <span className="absolute inset-0 grid place-items-center bg-bg/60">
                        <UploadCloud size={20} className="animate-pulse text-accent" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><Smile size={22} /></span>
            <div className="mt-3 font-medium text-text">
              {query.trim() ? "没有找到相关表情" : "输入关键词搜索表情"}
            </div>
            <div className="mt-1 max-w-xs text-xs leading-5">
              表情来自微信表情搜索，插入时会自动上传为永久图片链接。
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
