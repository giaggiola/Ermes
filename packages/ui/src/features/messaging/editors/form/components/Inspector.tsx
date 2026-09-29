"use client";

import type {
  BlockStyles,
  FormDevice,
  FormDisplayTrigger,
} from "../../../contracts/signup-form-schema";

import { Label } from "../../../../../components/ui/label";
import { Switch } from "../../../../../components/ui/switch";
import { Textarea } from "../../../../../components/ui/textarea";
import { useEditorStore } from "../../../editor-store";

import { CodeEditor } from "./CodeEditor";
import {
  ColorField,
  Field,
  ImageUploadField,
  NumberField,
  Section,
  SelectField,
  TextField,
} from "./fields";

const FONT_OPTIONS = [
  { value: "", label: "Default" },
  { value: "system-ui, sans-serif", label: "System" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: '"Times New Roman", serif', label: "Times" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: '"Courier New", monospace', label: "Mono" },
];

function FontField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <SelectField
      label="Font"
      value={value ?? ""}
      options={FONT_OPTIONS}
      onChange={(v) => onChange(v || undefined)}
    />
  );
}

function TypographySection({
  id,
  styles,
  withColor = true,
}: {
  id: string;
  styles: BlockStyles;
  withColor?: boolean;
}) {
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const set = (patch: Partial<BlockStyles>) => updateBlockStyle(id, patch);
  return (
    <Section title="Typography">
      <FontField
        value={styles.fontFamily}
        onChange={(v) => set({ fontFamily: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Size"
          value={styles.fontSize}
          onChange={(v) => set({ fontSize: v })}
        />
        <SelectField
          label="Weight"
          value={styles.fontWeight ?? "normal"}
          options={[
            { value: "normal", label: "Normal" },
            { value: "medium", label: "Medium" },
            { value: "bold", label: "Bold" },
          ]}
          onChange={(v) => set({ fontWeight: v })}
        />
        <NumberField
          label="Line height"
          value={styles.lineHeight}
          placeholder="1.4"
          onChange={(v) => set({ lineHeight: v })}
        />
        <NumberField
          label="Letter spacing"
          value={styles.letterSpacing}
          onChange={(v) => set({ letterSpacing: v })}
        />
        <SelectField
          label="Align"
          value={styles.align ?? "center"}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(v) => set({ align: v })}
        />
        {withColor ? (
          <ColorField
            label="Color"
            value={styles.color}
            onChange={(v) => set({ color: v })}
          />
        ) : null}
      </div>
    </Section>
  );
}

function SpacingSection({ id, styles }: { id: string; styles: BlockStyles }) {
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const set = (patch: Partial<BlockStyles>) => updateBlockStyle(id, patch);
  return (
    <Section title="Spacing">
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Padding X"
          value={styles.paddingX}
          onChange={(v) => set({ paddingX: v })}
        />
        <NumberField
          label="Padding Y"
          value={styles.paddingY}
          onChange={(v) => set({ paddingY: v })}
        />
        <NumberField
          label="Margin top"
          value={styles.marginTop}
          onChange={(v) => set({ marginTop: v })}
        />
        <NumberField
          label="Margin bottom"
          value={styles.marginBottom}
          onChange={(v) => set({ marginBottom: v })}
        />
      </div>
    </Section>
  );
}

function BlockSettings() {
  const document = useEditorStore((s) => s.document);
  const step = useEditorStore((s) => s.step);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const setBlockCode = useEditorStore((s) => s.setBlockCode);

  const block = document.steps
    .find((s) => s.kind === step)
    ?.blocks.find((b) => b.id === selectedBlockId);
  if (!block) return null;
  const styles = block.styles ?? {};
  const setStyle = (patch: Partial<BlockStyles>) =>
    updateBlockStyle(block.id, patch);

  return (
    <div className="space-y-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground capitalize">
        {block.type.replace("_", " ")}
      </Label>

      {/* Content */}
      {block.type === "html" ? (
        <Section title="HTML">
          <CodeEditor
            value={block.text ?? ""}
            onChange={(v) => setBlockCode(block.id, v)}
            height="260px"
          />
        </Section>
      ) : block.type === "image" ? (
        <Section title="Content">
          <ImageUploadField
            label="Image"
            value={block.src}
            onChange={(v) => updateBlock(block.id, { src: v })}
          />
          <TextField
            label="Alt text"
            value={block.text}
            onChange={(v) => updateBlock(block.id, { text: v })}
          />
          <TextField
            label="Link (optional)"
            value={styles.href}
            placeholder="https://…"
            onChange={(v) => setStyle({ href: v })}
          />
        </Section>
      ) : block.type !== "divider" && block.type !== "spacer" ? (
        <Section title="Content">
          <TextField
            label={
              block.type === "email_input" || block.type === "name_field"
                ? "Placeholder"
                : block.type === "consent"
                  ? "Consent text"
                  : "Text"
            }
            value={block.text}
            onChange={(v) => updateBlock(block.id, { text: v })}
          />
        </Section>
      ) : null}

      {(block.type === "heading" || block.type === "text") && (
        <TypographySection id={block.id} styles={styles} />
      )}

      {block.type === "button" && (
        <>
          <TypographySection id={block.id} styles={styles} withColor={false} />
          <Section title="Appearance">
            <ColorField
              label="Text color"
              value={styles.color}
              onChange={(v) => setStyle({ color: v })}
            />
            <ColorField
              label="Background"
              value={styles.background}
              onChange={(v) => setStyle({ background: v })}
            />
            <ColorField
              label="Hover background"
              value={styles.hoverBackground}
              onChange={(v) => setStyle({ hoverBackground: v })}
            />
            <NumberField
              label="Corner radius"
              value={styles.radius}
              onChange={(v) => setStyle({ radius: v })}
            />
          </Section>
        </>
      )}

      {(block.type === "email_input" || block.type === "name_field") && (
        <Section title="Appearance">
          <FontField
            value={styles.fontFamily}
            onChange={(v) => setStyle({ fontFamily: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Border width"
              value={styles.borderWidth}
              onChange={(v) => setStyle({ borderWidth: v })}
            />
            <NumberField
              label="Corner radius"
              value={styles.radius}
              onChange={(v) => setStyle({ radius: v })}
            />
          </div>
          <ColorField
            label="Border color"
            value={styles.borderColor}
            onChange={(v) => setStyle({ borderColor: v })}
          />
        </Section>
      )}

      {block.type === "consent" && (
        <Section title="Appearance">
          <FontField
            value={styles.fontFamily}
            onChange={(v) => setStyle({ fontFamily: v })}
          />
          <ColorField
            label="Text color"
            value={styles.color}
            onChange={(v) => setStyle({ color: v })}
          />
        </Section>
      )}

      {block.type === "image" && (
        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Height (px)"
              value={styles.height}
              placeholder="auto"
              onChange={(v) => setStyle({ height: v })}
            />
            <NumberField
              label="Corner radius"
              value={styles.radius}
              onChange={(v) => setStyle({ radius: v })}
            />
          </div>
          <SelectField
            label="Fit"
            value={styles.objectFit ?? "cover"}
            options={[
              { value: "cover", label: "Cover" },
              { value: "contain", label: "Contain" },
            ]}
            onChange={(v) => setStyle({ objectFit: v })}
          />
        </Section>
      )}

      {(block.type === "divider" || block.type === "spacer") && (
        <Section title="Appearance">
          <NumberField
            label={block.type === "spacer" ? "Height (px)" : "Spacing (px)"}
            value={styles.size}
            onChange={(v) => setStyle({ size: v })}
          />
          {block.type === "divider" ? (
            <>
              <NumberField
                label="Line width"
                value={styles.borderWidth}
                onChange={(v) => setStyle({ borderWidth: v })}
              />
              <ColorField
                label="Line color"
                value={styles.borderColor}
                onChange={(v) => setStyle({ borderColor: v })}
              />
            </>
          ) : null}
        </Section>
      )}

      {block.type !== "spacer" &&
        block.type !== "divider" &&
        block.type !== "html" && (
          <SpacingSection id={block.id} styles={styles} />
        )}

      <Section title="Visibility">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!styles.hideOnDesktop}
            onCheckedChange={(c) => setStyle({ hideOnDesktop: c })}
          />
          <Label className="text-xs">Hide on desktop</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!styles.hideOnMobile}
            onCheckedChange={(c) => setStyle({ hideOnMobile: c })}
          />
          <Label className="text-xs">Hide on mobile</Label>
        </div>
      </Section>
    </div>
  );
}

function FormDesignSettings() {
  const document = useEditorStore((s) => s.document);
  const setStyles = useEditorStore((s) => s.setStyles);
  const styles = document.styles ?? {};

  return (
    <div className="space-y-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Form design
      </Label>

      <Section title="Layout">
        <NumberField
          label="Maximum width (px)"
          value={styles.width}
          placeholder="480"
          onChange={(v) => setStyles({ width: v ?? 480 })}
        />
        <p className="text-xs text-muted-foreground">
          The form shrinks responsively below this maximum.
        </p>
        <ImageUploadField
          label="Side image"
          value={styles.image_url ?? undefined}
          onChange={(v) => setStyles({ image_url: v ?? null })}
        />
        {styles.image_url ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={styles.image_on_mobile === true}
              onCheckedChange={(checked) =>
                setStyles({ image_on_mobile: checked })
              }
            />
            <Label className="text-xs">
              Show image above the form on mobile
            </Label>
          </div>
        ) : null}
        <ColorField
          label="Background"
          value={styles.background}
          onChange={(v) => setStyles({ background: v })}
        />
      </Section>

      <Section title="Brand theme" defaultOpen={false}>
        <SelectField
          label="Font"
          value={styles.fontFamily ?? ""}
          options={FONT_OPTIONS}
          onChange={(v) => setStyles({ fontFamily: v || undefined })}
        />
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="Text color"
            value={styles.textColor}
            onChange={(v) => setStyles({ textColor: v })}
          />
          <ColorField
            label="Heading color"
            value={styles.headingColor}
            onChange={(v) => setStyles({ headingColor: v })}
          />
          <ColorField
            label="Button bg"
            value={styles.buttonBackground}
            onChange={(v) => setStyles({ buttonBackground: v })}
          />
          <ColorField
            label="Button text"
            value={styles.buttonColor}
            onChange={(v) => setStyles({ buttonColor: v })}
          />
        </div>
        <NumberField
          label="Button radius"
          value={styles.buttonRadius}
          onChange={(v) => setStyles({ buttonRadius: v })}
        />
      </Section>
    </div>
  );
}

function DisplaySettingsContent() {
  const targeting = useEditorStore((s) => s.document.targeting);
  const formType = useEditorStore((s) => s.type);
  const setType = useEditorStore((s) => s.setType);
  const setTargeting = useEditorStore((s) => s.setTargeting);
  const triggers = targeting.triggers?.length
    ? targeting.triggers
    : [targeting.trigger ?? "time"];
  const devices = targeting.devices ?? ["desktop", "mobile"];
  const closeButtonDevices = targeting.close_button_devices ?? [
    "desktop",
    "mobile",
  ];
  const outsideDismissDevices = targeting.dismiss_on_outside_devices ?? [
    "desktop",
    "mobile",
  ];

  const toggleTrigger = (trigger: FormDisplayTrigger, checked: boolean) => {
    const next = checked
      ? [...new Set([...triggers, trigger])]
      : triggers.filter((candidate) => candidate !== trigger);
    if (next.length) {
      setTargeting({ trigger: undefined, triggers: next });
    }
  };

  const toggleDevice = (device: FormDevice, checked: boolean) => {
    const next = checked
      ? [...new Set([...devices, device])]
      : devices.filter((candidate) => candidate !== device);
    if (next.length) {
      setTargeting({ devices: next });
    }
  };

  const toggleDismissDevice = (
    key: "close_button_devices" | "dismiss_on_outside_devices",
    current: FormDevice[],
    device: FormDevice,
    checked: boolean,
  ) => {
    setTargeting({
      [key]: checked
        ? [...new Set([...current, device])]
        : current.filter((candidate) => candidate !== device),
    });
  };

  return (
    <div className="space-y-4">
      <Section title="Placement">
        <SelectField
          label="Form type"
          value={formType}
          options={[
            { value: "popup", label: "Popup" },
            { value: "flyout", label: "Flyout" },
          ]}
          onChange={(value) => setType(value)}
        />
        <p className="text-xs text-muted-foreground">
          Popups appear over the page. Flyouts attach to a viewport edge.
        </p>
      </Section>

      <Section title="Display timing">
        <p className="text-xs text-muted-foreground">
          Select one or more conditions that can open the form.
        </p>
        <div className="flex items-center gap-2">
          <Switch
            checked={triggers.includes("time")}
            onCheckedChange={(checked) => toggleTrigger("time", checked)}
          />
          <Label className="text-xs">After a time delay</Label>
        </div>
        {triggers.includes("time") ? (
          <NumberField
            label="Delay (seconds)"
            value={targeting.delay_ms / 1000}
            onChange={(value) =>
              setTargeting({ delay_ms: Math.max(0, value ?? 0) * 1000 })
            }
          />
        ) : null}
        <div className="flex items-center gap-2">
          <Switch
            checked={triggers.includes("scroll")}
            onCheckedChange={(checked) => toggleTrigger("scroll", checked)}
          />
          <Label className="text-xs">After scrolling</Label>
        </div>
        {triggers.includes("scroll") ? (
          <NumberField
            label="Scroll depth (%)"
            value={targeting.scroll_percent}
            placeholder="50"
            onChange={(value) => setTargeting({ scroll_percent: value })}
          />
        ) : null}
        <div className="flex items-center gap-2">
          <Switch
            checked={triggers.includes("exit_intent")}
            onCheckedChange={(checked) => toggleTrigger("exit_intent", checked)}
          />
          <Label className="text-xs">On exit intent</Label>
        </div>
        {triggers.length > 1 ? (
          <SelectField
            label="When multiple conditions are selected"
            value={targeting.trigger_match ?? "any"}
            options={[
              { value: "any", label: "Show when any condition is met" },
              { value: "all", label: "Wait until all conditions are met" },
            ]}
            onChange={(value) => setTargeting({ trigger_match: value })}
          />
        ) : null}
      </Section>

      <Section title="Frequency" defaultOpen={false}>
        <NumberField
          label="Show again after closing (days)"
          value={targeting.cooldown_days}
          onChange={(value) =>
            setTargeting({ cooldown_days: Math.max(0, value ?? 0) })
          }
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={targeting.hide_after_submit !== false}
            onCheckedChange={(checked) =>
              setTargeting({ hide_after_submit: checked })
            }
          />
          <Label className="text-xs">
            Don&apos;t show again after this browser submits
          </Label>
        </div>
      </Section>

      <Section title="Dismissal" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          Configure the visible close controls separately for desktop and
          mobile. Escape always closes an open form for keyboard users.
        </p>
        <div className="flex items-center gap-2">
          <Switch
            checked={closeButtonDevices.includes("desktop")}
            onCheckedChange={(checked) =>
              toggleDismissDevice(
                "close_button_devices",
                closeButtonDevices,
                "desktop",
                checked,
              )
            }
          />
          <Label className="text-xs">Show X on desktop</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={closeButtonDevices.includes("mobile")}
            onCheckedChange={(checked) =>
              toggleDismissDevice(
                "close_button_devices",
                closeButtonDevices,
                "mobile",
                checked,
              )
            }
          />
          <Label className="text-xs">Show X on mobile</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={outsideDismissDevices.includes("desktop")}
            disabled={formType !== "popup"}
            onCheckedChange={(checked) =>
              toggleDismissDevice(
                "dismiss_on_outside_devices",
                outsideDismissDevices,
                "desktop",
                checked,
              )
            }
          />
          <Label className="text-xs">Click outside to close on desktop</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={outsideDismissDevices.includes("mobile")}
            disabled={formType !== "popup"}
            onCheckedChange={(checked) =>
              toggleDismissDevice(
                "dismiss_on_outside_devices",
                outsideDismissDevices,
                "mobile",
                checked,
              )
            }
          />
          <Label className="text-xs">Tap outside to close on mobile</Label>
        </div>
        {formType !== "popup" ? (
          <p className="text-xs text-muted-foreground">
            Outside-click dismissal only applies to popups because flyouts have
            no backdrop.
          </p>
        ) : null}
      </Section>

      <Section title="Devices & visitors" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <Switch
            checked={devices.includes("desktop")}
            onCheckedChange={(checked) => toggleDevice("desktop", checked)}
          />
          <Label className="text-xs">Show on desktop</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={devices.includes("mobile")}
            onCheckedChange={(checked) => toggleDevice("mobile", checked)}
          />
          <Label className="text-xs">Show on mobile</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={targeting.hide_when_logged_in}
            onCheckedChange={(checked) =>
              setTargeting({ hide_when_logged_in: checked })
            }
          />
          <Label className="text-xs">Hide from logged-in customers</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Duplicate a block and use its Visibility settings for different
          desktop and mobile content.
        </p>
      </Section>

      <Section title="Page targeting" defaultOpen={false}>
        <Field label="Show only on paths (one per line; blank = all)">
          <Textarea
            rows={3}
            className="font-mono text-xs"
            value={(targeting.page_paths ?? []).join("\n")}
            placeholder={"/products\n/collections"}
            onChange={(e) =>
              setTargeting({
                page_paths: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Never show on paths (one per line)">
          <Textarea
            rows={3}
            className="font-mono text-xs"
            value={(targeting.excluded_page_paths ?? []).join("\n")}
            placeholder={"/cart\n/checkouts\n/policies"}
            onChange={(event) =>
              setTargeting({
                excluded_page_paths: event.target.value
                  .split("\n")
                  .map((path) => path.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </Section>
    </div>
  );
}

export function DesignInspector() {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  return (
    <div className="mt-5 border-t pt-5">
      {selectedBlockId ? <BlockSettings /> : <FormDesignSettings />}
    </div>
  );
}

export function DisplaySettings() {
  return (
    <aside className="max-h-[48%] w-full shrink-0 overflow-y-auto border-b border-border bg-card p-4 lg:max-h-none lg:w-96 lg:border-b-0 lg:border-r">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Display &amp; targeting
      </Label>
      <div className="mt-4">
        <DisplaySettingsContent />
      </div>
    </aside>
  );
}
