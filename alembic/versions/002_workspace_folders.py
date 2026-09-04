"""Workspace folders and suite order.

Revision ID: 002_workspace_folders
Revises: 001_initial_workspace
Create Date: 2026-09-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_workspace_folders"
down_revision: Union[str, Sequence[str], None] = "001_initial_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("suites", sa.Column("folder", sa.String(length=255), nullable=False, server_default=""))
    op.add_column("suites", sa.Column("position", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "workspace_folders",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "name", name="uq_workspace_folders_owner_name"),
    )
    op.create_index("ix_workspace_folders_owner_id", "workspace_folders", ["owner_id"])


def downgrade() -> None:
    op.drop_table("workspace_folders")
    op.drop_column("suites", "position")
    op.drop_column("suites", "folder")
