const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export type User = { id: number; name: string; email: string };

export type Role = "owner" | "editor" | "viewer";
export type ShareRole = "editor" | "viewer";

export type DocSummary = {
  id: number;
  title: string;
  owner_id: number;
  owner_name: string;
  role: Role;
  updated_at: string;
};
export type DocFull = DocSummary & { content: string; created_at: string };

export type Share = {
  user_id: number;
  name: string;
  email: string;
  role: ShareRole;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      // For file uploads the browser sets Content-Type (with the boundary)
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string" ? body.detail : "Something went wrong"
    );
  }
  if (res.status === 204) return undefined as T; // no body (e.g. after DELETE)
  return res.json();
}

// Auth
export const login = (email: string, password: string) =>
  request<{ access_token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const fetchMe = () => request<User>("/auth/me");

// Documents
export const listDocuments = () => request<DocSummary[]>("/documents");

export const createDocument = () =>
  request<DocFull>("/documents", { method: "POST", body: JSON.stringify({}) });

export const importDocument = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<DocFull>("/documents/import", { method: "POST", body: form });
};

export const getDocument = (id: number) => request<DocFull>(`/documents/${id}`);

export const updateDocument = (
  id: number,
  changes: { title?: string; content?: string }
) =>
  request<DocFull>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

// Sharing
export const listUsers = () => request<User[]>("/users");

export const listShares = (docId: number) =>
  request<Share[]>(`/documents/${docId}/shares`);

export const setShare = (docId: number, userId: number, role: ShareRole) =>
  request<Share>(`/documents/${docId}/shares`, {
    method: "PUT",
    body: JSON.stringify({ user_id: userId, role }),
  });

export const removeShare = (docId: number, userId: number) =>
  request<void>(`/documents/${docId}/shares/${userId}`, { method: "DELETE" });