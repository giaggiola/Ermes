import assert from "node:assert/strict";
import test from "node:test";

import { compileEmailDocument } from "../packages/core/dist/index.js";

test("visual email documents compile deterministically to email-safe HTML and text", () => {
  const document = {
    kind: "tiptap",
    root: {
      content: [
        {
          content: [
            { marks: [{ type: "bold" }], text: "Hello", type: "text" },
            { text: " {{first_name}}", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    schema_version: 1,
  };

  const first = compileEmailDocument(document);
  const second = compileEmailDocument(document);

  assert.deepEqual(first, second);
  assert.match(first.html, /\{\{#if email_logo_url\}\}/);
  assert.match(first.html, /alt="\{\{store_name\}\}"/);
  assert.match(first.html, /<strong>Hello<\/strong> \{\{first_name\}\}/);
  assert.equal(first.text, "Hello {{first_name}}");
});

test("visual email documents neutralize unsafe links and reject unknown schemas", () => {
  const compiled = compileEmailDocument({
    kind: "tiptap",
    root: {
      content: [
        {
          content: [
            {
              marks: [
                {
                  attrs: { href: "javascript:alert(1)" },
                  type: "link",
                },
              ],
              text: "Click",
              type: "text",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    schema_version: 1,
  });

  assert.match(compiled.html, /href="#"/);
  assert.throws(
    () =>
      compileEmailDocument({
        kind: "tiptap",
        root: { type: "doc" },
        schema_version: 2,
      }),
    /Unsupported email document schema/,
  );
});
