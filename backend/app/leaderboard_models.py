"""Part K only: presentation preferences, never grade or attempt records."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class LeaderboardSettings(Base):
    __tablename__ = "leaderboard_settings"
    __table_args__ = (UniqueConstraint("cohort_id", "course_id", name="uq_leaderboard_class_course"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    top_three: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    hide_open_block: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())


class LeaderboardName(Base):
    __tablename__ = "leaderboard_names"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(24), nullable=False)
