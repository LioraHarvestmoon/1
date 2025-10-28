from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Offer, OfferEPCSnapshot
from .partnermatic import PartnerMaticAPIError, fetch_offers_from_partnermatic
from .schemas import ErrorResponse, FetchSnapshotResponse, OfferHistoryResponse, TopMover

app = FastAPI(title="Affiliate Offer EPC Monitor", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


VALID_WINDOWS = {7, 15, 30, 60, 90}
DEFAULT_WINDOW = 30


@app.post(
    "/api/fetch-and-snapshot",
    response_model=FetchSnapshotResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def fetch_and_snapshot(db: Session = Depends(get_db)) -> FetchSnapshotResponse:
    try:
        offers = fetch_offers_from_partnermatic()
    except PartnerMaticAPIError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    today = datetime.utcnow().date().isoformat()
    offers_processed = 0
    offers_inserted = 0
    offers_updated = 0
    snapshots_inserted = 0
    snapshots_updated = 0

    for offer_data in offers:
        offers_processed += 1
        offer_id_raw = offer_data.get("offer_id")
        offer_id = str(offer_id_raw) if offer_id_raw is not None else None
        if not offer_id:
            continue

        offer = db.get(Offer, offer_id)
        is_new_offer = offer is None
        if offer is None:
            offer = Offer(offer_id=offer_id, offer_name=offer_data.get("offer_name", "Unknown Offer"))

        offer.offer_name = offer_data.get("offer_name", offer.offer_name)
        offer.category = offer_data.get("category")
        offer.geo = offer_data.get("geo")
        offer.payout_type = offer_data.get("payout_type")
        offer.payout_value = offer_data.get("payout_value")
        acceptance_rate = offer_data.get("acceptance_rate")
        offer.acceptance_rate = float(acceptance_rate) if acceptance_rate is not None else None
        cookie_days = offer_data.get("cookie_days")
        offer.cookie_days = int(cookie_days) if cookie_days is not None else None
        offer.listing_date = offer_data.get("listing_date")

        if is_new_offer:
            db.add(offer)
            offers_inserted += 1
        else:
            offers_updated += 1

        snapshot = (
            db.query(OfferEPCSnapshot)
            .filter(OfferEPCSnapshot.offer_id == offer_id, OfferEPCSnapshot.date == today)
            .one_or_none()
        )

        epc_current_raw = offer_data.get("epc_current")
        epc_current = float(epc_current_raw) if epc_current_raw is not None else 0.0
        epc_7d_raw = offer_data.get("epc_7d")
        epc_7d = float(epc_7d_raw) if epc_7d_raw is not None else None
        epc_30d_raw = offer_data.get("epc_30d")
        epc_30d = float(epc_30d_raw) if epc_30d_raw is not None else None

        if snapshot is None:
            snapshot = OfferEPCSnapshot(
                offer_id=offer_id,
                date=today,
                epc_current=epc_current,
                epc_7d=epc_7d,
                epc_30d=epc_30d,
            )
            db.add(snapshot)
            snapshots_inserted += 1
        else:
            snapshot.epc_current = epc_current
            snapshot.epc_7d = epc_7d
            snapshot.epc_30d = epc_30d
            snapshots_updated += 1

    db.commit()

    return FetchSnapshotResponse(
        offers_processed=offers_processed,
        offers_inserted=offers_inserted,
        offers_updated=offers_updated,
        snapshots_inserted=snapshots_inserted,
        snapshots_updated=snapshots_updated,
    )


@app.get(
    "/api/top-movers",
    response_model=List[TopMover],
    responses={400: {"model": ErrorResponse}},
)
def get_top_movers(
    window: int = Query(DEFAULT_WINDOW, description="Look-back window in days"),
    sortMode: str = Query("pct", pattern="^(pct|abs|current)$"),
    search: Optional[str] = Query(None, description="Filter offers by name or GEO"),
    db: Session = Depends(get_db),
) -> List[TopMover]:
    if window not in VALID_WINDOWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"window must be one of {sorted(VALID_WINDOWS)}",
        )

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=window - 1)
    start_date_str = start_date.isoformat()
    end_date_str = end_date.isoformat()

    offers_query = db.query(Offer)
    if search:
        trimmed_search = search.strip()
        if trimmed_search:
            like_pattern = f"%{trimmed_search}%"
            offers_query = offers_query.filter(
                (Offer.offer_name.ilike(like_pattern)) | (Offer.geo.ilike(like_pattern))
            )

    movers: List[TopMover] = []
    for offer in offers_query.all():
        snapshots = (
            db.query(OfferEPCSnapshot)
            .filter(
                OfferEPCSnapshot.offer_id == offer.offer_id,
                OfferEPCSnapshot.date >= start_date_str,
                OfferEPCSnapshot.date <= end_date_str,
            )
            .order_by(OfferEPCSnapshot.date.asc())
            .all()
        )

        if not snapshots:
            continue

        epc_start = snapshots[0].epc_current
        epc_end = snapshots[-1].epc_current
        delta_abs = epc_end - epc_start
        denominator = max(epc_start, 0.0001)
        delta_pct = (epc_end - epc_start) / denominator * 100

        movers.append(
            TopMover(
                offer_id=offer.offer_id,
                offer_name=offer.offer_name,
                category=offer.category,
                geo=offer.geo,
                payout_type=offer.payout_type,
                payout_value=offer.payout_value,
                acceptance_rate=offer.acceptance_rate,
                cookie_days=offer.cookie_days,
                listing_date=offer.listing_date,
                epc_start=epc_start,
                epc_end=epc_end,
                delta_abs=delta_abs,
                delta_pct=delta_pct,
            )
        )

    if sortMode == "pct":
        movers.sort(key=lambda m: m.delta_pct, reverse=True)
    elif sortMode == "abs":
        movers.sort(key=lambda m: m.delta_abs, reverse=True)
    else:
        movers.sort(key=lambda m: m.epc_end, reverse=True)

    return movers


@app.get(
    "/api/offer/{offer_id}/history",
    response_model=OfferHistoryResponse,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
def get_offer_history(
    offer_id: str,
    window: int = Query(90, description="History window in days"),
    db: Session = Depends(get_db),
) -> OfferHistoryResponse:
    if window not in {30, 60, 90}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="window must be one of [30, 60, 90]",
        )

    offer = db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=window - 1)

    history_snapshots = (
        db.query(OfferEPCSnapshot)
        .filter(
            OfferEPCSnapshot.offer_id == offer_id,
            OfferEPCSnapshot.date >= start_date.isoformat(),
            OfferEPCSnapshot.date <= end_date.isoformat(),
        )
        .order_by(OfferEPCSnapshot.date.asc())
        .all()
    )

    history = [
        {"date": snapshot.date, "epc": snapshot.epc_current}
        for snapshot in history_snapshots
    ]

    return OfferHistoryResponse(
        offer_id=offer.offer_id,
        offer_name=offer.offer_name,
        category=offer.category,
        geo=offer.geo,
        payout_type=offer.payout_type,
        payout_value=offer.payout_value,
        acceptance_rate=offer.acceptance_rate,
        cookie_days=offer.cookie_days,
        listing_date=offer.listing_date,
        history=history,
    )


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
