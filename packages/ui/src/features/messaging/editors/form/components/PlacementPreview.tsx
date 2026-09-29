"use client";

import { Monitor, RotateCcw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../../../../components/ui/button";
import { FormRenderer } from "../../../components/forms/form-renderer";
import type {
  FormDevice,
  SignupFormDocument,
  StepKind,
} from "../../../contracts/signup-form-schema";
import { useEditorStore } from "../../../editor-store";

function ScaledViewport({
  children,
  className = "",
  height,
  label,
  width,
}: {
  children: ReactNode;
  className?: string;
  height: number;
  label: string;
  width: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const resize = () => setScale(frame.clientWidth / width);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      aria-label={label}
      className={`relative overflow-hidden bg-background ${className}`}
      ref={frameRef}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div
        className="origin-top-left"
        style={{ height, transform: `scale(${scale})`, width }}
      >
        {children}
      </div>
    </div>
  );
}

function StorefrontChrome({ device }: { device: FormDevice }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#f5f3ee]"
      aria-hidden="true"
    >
      <div
        className={`flex items-center border-b border-black/10 bg-white/90 ${
          device === "mobile" ? "h-16 px-5" : "h-20 px-8"
        }`}
      >
        <div className="h-2.5 w-16 rounded-full bg-black/80" />
        <div className="ml-auto flex gap-3">
          <div className="size-2.5 rounded-full bg-black/25" />
          <div className="size-2.5 rounded-full bg-black/25" />
        </div>
      </div>
      <div className={device === "mobile" ? "p-5" : "p-8"}>
        <div className="mb-4 h-3 w-2/5 rounded-full bg-black/15" />
        <div className="mb-7 h-2 w-3/5 rounded-full bg-black/10" />
        <div
          className={`grid gap-4 ${device === "mobile" ? "grid-cols-2" : "grid-cols-3"}`}
        >
          {Array.from({ length: device === "mobile" ? 4 : 6 }).map(
            (_, index) => (
              <div key={index}>
                <div className="aspect-[4/5] rounded-sm bg-black/10" />
                <div className="mt-3 h-2 w-3/4 rounded-full bg-black/10" />
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function PopupPlacement({
  device,
  document,
  email,
  formType,
  onEmailChange,
  onSubmit,
  step,
}: {
  device: FormDevice;
  document: SignupFormDocument;
  email: string;
  formType: "popup" | "flyout";
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  step: StepKind;
}) {
  const mobile = device === "mobile";
  const teaser = step === "teaser";
  const closeButtonDevices = document.targeting.close_button_devices ?? [
    "desktop",
    "mobile",
  ];
  const maxWidth = teaser
    ? 288
    : mobile
      ? formType === "flyout"
        ? "100%"
        : 340
      : (document.styles?.width ?? 480);
  const placement = mobile
    ? teaser
      ? "items-end justify-end p-4"
      : "items-end justify-center p-3"
    : teaser || formType === "flyout"
      ? "items-end justify-end p-4"
      : "items-center justify-center p-4";

  return (
    <>
      {formType === "popup" && !teaser ? (
        <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      ) : null}
      <div className={`absolute inset-0 z-10 flex ${placement}`}>
        <div className="relative w-full" style={{ maxWidth }}>
          <FormRenderer
            document={document}
            step={step}
            device={device}
            email={email}
            interactive={step === "opt_in"}
            onEmailChange={onEmailChange}
            onSubmit={onSubmit}
          />
          {!teaser && closeButtonDevices.includes(device) ? (
            <span
              aria-hidden="true"
              className="absolute right-2 top-1 z-10 flex size-11 items-center justify-center text-[2rem] font-light leading-none text-black"
            >
              ×
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PreviewStatus({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        enabled
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {enabled ? "Enabled" : "Not targeted"}
    </span>
  );
}

function placementLabel(
  device: FormDevice,
  formType: "popup" | "flyout",
  step: StepKind,
) {
  if (step === "teaser") return "Bottom-right teaser";
  if (device === "mobile") {
    return formType === "popup"
      ? "Bottom-anchored popup"
      : "Bottom-anchored flyout";
  }
  return formType === "popup" ? "Centered popup" : "Bottom-right flyout";
}

export function PlacementPreview() {
  const document = useEditorStore((state) => state.document);
  const formType = useEditorStore((state) => state.type);
  const editorStep = useEditorStore((state) => state.step);
  const [device, setDevice] = useState<FormDevice>("desktop");
  const [previewStep, setPreviewStep] = useState<StepKind>(editorStep);
  const [previewEmail, setPreviewEmail] = useState("");
  const placementType = formType === "flyout" ? "flyout" : "popup";
  const devices = document.targeting.devices ?? ["desktop", "mobile"];
  const position = placementLabel(device, placementType, previewStep);
  const changed = previewStep !== editorStep || previewEmail.length > 0;

  const reset = () => {
    setPreviewStep(editorStep);
    setPreviewEmail("");
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/40">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-64 flex-1">
          <h2 className="text-sm font-medium">Storefront preview</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Preview only—form submissions are simulated here and never sent to
            the live list.
          </p>
        </div>
        <div
          aria-label="Preview device"
          className="flex items-center rounded-md border border-border bg-background p-1"
          role="group"
        >
          <Button
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            size="sm"
            variant={device === "desktop" ? "default" : "ghost"}
          >
            <Monitor className="size-4" />
            Desktop
          </Button>
          <Button
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            size="sm"
            variant={device === "mobile" ? "default" : "ghost"}
          >
            <Smartphone className="size-4" />
            Mobile
          </Button>
        </div>
        {changed ? (
          <Button onClick={reset} size="sm" variant="outline">
            <RotateCcw className="size-4" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-2 flex items-center gap-2 text-xs">
            {device === "desktop" ? (
              <Monitor className="size-4" />
            ) : (
              <Smartphone className="size-4" />
            )}
            <span className="font-medium capitalize">{device}</span>
            <span className="text-muted-foreground">{position}</span>
            <span className="ml-auto">
              <PreviewStatus enabled={devices.includes(device)} />
            </span>
          </div>

          {device === "desktop" ? (
            <ScaledViewport
              className="w-full rounded-xl border border-border shadow-sm"
              height={900}
              label={`Desktop preview: ${position}`}
              width={1440}
            >
              <StorefrontChrome device="desktop" />
              <PopupPlacement
                device="desktop"
                document={document}
                email={previewEmail}
                formType={placementType}
                onEmailChange={setPreviewEmail}
                onSubmit={() => setPreviewStep("success")}
                step={previewStep}
              />
            </ScaledViewport>
          ) : (
            <div className="mx-auto w-fit">
              <div className="relative rounded-[2.75rem] bg-slate-950 p-2.5 shadow-xl ring-1 ring-black/20">
                <div
                  className="absolute left-1/2 top-2.5 z-30 h-2 w-20 -translate-x-1/2 rounded-full bg-slate-950"
                  aria-hidden="true"
                />
                <ScaledViewport
                  className="w-[270px] rounded-[2rem]"
                  height={667}
                  label={`Mobile preview: ${position}`}
                  width={375}
                >
                  <div className="relative size-full overflow-hidden">
                    <StorefrontChrome device="mobile" />
                    <PopupPlacement
                      device="mobile"
                      document={document}
                      email={previewEmail}
                      formType={placementType}
                      onEmailChange={setPreviewEmail}
                      onSubmit={() => setPreviewStep("success")}
                      step={previewStep}
                    />
                  </div>
                </ScaledViewport>
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                375 × 667 reference viewport
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
