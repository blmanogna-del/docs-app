from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True)
    password_hash: str


class Document(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(default="Untitled document")
    content: str = Field(default="")  # HTML from the editor
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Share(SQLModel, table=True):
    """Grants one user access to one document. Owner is not stored here."""

    __table_args__ = (UniqueConstraint("document_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="document.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str  # "viewer" or "editor"
    created_at: datetime = Field(default_factory=utcnow)
