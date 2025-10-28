import PropTypes from 'prop-types'
import EpcHistoryChart from './EpcHistoryChart'

function OfferDetailModal({
  isOpen,
  offer,
  historyData,
  historyWindow,
  historyWindows,
  onHistoryWindowChange,
  loading,
  error,
  onClose
}) {
  if (!isOpen || !offer) {
    return null
  }

  const history = historyData?.history ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
          aria-label="Close"
        >
          ×
        </button>
        <div className="grid gap-6 p-6 md:grid-cols-5">
          <div className="md:col-span-2 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{offer.offer_name}</h2>
              <p className="text-sm text-slate-500">{offer.category || '—'} • {offer.geo || '—'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 shadow-inner">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-600">Payout</dt>
                  <dd className="text-slate-800">{offer.payout_value || offer.payout_type || '—'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Current EPC</dt>
                  <dd className="text-slate-800">
                    {offer.history && offer.history.length
                      ? `$${offer.history[offer.history.length - 1].epc.toFixed(2)}`
                      : '$0.00'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Acceptance rate</dt>
                  <dd className="text-slate-800">
                    {offer.acceptance_rate !== null && offer.acceptance_rate !== undefined
                      ? `${offer.acceptance_rate.toFixed(1)}%`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Cookie days</dt>
                  <dd className="text-slate-800">{offer.cookie_days ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Listing date</dt>
                  <dd className="text-slate-800">{offer.listing_date || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="md:col-span-3 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">EPC history</h3>
              <select
                value={historyWindow}
                onChange={(event) => onHistoryWindowChange(Number(event.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                {historyWindows.map((option) => (
                  <option key={option} value={option}>{`${option} days`}</option>
                ))}
              </select>
            </div>
            <div className="h-72 w-full rounded-2xl bg-slate-50 p-4">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-500">Loading history…</div>
              ) : error ? (
                <div className="flex h-full items-center justify-center text-red-600">{error}</div>
              ) : history.length ? (
                <EpcHistoryChart data={history} />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500">
                  No history for this window yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

OfferDetailModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  offer: PropTypes.object,
  historyData: PropTypes.object,
  historyWindow: PropTypes.number.isRequired,
  historyWindows: PropTypes.arrayOf(PropTypes.number).isRequired,
  onHistoryWindowChange: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onClose: PropTypes.func.isRequired
}

OfferDetailModal.defaultProps = {
  offer: null,
  historyData: null,
  loading: false,
  error: ''
}

export default OfferDetailModal
