type MathJaxDocument = {
  clear?: () => void;
};

type MathJaxApi = {
  startup?: {
    document?: MathJaxDocument;
  } & Record<string, unknown>;
  typesetClear?: (elements?: HTMLElement[]) => void;
  typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
};

declare global {
  interface Window {
    MathJax?: MathJaxApi & Record<string, unknown>;
  }
}

type MathJaxConfig = MathJaxApi & {
  startup: {
    typeset: false;
  };
  tex: {
    inlineMath: string[][];
    displayMath: string[][];
    processEscapes: boolean;
  };
  options: {
    enableMenu: false;
    enableAssistiveMml: false;
    menuOptions: {
      settings: Record<string, boolean>;
    };
  };
  svg: {
    fontCache: "none";
  };
};

let loadPromise: Promise<MathJaxApi> | undefined;
let idlePromise: Promise<void> = Promise.resolve();
let typesetQueue: Promise<void> = Promise.resolve();
let nextJobId = 0;
const rootJobIds = new WeakMap<HTMLElement, number>();

export function createMathJaxConfig(): MathJaxConfig {
  return {
    startup: {
      typeset: false,
    },
    tex: {
      inlineMath: [["$", "$"], ["\\(", "\\)"]],
      displayMath: [["$$", "$$"], ["\\[", "\\]"]],
      processEscapes: true,
    },
    options: {
      enableMenu: false,
      enableAssistiveMml: false,
      menuOptions: {
        settings: {
          enrich: false,
          speech: false,
          assistiveMml: false,
          collapsible: false,
          explorer: false,
        },
      },
    },
    svg: {
      fontCache: "none",
    },
  };
}

async function loadMathJax(): Promise<MathJaxApi> {
  if (!loadPromise) {
    window.MathJax = createMathJaxConfig();

    loadPromise = import("mathjax/es5/tex-svg.js").then(() => {
      if (!window.MathJax) {
        throw new Error("MathJax failed to initialize");
      }
      return window.MathJax;
    });
  }

  return loadPromise;
}

export function typesetMath(root: HTMLElement): Promise<void> {
  const currentJob = ++nextJobId;
  rootJobIds.set(root, currentJob);
  const job = typesetQueue.then(async () => {
    const mathJax = await loadMathJax();
    // 只淘汰同一个容器的旧任务。预览区和公式对话框可以同时排版，互不取消。
    if (rootJobIds.get(root) !== currentJob || !root.isConnected) {
      return;
    }

    mathJax.typesetClear?.([root]);
    mathJax.startup?.document?.clear?.();
    await mathJax.typesetPromise?.([root]);
    if (rootJobIds.get(root) === currentJob) rootJobIds.delete(root);
  });

  typesetQueue = job.catch(() => undefined);
  idlePromise = job;
  return job;
}

export function waitForMathJaxIdle(): Promise<void> {
  return idlePromise;
}
