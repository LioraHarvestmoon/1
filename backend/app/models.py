from sqlalchemy import Column, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


class Offer(Base):
    __tablename__ = "offers"

    offer_id = Column(String, primary_key=True, index=True)
    offer_name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    geo = Column(String, nullable=True)
    payout_type = Column(String, nullable=True)
    payout_value = Column(String, nullable=True)
    acceptance_rate = Column(Float, nullable=True)
    cookie_days = Column(Integer, nullable=True)
    listing_date = Column(String, nullable=True)

    snapshots = relationship(
        "OfferEPCSnapshot",
        back_populates="offer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class OfferEPCSnapshot(Base):
    __tablename__ = "offer_epc_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(String, ForeignKey("offers.offer_id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String, nullable=False, index=True)
    epc_current = Column(Float, nullable=False)
    epc_7d = Column(Float, nullable=True)
    epc_30d = Column(Float, nullable=True)

    offer = relationship("Offer", back_populates="snapshots")

    __table_args__ = (UniqueConstraint("offer_id", "date", name="uq_offer_snapshot_date"),)
