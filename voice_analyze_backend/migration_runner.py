"""Run Tarannum schema migrations safely before a deployment starts.

Legacy production databases predate Alembic. The first run stamps only the
known legacy baseline, then upgrades to the current head. A PostgreSQL advisory
lock serialises migrations when several services deploy at the same time.
"""

from pathlib import Path
import logging
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool


BASELINE_REVISION = "20261028_0001"
MIGRATION_LOCK_ID = 746_272_663_001
LOGGER = logging.getLogger("tarannum.migrations")


def _alembic_config(connection) -> Config:
    backend_dir = Path(__file__).resolve().parent
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["connection"] = connection
    return config


def run_migrations() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL must be configured before running migrations")

    engine = create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": MIGRATION_LOCK_ID},
            )
            # The lock is session-scoped, so committing the implicit SQLAlchemy
            # transaction keeps the lock while allowing Alembic to own and
            # commit its migration transactions normally.
            connection.commit()
            try:
                inspector = inspect(connection)
                tables = set(inspector.get_table_names())
                if "users" not in tables:
                    raise RuntimeError(
                        "Legacy schema is missing the users table. "
                        "Bootstrap a new database explicitly before stamping the baseline."
                    )

                config = _alembic_config(connection)
                if "alembic_version" not in tables:
                    LOGGER.info("Stamping existing Tarannum schema at %s", BASELINE_REVISION)
                    command.stamp(config, BASELINE_REVISION)

                LOGGER.info("Upgrading Tarannum schema to Alembic head")
                command.upgrade(config, "head")
            finally:
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": MIGRATION_LOCK_ID},
                )
    finally:
        engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    run_migrations()
