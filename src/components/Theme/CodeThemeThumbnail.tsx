import {useEffect, useMemo} from "react";
import {buildCodeThemeCss, type CodeTheme} from "../../markdown/codeThemes.ts";
import {scopeCss} from "./scopeCss.ts";

interface Props {
  theme: CodeTheme;
}

const THUMB_STYLE_ID = "code-theme-thumbnails";
const thumbBlocks = new Map<string, string>();

const SAMPLE_HTML = `<pre class="custom"><code class="hljs"><span class="hljs-keyword">function</span> <span class="hljs-title function_">formatTitle</span>(<span class="hljs-params">name, count = <span class="hljs-number">1</span></span>) {
  <span class="hljs-keyword">const</span> label = <span class="hljs-string">\`Hello, \${name}\`</span>;
  <span class="hljs-comment">// preview</span>
  <span class="hljs-keyword">return</span> label.<span class="hljs-title function_">repeat</span>(count);
}</code></pre>`;

function flushThumbStyles() {
  const tag = document.getElementById(THUMB_STYLE_ID);
  if (tag) tag.innerHTML = Array.from(thumbBlocks.values()).join("\n");
}

export default function CodeThemeThumbnail({theme}: Props) {
  const scopeClass = useMemo(() => "ct-" + theme.id.replace(/[^a-zA-Z0-9_-]/g, "-"), [theme.id]);
  const scoped = useMemo(() => scopeCss(buildCodeThemeCss(theme.id), scopeClass), [scopeClass, theme.id]);

  useEffect(() => {
    thumbBlocks.set(scopeClass, scoped);
    flushThumbStyles();
    return () => {
      thumbBlocks.delete(scopeClass);
      flushThumbStyles();
    };
  }, [scopeClass, scoped]);

  return (
    <div className={scopeClass} style={{height: 118, overflow: "hidden", borderRadius: 4}}>
      <div
        style={{
          width: "150%",
          transform: "scale(0.67)",
          transformOrigin: "top left",
        }}
        dangerouslySetInnerHTML={{__html: SAMPLE_HTML}}
      />
    </div>
  );
}
