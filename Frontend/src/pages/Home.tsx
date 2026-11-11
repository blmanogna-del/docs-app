import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import ShareDialog from "../components/ShareDialog";
import {
  createDocument,
  importDocument,
  listDocuments,
  updateDocument,
  type DocSummary,
} from "../api";

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".docx"];
const MAX_UPLOAD_MB = 5;

export default function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sharingId, setSharingId] = useState<number | null>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const owned = docs.filter((d) => d.role === "owner");
  const shared = docs.filter((d) => d.role !== "owner");

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const doc = await createDocument();
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create document");
      setCreating(false);
    }
  };

  const handleFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again later
    if (!file) return;
    setError("");

    // Quick checks for a friendly message; the server enforces these too
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError("Unsupported file type. Please upload a .txt, .md or .docx file.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`File is too large. The maximum size is ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const doc = await importDocument(file);
      navigate(`/doc/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  const startRename = (doc: DocSummary) => {
    setRenamingId(doc.id);
    setDraft(doc.title);
  };

  const commitRename = async (doc: DocSummary) => {
    setRenamingId(null);
    const title = draft.trim() || "Untitled document";
    if (title === doc.title) return;
    try {
      const updated = await updateDocument(doc.id, { title });
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, ...updated } : d))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename document");
    }
  };

  const row = (doc: DocSummary) => (
    <li key={doc.id} className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        {renamingId === doc.id ? (
          <input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitRename(doc)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenamingId(null);
            }}
            className="w-full rounded border border-blue-500 px-2 py-1 focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to={`/doc/${doc.id}`}
              className="truncate font-medium text-gray-900 hover:text-blue-700"
            >
              {doc.title}
            </Link>
            {doc.role !== "owner" && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  doc.role === "editor"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {doc.role === "editor" ? "Editor" : "Viewer"}
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-gray-500">
          {doc.role !== "owner" && `Shared by ${doc.owner_name} · `}
          Edited {new Date(doc.updated_at).toLocaleString()}
        </p>
      </div>

      {doc.role !== "viewer" && (
        <button
          onClick={() => startRename(doc)}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Rename
        </button>
      )}
      {doc.role === "owner" && (
        <button
          onClick={() => setSharingId(doc.id)}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Share
        </button>
      )}
    </li>
  );

  const section = (title: string, items: DocSummary[], emptyText: string) => (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <div className="rounded-lg border bg-white">
        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-gray-500">{emptyText}</p>
        ) : (
          <ul className="divide-y">{items.map(row)}</ul>
        )}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <span className="font-semibold">Docs</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{user?.name}</span>
          <button
            onClick={signOut}
            className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Home Screen</h1>
          <div className="flex gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload file"}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {creating ? "Creating..." : "+ New document"}
            </button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          onChange={handleFileChosen}
          className="hidden"
        />
        <p className="mt-2 text-right text-xs text-gray-500">
          Upload supports .txt, .md and .docx files up to {MAX_UPLOAD_MB} MB.
          Each upload becomes a new document.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {section(
          "Owned by me",
          owned,
          "No documents yet. Create one or upload a file to start."
        )}
        {section(
          "Shared with me",
          shared,
          "Nothing has been shared with you yet."
        )}
      </main>

      {sharingId !== null && (
        <ShareDialog docId={sharingId} onClose={() => setSharingId(null)} />
      )}
    </div>
  );
}