export const EMAIL_DOCUMENT_SCHEMA_VERSION = 1;

type JsonRecord = Record<string, unknown>;

export interface VisualEmailDocument {
  kind: "tiptap";
  root: JsonRecord;
  schema_version: typeof EMAIL_DOCUMENT_SCHEMA_VERSION;
}

export interface CompiledEmailDocument {
  html: string;
  text: string;
}

/**
 * Compile the browser-safe visual document into deterministic email HTML.
 * Sending code consumes this output and never trusts browser-only rendering.
 */
export function compileEmailDocument(document: unknown): CompiledEmailDocument {
  if (!isRecord(document)) {
    throw new Error("Email document must be an object");
  }
  if (
    document.schema_version !== EMAIL_DOCUMENT_SCHEMA_VERSION ||
    document.kind !== "tiptap" ||
    !isRecord(document.root) ||
    document.root.type !== "doc"
  ) {
    throw new Error("Unsupported email document schema");
  }

  const body = renderChildren(document.root);
  const text = plainText(document.root).replace(/\n{3,}/g, "\n\n").trim();
  return {
    html:
      '<div style="margin:0 auto;max-width:640px;color:#1c1c1c;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 32px;width:100%"><tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border-bottom:1px solid #cfcfcf;padding:30px 24px"><a href="{{store_url}}" style="color:#1c1c1c;text-decoration:none">{{#if email_logo_url}}<img src="{{email_logo_url}}" width="142" height="46" alt="{{store_name}}" style="border:0;display:block;height:auto;max-width:100%;width:142px">{{else}}{{store_name}}{{/if}}</a></td></tr></table>' +
      body +
      "</div>",
    text,
  };
}

function renderChildren(node: JsonRecord): string {
  return childrenOf(node).map(renderNode).join("");
}

function renderNode(node: JsonRecord): string {
  const inner = renderChildren(node);
  switch (node.type) {
    case "blockquote":
      return `<blockquote style="border-left:3px solid #d4d4d4;margin:0 0 16px;padding-left:16px">${inner}</blockquote>`;
    case "bulletList":
      return `<ul style="margin:0 0 16px;padding-left:24px">${inner}</ul>`;
    case "codeBlock":
      return `<pre style="background:#f5f5f5;border-radius:6px;overflow:auto;padding:12px"><code>${inner}</code></pre>`;
    case "doc":
      return inner;
    case "hardBreak":
      return "<br>";
    case "heading": {
      const level = numberAttribute(node, "level", 2, 1, 3);
      const sizes = { 1: "30px", 2: "24px", 3: "20px" } as const;
      return `<h${level} style="font-size:${sizes[level as 1 | 2 | 3]};line-height:1.25;margin:0 0 16px">${inner}</h${level}>`;
    }
    case "horizontalRule":
      return '<hr style="border:0;border-top:1px solid #dedede;margin:24px 0">';
    case "listItem":
      return `<li style="margin:0 0 6px">${inner}</li>`;
    case "orderedList":
      return `<ol style="margin:0 0 16px;padding-left:24px">${inner}</ol>`;
    case "paragraph":
      return `<p style="margin:0 0 16px">${inner || "&nbsp;"}</p>`;
    case "table":
      return `<table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px">${inner}</table>`;
    case "tableCell":
      return `<td style="border:1px solid #dedede;vertical-align:top">${inner}</td>`;
    case "tableHeader":
      return `<th style="background:#f5f5f5;border:1px solid #dedede;text-align:left;vertical-align:top">${inner}</th>`;
    case "tableRow":
      return `<tr>${inner}</tr>`;
    case "text":
      return renderText(node);
    default:
      return inner;
  }
}

function renderText(node: JsonRecord): string {
  let value = escapeHtml(typeof node.text === "string" ? node.text : "");
  const marks = Array.isArray(node.marks)
    ? node.marks.filter(isRecord)
    : [];
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        value = `<strong>${value}</strong>`;
        break;
      case "code":
        value = `<code style="background:#f5f5f5;border-radius:3px;padding:1px 4px">${value}</code>`;
        break;
      case "italic":
        value = `<em>${value}</em>`;
        break;
      case "link": {
        const href = safeHref(
          isRecord(mark.attrs) && typeof mark.attrs.href === "string"
            ? mark.attrs.href
            : "",
        );
        value = `<a href="${escapeAttribute(href)}" style="color:#1c1c1c;text-decoration:underline">${value}</a>`;
        break;
      }
      case "strike":
        value = `<s>${value}</s>`;
        break;
      case "underline":
        value = `<u>${value}</u>`;
        break;
    }
  }
  return value;
}

function plainText(node: JsonRecord): string {
  if (node.type === "text") {
    return typeof node.text === "string" ? node.text : "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  const value = childrenOf(node).map(plainText).join("");
  return ["blockquote", "heading", "listItem", "paragraph", "tableRow"].includes(
    String(node.type),
  )
    ? `${value}\n`
    : value;
}

function childrenOf(node: JsonRecord): JsonRecord[] {
  return Array.isArray(node.content) ? node.content.filter(isRecord) : [];
}

function numberAttribute(
  node: JsonRecord,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value =
    isRecord(node.attrs) && typeof node.attrs[name] === "number"
      ? node.attrs[name]
      : fallback;
  return Math.min(max, Math.max(min, value));
}

function safeHref(value: string) {
  const trimmed = value.trim();
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed) ? trimmed : "#";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
