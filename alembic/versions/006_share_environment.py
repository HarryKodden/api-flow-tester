"""Add optional environment sharing on collection shares.

Revision ID: 006_share_environment
Revises: 005_collection_shares
Create Date: 2026-09-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "006_share_environment"
down_revision: Union[str, Sequence[str], None] = "005_collection_shares"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "share_environment" in _columns("collection_shares"):
        return
    with op.batch_alter_table("collection_shares") as batch:
        batch.add_column(
            sa.Column(
                "share_environment",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    if "share_environment" not in _columns("collection_shares"):
        return
    with op.batch_alter_table("collection_shares") as batch:
        batch.drop_column("share_environment")
