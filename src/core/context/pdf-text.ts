// Text out of a PDF, for a `pdf` context source.
//
// WHY AN EXTERNAL TOOL RATHER THAN A BUNDLED PARSER
//
// The JavaScript options all carry a pdfjs build: `unpdf` measures 2.5 MB
// installed, against an 8.5 MB unpacked package - roughly a third more weight,
// shipped to every user, for a source kind most runs never attach. A PDF parser
// is also a binary parser over user-supplied input, which is new attack surface
// in a tool whose posture is otherwise "read nothing you were not pointed at".
//
// Vibestrate's whole shape is already "drive the tools on your machine" - it
// requires a coding CLI to do anything at all - so requiring `pdftotext` for
// PDFs is consistent, costs nothing to the people who never attach one, and
// adds no supply-chain surface. The tradeoff it makes is real and is stated
// plainly at the point of failure: without poppler the source is refused with
// the install command, not silently dropped.
//
// SAFETY
//
// The caller resolves the path through the project path guard BEFORE calling
// here, so `pdftotext` only ever sees a path inside an approved root. The
// argument vector is passed as an array with no shell, and `--` separates flags
// from the path, so a filename cannot be read as an option or inject anything.
// Output is bounded here and secret-redacted by the caller, the same as every
// other context source.
import { execa } from "execa";

/** Bound on extracted text before the caller's own clamp. Generous enough for a
 *  long document, small enough that a pathological PDF cannot exhaust memory. */
const MAX_CHARS = 2 * 1024 * 1024;

/** How long a single extraction may take before it is killed. */
const TIMEOUT_MS = 30_000;

export type PdfTextResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: "no-extractor" | "failed"; reason: string };

export type PdfRunner = (
  file: string,
) => Promise<{ exitCode: number | undefined; stdout: string; stderr: string }>;

/** Injected in tests; production shells out to poppler's `pdftotext`. */
const defaultRunner: PdfRunner = async (file) => {
  const res = await execa("pdftotext", ["-q", "-layout", "--", file, "-"], {
    reject: false,
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_CHARS * 2,
    // No shell: the path is an argv element, never a string to be re-parsed.
    shell: false,
  });
  return { exitCode: res.exitCode, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
};

/**
 * Extract a PDF's text, or say precisely why not.
 *
 * A missing extractor is its own code rather than a generic failure: it is the
 * one case the reader can fix, and the message has to carry the command that
 * fixes it.
 */
export async function extractPdfText(
  absolutePath: string,
  runner: PdfRunner = defaultRunner,
): Promise<PdfTextResult> {
  let res: Awaited<ReturnType<PdfRunner>>;
  try {
    res = await runner(absolutePath);
  } catch (err) {
    // execa surfaces a missing binary as ENOENT on the error, not an exit code.
    const code = (err as { code?: unknown })?.code;
    if (code === "ENOENT") return { ok: false, code: "no-extractor", reason: missingMessage() };
    return {
      ok: false,
      code: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (res.exitCode !== 0) {
    return {
      ok: false,
      code: "failed",
      reason: res.stderr.trim() || `pdftotext exited ${res.exitCode ?? "with no code"}`,
    };
  }
  const raw = res.stdout;
  const truncated = raw.length > MAX_CHARS;
  const text = truncated ? raw.slice(0, MAX_CHARS) : raw;
  if (text.trim().length === 0) {
    // A scanned PDF is images with no text layer. Extracting nothing and
    // reporting success would attach an empty section and look like the
    // document said nothing.
    return {
      ok: false,
      code: "failed",
      reason:
        "the PDF has no extractable text - it is probably scanned images. " +
        "Run it through OCR first, or attach the text you want as a .md/.txt file.",
    };
  }
  return { ok: true, text, truncated };
}

/** The one failure a reader can act on, with the command that acts on it. */
export function missingMessage(): string {
  return (
    "`pdftotext` was not found. Vibestrate reads PDFs with poppler rather than " +
    "bundling a parser, so it is not shipped: install it with `brew install poppler` " +
    "(macOS), `apt install poppler-utils` (Debian/Ubuntu), or " +
    "`choco install poppler` (Windows) - or attach the text as a .md/.txt file instead."
  );
}
