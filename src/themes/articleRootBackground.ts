// 判断主题是否给文章根元素设置了实色背景。
// 主题未设置 #article 背景，或显式设为透明（如 rgba(0,0,0,0)）时，
// 预览需要垫白色兜底，否则文章会透出预览舞台底色，与微信发布的白底成品不一致。
export function articleRootBackgroundIsSolid(css: string): boolean {
  const rootRuleRe = /#article\s*\{([^}]*)\}/g;
  let rootMatch: RegExpExecArray | null;
  while ((rootMatch = rootRuleRe.exec(css))) {
    const body = rootMatch[1];
    const declRe = /background(?:-color)?\s*:\s*([^;}]+)/g;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declRe.exec(body))) {
      const value = declMatch[1].trim();
      if (
        value &&
        value !== "none" &&
        value !== "transparent" &&
        !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(value)
      ) {
        return true;
      }
    }
  }
  return false;
}
