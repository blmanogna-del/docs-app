# Docs App

A small collaborative document editor inspired by Google Docs. Users can log in, create and edit rich-text documents, import files, and share documents with other users.

## Features

- Login with seeded accounts
- Create, rename, edit and reopen documents (autosave)
- Formatting: bold, italic, underline, headings, bulleted and numbered lists
- Upload a `.txt`, `.md` or `.docx` file (max 5 MB) to create a new document
- Share a document with another user as **Viewer** (read-only) or **Editor**
- Dashboard split into "Owned by me" and "Shared with me"

## Tech stack

- **Backend:** Python, FastAPI, SQLite (SQLModel)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TipTap editor

## Project structure

```
Backend/    FastAPI app (API, database, permissions)
Frontend/   React app (login, dashboard, editor)
```

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer

## Run it locally

You need **two terminals**, one for the backend and one for the frontend.

### 1. Backend (terminal 1)

```bash
cd Backend
python -m venv .venv
.venv\Scripts\activate          # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run `uvicorn` from inside the `Backend` folder. The database file `app.db` is created automatically on first start.

API docs: http://localhost:8000/docs

### 2. Frontend (terminal 2)

```bash
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173

## Demo accounts

| Name  | Email             | Password |
| ----- | ----------------- | -------- |
| Alice | alice@example.com | alice123 |
| Bob   | bob@example.com   | bob123   |
| Carol | carol@example.com | carol123 |

The login page also has quick "Alice / Bob / Carol" buttons.

## Try the sharing demo

1. Log in as **Alice** and click **+ New document**. Type some text and wait for "Saved".
2. Log out and log in as **Bob**. Alice's document is not visible.
3. Log back in as Alice, click **Share**, choose Bob as **Viewer**.
4. Log in as Bob. The document is under **Shared with me** with a **Viewer** badge, and it is read-only.
5. As Alice, change Bob's role to **Editor**. Bob can now edit it.

## File upload

Click **Upload file** on the dashboard.

- Supported types: `.txt`, `.md`, `.docx` (other types are rejected)
- Maximum size: 5 MB
- Each upload becomes a new document. In `.docx` files, text, headings, bold, italic, underline, lists and links are kept. Images and tables are dropped.

## Run the automated test

From the `Backend` folder, with the virtual environment active:

```bash
pip install pytest httpx
python -m pytest -v
```

The test checks that a shared Viewer can read a document but cannot edit it, and that a user with no access is blocked. It uses a temporary database, so your real data is not touched.

## Data storage

Everything is stored in SQLite (`Backend/app.db`) with three tables: `user`, `document` and `share`. Document content is saved as HTML, which keeps the formatting. To reset all data, stop the backend, delete `Backend/app.db`, and start it again.

## Validation and error handling

- Wrong login returns a generic "Invalid email or password"; missing token returns 401
- No access returns 403; missing document returns 404
- Viewers cannot edit; only owners can manage sharing
- Upload checks file type and size, and gives clear messages for unreadable or empty files
- Imported content is sanitized
- The UI shows loading, empty and error states, and a Retry button if a save fails

## Architecture note

**What I prioritized**

- **Permissions enforced on the backend.** The server decides who the user is from their token, and every document request goes through one function (`get_doc_and_role`). The UI hiding buttons is only a convenience.
- **Never losing work.** Autosave after one second of no typing, with a visible Saving/Saved status.
- **A small, working end-to-end product** over many half-finished features.

**What I skipped, and why**

Real-time co-editing, real authentication (signup, password reset), export, version history, comments and share-by-link. They are valuable but too large for the timebox.

**Known tradeoffs**

- Last write wins: two people editing at once can overwrite each other
- Content is stored as HTML, which is simple but not ideal for real-time collaboration
- The login token is kept in `localStorage`, which is simple but less secure than a cookie
- SQLite is a single-file database, which is fine here but not for a large multi-user system

## What I would do next

Real-time collaboration (Yjs + WebSockets), real authentication, share by email, document deletion, version history, and export to PDF/Word.
