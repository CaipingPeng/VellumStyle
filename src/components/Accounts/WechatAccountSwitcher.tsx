import {useState, useSyncExternalStore} from "react";
import {getWechatAccounts, subscribeWechatAccounts, switchWechatAccount} from "../../utils/wechatAccounts.ts";
import {toast} from "../Toast/toast.ts";

export default function WechatAccountSwitcher({onSettings, disabled = false}: {onSettings: () => void; disabled?: boolean}) {
  const {accounts, active_app_id} = useSyncExternalStore(subscribeWechatAccounts, getWechatAccounts);
  const [switching, setSwitching] = useState(false);
  const active = accounts.find((account) => account.app_id === active_app_id);
  return <select
    data-account-switcher
    aria-label="切换公众号"
    title={disabled ? "请先保存或关闭设置" : active ? `当前公众号：${active.name}（${active.app_id}）` : "配置或管理公众号"}
    disabled={disabled || switching}
    value={active_app_id}
    className="h-8 w-36 flex-none rounded border border-border bg-bg px-2 text-sm text-text disabled:opacity-60"
    onChange={(event) => {
      const id = event.target.value;
      if (id === "manage") { onSettings(); return; }
      setSwitching(true);
      void switchWechatAccount(id)
        .then(() => toast.show("已切换公众号", "info"))
        .catch((error) => toast.show(String(error), "error"))
        .finally(() => setSwitching(false));
    }}
  >
    {!active_app_id && <option value="">配置公众号</option>}
    {accounts.map((account) => <option key={account.app_id} value={account.app_id}>{account.name ? `${account.name}（${account.app_id}）` : account.app_id}</option>)}
    <option value="manage">管理公众号…</option>
  </select>;
}
