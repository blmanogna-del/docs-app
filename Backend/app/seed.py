from sqlmodel import Session, select

from .auth import hash_password
from .models import User

SEED_USERS = [
    ("Alice", "alice@example.com", "alice123"),
    ("Bob", "bob@example.com", "bob123"),
    ("Carol", "carol@example.com", "carol123"),
]


def seed_users(session: Session) -> None:
    if session.exec(select(User)).first():
        return
    for name, email, password in SEED_USERS:
        session.add(User(name=name, email=email, password_hash=hash_password(password)))
    session.commit()
