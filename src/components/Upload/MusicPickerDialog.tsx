import {useState} from "react";
import {Music, Search} from "lucide-react";
import {getMusicInfo, searchMusic} from "../../utils/publish.ts";
import {waitBackendCommand} from "../../utils/wechatBackend.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface MusicItem {
  id: string;
  type: number;
  source: number;
  vip: boolean;
  title: string;
  author: string;
  cover: string;
  duration: number;
  listenId: string;
  playUrl: string;
}

interface Props {
  open?: boolean;
  onClose: () => void;
  onPick: (markup: string) => void;
  onNeedSettings?: () => void;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDuration(millis: number): string {
  const seconds = Math.round(millis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function parseMusicSearch(source: string): MusicItem[] | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    search_resp?: {list?: Array<Record<string, unknown>>};
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) return null;
  const list = data?.search_resp?.list;
  if (!Array.isArray(list)) return null;
  const items: MusicItem[] = [];
  for (const entry of list) {
    const music = entry.music as Record<string, unknown> | undefined;
    const id = typeof entry.id === "string" ? entry.id : "";
    const listenId = typeof music?.listen_id === "string" ? music.listen_id : "";
    if (!id || !listenId) continue;
    items.push({
      id,
      type: typeof entry.type === "number" ? entry.type : 1,
      source: typeof entry.source === "number" ? entry.source : 1,
      vip: Number(entry.vip ?? 0) === 1,
      title: typeof music?.title === "string" ? music.title : "未知曲名",
      author: typeof music?.author === "string" ? music.author : "",
      cover: typeof music?.cover === "string" ? music.cover : "",
      duration: typeof music?.duration === "number" ? music.duration : 0,
      listenId,
      playUrl: typeof entry.music_play_url === "string" ? entry.music_play_url : "",
    });
  }
  return items;
}

function parseMusicInfo(source: string): MusicItem | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    music_info_list?: Array<Record<string, unknown>>;
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) return null;
  const first = data?.music_info_list?.[0];
  if (!first) return null;
  const music = first.music as Record<string, unknown> | undefined;
  const listenId = typeof music?.listen_id === "string" ? music.listen_id : "";
  if (!listenId) return null;
  return {
    id: typeof first.id === "string" ? first.id : "",
    type: typeof first.type === "number" ? first.type : 1,
    source: Number(first.source ?? 1),
    vip: false,
    title: typeof music?.title === "string" ? music.title : "未知曲名",
    author: typeof music?.author === "string" ? music.author : "",
    cover: typeof music?.cover === "string" ? music.cover : "",
    duration: typeof music?.duration === "number" ? music.duration : 0,
    listenId,
    playUrl: "",
  };
}

// 按官方编辑器插入的 mp-common-clmusic 组件生成标签，发布后微信渲染为 QQ 音乐卡片。
// data-vs-music-url 为本地预览用的带签名播放地址，导出/发布时由 stripPreviewArtifacts 清理。
function buildClmusicMarkup(music: MusicItem): string {
  const attr = (name: string, value: string) => ` ${name}="${escapeHtmlAttribute(value)}"`;
  return (
    `<mp-common-clmusic class="res_iframe clmusic_iframe js_uneditable custom_select_card mp_common_widget"` +
    attr("data-pluginname", "insertaudio") +
    attr("type", String(music.type)) +
    attr("music_name", music.title) +
    attr("albumurl", music.cover) +
    attr("singer", music.author) +
    attr("count", "0") +
    attr("is_vip", music.vip ? "1" : "0") +
    attr("duration", String(music.duration)) +
    attr("music_source", String(music.source)) +
    attr("listenid", music.listenId) +
    (music.playUrl ? attr("data-vs-music-url", music.playUrl) : "") +
    "></mp-common-clmusic>"
  );
}

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

export default function MusicPickerDialog({open = true, onClose, onPick, onNeedSettings}: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MusicItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSearch = async () => {
    const keyword = query.trim();
    if (!keyword || searching || insertingId) return;
    setSearching(true);
    setError(null);
    try {
      const response = await waitBackendCommand(
        () => searchMusic(keyword),
        (text) => parseMusicSearch(text) !== null,
      );
      const found = parseMusicSearch(response) ?? [];
      setItems(found);
      if (found.length === 0) setError("没有找到相关音乐，换个关键词试试");
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      }
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const insert = async (item: MusicItem) => {
    if (insertingId) return;
    setInsertingId(item.id);
    setError(null);
    try {
      const response = await waitBackendCommand(
        () => getMusicInfo(item.id, item.type, item.source),
        (text) => parseMusicInfo(text) !== null,
      );
      const info = parseMusicInfo(response);
      if (!info) throw new Error("获取音乐信息失败，请重试");
      onPick(buildClmusicMarkup({...info, playUrl: item.playUrl || info.playUrl}));
      toast.show(`已插入音乐：${info.title}`, "info");
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      }
      setError(message);
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Music size={16} />
          插入音乐
        </span>
      }
      onClose={onClose}
      closeDisabled={Boolean(insertingId)}
      width="min(90vw,720px)"
      contentPadding={false}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs font-normal text-text-muted">
            {items.length > 0 ? `搜索到 ${items.length} 首 · 点击歌曲即可插入` : "输入歌名或歌手搜索 QQ 音乐"}
          </span>
        </div>
      }
    >
      <div className="flex h-[clamp(360px,calc(86vh-120px),560px)] min-h-0 flex-col">
        <div className="flex h-[46px] flex-none items-center gap-3 border-b border-border bg-bg-secondary px-4">
          <div className="min-w-0 flex-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void startSearch();
                }
              }}
              placeholder="输入歌名或歌手，按回车搜索，如：壁上观"
              spellCheck={false}
              className="box-border h-8 w-full rounded-md border border-[color:var(--ring)] bg-bg px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            state={searching ? "loading" : "idle"}
            loadingText="搜索中…"
            disabled={!query.trim() || searching || Boolean(insertingId)}
            onClick={() => void startSearch()}
          >
            <Search size={15} />
            搜索
          </Button>
        </div>

        {searching ? (
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-3 overflow-hidden p-4 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from({length: 12}).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-bg-tertiary" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="grid auto-rows-max grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-2">
              {items.map((item) => {
                const inserting = insertingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={Boolean(insertingId)}
                    onClick={() => void insert(item)}
                    className={`group relative flex min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-lg border bg-bg-secondary p-2 text-left outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${
                      inserting
                        ? "border-accent/70"
                        : "border-[color:var(--card-border)] hover:-translate-y-0.5 hover:bg-bg"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="relative block h-14 w-14 flex-none overflow-hidden rounded-md bg-bg-tertiary bg-cover bg-center"
                      style={item.cover ? {backgroundImage: `url("${toProxyImageUrl(item.cover)}")`} : undefined}
                    >
                      <span className="absolute inset-0 grid place-items-center bg-black/20 text-white opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                        {inserting ? "插入中…" : <Music size={18} />}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">
                        {item.title}
                        {item.vip && (
                          <span className="ml-1 inline-block rounded-sm bg-accent px-1 text-[10px] leading-4 text-white">
                            VIP
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-secondary">
                        {item.author || "未知歌手"}
                      </span>
                      <span className="mt-0.5 block text-xs2 text-text-muted">
                        {formatDuration(item.duration)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <Music size={22} />
            </span>
            <div className="mt-3 font-medium text-text">
              {error ?? (query.trim() ? "没有找到相关音乐" : "搜索 QQ 音乐并插入文章")}
            </div>
            <div className="mt-1 max-w-xs text-xs leading-5">
              {error
                ? "请检查微信后台登录状态后重试"
                : "发布后以微信官方 QQ 音乐卡片展示，读者可直接播放"}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
