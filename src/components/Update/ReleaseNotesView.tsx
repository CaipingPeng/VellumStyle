import {useMemo} from "react";
import {render} from "../../markdown/parser.ts";

interface Props {
  markdown: string;
  className?: string;
}

export default function ReleaseNotesView({markdown, className = ""}: Props) {
  const html = useMemo(() => render(markdown), [markdown]);

  return (
    <div
      className={`update-release-notes ${className}`}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
