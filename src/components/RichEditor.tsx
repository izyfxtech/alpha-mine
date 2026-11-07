import { safeUrl, sanitizeHtml } from "@/lib/sanitize-html";
import { useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Image as ImageIcon,
  Italic,
  Link2,
  ListOrdered,
  Maximize2,
  Minus,
  Pilcrow,
  Printer,
  Redo2,
  Table,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDialogs } from "@/components/ui/confirm";

/** Lightweight rich-text editor (bold, lists, links, tables…) storing HTML. */
export function RichEditor({
  value,
  onChange,
  placeholder = "Edit Your Content Here!",
  className,
  compactToolbar,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  compactToolbar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { prompt } = useDialogs();
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitizeHtml(value);
  }, [value]);
  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };
  /** Asks for a URL in the app's own dialog. The dialog takes focus, so the text selection is put back before the command runs. */
  const askUrl = async (title: string, cmd: string) => {
    const sel = window.getSelection();
    const saved =
      sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    const typed = await prompt({
      title,
      label: "URL (http, https or mailto)",
      placeholder: "https://",
      confirmLabel: "Insert",
    });
    if (typed == null) return;
    const u = safeUrl(typed, cmd === "insertImage" ? "image" : "link");
    if (!u) {
      toast.error("Only http, https and mailto links are allowed.");
      return;
    }
    ref.current?.focus();
    if (saved) {
      const s2 = window.getSelection();
      s2?.removeAllRanges();
      s2?.addRange(saved);
    }
    run(cmd, u);
  };
  const B = ({
    icon: I,
    cmd,
    arg,
    title,
    onClick,
  }: {
    icon: typeof Bold;
    cmd?: string;
    arg?: string;
    title: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick ?? (() => cmd && run(cmd, arg))}
      className="rounded p-1.5 text-foreground/80 hover:bg-muted hover:text-foreground"
    >
      <I className="h-4 w-4" />
    </button>
  );
  const left = (
    <>
      <B icon={Bold} cmd="bold" title="Bold" />
      <B icon={Italic} cmd="italic" title="Italic" />
      <B icon={Underline} cmd="underline" title="Underline" />
      <B icon={Type} cmd="formatBlock" arg="h3" title="Heading" />
      <span className="w-3" />
      <B icon={AlignLeft} cmd="justifyLeft" title="Align left" />
      <B icon={AlignCenter} cmd="justifyCenter" title="Center" />
      <B icon={ListOrdered} cmd="insertOrderedList" title="Numbered list" />
      <B icon={Pilcrow} cmd="formatBlock" arg="p" title="Paragraph" />
    </>
  );
  const mid = (
    <>
      <B icon={Link2} title="Link" onClick={() => void askUrl("Insert link", "createLink")} />
      <B
        icon={ImageIcon}
        title="Image"
        onClick={() => void askUrl("Insert image", "insertImage")}
      />
      <B
        icon={Table}
        title="Table"
        onClick={() =>
          run(
            "insertHTML",
            '<table class="re-table"><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>',
          )
        }
      />
      <B icon={Minus} cmd="insertHorizontalRule" title="Divider" />
    </>
  );
  const right = (
    <>
      <B icon={Undo2} cmd="undo" title="Undo" />
      <B icon={Redo2} cmd="redo" title="Redo" />
      <B
        icon={Maximize2}
        title="Fullscreen"
        onClick={() => ref.current?.parentElement?.requestFullscreen?.()}
      />
      <B icon={Printer} title="Print" onClick={() => window.print()} />
    </>
  );
  return (
    <div className={cn("flex flex-col rounded-md border bg-card", className)}>
      {compactToolbar ? (
        <div className="space-y-1 border-b px-2 py-2">
          <div className="flex flex-wrap items-center gap-1">{left}</div>
          <div className="flex flex-wrap items-center gap-1">
            {mid}
            <span className="flex-1" />
            {right}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-2">
          {left}
          <span className="w-3" />
          {mid}
          <span className="flex-1" />
          {right}
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="rich-content min-h-[220px] flex-1 overflow-auto px-4 py-3 text-sm leading-relaxed outline-none"
      />
    </div>
  );
}

export const stripHtml = (h: string | null | undefined) =>
  (h ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
