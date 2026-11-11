import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ShareDialog from "../components/ShareDialog";
import { getDocument, updateDocument, type DocFull } from "../api";

type SaveStatus = "saved" | "saving" | "error";

// ---------- Toolbar ----------
function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // keep focus (and the text selection) inside the editor
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-9 rounded px-2 py-1 text-sm hover:bg-gray-100 ${
        active ? "bg-blue-100 text-blue-700" : "text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render the toolbar when the selection or formatting changes
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
    }),
  });

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-white px-4 py-2">
      <ToolbarButton
        label="Bold (Ctrl+B)"
        active={s.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        label="Italic (Ctrl+I)"
        active={s.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        label="Underline (Ctrl+U)"
        active={s.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-gray-300" />

      <ToolbarButton
        label="Heading 1"
        active={s.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={s.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-gray-300" />

      <ToolbarButton
        label="Bulleted list"
        active={s.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={s.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
    </div>
  );
}

// ---------- Editor with autosave ----------
function DocumentEditor({ doc }: { doc: DocFull }) {
  const canEdit = doc.role !== "viewer";
  const isOwner = doc.role === "owner";

  const [title, setTitle] = useState(doc.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [sharing, setSharing] = useState(false);
  const pending = useRef<{ title?: string; content?: string }>({});
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const changes = pending.current;
    if (Object.keys(changes).length === 0) return;
    pending.current = {};
    setStatus("saving");
    try {
      await updateDocument(doc.id, changes);
      // If the user kept typing during the request, we're not "saved" yet
      setStatus(Object.keys(pending.current).length ? "saving" : "saved");
    } catch {
      // Put the changes back so a retry sends them again
      pending.current = { ...changes, ...pending.current };
      setStatus("error");
    }
  }, [doc.id]);

  const queueSave = useCallback(
    (changes: { title?: string; content?: string }) => {
      if (!canEdit) return;
      pending.current = { ...pending.current, ...changes };
      setStatus("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 1000);
    },
    [flush, canEdit]
  );

  const editor = useEditor({
    extensions: [StarterKit],
    content: doc.content,
    editable: canEdit,
    onUpdate: ({ editor }) => queueSave({ content: editor.getHTML() }),
  });

  // Save anything pending when leaving the page (e.g. clicking "Home")
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  // Warn if the tab is closed while changes are unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    queueSave({ title: value });
  };

  const handleTitleBlur = () => {
    if (canEdit && !title.trim()) handleTitleChange("Untitled document");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-4 border-b bg-white px-4 py-3">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← Home
        </Link>
        <input
          value={title}
          maxLength={200}
          readOnly={!canEdit}
          aria-label="Document title"
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-lg font-medium hover:border-gray-300 focus:border-blue-500 focus:outline-none read-only:hover:border-transparent"
        />

        {!isOwner && (
          <span className="hidden text-sm text-gray-500 sm:inline">
            Shared by {doc.owner_name}
          </span>
        )}
        {!canEdit && (
          <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
            View only
          </span>
        )}

        {canEdit && (
          <div className="w-32 text-right text-sm" aria-live="polite">
            {status === "saved" && <span className="text-gray-500">Saved</span>}
            {status === "saving" && <span className="text-gray-500">Saving...</span>}
            {status === "error" && (
              <span className="text-red-600">
                Not saved.{" "}
                <button onClick={flush} className="underline">
                  Retry
                </button>
              </span>
            )}
          </div>
        )}

        {isOwner && (
          <button
            onClick={() => setSharing(true)}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Share
          </button>
        )}
      </header>

      {editor && canEdit && <Toolbar editor={editor} />}

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-lg border bg-white p-8 shadow-sm">
          <EditorContent editor={editor} className="editor-content" />
        </div>
      </main>

      {sharing && <ShareDialog docId={doc.id} onClose={() => setSharing(false)} />}
    </div>
  );
}

// ---------- Page: loads the document, then hands it to the editor ----------
export default function DocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<DocFull | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDoc(null);
    setError("");
    getDocument(Number(id))
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="p-8">
        <p role="alert" className="text-red-600">
          {error}
        </p>
        <Link to="/" className="mt-2 inline-block text-blue-600 hover:underline">
          ← Back to Home
        </Link>
      </div>
    );
  }
  if (!doc) return <p className="p-8 text-gray-500">Loading...</p>;

  // key forces a fresh editor if you navigate between documents
  return <DocumentEditor key={doc.id} doc={doc} />;
}