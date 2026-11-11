import { useEffect, useState } from "react";
import {
  listShares,
  listUsers,
  removeShare,
  setShare,
  type Share,
  type ShareRole,
  type User,
} from "../api";

export default function ShareDialog({
  docId,
  onClose,
}: {
  docId: number;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");

  useEffect(() => {
    Promise.all([listUsers(), listShares(docId)])
      .then(([u, s]) => {
        setUsers(u);
        setShares(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [docId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const alreadyShared = new Set(shares.map((s) => s.user_id));
  const available = users.filter((u) => !alreadyShared.has(u.id));

  const save = async (uid: number, newRole: ShareRole) => {
    setBusy(true);
    setError("");
    try {
      const saved = await setShare(docId, uid, newRole);
      setShares((prev) =>
        prev.some((s) => s.user_id === uid)
          ? prev.map((s) => (s.user_id === uid ? saved : s))
          : [...prev, saved]
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update sharing");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!userId) return;
    if (await save(Number(userId), role)) setUserId("");
  };

  const handleRemove = async (uid: number) => {
    setBusy(true);
    setError("");
    try {
      await removeShare(docId, uid);
      setShares((prev) => prev.filter((s) => s.user_id !== uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share document"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share document</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-xl leading-none text-gray-500 hover:bg-gray-100"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-gray-500">Loading...</p>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                aria-label="Person to share with"
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="">
                  {available.length ? "Choose a person..." : "Everyone has access"}
                </option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ShareRole)}
                aria-label="Role"
                className="rounded-md border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={!userId || busy}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Share
              </button>
            </div>

            <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-gray-400">
              People with access
            </h3>
            {shares.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                Only you can open this document.
              </p>
            ) : (
              <ul className="mt-2 divide-y">
                {shares.map((s) => (
                  <li key={s.user_id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-gray-500">{s.email}</p>
                    </div>
                    <select
                      value={s.role}
                      disabled={busy}
                      aria-label={`Role for ${s.name}`}
                      onChange={(e) => save(s.user_id, e.target.value as ShareRole)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      onClick={() => handleRemove(s.user_id)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}