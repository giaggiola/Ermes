"use client";

import { html } from "@codemirror/lang-html";
import CodeMirror from "@uiw/react-codemirror";

export function CodeEditor({
  value,
  onChange,
  height = "300px",
}: {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border text-[13px]">
      <CodeMirror
        value={value}
        height={height}
        extensions={[html()]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
        }}
      />
    </div>
  );
}
