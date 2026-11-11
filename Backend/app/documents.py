import os
from datetime import datetime, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, field_validator
from sqlmodel import Session, col, select

from .auth import get_current_user
from .database import get_session
from .importers import SUPPORTED_EXTENSIONS, ImportFailed, convert_to_html
from .models import Document, Share, User, utcnow

router = APIRouter(prefix="/api/documents", tags=["documents"])

DEFAULT_TITLE = "Untitled document"
MAX_TITLE_LENGTH = 200
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


# ---------- Schemas ----------
class DocSummary(BaseModel):
    id: int
    title: str
    owner_id: int
    owner_name: str
    role: str  # the caller's role: owner | editor | viewer
    updated_at: datetime

    # SQLite drops timezone info; re-attach UTC so browsers parse times correctly
    @field_validator("updated_at", "created_at", check_fields=False)
    @classmethod
    def _as_utc(cls, v: datetime) -> datetime:
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


class DocOut(DocSummary):
    content: str
    created_at: datetime


class DocCreate(BaseModel):
    title: str | None = None


class DocUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class ShareRequest(BaseModel):
    user_id: int
    role: Literal["viewer", "editor"]


class ShareOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str


# ---------- Helpers ----------
def clean_title(raw: str | None) -> str:
    title = (raw or "").strip()
    return title[:MAX_TITLE_LENGTH] if title else DEFAULT_TITLE


def get_doc_and_role(session: Session, doc_id: int, user: User) -> tuple[Document, str]:
    """The single place that decides who may open a document.

    Returns (document, role) where role is "owner", "editor" or "viewer".
    Raises 403 for anyone without access.
    """
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if doc.owner_id == user.id:
        return doc, "owner"
    share = session.exec(
        select(Share).where(Share.document_id == doc.id, Share.user_id == user.id)
    ).first()
    if share is not None:
        return doc, share.role
    raise HTTPException(
        status.HTTP_403_FORBIDDEN, "You don't have access to this document"
    )


def require_owner(session: Session, doc_id: int, user: User) -> Document:
    doc, role = get_doc_and_role(session, doc_id, user)
    if role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the owner can manage sharing"
        )
    return doc


def owner_name_of(session: Session, doc: Document) -> str:
    owner = session.get(User, doc.owner_id)
    return owner.name if owner else "Unknown"


def to_summary(doc: Document, role: str, owner_name: str) -> DocSummary:
    return DocSummary(**doc.model_dump(), role=role, owner_name=owner_name)


def to_out(doc: Document, role: str, owner_name: str) -> DocOut:
    return DocOut(**doc.model_dump(), role=role, owner_name=owner_name)


# ---------- Document endpoints ----------
@router.post("", response_model=DocOut, status_code=status.HTTP_201_CREATED)
def create_document(
    body: DocCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    doc = Document(title=clean_title(body.title), owner_id=current_user.id)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return to_out(doc, "owner", current_user.name)


@router.post("/import", response_model=DocOut, status_code=status.HTTP_201_CREATED)
def import_document(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Turn an uploaded .txt / .md / .docx file into a new document."""
    filename = os.path.basename(file.filename or "")
    stem, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Unsupported file type. Please upload a .txt, .md or .docx file.",
        )

    # Read one byte past the limit so we can tell "exactly 5 MB" from "too big"
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File is too large. The maximum size is 5 MB.",
        )

    try:
        html = convert_to_html(ext, data)
    except ImportFailed as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    doc = Document(title=clean_title(stem), content=html, owner_id=current_user.id)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return to_out(doc, "owner", current_user.name)


@router.get("", response_model=list[DocSummary])
def list_documents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Everything the caller can open: documents they own plus shared with them."""
    owned = session.exec(
        select(Document).where(Document.owner_id == current_user.id)
    ).all()
    shared = session.exec(
        select(Document, Share.role)
        .join(Share, Share.document_id == Document.id)
        .where(Share.user_id == current_user.id)
    ).all()

    pairs = [(d, "owner") for d in owned] + [(d, role) for d, role in shared]

    owner_ids = {d.owner_id for d, _ in pairs}
    names: dict[int, str] = {}
    if owner_ids:
        names = {
            u.id: u.name
            for u in session.exec(select(User).where(col(User.id).in_(owner_ids))).all()
        }

    items = [to_summary(d, role, names.get(d.owner_id, "Unknown")) for d, role in pairs]
    items.sort(key=lambda s: s.updated_at, reverse=True)
    return items


@router.get("/{doc_id}", response_model=DocOut)
def get_document(
    doc_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    doc, role = get_doc_and_role(session, doc_id, current_user)
    return to_out(doc, role, owner_name_of(session, doc))


@router.patch("/{doc_id}", response_model=DocOut)
def update_document(
    doc_id: int,
    body: DocUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    doc, role = get_doc_and_role(session, doc_id, current_user)
    if role == "viewer":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You have view-only access to this document"
        )
    if body.title is not None:
        doc.title = clean_title(body.title)
    if body.content is not None:
        doc.content = body.content
    doc.updated_at = utcnow()
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return to_out(doc, role, owner_name_of(session, doc))


# ---------- Sharing endpoints (owner only) ----------
@router.get("/{doc_id}/shares", response_model=list[ShareOut])
def list_shares(
    doc_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    doc = require_owner(session, doc_id, current_user)
    rows = session.exec(
        select(Share, User)
        .join(User, User.id == Share.user_id)
        .where(Share.document_id == doc.id)
        .order_by(User.name)
    ).all()
    return [
        ShareOut(user_id=u.id, name=u.name, email=u.email, role=s.role) for s, u in rows
    ]


@router.put("/{doc_id}/shares", response_model=ShareOut)
def grant_or_change_share(
    doc_id: int,
    body: ShareRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Give someone access, or change their role if they already have it."""
    doc = require_owner(session, doc_id, current_user)
    if body.user_id == current_user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "You already own this document"
        )
    target = session.get(User, body.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    share = session.exec(
        select(Share).where(Share.document_id == doc.id, Share.user_id == target.id)
    ).first()
    if share is None:
        share = Share(document_id=doc.id, user_id=target.id, role=body.role)
    else:
        share.role = body.role
    session.add(share)
    session.commit()
    session.refresh(share)
    return ShareOut(
        user_id=target.id, name=target.name, email=target.email, role=share.role
    )


@router.delete("/{doc_id}/shares/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(
    doc_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    doc = require_owner(session, doc_id, current_user)
    share = session.exec(
        select(Share).where(Share.document_id == doc.id, Share.user_id == user_id)
    ).first()
    if share is not None:
        session.delete(share)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
