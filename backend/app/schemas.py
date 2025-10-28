from typing import List, Optional

from pydantic import BaseModel, Field


class OfferBase(BaseModel):
    offer_id: str
    offer_name: str
    category: Optional[str] = None
    geo: Optional[str] = None
    payout_type: Optional[str] = None
    payout_value: Optional[str] = None
    acceptance_rate: Optional[float] = None
    cookie_days: Optional[int] = None
    listing_date: Optional[str] = None

    class Config:
        orm_mode = True


class TopMover(OfferBase):
    epc_start: float = Field(..., description="EPC at the beginning of the window")
    epc_end: float = Field(..., description="EPC at the end of the window")
    delta_abs: float = Field(..., description="Absolute EPC change over the window")
    delta_pct: float = Field(..., description="Percent EPC change over the window")


class TopMoversResponse(BaseModel):
    __root__: List[TopMover]


class HistoryPoint(BaseModel):
    date: str
    epc: float


class OfferHistoryResponse(OfferBase):
    history: List[HistoryPoint]


class FetchSnapshotResponse(BaseModel):
    offers_processed: int
    offers_inserted: int
    offers_updated: int
    snapshots_inserted: int
    snapshots_updated: int


class ErrorResponse(BaseModel):
    error: str
