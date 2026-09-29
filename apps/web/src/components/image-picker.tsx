"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { ErmesProvider } from "@ermes/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ermes/ui/components/ui/dialog";
import { Button } from "@ermes/ui/components/ui/button";
import { Input } from "@ermes/ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ermes/ui/components/ui/tabs";
import { MAX_IMAGE_BYTES, IMAGE_MIME_TYPES, type ImageAsset, type ImageLibraryPage } from "@ermes/core/assets";

async function imageResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not access your images.");
  return data;
}

export function StandaloneErmesProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolvePicker = useRef<((url: string | undefined) => void) | null>(null);
  const pickImage = useCallback(() => new Promise<string | undefined>(resolve => {
    resolvePicker.current?.(undefined);
    resolvePicker.current = resolve;
    setOpen(true);
  }), []);
  const host = useMemo(() => ({ apiBase: "/api/admin", pickImage }), [pickImage]);
  const finish = (url?: string) => {
    resolvePicker.current?.(url);
    resolvePicker.current = null;
    setOpen(false);
  };
  useEffect(() => () => { resolvePicker.current?.(undefined); }, []);
  return (
    <ErmesProvider host={host}>
      {children}
      {open && <ImagePicker onFinish={finish} />}
    </ErmesProvider>
  );
}

function ImagePicker({ onFinish }: { onFinish: (url?: string) => void }) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState({ search: "", offset: 0 });
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<ImageAsset | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ search: query.search, offset: String(query.offset) });
      fetch(`/api/assets?${params}`, { signal: controller.signal, credentials: "same-origin" })
        .then(imageResponse<ImageLibraryPage>)
        .then(page => {
          if (controller.signal.aborted) return;
          setAssets(current => query.offset ? [...current, ...page.assets] : page.assets);
          setNextOffset(page.nextOffset);
          setConfigured(page.configured);
        })
        .catch(reason => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your images.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query.search ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, retry]);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(files: FileList | null) {
    setError("");
    setFile(null);
    if (!files?.length) return;
    if (files.length !== 1) { setError("Choose one image at a time."); return; }
    const chosen = files[0];
    if (!IMAGE_MIME_TYPES.includes(chosen.type as typeof IMAGE_MIME_TYPES[number])) {
      setError("Choose a JPEG, PNG, GIF or WebP image."); return;
    }
    if (!chosen.size || chosen.size > MAX_IMAGE_BYTES) {
      setError("Choose a non-empty image, 10 MB or smaller."); return;
    }
    setFile(chosen);
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      const asset = await imageResponse<ImageAsset>(await fetch("/api/assets/upload", {
        method: "POST", body: form, credentials: "same-origin",
      }));
      onFinish(asset.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload the image.");
    } finally { setUploading(false); }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !uploading) onFinish(); }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!uploading}>
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Upload an image or reuse one from your library.</DialogDescription>
        </DialogHeader>
        {configured === false && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            Connect Cloudinary to upload images. You can still use saved images or paste an image URL in the editor.
            <Link className="mt-2 block font-medium underline" href="/onboarding?step=images">Set up image storage →</Link>
          </div>
        )}
        <Tabs defaultValue="library">
          <TabsList className="w-full">
            <TabsTrigger value="library" disabled={uploading}>Image library</TabsTrigger>
            <TabsTrigger value="upload" disabled={uploading}>Upload image</TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="space-y-4">
            <Input aria-label="Search images" placeholder="Search by filename…" value={query.search} maxLength={200}
              onChange={event => {
                setSelected(null); setAssets([]); setNextOffset(null);
                setQuery({ search: event.target.value, offset: 0 });
              }} />
            <div className="max-h-[45vh] overflow-y-auto" aria-busy={loading}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {assets.map(asset => (
                  <button key={asset.id} type="button" aria-pressed={selected?.id === asset.id}
                    aria-label={`Select ${asset.filename}`} onClick={() => setSelected(asset)}
                    className={`overflow-hidden rounded-md border text-left focus-visible:outline-2 focus-visible:outline-ring ${selected?.id === asset.id ? "border-primary ring-2 ring-primary" : "hover:border-primary/50"}`}>
                    {/* Public Cloudinary URLs also work outside the authenticated workspace. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt="" loading="lazy" className="aspect-square w-full bg-muted object-contain" />
                    <span className="block truncate px-2 pt-2 text-sm" title={asset.filename}>{asset.filename}</span>
                    <span className="block px-2 pb-2 text-xs text-muted-foreground">{asset.width} × {asset.height}</span>
                  </button>
                ))}
              </div>
              {!loading && !assets.length && !error && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <ImagePlus className="mx-auto mb-3 size-8" />
                  {query.search ? "No images match your search." : "Your image library is empty. Upload your first image to get started."}
                </div>
              )}
              {loading && <p role="status" className="py-4 text-center text-sm text-muted-foreground">Loading images…</p>}
              {nextOffset !== null && <Button variant="outline" className="mt-3 w-full" disabled={loading}
                onClick={() => setQuery(current => ({ ...current, offset: nextOffset }))}>Load more</Button>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onFinish()}>Cancel</Button>
              <Button disabled={!selected} onClick={() => selected && onFinish(selected.url)}>Use image</Button>
            </div>
          </TabsContent>
          <TabsContent value="upload" className="space-y-4">
            <input ref={input} type="file" accept={IMAGE_MIME_TYPES.join(",")} className="sr-only" tabIndex={-1}
              aria-label="Image file" disabled={!configured || uploading}
              onChange={event => { chooseFile(event.target.files); event.target.value = ""; }} />
            <button type="button" disabled={!configured || uploading} onClick={() => input.current?.click()}
              onDragOver={event => { event.preventDefault(); if (configured && !uploading) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => { event.preventDefault(); setDragging(false); if (configured && !uploading) chooseFile(event.dataTransfer.files); }}
              className={`flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-sm disabled:opacity-50 ${dragging ? "border-primary bg-muted" : "border-border"}`}>
              {preview ? <img src={preview} alt="Selected image preview" className="max-h-44 max-w-full object-contain" /> : <Upload className="size-8 text-muted-foreground" />}
              <span className="max-w-full truncate">{file ? file.name : "Drop an image here, or click to choose"}</span>
              <span className="text-xs text-muted-foreground">JPEG, PNG, GIF or WebP · Up to 10 MB</span>
            </button>
            <p className="text-xs text-muted-foreground">Uploaded images have public URLs so they can appear in forms and emails.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={uploading} onClick={() => onFinish()}>Cancel</Button>
              <Button disabled={!configured || !file || uploading} onClick={() => void upload()}>
                {uploading ? "Uploading…" : "Upload and use"}
              </Button>
            </div>
            {uploading && <p role="status" className="text-sm text-muted-foreground">Uploading your image…</p>}
          </TabsContent>
        </Tabs>
        {error && <div role="alert" className="text-sm text-destructive">{error}
          {configured === null && <Button className="ml-2" size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
