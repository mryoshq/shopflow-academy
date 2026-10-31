"""ADR-0039: badges already earned and the class goal. Never grade or attempt records."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class StudentBadge(Base):
    """A badge earned once (kept even if the course changes later). Derived from attempts, recomputable."""

    __tablename__ = "student_badges"
    __table_args__ = (UniqueConstraint("user_id", "course_id", "key", name="uq_student_badge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(160), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    rules_version: Mapped[int] = mapped_column(Integer, nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ClassGoal(Base):
    """The class goal chosen by the teacher (no row = default: every main mission solved by everyone)."""

    __tablename__ = "class_goals"
    __table_args__ = (UniqueConstraint("cohort_id", "course_id", name="uq_class_goal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    metric: Mapped[str] = mapped_column(String(16), nullable=False)
    target: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
