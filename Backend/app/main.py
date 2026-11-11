from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from .auth import create_token, get_current_user, verify_password
from .database import engine, get_session, init_db
from .documents import router as documents_router
from .models import User
from .seed import seed_users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(engine) as session:
        seed_users(session)
    yield


app = FastAPI(title="Docs App", lifespan=lifespan)
app.include_router(documents_router)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str


class LoginResponse(BaseModel):
    access_token: str
    user: UserOut


@app.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(
        select(User).where(User.email == body.email.strip().lower())
    ).first()
    # Same error for unknown email and wrong password, so we don't leak which exists
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return LoginResponse(
        access_token=create_token(user.id),
        user=UserOut.model_validate(user, from_attributes=True),
    )


@app.get("/api/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/api/users", response_model=list[UserOut])
def list_other_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Everyone except the caller. Feeds the 'share with' dropdown."""
    return session.exec(
        select(User).where(User.id != current_user.id).order_by(User.name)
    ).all()
