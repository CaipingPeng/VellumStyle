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
let jobId = 0;

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
  const currentJob = ++jobId;
  const job = typesetQueue.then(async () => {
    const mathJax = await loadMathJax();
    if (currentJob !== jobId || !root.isConnected) {
      return;
    }

    mathJax.typesetClear?.([root]);
    mathJax.startup?.document?.clear?.();
    await mathJax.typesetPromise?.([root]);
  });

  typesetQueue = job.catch(() => undefined);
  idlePromise = job;
  return job;
}

export function waitForMathJaxIdle(): Promise<void> {
  return idlePromise;
}
