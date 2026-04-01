"""
SQLAlchemy ORM models mirroring the Prisma schema.

The Python worker connects as worker_role (BYPASSRLS) — it can access any user's data
without RLS filtering. This is intentional: the worker processes jobs for any user.

Column names use snake_case to match PostgreSQL column names exactly.
Prisma handles the camelCase↔snake_case mapping for the TypeScript app; SQLAlchemy
speaks directly to Postgres so it uses the raw column names.

DateTime columns use timezone=False to match Prisma's TIMESTAMP(3) (no timezone).
Prisma does not add timezone by default — using TIMESTAMPTZ here would cause implicit
server-timezone conversions that could shift financial transaction dates.

Architecture note: Prisma is the schema source of truth. Any change to schema.prisma
must be reflected here to keep the worker in sync.
"""
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()

# Job stage enum values — must match Prisma JobStage enum exactly.
# Frontend switches on these string values; do not rename or reorder.
JOB_STAGE_ENUM = SAEnum(
    "QUEUED", "UPLOADING", "READING", "CATEGORIZING", "COMPLETE", "FAILED",
    name="JobStage",
)

ROLE_ENUM = SAEnum("USER", "ADMIN", name="Role")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    email = Column(String, unique=True, nullable=False)
    email_verified = Column(DateTime(timezone=False), name="emailVerified")
    image = Column(String)
    role = Column(ROLE_ENUM, nullable=False, server_default="USER")
    is_active = Column(Boolean, nullable=False, server_default="true", name="isActive")
    password_hash = Column(String, name="passwordHash")
    created_at = Column(DateTime(timezone=False), server_default=func.now(), name="createdAt")
    updated_at = Column(
        DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), name="updatedAt"
    )
    last_login_at = Column(DateTime(timezone=False), name="lastLoginAt")

    statements = relationship("Statement", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    corrections = relationship("CorrectionLog", back_populates="user", cascade="all, delete-orphan")
    job_statuses = relationship("JobStatus", back_populates="user", cascade="all, delete-orphan")


class Statement(Base):
    __tablename__ = "statements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, name="userId",
    )
    filename = Column(String, nullable=False)
    institution = Column(String)
    uploaded_at = Column(DateTime(timezone=False), server_default=func.now(), name="uploadedAt")

    user = relationship("User", back_populates="statements")
    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")
    job_statuses = relationship("JobStatus", back_populates="statement")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, name="userId",
    )
    statement_id = Column(
        UUID(as_uuid=True), ForeignKey("statements.id", ondelete="CASCADE"),
        nullable=False, name="statementId",
    )
    date = Column(DateTime(timezone=False), nullable=False)
    merchant_raw = Column(String, nullable=False, name="merchantRaw")
    merchant_norm = Column(String, nullable=False, name="merchantNorm")
    amount = Column(Numeric(12, 2), nullable=False)
    category = Column(String)           # null until LLM categorization runs
    confidence = Column(Float)          # null until LLM runs; < 0.70 → review queue
    is_flagged = Column(Boolean, nullable=False, server_default="false", name="isFlagged")
    pattern_applied_note = Column(String, nullable=True, name="patternAppliedNote")
    is_duplicate = Column(Boolean, nullable=False, server_default="false", name="isDuplicate")
    is_excluded = Column(Boolean, nullable=False, server_default="false", name="isExcluded")
    is_reviewed = Column(Boolean, nullable=False, server_default="false", name="isReviewed")
    created_at = Column(DateTime(timezone=False), server_default=func.now(), name="createdAt")

    user = relationship("User", back_populates="transactions")
    statement = relationship("Statement", back_populates="transactions")


class CorrectionLog(Base):
    __tablename__ = "correction_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, name="userId",
    )
    # merchantPattern: normalized merchant string used for future LLM few-shot matching.
    # NOT the raw merchant name — normalized to remove transaction-specific suffixes.
    merchant_pattern = Column(String, nullable=False, name="merchantPattern")
    corrected_category = Column(String, nullable=False, name="correctedCategory")
    created_at = Column(DateTime(timezone=False), server_default=func.now(), name="createdAt")

    user = relationship("User", back_populates="corrections")


class JobStatus(Base):
    __tablename__ = "job_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, name="userId",
    )
    # statementId is nullable: job_status row survives statement deletion for audit.
    statement_id = Column(
        UUID(as_uuid=True), ForeignKey("statements.id", ondelete="SET NULL"),
        nullable=True, name="statementId",
    )
    stage = Column(JOB_STAGE_ENUM, nullable=False, server_default="QUEUED")
    transaction_count = Column(Integer, nullable=False, server_default="0", name="transactionCount")
    error_message = Column(String, name="errorMessage")
    created_at = Column(DateTime(timezone=False), server_default=func.now(), name="createdAt")
    updated_at = Column(
        DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), name="updatedAt"
    )

    user = relationship("User", back_populates="job_statuses")
    statement = relationship("Statement", back_populates="job_statuses")
