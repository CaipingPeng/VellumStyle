import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

interface Props {
  onClose: () => void;
}

interface AppConfig {
  wechat: {
    app_id: string;
    app_secret: string;
  };
}

// 设置弹窗：读 get_config 回显，保存调 save_config（写 config.local.yaml；微信凭证变更会清 token 缓存）。
export default function SettingsDialog({onClose}: Props) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        setAppId(cfg.wechat?.app_id || "");
        setAppSecret(cfg.wechat?.app_secret || "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("save_config", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      onClose();
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "保存失败";
      window.alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          maxWidth: "90%",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid #eee",
            fontWeight: 600,
            color: "#333",
          }}
        >
          <span>设置</span>
          <button
            onClick={onClose}
            style={{border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#999"}}
            title="关闭"
          >
            ✕
          </button>
        </div>

        <div style={{padding: 16, display: "flex", flexDirection: "column", gap: 18}}>
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>微信图床设置</div>
            <label style={labelStyle}>
              AppID
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="公众号 AppID（wx 开头）"
                disabled={!loaded}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              AppSecret
              <input
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="公众号 AppSecret"
                type="password"
                disabled={!loaded}
                style={inputStyle}
              />
            </label>
            <p style={hintStyle}>
              在「微信公众平台 → 设置与开发 → 基本配置」获取。凭证仅保存在本机，用于上传图片到你公众号的素材库。
            </p>
          </section>
        </div>

        <div style={{display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 16px 16px"}}>
          <button onClick={onClose} style={btnStyle(false)}>
            取消
          </button>
          <button onClick={handleSave} disabled={saving || !loaded} style={btnStyle(true)}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#333",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#555",
};

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#999",
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  fontSize: 14,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  outline: "none",
};

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 16px",
    fontSize: 13,
    borderRadius: 4,
    cursor: "pointer",
    border: primary ? "none" : "1px solid #d9d9d9",
    background: primary ? "#1e6bb8" : "#fff",
    color: primary ? "#fff" : "#333",
  };
}
