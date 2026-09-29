"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { FormRenderer } from "../../../components/forms/form-renderer";
import { Button } from "../../../../../components/ui/button";
import { Label } from "../../../../../components/ui/label";
import { useEditorStore } from "../../../editor-store";

import { CodeEditor } from "./CodeEditor";

export function HtmlModeEditor() {
  const document = useEditorStore((s) => s.document);
  const setHtml = useEditorStore((s) => s.setHtml);
  const setCss = useEditorStore((s) => s.setCss);
  const regenerateHtml = useEditorStore((s) => s.regenerateHtml);
  const device = useEditorStore((s) => s.device);
  const setDevice = useEditorStore((s) => s.setDevice);
  const [showCss, setShowCss] = useState(Boolean(document.css));

  function regenerate() {
    if (
      !document.html?.trim() ||
      window.confirm(
        "Replace the HTML with markup generated from your visual blocks? Any hand edits will be lost.",
      )
    ) {
      regenerateHtml();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex max-h-[50%] w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-border p-4 lg:max-h-none lg:w-1/2 lg:border-b-0 lg:border-r">
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              HTML
            </Label>
            <button
              className="text-xs text-primary underline"
              onClick={regenerate}
            >
              Generate from blocks
            </button>
          </div>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            This form <strong>publishes its HTML</strong>. Include an{" "}
            <code className="rounded bg-muted px-1">
              &lt;input type=&quot;email&quot; name=&quot;email&quot;&gt;
            </code>{" "}
            and a submit button — the email is captured from the form on submit.
          </p>
          <CodeEditor
            value={document.html ?? ""}
            onChange={setHtml}
            height="360px"
          />
        </div>
        <div>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setShowCss((v) => !v)}
          >
            {showCss ? "Hide CSS" : "Add CSS"}
          </button>
          {showCss ? (
            <div className="mt-2">
              <CodeEditor
                value={document.css ?? ""}
                onChange={setCss}
                height="200px"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b border-border bg-card py-2">
          <Button
            size="icon-sm"
            variant={device === "desktop" ? "default" : "ghost"}
            onClick={() => setDevice("desktop")}
            title="Desktop preview"
          >
            <Monitor className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant={device === "mobile" ? "default" : "ghost"}
            onClick={() => setDevice("mobile")}
            title="Mobile preview"
          >
            <Smartphone className="size-4" />
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-8">
          <FormRenderer document={document} step="opt_in" device={device} />
        </div>
      </div>
    </div>
  );
}
