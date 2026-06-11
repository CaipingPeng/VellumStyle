export const ARTICLE_ROOT_ID = "article";
export const ARTICLE_ROOT_SELECTOR = `#${ARTICLE_ROOT_ID}`;
export const ARTICLE_BOX_ID = "article-box";

export const LEGACY_ARTICLE_ROOT_SELECTORS = ["#nice", "#wechat-article"];

const LEGACY_ROOT_RE = /#(?:nice|wechat-article)(?![-_a-zA-Z0-9])/g;

export function normalizeArticleRootSelector(input: string): string {
  return input.replace(LEGACY_ROOT_RE, ARTICLE_ROOT_SELECTOR);
}
