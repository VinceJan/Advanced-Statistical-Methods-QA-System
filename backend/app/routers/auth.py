from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SessionToken, User
from ..schemas import AuthResponse, LoginRequest, RegisterRequest
from ..security import create_session, current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username.strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(username=username, password_hash=hash_password(payload.password), role="student")
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_session(db, user)
    return AuthResponse(token=token, username=user.username, role=user.role)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_session(db, user)
    return AuthResponse(token=token, username=user.username, role=user.role)


@router.get("/me", response_model=AuthResponse)
def me(user: User = Depends(current_user)) -> AuthResponse:
    return AuthResponse(token="", username=user.username, role=user.role)


@router.post("/logout")
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    db.query(SessionToken).filter(SessionToken.user_id == user.id).delete()
    db.commit()
    return {"message": "已退出登录"}
