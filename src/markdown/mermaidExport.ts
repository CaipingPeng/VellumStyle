interface SvgStyleSnapshot {
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAnchor?: string;
  opacity?: string;
}

type StyleReader = (element: Element) => SvgStyleSnapshot;

const SVG_PRESENTATION_ATTRS: Array<[keyof SvgStyleSnapshot, string]> = [
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["strokeWidth", "stroke-width"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["fontStyle", "font-style"],
  ["textAnchor", "text-anchor"],
  ["opacity", "opacity"],
];

const SVG_NS = "http://www.w3.org/2000/svg";

const MERMAID_DEFAULTS = {
  nodeFill: "#ECECFF",
  nodeStroke: "#9370DB",
  textFill: "#333333",
  lineStroke: "#333333",
  edgeLabelFill: "#ffffff",
  fontFamily: "trebuchet ms, verdana, arial, sans-serif",
  fontSize: "16px",
};

function defaultStyleReader(element: Element): SvgStyleSnapshot {
  const style = window.getComputedStyle(element);
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAnchor: style.textAnchor,
    opacity: style.opacity,
  };
}

function hasUsefulValue(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "normal" && normalized !== "auto";
}

function isTransparent(value: string): boolean {
  return value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)";
}

function classListContains(element: Element, className: string): boolean {
  return element.classList?.contains(className) ?? false;
}

function mermaidFallbackStyle(element: Element): SvgStyleSnapshot {
  const tag = element.tagName.toLowerCase();
  if (classListContains(element, "flowchart-link")) {
    return {fill: "none", stroke: MERMAID_DEFAULTS.lineStroke, strokeWidth: "2px"};
  }
  if (classListContains(element, "arrowMarkerPath")) {
    return {fill: MERMAID_DEFAULTS.lineStroke, stroke: MERMAID_DEFAULTS.lineStroke};
  }
  if (classListContains(element, "background") && element.closest(".edgeLabels")) {
    return {fill: MERMAID_DEFAULTS.edgeLabelFill, stroke: "none"};
  }
  if (classListContains(element, "label-container") && element.closest(".node")) {
    return {fill: MERMAID_DEFAULTS.nodeFill, stroke: MERMAID_DEFAULTS.nodeStroke};
  }
  if (tag === "text" || tag === "tspan") {
    return {
      fill: MERMAID_DEFAULTS.textFill,
      color: MERMAID_DEFAULTS.textFill,
      fontFamily: MERMAID_DEFAULTS.fontFamily,
      fontSize: MERMAID_DEFAULTS.fontSize,
    };
  }
  return {};
}

function mergeWithFallback(element: Element, snapshot: SvgStyleSnapshot): SvgStyleSnapshot {
  const fallback = mermaidFallbackStyle(element);
  return {
    ...fallback,
    ...Object.fromEntries(Object.entries(snapshot).filter(([, value]) => hasUsefulValue(value))),
  };
}

function applyPresentationAttributes(element: Element, snapshot: SvgStyleSnapshot): void {
  const merged = mergeWithFallback(element, snapshot);
  for (const [key, attr] of SVG_PRESENTATION_ATTRS) {
    const value = merged[key];
    if (!hasUsefulValue(value)) continue;
    if ((attr === "fill" || attr === "stroke") && isTransparent(value.trim().toLowerCase())) continue;
    element.setAttribute(attr, value);
  }
  if (!element.getAttribute("fill") && hasUsefulValue(merged.color)) {
    element.setAttribute("fill", merged.color);
  }
}

function appendStyle(element: HTMLElement | SVGElement, style: string): void {
  const current = element.getAttribute("style")?.trim();
  element.setAttribute("style", current ? `${current.replace(/;?\s*$/, ";")}${style}` : style);
}

function splitForeignObjectText(node: Node): string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text ? [text] : [];
  }
  if (!(node instanceof Element)) {
    return [];
  }
  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const child of Array.from(node.childNodes)) {
    const childLines = splitForeignObjectText(child);
    for (const line of childLines) {
      if (line === "") {
        if (current.trim()) {
          lines.push(current.trim());
          current = "";
        }
        continue;
      }
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }
  return lines;
}

function linesFromForeignObject(foreignObject: SVGForeignObjectElement): string[] {
  const lines = Array.from(foreignObject.childNodes).flatMap((child) => splitForeignObjectText(child));
  return lines.map((line) => line.trim()).filter(Boolean);
}

function numericAttr(element: Element, name: string): number {
  const value = element.getAttribute(name);
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function replaceForeignObjectWithText(foreignObject: SVGForeignObjectElement): SVGTextElement {
  const width = numericAttr(foreignObject, "width");
  const height = numericAttr(foreignObject, "height");
  const x = numericAttr(foreignObject, "x") + width / 2;
  const y = numericAttr(foreignObject, "y") + height / 2;
  const lines = linesFromForeignObject(foreignObject);
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("class", "nodeLabel");
  text.setAttribute("data-mermaid-converted-label", "true");

  for (const [index, line] of lines.entries()) {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(x));
    tspan.setAttribute("text-anchor", "middle");
    tspan.setAttribute("data-mermaid-converted-label", "true");
    if (index === 0) {
      const offset = lines.length > 1 ? `${-0.6 * (lines.length - 1)}em` : "0";
      tspan.setAttribute("dy", offset);
    } else {
      tspan.setAttribute("dy", "1.2em");
    }
    tspan.textContent = line;
    text.appendChild(tspan);
  }

  foreignObject.replaceWith(text);
  return text;
}

function replaceForeignObjectsWithSvgText(svg: SVGElement): void {
  for (const foreignObject of Array.from(svg.querySelectorAll<SVGForeignObjectElement>("foreignObject"))) {
    replaceForeignObjectWithText(foreignObject);
  }
}

function removeEmptyStyleAttribute(element: Element): void {
  const style = element.getAttribute("style");
  if (style !== null && style.replace(/[;\s]/g, "") === "") {
    element.removeAttribute("style");
  }
}

function preserveConvertedLabelLayout(element: Element): void {
  if (element.getAttribute("data-mermaid-converted-label") !== "true") {
    return;
  }
  element.setAttribute("text-anchor", "middle");
  if (element.tagName.toLowerCase() === "text") {
    element.setAttribute("dominant-baseline", "middle");
  }
  element.removeAttribute("data-mermaid-converted-label");
}

export function inlineMermaidSvgElementStylesForWechat(svg: SVGElement, readStyle: StyleReader = defaultStyleReader): void {
  replaceForeignObjectsWithSvgText(svg);
  const elements = svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text,tspan");
  const entries = Array.from(elements).map((element) => ({
    element,
    snapshot: readStyle(element),
  }));

  svg.querySelectorAll("style").forEach((style) => style.remove());
  appendStyle(svg, "max-width: 100%;height: auto;");

  for (const {element, snapshot} of entries) {
    removeEmptyStyleAttribute(element);
    applyPresentationAttributes(element, snapshot);
    preserveConvertedLabelLayout(element);
  }
}

export function inlineMermaidSvgStylesForWechat(html: string, readStyle: StyleReader = defaultStyleReader): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  const charts = template.content.querySelectorAll<HTMLElement>("pre.mermaid");
  for (const chart of Array.from(charts)) {
    chart.removeAttribute("data-mermaid-source");
    chart.removeAttribute("data-mermaid-error");
    const svg = chart.querySelector<SVGElement>("svg");
    if (!svg) continue;
    inlineMermaidSvgElementStylesForWechat(svg, readStyle);
  }

  return template.innerHTML;
}
