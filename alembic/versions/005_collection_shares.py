"""Add live collection shares and fork source links.

Revision ID: 005_collection_shares
Revises: 004_rename_suite_to_collection
Create Date: 2026-09-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "005_collection_shares"
down_revision: Union[str, Sequence[str], None] = "004_rename_suite_to_collection"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _unique_names(table: str) -> set[str]:
    return {item["name"] for item in inspect(op.get_bind()).get_unique_constraints(table)}


def upgrade() -> None:
    cols = _columns("collections")
    if "source_collection_id" not in cols:
        with op.batch_alter_table("collections") as batch:
            batch.add_column(sa.Column("source_collection_id", sa.String(length=36), nullable=True))
            batch.create_foreign_key(
                "fk_collections_source_collection_id",
                "collections",
                ["source_collection_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch.create_index("ix_collections_source_collection_id", ["source_collection_id"])
    else:
        indexes = {item["name"] for item in inspect(op.get_bind()).get_indexes("collections")}
        if "ix_collections_source_collection_id" not in indexes:
            op.create_index("ix_collections_source_collection_id", "collections", ["source_collection_id"])

    if "collection_shares" not in _tables():
        op.create_table(
            "collection_shares",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "collection_id",
                sa.String(length=36),
                sa.ForeignKey("collections.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "owner_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("permission", sa.String(length=16), nullable=False, server_default="read"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("collection_id", "user_id", name="uq_collection_shares_collection_user"),
        )
        op.create_index("ix_collection_shares_collection_id", "collection_shares", ["collection_id"])
        op.create_index("ix_collection_shares_owner_id", "collection_shares", ["owner_id"])
        op.create_index("ix_collection_shares_user_id", "collection_shares", ["user_id"])

    env_uniques = _unique_names("collection_env_values")
    if "uq_collection_env_owner" not in env_uniques:
        with op.batch_alter_table("collection_env_values") as batch:
            if "uq_collection_env" in env_uniques:
                batch.drop_constraint("uq_collection_env", type_="unique")
            batch.create_unique_constraint(
                "uq_collection_env_owner",
                ["collection_id", "owner_id", "environment_name"],
            )


def downgrade() -> None:
    with op.batch_alter_table("collection_env_values") as batch:
        batch.drop_constraint("uq_collection_env_owner", type_="unique")
        batch.create_unique_constraint("uq_collection_env", ["collection_id", "environment_name"])

    if "collection_shares" in _tables():
        op.drop_table("collection_shares")

    cols = _columns("collections")
    if "source_collection_id" in cols:
        with op.batch_alter_table("collections") as batch:
            batch.drop_constraint("fk_collections_source_collection_id", type_="foreignkey")
            batch.drop_index("ix_collections_source_collection_id")
            batch.drop_column("source_collection_id")
