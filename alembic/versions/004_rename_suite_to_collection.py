"""Rename suite tables/columns to collection.

Revision ID: 004_rename_suite_to_collection
Revises: 003_nested_workspace_folders
Create Date: 2026-09-04
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "004_rename_suite_to_collection"
down_revision: Union[str, Sequence[str], None] = "003_nested_workspace_folders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _already_renamed() -> bool:
    tables = _tables()
    if "collections" not in tables or "scenarios" not in tables:
        return False
    cols = _columns("scenarios")
    return "collection_id" in cols and "suite_id" not in cols


def upgrade() -> None:
    if _already_renamed():
        return
    if "suites" not in _tables():
        raise RuntimeError("Expected suites table before rename to collections")

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        _upgrade_sqlite()
    else:
        _upgrade_postgres()


def downgrade() -> None:
    tables = _tables()
    if "suites" in tables and "collections" not in tables:
        return
    if "collections" not in tables:
        raise RuntimeError("Expected collections table before rename back to suites")

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        _downgrade_sqlite()
    else:
        _downgrade_postgres()


def _upgrade_postgres() -> None:
    op.rename_table("suites", "collections")
    op.rename_table("suite_env_values", "collection_env_values")
    op.alter_column("scenarios", "suite_id", new_column_name="collection_id")
    op.alter_column("collection_env_values", "suite_id", new_column_name="collection_id")
    op.execute("ALTER INDEX IF EXISTS ix_suites_owner_id RENAME TO ix_collections_owner_id")
    op.execute("ALTER INDEX IF EXISTS ix_scenarios_suite_id RENAME TO ix_scenarios_collection_id")
    op.execute("ALTER INDEX IF EXISTS ix_suite_env_values_owner_id RENAME TO ix_collection_env_values_owner_id")
    op.execute("ALTER INDEX IF EXISTS ix_suite_env_values_suite_id RENAME TO ix_collection_env_values_collection_id")
    op.execute(
        "ALTER TABLE scenarios RENAME CONSTRAINT uq_scenarios_suite_name TO uq_scenarios_collection_name"
    )
    op.execute("ALTER TABLE collection_env_values RENAME CONSTRAINT uq_suite_env TO uq_collection_env")


def _downgrade_postgres() -> None:
    op.execute("ALTER TABLE collection_env_values RENAME CONSTRAINT uq_collection_env TO uq_suite_env")
    op.execute(
        "ALTER TABLE scenarios RENAME CONSTRAINT uq_scenarios_collection_name TO uq_scenarios_suite_name"
    )
    op.execute("ALTER INDEX IF EXISTS ix_collection_env_values_collection_id RENAME TO ix_suite_env_values_suite_id")
    op.execute("ALTER INDEX IF EXISTS ix_collection_env_values_owner_id RENAME TO ix_suite_env_values_owner_id")
    op.execute("ALTER INDEX IF EXISTS ix_scenarios_collection_id RENAME TO ix_scenarios_suite_id")
    op.execute("ALTER INDEX IF EXISTS ix_collections_owner_id RENAME TO ix_suites_owner_id")
    op.alter_column("collection_env_values", "collection_id", new_column_name="suite_id")
    op.alter_column("scenarios", "collection_id", new_column_name="suite_id")
    op.rename_table("collection_env_values", "suite_env_values")
    op.rename_table("collections", "suites")


def _upgrade_sqlite() -> None:
    op.rename_table("suites", "collections")
    op.rename_table("suite_env_values", "collection_env_values")
    op.execute("ALTER TABLE scenarios RENAME COLUMN suite_id TO collection_id")
    op.execute("ALTER TABLE collection_env_values RENAME COLUMN suite_id TO collection_id")
    op.execute("DROP INDEX IF EXISTS ix_suites_owner_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_collections_owner_id ON collections (owner_id)")
    op.execute("DROP INDEX IF EXISTS ix_scenarios_suite_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_scenarios_collection_id ON scenarios (collection_id)")
    op.execute("DROP INDEX IF EXISTS ix_suite_env_values_owner_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_collection_env_values_owner_id ON collection_env_values (owner_id)")
    op.execute("DROP INDEX IF EXISTS ix_suite_env_values_suite_id")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_collection_env_values_collection_id "
        "ON collection_env_values (collection_id)"
    )


def _downgrade_sqlite() -> None:
    op.execute("DROP INDEX IF EXISTS ix_collections_owner_id")
    op.execute("DROP INDEX IF EXISTS ix_scenarios_collection_id")
    op.execute("DROP INDEX IF EXISTS ix_collection_env_values_owner_id")
    op.execute("DROP INDEX IF EXISTS ix_collection_env_values_collection_id")
    op.execute("ALTER TABLE scenarios RENAME COLUMN collection_id TO suite_id")
    op.execute("ALTER TABLE collection_env_values RENAME COLUMN collection_id TO suite_id")
    op.rename_table("collection_env_values", "suite_env_values")
    op.rename_table("collections", "suites")
    op.execute("CREATE INDEX IF NOT EXISTS ix_suites_owner_id ON suites (owner_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_scenarios_suite_id ON scenarios (suite_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_suite_env_values_owner_id ON suite_env_values (owner_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_suite_env_values_suite_id ON suite_env_values (suite_id)")
