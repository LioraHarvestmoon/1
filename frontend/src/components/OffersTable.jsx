import PropTypes from 'prop-types'

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '–'
  }
  return Number(value).toFixed(digits)
}

const formatPercentage = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '–'
  }
  return `${Number(value).toFixed(1)}%`
}

function OffersTable({ offers, loading, error, onSelectOffer }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-slate-600 shadow-lg">
        Loading offers…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-red-600 shadow-lg">
        {error}
      </div>
    )
  }

  if (!offers.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-lg">
        No offer snapshots found. Run the daily fetch to populate data.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
      <div className="hidden bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-10">
        <span className="col-span-2">Offer</span>
        <span>GEO</span>
        <span>Category</span>
        <span>Payout</span>
        <span>EPC start</span>
        <span>EPC end</span>
        <span>Change %</span>
        <span>Acceptance</span>
        <span>Cookie days</span>
        <span>Listing date</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {offers.map((offer) => (
          <li
            key={offer.offer_id}
            className="group cursor-pointer bg-white px-6 py-4 transition hover:bg-indigo-50"
            onClick={() => onSelectOffer(offer)}
          >
            <div className="grid grid-cols-1 gap-y-3 md:grid-cols-10 md:items-center md:gap-2">
              <div className="md:col-span-2">
                <p className="font-semibold text-slate-900 group-hover:text-indigo-700">
                  {offer.offer_name}
                </p>
                <p className="text-sm text-slate-500">{offer.payout_type || '—'}</p>
              </div>
              <p className="text-sm text-slate-700 md:text-center">{offer.geo || '—'}</p>
              <p className="text-sm text-slate-700 md:text-center">{offer.category || '—'}</p>
              <p className="text-sm text-slate-700 md:text-center">
                {offer.payout_type && offer.payout_value
                  ? `${offer.payout_type} • ${offer.payout_value}`
                  : offer.payout_value || offer.payout_type || '—'}
              </p>
              <p className="text-sm font-mono text-slate-700 md:text-center">${formatNumber(offer.epc_start)}</p>
              <p className="text-sm font-mono text-slate-700 md:text-center">${formatNumber(offer.epc_end)}</p>
              <p
                className={`text-sm font-semibold md:text-center ${
                  offer.delta_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {formatPercentage(offer.delta_pct)}
              </p>
              <p className="text-sm text-slate-700 md:text-center">
                {offer.acceptance_rate !== null && offer.acceptance_rate !== undefined
                  ? `${formatNumber(offer.acceptance_rate, 1)}%`
                  : '—'}
              </p>
              <p className="text-sm text-slate-700 md:text-center">
                {offer.cookie_days !== null && offer.cookie_days !== undefined
                  ? offer.cookie_days
                  : '—'}
              </p>
              <p className="text-sm text-slate-700 md:text-center">{offer.listing_date || '—'}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

OffersTable.propTypes = {
  offers: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onSelectOffer: PropTypes.func.isRequired
}

OffersTable.defaultProps = {
  loading: false,
  error: ''
}

export default OffersTable
