import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { extractPdfText, missingMessage, type PdfRunner } from "../src/core/context/pdf-text.js";
import { materializeContextSources } from "../src/core/context/context-sources.js";
import { contextSourceKindSchema } from "../src/core/context/context-source-schema.js";

/**
 * A `pdf` context source, read with poppler rather than a bundled parser.
 *
 * The extractor is injected here, so these cover the decisions rather than
 * poppler: what happens with no extractor installed, with a scanned PDF that
 * has no text layer, and - the one that matters - that extracted text is
 * redacted and path-guarded exactly like a `file` source. A PDF must not be a
 * way to get an unredacted secret or an out-of-root read into a prompt.
 */
const ok = (stdout: string): PdfRunner => async () => ({ exitCode: 0, stdout, stderr: "" });

describe("extractPdfText", () => {
  it("returns the extracted text", async () => {
    const r = await extractPdfText("/x.pdf", ok("Hello from a PDF"));
    expect(r).toEqual({ ok: true, text: "Hello from a PDF", truncated: false });
  });

  it("names the missing extractor as its own case, with the install command", async () => {
    const enoent: PdfRunner = async () => {
      throw Object.assign(new Error("spawn pdftotext ENOENT"), { code: "ENOENT" });
    };
    const r = await extractPdfText("/x.pdf", enoent);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Its own code, because it is the one failure the reader can fix.
    expect(r.code).toBe("no-extractor");
    expect(r.reason).toContain("brew install poppler");
    expect(r.reason).toContain("apt install poppler-utils");
  });

  it("reports a non-zero exit with poppler's own stderr", async () => {
    const bad: PdfRunner = async () => ({ exitCode: 1, stdout: "", stderr: "Syntax Error: damaged" });
    const r = await extractPdfText("/x.pdf", bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("failed");
      expect(r.reason).toContain("damaged");
    }
  });

  it("refuses a PDF with no text layer instead of attaching nothing", async () => {
    // A scanned document extracts to whitespace. Reporting success would put an
    // empty section in the prompt and read as "the document said nothing".
    const r = await extractPdfText("/scan.pdf", ok("   \n\n  \t "));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("scanned");
  });

  it("bounds a pathological document", async () => {
    const r = await extractPdfText("/big.pdf", ok("x".repeat(5 * 1024 * 1024)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncated).toBe(true);
      expect(r.text.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    }
  });

  it("has an install message naming every platform we claim to support", () => {
    const m = missingMessage();
    for (const needle of ["brew install poppler", "poppler-utils", "choco install poppler"]) {
      expect(m).toContain(needle);
    }
  });
});

describe("the pdf kind is a real context source", () => {
  it("is accepted by the schema", () => {
    expect(contextSourceKindSchema.safeParse("pdf").success).toBe(true);
  });

  it("path-guards the reference the same way a file source is guarded", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pdfctx-"));
    const res = await materializeContextSources({
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
      sources: [{ kind: "pdf", ref: "../../../etc/passwd" }],
    });
    // Refused before any extractor runs - traversal is a path-guard decision,
    // not something poppler should ever be asked about.
    expect(res.artifacts).toHaveLength(0);
    expect(res.notes.join("\n")).toMatch(/Refused context PDF/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses a secret-like path before extracting", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pdfsec-"));
    await fs.writeFile(path.join(dir, ".env.pdf"), "not really a pdf");
    const res = await materializeContextSources({
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
      sources: [{ kind: "pdf", ref: ".env.pdf" }],
    });
    expect(res.artifacts).toHaveLength(0);
    expect(res.notes.join("\n")).toMatch(/secret-like/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("a PDF is not a way around the guarantees text sources have", () => {
  const withSecret: PdfRunner = async () => ({
    exitCode: 0,
    // A credential pasted into a design doc that was then exported to PDF. The
    // shape is assembled at runtime so no key-shaped literal sits in the repo.
    stdout: `Deployment notes\n\nrotate ${["sk", "live", `51H${"x".repeat(24)}Q`].join("_")} before shipping`,
    stderr: "",
  });

  it("redacts secret shapes out of extracted text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pdfredact-"));
    await fs.writeFile(path.join(dir, "notes.pdf"), "%PDF-1.4 stub");
    const res = await materializeContextSources({
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
      sources: [{ kind: "pdf", ref: "notes.pdf" }],
      pdfRunner: withSecret,
    });
    expect(res.artifacts).toHaveLength(1);
    const content = res.artifacts[0]!.content;
    expect(content).toContain("Deployment notes");
    expect(content).not.toContain("sk_live_");
    expect(content).toContain("REDACTED");
    // ...and it says so, rather than quietly changing what the document said.
    expect(content).toContain("secret token(s) redacted");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("labels the artifact as a pdf and names the guarded relative path", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pdflabel-"));
    await fs.mkdir(path.join(dir, "docs"), { recursive: true });
    await fs.writeFile(path.join(dir, "docs", "spec.pdf"), "%PDF-1.4 stub");
    const res = await materializeContextSources({
      projectRoot: dir,
      worktreePath: null,
      allowUrlFetch: false,
      sources: [{ kind: "pdf", ref: "docs/spec.pdf" }],
      pdfRunner: ok("The spec says so."),
    });
    expect(res.artifacts[0]!.content).toContain("Source: pdf docs/spec.pdf");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
