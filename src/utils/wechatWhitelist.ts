const WECHAT_WHITELIST_BASE_URL = "https://developers.weixin.qq.com/console/product/mp";

export function buildWechatWhitelistUrl(appId: string): string {
  const normalized = appId.trim();
  if (!normalized) {
    throw new Error("请先在公众号配置中填写并保存 AppID");
  }
  return `${WECHAT_WHITELIST_BASE_URL}/${encodeURIComponent(normalized)}?tab1=basicInfo`;
}
