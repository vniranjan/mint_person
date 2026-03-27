"""
SQLAlchemy engine and session factory for the Python worker.

The worker connects as worker_role (BYPASSRLS) using the DATABASE_URL env var.
In production: set DATABASE_URL to use the worker_role credentials, not the app user.

Usage:
    from database import get_session

    with get_session() as db:
        jobs = db.query(JobStatus).filter(JobStatus.stage == "QUEUED").all()
"""
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,      # verify connection is alive before use
    pool_size=5,             # worker is single-process; small pool is fine
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def get_session() -> Session:  # type: ignore[misc]
    """
    Context manager for SQLAlchemy sessions.

    Commits on clean exit, rolls back on exception.
    Always closes the session.

    Usage:
        with get_session() as db:
            db.query(JobStatus).filter(...).all()
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
