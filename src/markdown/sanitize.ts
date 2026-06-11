import createDOMPurify, {type Config, type DOMPurify, type WindowLike} from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "section",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "video",
];

const GLOBAL_ATTRIBUTES = [
  "class",
  "data-line",
  "data-tool",
  "id",
  "role",
  "style",
  "title",
  "aria-current",
  "aria-describedby",
  "aria-expanded",
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "aria-selected",
];

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: [
    ...GLOBAL_ATTRIBUTES,
    "align",
    "alt",
    "colspan",
    "controls",
    "height",
    "href",
    "loading",
    "name",
    "poster",
    "rel",
    "rowspan",
    "src",
    "start",
    "target",
    "type",
    "width",
  ],
  ADD_DATA_URI_TAGS: ["img", "source", "video"],
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob|wximg):|\/\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ["script", "style"],
};

const purifier = createPurifier();

export function sanitizeRenderedHtml(html: string): string {
  return purifier.sanitize(html, SANITIZE_CONFIG);
}

function createPurifier(): DOMPurify {
  const root = globalThis.window as WindowLike | undefined;
  if (!root) {
    throw new Error("DOMPurify requires a browser-like window before rendering Markdown.");
  }
  return createDOMPurify(root);
}
