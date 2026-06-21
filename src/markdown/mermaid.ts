import {getCodeMirrorCspNonce} from "../utils/cspNonce.ts";

const MERMAID_SELECTOR = 'pre.mermaid[data-mermaid-source="true"]';
const MERMAID_RENDERED_SOURCE_ATTR = "data-mermaid-rendered-source";
const MERMAID_RUNTIME_STYLE_ATTR = "data-vellumstyle-mermaid-style";

type MermaidRenderer = typeof import("mermaid").default;

let mermaidLoader: Promise<MermaidRenderer> | null = null;
let renderCounter = 0;

function mountedMermaidStyle(id: string): HTMLStyleElement | null {
  return (
    Array.from(document.head.querySelectorAll<HTMLStyleElement>(`style[${MERMAID_RUNTIME_STYLE_ATTR}]`)).find(
      (style) => style.getAttribute(MERMAID_RUNTIME_STYLE_ATTR) === id,
    ) ?? null
  );
}

function createMermaidStyle(id: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.setAttribute(MERMAID_RUNTIME_STYLE_ATTR, id);
  const nonce = getCodeMirrorCspNonce();
  if (nonce) {
    style.nonce = nonce;
  }
  document.head.appendChild(style);
  return style;
}

export function mountMermaidSvgStylesForRuntime(svg: SVGElement): void {
  const id = svg.id;
  const styleText = svg.querySelector("style")?.textContent;
  if (!id || !styleText) {
    return;
  }

  const style = mountedMermaidStyle(id) ?? createMermaidStyle(id);
  style.textContent = styleText;
}

export function cleanupMermaidSvgStylesForRuntime(root: ParentNode = document): void {
  const activeIds = new Set(
    Array.from(root.querySelectorAll<SVGElement>("pre.mermaid svg[id]"))
      .map((svg) => svg.id)
      .filter(Boolean),
  );
  for (const style of Array.from(document.head.querySelectorAll<HTMLStyleElement>(`style[${MERMAID_RUNTIME_STYLE_ATTR}]`))) {
    const id = style.getAttribute(MERMAID_RUNTIME_STYLE_ATTR);
    if (!id || !activeIds.has(id)) {
      style.remove();
    }
  }
}

async function loadMermaid(): Promise<MermaidRenderer> {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then(({default: mermaid}) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        htmlLabels: false,
        flowchart: {
          htmlLabels: false,
        },
      });
      return mermaid;
    });
  }
  return mermaidLoader;
}

function markError(element: HTMLElement, error: unknown): void {
  element.classList.add("mermaid-error");
  element.setAttribute("data-mermaid-error", error instanceof Error ? error.message : String(error));
  element.removeAttribute(MERMAID_RENDERED_SOURCE_ATTR);
}

interface RenderedMermaidChart {
  source: string;
  html: string;
}

function renderedMermaidCharts(root: ParentNode): RenderedMermaidChart[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`pre.mermaid[${MERMAID_RENDERED_SOURCE_ATTR}]`))
    .filter((element) => element.querySelector("svg"))
    .map((element) => ({
      source: element.getAttribute(MERMAID_RENDERED_SOURCE_ATTR) ?? "",
      html: element.innerHTML,
    }))
    .filter((chart) => chart.source);
}

export function reuseRenderedMermaidCharts(html: string, previousRoot: ParentNode | null): string {
  if (!previousRoot || !html.includes("data-mermaid-source")) {
    return html;
  }

  const available = new Map<string, RenderedMermaidChart[]>();
  for (const chart of renderedMermaidCharts(previousRoot)) {
    const charts = available.get(chart.source) ?? [];
    charts.push(chart);
    available.set(chart.source, charts);
  }
  if (available.size === 0) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const element of Array.from(template.content.querySelectorAll<HTMLElement>(MERMAID_SELECTOR))) {
    const source = element.textContent ?? "";
    const reusable = available.get(source)?.shift();
    if (!reusable) {
      continue;
    }
    element.removeAttribute("data-mermaid-source");
    element.removeAttribute("data-mermaid-error");
    element.setAttribute(MERMAID_RENDERED_SOURCE_ATTR, source);
    element.innerHTML = reusable.html;
  }

  return template.innerHTML;
}

export async function renderMermaidCharts(root: ParentNode): Promise<void> {
  const charts = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR));
  if (charts.length === 0) {
    return;
  }

  const mermaid = await loadMermaid();
  await Promise.all(
    charts.map(async (element) => {
      const source = element.textContent ?? "";
      const id = `mermaid-${Date.now()}-${renderCounter++}`;
      try {
        const {svg} = await mermaid.render(id, source);
        element.removeAttribute("data-mermaid-source");
        element.removeAttribute("data-mermaid-error");
        element.setAttribute(MERMAID_RENDERED_SOURCE_ATTR, source);
        element.classList.remove("mermaid-error");
        element.innerHTML = svg;
        const renderedSvg = element.querySelector<SVGElement>("svg");
        if (renderedSvg) {
          mountMermaidSvgStylesForRuntime(renderedSvg);
        }
      } catch (error) {
        markError(element, error);
      }
    }),
  );
  cleanupMermaidSvgStylesForRuntime(root);
}
