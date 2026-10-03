import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Folder, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichEditor, stripHtml } from "@/components/RichEditor";
import { useJournal } from "@/lib/journal-context";
import { useJournalTable } from "@/lib/crud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/diary/notebook")({
  head: () => ({ meta: [{ title: "Notebook — AlphaMine" }, { name: "description", content: "Your trading notebook, organised in folders." }, { property: "og:title", content: "Notebook — AlphaMine" }, { property: "og:description", content: "Your trading notebook, organised in folders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Notebook,
});

const ALL = "__all__";
const fmtStamp = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

function Notebook() {
  const { journal } = useJournal();
  const pages = useJournalTable("notebook_pages", journal?.id, "updated_at");
  const folders = useJournalTable("notebook_folders", journal?.id, "position", true);
  const [folder, setFolder] = useState<string>(ALL);
  const [sel, setSel] = useState<string | null>(null);

  // Folder names: saved folders plus any folder referenced by an existing note.
  const names = useMemo(() => {
    const saved = folders.rows.map((f) => f.name);
    return [...saved, ...[...new Set(pages.rows.map((p) => p.folder))].filter((n) => !saved.includes(n))];
  }, [folders.rows, pages.rows]);
  const list = folder === ALL ? pages.rows : pages.rows.filter((p) => p.folder === folder);
  const page = list.find((p) => p.id === sel) ?? null;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  useEffect(() => { setTitle(page?.title ?? ""); setContent(page?.content ?? ""); }, [page?.id]);
  useEffect(() => {
    if (!page || (title === page.title && content === (page.content ?? ""))) return;
    const h = setTimeout(() => pages.update(page.id, { title, content, updated_at: new Date().toISOString() }), 700);
    return () => clearTimeout(h);
  }, [title, content]);

  const addNote = async () => {
    const target = folder === ALL ? names[0] ?? "Diary" : folder;
    if (!names.includes(target)) await folders.insert({ name: target, position: 0 });
    const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const r = await pages.insert({ folder: target, title: today, content: "" });
    if (r) setSel(r.id);
  };
  const newFolder = async () => {
    const n = prompt("Folder name")?.trim();
    if (n) await folders.insert({ name: n, position: names.length });
  };
  const renameFolder = async (name: string) => {
    const n = prompt("Rename folder", name)?.trim();
    if (!n || n === name) return;
    const f = folders.rows.find((x) => x.name === name);
    if (f) await folders.update(f.id, { name: n }); else await folders.insert({ name: n, position: names.length });
    await Promise.all(pages.rows.filter((p) => p.folder === name).map((p) => pages.update(p.id, { folder: n })));
    if (folder === name) setFolder(n);
  };
  const deleteFolder = async (name: string) => {
    if (!confirm(`Delete folder "${name}" and its notes?`)) return;
    await Promise.all(pages.rows.filter((p) => p.folder === name).map((p) => pages.remove(p.id)));
    const f = folders.rows.find((x) => x.name === name);
    if (f) await folders.remove(f.id);
    setFolder(ALL);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div><Button variant="ink" size="sm" onClick={addNote}><Plus className="h-4 w-4" /> Add Note</Button></div>
      <div className="grid min-h-0 flex-1 grid-cols-[210px_250px_1fr] gap-4 rounded-xl border bg-card p-5">
        <aside className="space-y-0.5 text-sm">
          <FolderRow label="All Notes" active={folder === ALL} onClick={() => setFolder(ALL)} />
          {names.map((n) => (
            <FolderRow key={n} label={`(${pages.rows.filter((p) => p.folder === n).length}) ${n}`} active={folder === n}
              onClick={() => { setFolder(n); setSel(null); }} onEdit={() => renameFolder(n)} onDelete={() => deleteFolder(n)} />
          ))}
          <button onClick={newFolder} className="px-2 pt-2 text-sm text-info hover:underline">+ New Folder</button>
        </aside>

        <div className="min-h-0 overflow-y-auto rounded-lg bg-muted/50 p-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => setSel(p.id)}
              className={cn("mb-1 block w-full rounded-md px-3 py-3 text-left", page?.id === p.id ? "bg-card shadow-sm" : "hover:bg-card/60")}>
              <p className="truncate text-sm font-semibold">{p.title || "Untitled"}</p>
              <p className="truncate text-xs text-muted-foreground">{stripHtml(p.content) || "Empty note"}</p>
              <p className="text-[11px] text-muted-foreground">{fmtStamp(p.updated_at)}</p>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-col">
          {!page ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{list.length ? "Select a note." : "There are no notes."}</div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 bg-transparent text-lg font-bold outline-none" />
                <Button variant="ghost" size="icon" onClick={() => { pages.remove(page.id); setSel(null); }} title="Delete note"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <RichEditor value={content} onChange={setContent} className="min-h-0 flex-1" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderRow({ label, active, onClick, onEdit, onDelete }: { label: string; active: boolean; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const I = active ? FolderOpen : Folder;
  return (
    <div className={cn("group flex items-center gap-2 rounded-md px-2 py-1.5", active ? "bg-muted font-semibold" : "hover:bg-muted/60")}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left"><I className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></button>
      {onEdit && <button onClick={onEdit} className="opacity-0 group-hover:opacity-100" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>}
      {onDelete && <button onClick={onDelete} className="opacity-0 group-hover:opacity-100" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  );
}
