from __future__ import annotations

import logging
from typing import Any, Dict, List

import requests

from .config import get_settings

logger = logging.getLogger(__name__)


SAMPLE_OFFERS: List[Dict[str, Any]] = [
    {
        "offer_id": "128541",
        "offer_name": "MOYU UK",
        "category": "Others",
        "geo": "UK",
        "payout_type": "Per Sale",
        "payout_value": "12%",
        "acceptance_rate": 42.85,
        "cookie_days": 30,
        "listing_date": "2025-02-25",
        "epc_current": 133.0,
        "epc_7d": 95.0,
        "epc_30d": 74.0,
    },
    {
        "offer_id": "839441",
        "offer_name": "Zenify Sleep Gummies",
        "category": "Health & Beauty",
        "geo": "US",
        "payout_type": "Per Sale",
        "payout_value": "$28.00",
        "acceptance_rate": 55.1,
        "cookie_days": 45,
        "listing_date": "2024-11-16",
        "epc_current": 87.5,
        "epc_7d": 61.2,
        "epc_30d": 38.4,
    },
    {
        "offer_id": "992114",
        "offer_name": "FitWave Pro Trainer",
        "category": "Sports & Outdoors",
        "geo": "CA",
        "payout_type": "Per Lead",
        "payout_value": "$19.00",
        "acceptance_rate": 38.2,
        "cookie_days": 20,
        "listing_date": "2024-09-09",
        "epc_current": 41.3,
        "epc_7d": 25.7,
        "epc_30d": 19.4,
    },
]


class PartnerMaticAPIError(Exception):
    """Raised when the PartnerMatic API fails."""


def fetch_offers_from_partnermatic() -> List[Dict[str, Any]]:
    settings = get_settings()
    if not settings.partnermatic_token:
        raise PartnerMaticAPIError("PARTNERMATIC_TOKEN is not configured")

    payload = {"source": "partnermatic", "token": settings.partnermatic_token}

    try:
        response = requests.post(settings.partnermatic_base_url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError("Unexpected response format")
        return data
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falling back to sample PartnerMatic data due to error: %s", exc)
        return SAMPLE_OFFERS
