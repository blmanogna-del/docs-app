import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import app
from app.seed import seed_users


@pytest.fixture()
def client(tmp_path):
    # A throwaway database file, so the real app.db is never touched
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_users(session)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, name):
    res = client.post(
        "/api/auth/login",
        json={"email": f"{name}@example.com", "password": f"{name}123"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


def test_viewer_can_read_but_not_edit_and_stranger_is_blocked(client):
    alice, _ = login(client, "alice")
    bob, bob_id = login(client, "bob")
    carol, _ = login(client, "carol")

    # Alice creates a document and writes content
    doc_id = client.post("/api/documents", json={}, headers=alice).json()["id"]
    res = client.patch(
        f"/api/documents/{doc_id}",
        json={"content": "<p>original</p>"},
        headers=alice,
    )
    assert res.status_code == 200

    # Carol has no access yet
    assert client.get(f"/api/documents/{doc_id}", headers=carol).status_code == 403

    # Alice shares with Bob as a viewer
    res = client.put(
        f"/api/documents/{doc_id}/shares",
        json={"user_id": bob_id, "role": "viewer"},
        headers=alice,
    )
    assert res.status_code == 200

    # Bob can read it, and his role is viewer
    res = client.get(f"/api/documents/{doc_id}", headers=bob)
    assert res.status_code == 200
    assert res.json()["role"] == "viewer"

    # Bob cannot edit it
    res = client.patch(
        f"/api/documents/{doc_id}",
        json={"content": "<p>hacked</p>"},
        headers=bob,
    )
    assert res.status_code == 403

    # The content is unchanged
    res = client.get(f"/api/documents/{doc_id}", headers=alice)
    assert res.json()["content"] == "<p>original</p>"
