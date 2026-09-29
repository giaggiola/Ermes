import { adminFetch } from "./admin-api";
import type { EmailTemplate, SignupForm } from "./admin-types";

interface ExportFile {
  contents: string;
  path: string;
}

interface ExportResult {
  filename: string;
  formCount: number;
  templateCount: number;
}

const encoder = new TextEncoder();

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(value: Uint8Array) {
  let checksum = 0xffffffff;
  for (const byte of value) {
    checksum = crc32Table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function setUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function setUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function zipTimestamp(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

// A small store-only ZIP writer keeps the export entirely in the browser and
// avoids adding a runtime dependency for one administrative action.
function createZip(files: ExportFile[], createdAt: Date) {
  const { date, time } = zipTimestamp(createdAt);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path.replace(/^\/+/, ""));
    const contents = encoder.encode(file.contents);
    const checksum = crc32(contents);
    const local = new Uint8Array(30 + name.length + contents.length);
    const localView = new DataView(local.buffer);

    setUint32(localView, 0, 0x04034b50);
    setUint16(localView, 4, 20);
    setUint16(localView, 6, 0x0800);
    setUint16(localView, 8, 0);
    setUint16(localView, 10, time);
    setUint16(localView, 12, date);
    setUint32(localView, 14, checksum);
    setUint32(localView, 18, contents.length);
    setUint32(localView, 22, contents.length);
    setUint16(localView, 26, name.length);
    setUint16(localView, 28, 0);
    local.set(name, 30);
    local.set(contents, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    setUint32(centralView, 0, 0x02014b50);
    setUint16(centralView, 4, 20);
    setUint16(centralView, 6, 20);
    setUint16(centralView, 8, 0x0800);
    setUint16(centralView, 10, 0);
    setUint16(centralView, 12, time);
    setUint16(centralView, 14, date);
    setUint32(centralView, 16, checksum);
    setUint32(centralView, 20, contents.length);
    setUint32(centralView, 24, contents.length);
    setUint16(centralView, 28, name.length);
    setUint16(centralView, 30, 0);
    setUint16(centralView, 32, 0);
    setUint16(centralView, 34, 0);
    setUint16(centralView, 36, 0);
    setUint32(centralView, 38, 0);
    setUint32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);

    localOffset += local.length;
  }

  const centralSize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  setUint32(endView, 0, 0x06054b50);
  setUint16(endView, 4, 0);
  setUint16(endView, 6, 0);
  setUint16(endView, 8, files.length);
  setUint16(endView, 10, files.length);
  setUint32(endView, 12, centralSize);
  setUint32(endView, 16, localOffset);
  setUint16(endView, 20, 0);

  const archive = new Uint8Array(localOffset + centralSize + end.length);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    archive.set(part, offset);
    offset += part.length;
  }
  return archive;
}

function slug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function withoutTemplateContents(template: EmailTemplate) {
  const metadata: Partial<EmailTemplate> = { ...template };
  delete metadata.document;
  delete metadata.html_content;
  delete metadata.text_content;
  return metadata;
}

function withoutFormDocument(form: SignupForm) {
  const metadata: Partial<SignupForm> = { ...form };
  delete metadata.document;
  return metadata;
}

function buildExportFiles(
  templates: EmailTemplate[],
  forms: SignupForm[],
  exportedAt: Date,
) {
  const date = exportedAt.toISOString().slice(0, 10);
  const root = `ermes-designs-${date}`;
  const files: ExportFile[] = [];

  const manifest = {
    exported_at: exportedAt.toISOString(),
    forms: forms.map(({ id, name, status, type }) => ({
      id,
      name,
      status,
      type,
    })),
    templates: templates.map(({ category, id, name, subject }) => ({
      category,
      id,
      name,
      subject,
    })),
  };

  files.push({ path: `${root}/manifest.json`, contents: json(manifest) });
  files.push({
    path: `${root}/all-designs.json`,
    contents: json({ exported_at: exportedAt.toISOString(), forms, templates }),
  });
  files.push({
    path: `${root}/README.txt`,
    contents: [
      "Ermes design export",
      "",
      `Exported ${templates.length} email templates and ${forms.length} signup forms at ${exportedAt.toISOString()}.`,
      "",
      "Email templates",
      "- template.html is the editable Handlebars email source.",
      "- template.txt is the plain-text fallback when one exists.",
      "- document.json is the visual-editor document when one exists.",
      "- metadata.json contains the template settings without duplicating the content.",
      "",
      "Signup forms",
      "- form.json is the complete form-builder source of truth.",
      "- form.html and form.css are included when the form uses custom HTML mode.",
      "- metadata.json contains the form settings without duplicating the document.",
      "",
      "all-designs.json contains the complete export in one file for easier re-use.",
      "Editing these local files does not change the live Messaging service.",
      "",
    ].join("\n"),
  });

  for (const template of templates) {
    const directory = `${root}/email-templates/${slug(template.name)}--${slug(template.id)}`;
    files.push({
      path: `${directory}/metadata.json`,
      contents: json(withoutTemplateContents(template)),
    });
    files.push({
      path: `${directory}/template.html`,
      contents: template.html_content,
    });
    if (template.text_content) {
      files.push({
        path: `${directory}/template.txt`,
        contents: template.text_content,
      });
    }
    if (template.document) {
      files.push({
        path: `${directory}/document.json`,
        contents: json(template.document),
      });
    }
  }

  for (const form of forms) {
    const directory = `${root}/signup-forms/${slug(form.name)}--${slug(form.id)}`;
    files.push({
      path: `${directory}/metadata.json`,
      contents: json(withoutFormDocument(form)),
    });
    files.push({
      path: `${directory}/form.json`,
      contents: json(form.document),
    });
    if (form.document.mode === "html") {
      if (form.document.html) {
        files.push({
          path: `${directory}/form.html`,
          contents: form.document.html,
        });
      }
      if (form.document.css) {
        files.push({
          path: `${directory}/form.css`,
          contents: form.document.css,
        });
      }
    }
  }

  return files;
}

export async function downloadMessagingDesigns(): Promise<ExportResult> {
  const [{ email_templates: templates }, { signup_forms: forms }] =
    await Promise.all([
      adminFetch<{ email_templates: EmailTemplate[] }>("email-templates"),
      adminFetch<{ signup_forms: SignupForm[] }>("signup-forms"),
    ]);
  const exportedAt = new Date();
  const files = buildExportFiles(templates, forms, exportedAt);
  const archive = createZip(files, exportedAt);
  const date = exportedAt.toISOString().slice(0, 10);
  const filename = `ermes-designs-${date}.zip`;
  const buffer = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return {
    filename,
    formCount: forms.length,
    templateCount: templates.length,
  };
}
