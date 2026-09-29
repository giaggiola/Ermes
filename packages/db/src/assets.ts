import type { ImageAsset } from "@ermes/core/assets";
import { getPool } from "./client.js";

export type NewImageAsset = Omit<ImageAsset, "createdAt"> & {
  cloudName: string;
  publicId: string;
};

const columns = `id, url, filename, mime_type AS "mimeType", bytes, width, height,
  created_at AS "createdAt"`;

export async function saveImageAsset(asset: NewImageAsset): Promise<ImageAsset> {
  const { rows } = await getPool().query(
    `INSERT INTO ermes_image_asset
      (id, cloud_name, public_id, url, filename, mime_type, bytes, width, height)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,
    [asset.id, asset.cloudName, asset.publicId, asset.url, asset.filename,
      asset.mimeType, asset.bytes, asset.width, asset.height],
  );
  return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
}

export async function listImageAssets(search = "", offset = 0) {
  const limit = 40;
  const term = search.slice(0, 200).replace(/[\\%_]/g, "\\$&");
  const { rows } = await getPool().query(
    `SELECT ${columns} FROM ermes_image_asset WHERE filename ILIKE $1
     ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [`%${term}%`, limit + 1, offset],
  );
  return {
    assets: rows.slice(0, limit).map(row => ({
      ...row, createdAt: row.createdAt.toISOString(),
    })) as ImageAsset[],
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}
