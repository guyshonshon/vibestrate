import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, FileText, Paperclip, X } from "lucide-react";
import { Button } from "./Button.js";
import { IconBtn } from "./IconBtn.js";
import { cn } from "./cn.js";

/**
 * Attaching files to a chat composer: the picker, and the strip of removable
 * previews that belongs beside every composer offering one.
 *
 * These are REFERENCES, not uploads. The picker records what you chose and the
 * names ride along in the message text, so the agent opens them from the repo it
 * is already working in. Nothing is copied into .vibestrate, which keeps a
 * screenshot or a spec out of the run's artifacts and out of anything replayed
 * later. The thumbnail is drawn from the browser's own File handle and never
 * leaves the tab.
 *
 * Removing an item drops it from the list the message text is derived from, so
 * the chip and what the agent is told cannot drift apart.
 */

export type Attachment = {
  /** The file name, because the name is the whole reference: two entries
   *  sharing one would tell the agent to open the same file twice. */
  id: string;
  name: string;
  size: number;
  file: File;
};

/** What the picker offers. Images first because a screenshot is the common case. */
const ACCEPT = "image/*,.pdf,.md,.txt,.json,.csv";

/** Past this the tab would hold the decoded bitmap of something nobody needs to
 *  see at 32px, so a large image falls back to its file tile instead. */
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

function attachmentOf(file: File): Attachment {
  return { id: file.name, name: file.name, size: file.size, file };
}

function canPreview(item: Attachment): boolean {
  return item.file.type.startsWith("image/") && item.size > 0 && item.size <= PREVIEW_MAX_BYTES;
}

function extLabel(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  return ext ? ext.toUpperCase().slice(0, 5) : "FILE";
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The line that carries the choice into the message. One wording everywhere, so
 *  a model meets the same shape whichever composer the message came from. */
function attachmentNote(items: Attachment[]): string {
  if (items.length === 0) return "";
  return `\n\nAttached for reference: ${items.map((i) => i.name).join(", ")}`;
}

/** Composer-side state for a set of attachments: what was picked, and the note
 *  to append to the message. Held by the composer so its send path and the strip
 *  read the same list. */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const add = useCallback((files: File[]) => {
    setItems((prev) => {
      const next = [...prev];
      for (const file of files) {
        const item = attachmentOf(file);
        const at = next.findIndex((x) => x.id === item.id);
        // Re-picking a name keeps its place but takes the newer handle, so the
        // thumbnail matches the file on disk after an edit.
        if (at === -1) next.push(item);
        else next[at] = item;
      }
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);
  const clear = useCallback(() => setItems([]), []);
  return { items, add, remove, clear, note: attachmentNote(items) };
}

/** The picker trigger. Pair it with `AttachmentStrip` - on its own it gives no
 *  sign of what is attached. */
export function AttachButton({
  onAdd,
  disabled,
  className,
}: {
  onAdd: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onAdd(picked);
          // Reset the input so removing a file and picking it again still fires
          // a change event - it does not fire when the value is unchanged.
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title="Referenced by name, not uploaded"
        iconLeft={<Paperclip className="h-3.5 w-3.5" strokeWidth={2} />}
        className={className}
      >
        Attach
      </Button>
    </>
  );
}

/**
 * The 32px leading visual. An image gets its own thumbnail; everything else -
 * and anything too large to be worth decoding, or that the browser fails to
 * decode - gets a file tile, so the row never falls to a broken-image glyph.
 */
function Thumb({ item }: { item: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  // Keyed on the file name, so re-picking a name swaps the handle under a
  // mounted card: the previous verdict has to be dropped along with its URL.
  useEffect(() => {
    setBroken(false);
    if (!canPreview(item)) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(item.file);
    setUrl(objectUrl);
    // An object URL pins the blob until it is revoked, so a session that
    // attaches and removes all day would otherwise hold every image it saw.
    return () => URL.revokeObjectURL(objectUrl);
  }, [item]);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-[8px] border border-[color:var(--line-soft)] bg-coal-700 object-cover"
      />
    );
  }
  const isImage = item.file.type.startsWith("image/");
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-[color:var(--line-soft)] bg-coal-700 text-violet-soft"
    >
      {isImage ? (
        <ImageIcon className="h-4 w-4" strokeWidth={1.8} />
      ) : (
        <FileText className="h-4 w-4" strokeWidth={1.8} />
      )}
    </span>
  );
}

function AttachmentCard({ item, onRemove }: { item: Attachment; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-800 py-1 pl-1 pr-1">
      <Thumb item={item} />
      <div className="min-w-0">
        <div
          className="max-w-[160px] truncate text-[13px] font-semibold leading-tight text-chalk-100"
          title={item.name}
        >
          {item.name}
        </div>
        {/* Type and size, never an error line: a file that cannot be previewed
            still reads as itself here, so the tile above it needs no apology. */}
        <div className="text-meta leading-tight text-chalk-300">
          {extLabel(item.name)} · {fmtBytes(item.size)}
        </div>
      </div>
      <IconBtn variant="plain" title={`Remove ${item.name}`} onClick={onRemove}>
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </IconBtn>
    </div>
  );
}

/** The attached files, each removable. Renders nothing while nothing is
 *  attached, so a composer can place it unconditionally. */
export function AttachmentStrip({
  items,
  onRemove,
  className,
}: {
  items: Attachment[];
  onRemove: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => (
        <AttachmentCard key={item.id} item={item} onRemove={() => onRemove(item.id)} />
      ))}
    </div>
  );
}
