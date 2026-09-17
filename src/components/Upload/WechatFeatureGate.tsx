import {useEffect, useState, type ReactNode} from "react";
import {capabilityReason, readCapabilities, type WechatFeature} from "../../utils/featureCapabilities.ts";
import {backendWindowUrl, openWechatBackend} from "../../utils/publish.ts";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

/** 所有入口共用平台、凭证、后台登录检查；对话框仅在满足条件后挂载。 */
export default function WechatFeatureGate({feature = "backend", onClose, onSettings, children}: {
  feature?: WechatFeature; onClose: () => void; onSettings?: () => void; children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState("正在检查功能可用性…");
  const [canLogin, setCanLogin] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const capabilities = await readCapabilities();
        if (disposed) return;
        const unavailable = capabilityReason(feature, capabilities);
        if (unavailable) {setReason(unavailable); return;}
        if (feature === "backend") {
          const url = await backendWindowUrl();
          if (disposed) return;
          if (!url || !new URL(url).searchParams.get("token")) {
            setReason("此功能需要登录微信公众平台。登录窗口中的账号应与当前文章使用的公众号一致。");
            setCanLogin(true);
            timer = setTimeout(() => void check(), 1500);
            return;
          }
        }
        setReady(true);
      } catch (error) {if (!disposed) setReason(`检查失败：${String(error)}`);}
    };
    void check();
    return () => {disposed = true; clearTimeout(timer);};
  }, [feature]);
  if (ready) return children;
  return <Dialog open title="微信功能准备" onClose={onClose} footer={<>
    {onSettings && <Button variant="secondary" onClick={() => {onClose(); onSettings();}}>打开设置</Button>}
    {canLogin && <Button disabled={checking} onClick={() => {
      setChecking(true); void openWechatBackend().catch((error) => setReason(String(error))).finally(() => setChecking(false));
    }}>登录微信后台</Button>}
    <Button variant="secondary" onClick={onClose}>返回编辑</Button>
  </>}><p>{reason}</p></Dialog>;
}
