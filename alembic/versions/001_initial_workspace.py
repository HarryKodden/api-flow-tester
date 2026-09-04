"""Initial users, suites, scenarios, and private suite env values.

Revision ID: 001_initial_workspace
Revises:
Create Date: 2026-09-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial_workspace"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("issuer", sa.String(length=512), nullable=False),
        sa.Column("sub", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("issuer", "sub", name="uq_users_issuer_sub"),
    )
    op.create_table(
        "suites",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("selected_environment", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_suites_owner_id", "suites", ["owner_id"])
    op.create_table(
        "scenarios",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("suite_id", sa.String(length=36), sa.ForeignKey("suites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("suite_id", "name", name="uq_scenarios_suite_name"),
    )
    op.create_index("ix_scenarios_owner_id", "scenarios", ["owner_id"])
    op.create_index("ix_scenarios_suite_id", "scenarios", ["suite_id"])
    op.create_table(
        "suite_env_values",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("suite_id", sa.String(length=36), sa.ForeignKey("suites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("environment_name", sa.String(length=255), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("suite_id", "environment_name", name="uq_suite_env"),
    )
    op.create_index("ix_suite_env_values_owner_id", "suite_env_values", ["owner_id"])
    op.create_index("ix_suite_env_values_suite_id", "suite_env_values", ["suite_id"])


def downgrade() -> None:
    op.drop_table("suite_env_values")
    op.drop_table("scenarios")
    op.drop_table("suites")
    op.drop_table("users")
