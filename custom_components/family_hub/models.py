"""Validated, serializable Family Hub domain models.

Models are independent of Home Assistant so they can be unit-tested without
starting a Home Assistant instance. Identifiers are generated at creation time.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from uuid import uuid4


def new_id():
    """Create a stable, non-sequential identifier for stored records."""
    return uuid4().hex


def timestamp():
    """Use timezone-aware UTC timestamps for audit records."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Member:
    """A household member, optionally linked to a Home Assistant user."""
    name: str
    role: str = "child"
    ha_user_id: str | None = None
    color: str = "#64748b"
    id: str = field(default_factory=new_id)

    def __post_init__(self):
        if not self.name.strip():
            raise ValueError("Member name is required")
        if self.role not in {"child", "adult"}:
            raise ValueError("Member role must be child or adult")

    def to_dict(self):
        return asdict(self)


@dataclass
class Chore:
    """One assignment with optional recurrence and approval requirements."""
    title: str
    assignee_ids: list[str]
    points: int = 0
    recurrence: str = "daily"
    approval_required: bool = False
    description: str = ""
    id: str = field(default_factory=new_id)

    def __post_init__(self):
        if not self.title.strip():
            raise ValueError("Chore title is required")
        if not self.assignee_ids:
            raise ValueError("At least one assignee is required")
        if not 0 <= self.points <= 100000:
            raise ValueError("Points must be between 0 and 100000")
        if self.recurrence not in {"once", "daily", "weekly"}:
            raise ValueError("Unsupported recurrence")

    def to_dict(self):
        return asdict(self)


@dataclass
class Reward:
    """A redeemable reward with a fixed non-negative point cost."""
    title: str
    cost: int
    description: str = ""
    id: str = field(default_factory=new_id)

    def __post_init__(self):
        if not self.title.strip():
            raise ValueError("Reward title is required")
        if self.cost < 0:
            raise ValueError("Reward cost cannot be negative")

    def to_dict(self):
        return asdict(self)
