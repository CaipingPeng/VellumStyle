const MERMAID_SELECTOR = 'pre.mermaid[data-mermaid-source="true"]';

type MermaidRenderer = typeof import("mermaid").default;

let mermaidLoader: Promise<MermaidRenderer> | null = null;
let renderCounter = 0;

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
        element.classList.remove("mermaid-error");
        element.innerHTML = svg;
      } catch (error) {
        markError(element, error);
      }
    }),
  );
}
