from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from webapp.db import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("issuer", "sub", name="uq_users_issuer_sub"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    issuer: Mapped[str] = mapped_column(String(512), nullable=False)
    sub: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    collections: Mapped[list[Collection]] = relationship(back_populates="owner")


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    selected_environment: Mapped[str] = mapped_column(String(255), default="")
    folder: Mapped[str] = mapped_column(String(255), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    source_collection_id: Mapped[str | None] = mapped_column(
        ForeignKey("collections.id", ondelete="SET NULL"), nullable=True, index=True
    )
    document: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    owner: Mapped[User] = relationship(back_populates="collections")
    scenarios: Mapped[list[Scenario]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="Scenario.created_at",
    )
    env_values: Mapped[list[CollectionEnvValue]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    shares: Mapped[list[CollectionShare]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    source_collection: Mapped[Collection | None] = relationship(
        remote_side="Collection.id",
        foreign_keys=[source_collection_id],
    )


class Scenario(Base):
    __tablename__ = "scenarios"
    __table_args__ = (UniqueConstraint("collection_id", "name", name="uq_scenarios_collection_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    collection_id: Mapped[str] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    collection: Mapped[Collection] = relationship(back_populates="scenarios")


class CollectionEnvValue(Base):
    __tablename__ = "collection_env_values"
    __table_args__ = (
        UniqueConstraint("collection_id", "owner_id", "environment_name", name="uq_collection_env_owner"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    collection_id: Mapped[str] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    environment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    values: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    collection: Mapped[Collection] = relationship(back_populates="env_values")


class CollectionShare(Base):
    __tablename__ = "collection_shares"
    __table_args__ = (UniqueConstraint("collection_id", "user_id", name="uq_collection_shares_collection_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    collection_id: Mapped[str] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission: Mapped[str] = mapped_column(String(16), default="read")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    collection: Mapped[Collection] = relationship(back_populates="shares")
    recipient: Mapped[User] = relationship(foreign_keys=[user_id])
    sharer: Mapped[User] = relationship(foreign_keys=[owner_id])


class WorkspaceFolder(Base):
    __tablename__ = "workspace_folders"
    __table_args__ = (
        UniqueConstraint("owner_id", "parent", "name", name="uq_workspace_folders_owner_parent_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent: Mapped[str] = mapped_column(String(255), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
