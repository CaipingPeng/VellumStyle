import {useCallback, useEffect, useRef, useState} from "react";
import {ImagePlus, Smartphone} from "lucide-react";
import {
  confirmPhoneUploadPics,
  getPhoneUploadPicList,
  getPhoneUploadQrcode,
} from "../../utils/publish.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {waitBackendCommand} from "../../utils/wechatBackend.ts";
import {formatHtmlImage} from "../../markdown/imageMarkdown.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  canInsert: boolean;
  onClose: () => void;
  onPick: (markdown: string) => void;
  onNeedSettings?: () => void;
}

interface QrcodeInfo {
  qrcodeUuid: string;
  qrcodeTmpUrl: string;
}

interface UploadedPic {
  cdnUrl: string;
  filename: string;
  index: number;
  userUploadTime: number;
  historyQrcodeUuid: string;
}

type Phase = "loading" | "waiting" | "received" | "error";

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function parseErrorHint(source: string): string {
  const text = source.trim();
  if (!text) return "接口返回为空";
  if (!text.startsWith("{")) return `返回内容不是 JSON：${text.slice(0, 120)}`;
  try {
    const data = JSON.parse(text) as {
      vs_error?: boolean;
      reason?: string;
      message?: string;
      base_resp?: {ret?: number; err_msg?: string};
    };
    if (data?.vs_error) {
      return `后台页面脚本异常：${data.reason || data.message || "未知"}`;
    }
    if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
      return `微信接口错误(${data.base_resp.ret})：${data.base_resp.err_msg || ""}`;
    }
  } catch {
    // 解析失败走兜底提示
  }
  return `接口返回内容异常：${text.slice(0, 120)}`;
}

function parseQrcodeResponse(source: string): QrcodeInfo | null {
  try {
    const data = JSON.parse(source) as {
      base_resp?: {ret?: number};
      qrcode_uuid?: string;
      qrcode_tmp_url?: string;
    };
    if (data?.base_resp && data.base_resp.ret !== 0) return null;
    if (!data?.qrcode_uuid || !data?.qrcode_tmp_url) return null;
    return {qrcodeUuid: data.qrcode_uuid, qrcodeTmpUrl: data.qrcode_tmp_url};
  } catch {
    return null;
  }
}

function parsePicListResponse(source: string): UploadedPic[] | null {
  try {
    const data = JSON.parse(source) as {
      base_resp?: {ret?: number};
      upload_pic_info_list?: Array<Record<string, unknown>>;
    };
    if (data?.base_resp && data.base_resp.ret !== 0) return null;
    return (data?.upload_pic_info_list ?? [])
      .filter((item) => typeof item.cdn_url === "string" && item.cdn_url)
      .map((item) => ({
        cdnUrl: item.cdn_url as string,
        filename: String(item.filename ?? ""),
        index: Number(item.index ?? 0),
        userUploadTime: Number(item.user_upload_time ?? 0),
        historyQrcodeUuid: String(item.history_qrcode_uuid ?? ""),
      }));
  } catch {
    return null;
  }
}

function parseConfirmResponse(source: string): UploadedPic[] | null {
  try {
    const data = JSON.parse(source) as {
      base_resp?: {ret?: number};
      upload_pic_info_list?: Array<Record<string, unknown>>;
    };
    if (data?.base_resp && data.base_resp.ret !== 0) return null;
    return (data?.upload_pic_info_list ?? [])
      .filter((item) => typeof item.cdn_url === "string" && item.cdn_url)
      .map((item) => ({
        cdnUrl: item.cdn_url as string,
        filename: String(item.filename ?? ""),
        index: Number(item.index ?? 0),
        userUploadTime: Number(item.user_upload_time ?? 0),
        historyQrcodeUuid: String(item.history_qrcode_uuid ?? ""),
      }));
  } catch {
    return null;
  }
}

const POLL_INTERVAL_MS = 2000;

export default function PhoneUploadDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [qr, setQr] = useState<QrcodeInfo | null>(null);
  const [pics, setPics] = useState<UploadedPic[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [confirming, setConfirming] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const sessionRef = useRef(0);

  // 打开对话框：获取上传二维码；关闭时作废在途请求与轮询。
  useEffect(() => {
    if (!open) return;
    const session = ++sessionRef.current;
    setQr(null);
    setPics([]);
    setPhase("loading");
    setConfirming(false);

    void (async () => {
      try {
        // 后台窗口可能尚未打开（首次使用/重启后），等待窗口就绪并重试
        const response = await waitBackendCommand(
          () => getPhoneUploadQrcode(),
          (text) => parseQrcodeResponse(text) !== null,
        );
        if (session !== sessionRef.current) return;
        const info = parseQrcodeResponse(response);
        if (!info) {
          setPhase("error");
          toast.show(`获取上传二维码失败：${parseErrorHint(response)}`, "error", 6000);
          return;
        }
        setQr(info);
        setPhase("waiting");
      } catch (error) {
        if (session !== sessionRef.current) return;
        setPhase("error");
        toast.show(`获取上传二维码失败：${errorMessage(error)}`, "error");
      }
    })();

    return () => {
      sessionRef.current += 1;
    };
  }, [open, retryToken]);

  // 轮询扫码上传结果，收到图片后停止轮询。
  useEffect(() => {
    if (!open || !qr || phase !== "waiting") return;
    const session = sessionRef.current;
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      if (stopped || session !== sessionRef.current) return;
      try {
        const response = await getPhoneUploadPicList(qr.qrcodeUuid);
        if (stopped || session !== sessionRef.current) return;
        const list = parsePicListResponse(response);
        if (list && list.length > 0) {
          setPics(list);
          setPhase("received");
          return;
        }
      } catch {
        // 后台窗口暂不可用，继续轮询
      }
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, qr, phase]);

  const confirmInsert = useCallback(async () => {
    if (!canInsert || !qr || pics.length === 0 || confirming) return;
    setConfirming(true);
    try {
      const data = JSON.stringify({
        qrcode_uuid: qr.qrcodeUuid,
        pic_info_list: pics.map((pic) => ({
          cdn_url: pic.cdnUrl,
          index: pic.index,
          filename: pic.filename,
          user_upload_time: pic.userUploadTime,
          fileid: "",
          history_qrcode_uuid: pic.historyQrcodeUuid,
        })),
        seq: Date.now(),
        svr_time: String(Math.floor(Date.now() / 1000)),
      });
      const response = await confirmPhoneUploadPics(data);
      const confirmed = parseConfirmResponse(response);
      if (!confirmed || confirmed.length === 0) {
        throw new Error(`确认保存失败：${parseErrorHint(response)}`);
      }
      const markdown = confirmed
        .map((pic, index) => formatHtmlImage({src: pic.cdnUrl, alt: `手机图片${index + 1}`}))
        .join("\n\n");
      onPick(markdown);
      toast.show(`已插入 ${confirmed.length} 张图片`, "info");
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`图片插入失败：${message}`, "error");
      }
    } finally {
      setConfirming(false);
    }
  }, [canInsert, confirming, onClose, onNeedSettings, onPick, pics, qr]);

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Smartphone size={16} />
          手机传图
        </span>
      }
      onClose={onClose}
      closeDisabled={confirming}
      width="min(90vw,480px)"
      contentPadding={false}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs font-normal text-text-muted">
            {phase === "received" ? `已收到 ${pics.length} 张图片` : "微信扫码后从手机相册选择图片"}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" state={confirming ? "loading" : "idle"} disabled={confirming} onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              state={confirming ? "loading" : "idle"}
              loadingText="正在保存…"
              disabled={!canInsert || pics.length === 0 || confirming}
              title={!canInsert ? "请先打开一篇文章" : "将手机上传的图片插入正文"}
              onClick={() => void confirmInsert()}
            >
              确认插入
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex h-[clamp(360px,calc(86vh-160px),480px)] min-h-0 flex-col">
        {phase === "loading" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
            <div className="h-52 w-52 animate-pulse rounded-lg bg-bg-tertiary" />
            <div className="text-sm text-text-muted">正在生成上传二维码…</div>
          </div>
        )}

        {phase === "waiting" && qr && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
            <img
              src={toProxyImageUrl(qr.qrcodeTmpUrl)}
              alt="上传二维码"
              className="h-52 w-52 rounded-lg border border-border bg-white object-contain"
            />
            <div className="text-center">
              <div className="text-sm font-medium text-text">用微信扫码上传图片</div>
              <div className="mt-1 text-xs text-text-muted">从手机相册选择，最多 20 张；上传后自动出现在下方</div>
            </div>
          </div>
        )}

        {phase === "received" && (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
            <div className="grid auto-rows-max grid-cols-4 gap-3">
              {pics.map((pic, index) => (
                <div
                  key={pic.filename || pic.index || index}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border bg-bg-secondary"
                >
                  <img src={toProxyImageUrl(pic.cdnUrl)} alt="" loading="lazy" decoding="async" className="block h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
            <ImagePlus size={32} className="text-text-muted" />
            <div className="text-sm text-text-secondary">获取上传二维码失败</div>
            <Button type="button" variant="secondary" state="idle" onClick={() => setRetryToken((token) => token + 1)}>
              重试
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
