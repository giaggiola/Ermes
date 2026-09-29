export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export interface ImageAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface ImageLibraryPage {
  assets: ImageAsset[];
  nextOffset: number | null;
  configured: boolean;
}
