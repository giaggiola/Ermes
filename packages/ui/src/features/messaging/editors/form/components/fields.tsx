"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";

import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Label } from "../../../../../components/ui/label";
import { useErmesHost } from "../../../../../host";

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group border-t pt-4 first:border-t-0 first:pt-0"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Field label={label}>
      <Input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-9"
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: number;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        className="h-9"
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const { pickImage } = useErmesHost();
  async function choose() {
    if (!pickImage) return;
    setUploading(true);
    try {
      const url = await pickImage();
      if (url) onChange(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not choose image",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          value={value ?? ""}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-9"
        />
        {pickImage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => void choose()}
          >
            {uploading ? "…" : "Choose"}
          </Button>
        )}
      </div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="mt-1 h-16 w-full rounded-md border object-cover"
        />
      ) : null}
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="size-9 shrink-0 rounded-md border bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:10px_10px]"
          aria-label="Pick color"
        >
          <span
            className="block size-full rounded-[5px]"
            style={{ background: value || "transparent" }}
          />
        </button>
        <Input
          value={value ?? ""}
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-9"
        />
      </div>
      {open ? (
        <div className="relative">
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 rounded-md border bg-popover p-2 shadow-md">
            <HexColorPicker color={value || "#000000"} onChange={onChange} />
          </div>
        </div>
      ) : null}
    </Field>
  );
}
