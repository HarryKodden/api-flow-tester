"""Allow nested workspace folders.

Revision ID: 003_nested_workspace_folders
Revises: 002_workspace_folders
Create Date: 2026-09-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_nested_workspace_folders"
down_revision: Union[str, Sequence[str], None] = "002_workspace_folders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("workspace_folders") as batch:
        batch.add_column(sa.Column("parent", sa.String(length=255), nullable=False, server_default=""))
        batch.drop_constraint("uq_workspace_folders_owner_name", type_="unique")
        batch.create_unique_constraint(
            "uq_workspace_folders_owner_parent_name",
            ["owner_id", "parent", "name"],
        )


def downgrade() -> None:
    with op.batch_alter_table("workspace_folders") as batch:
        batch.drop_constraint("uq_workspace_folders_owner_parent_name", type_="unique")
        batch.create_unique_constraint("uq_workspace_folders_owner_name", ["owner_id", "name"])
        batch.drop_column("parent")
