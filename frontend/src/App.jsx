import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import FilterBar from './components/FilterBar'
import OffersTable from './components/OffersTable'
import OfferDetailModal from './components/OfferDetailModal'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const WINDOW_OPTIONS = [7, 15, 30, 60, 90]
const SORT_OPTIONS = [
  { value: 'pct', label: 'Biggest % jump' },
  { value: 'abs', label: 'Biggest $ jump' },
  { value: 'current', label: 'Highest current EPC' }
]

const HISTORY_WINDOWS = [30, 60, 90]

function App() {
  const [windowSize, setWindowSize] = useState(30)
  const [sortMode, setSortMode] = useState('pct')
  const [searchTerm, setSearchTerm] = useState('')
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [historyWindow, setHistoryWindow] = useState(90)
  const [offerHistory, setOfferHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const fetchOffers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get(`${API_BASE_URL}/api/top-movers`, {
        params: {
          window: windowSize,
          sortMode,
          search: searchTerm.trim() ? searchTerm.trim() : undefined
        }
      })
      setOffers(response.data)
    } catch (err) {
      console.error(err)
      setError('Unable to load offers. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [windowSize, sortMode, searchTerm])

  useEffect(() => {
    fetchOffers()
  }, [fetchOffers])

  const handleSelectOffer = (offer) => {
    setSelectedOffer(offer)
    setHistoryWindow(90)
  }

  const closeModal = () => {
    setSelectedOffer(null)
    setOfferHistory(null)
    setHistoryError('')
  }

  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedOffer) {
        return
      }
      setHistoryLoading(true)
      setHistoryError('')
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/offer/${selectedOffer.offer_id}/history`,
          {
            params: { window: historyWindow }
          }
        )
        setOfferHistory(response.data)
      } catch (err) {
        console.error(err)
        setHistoryError('Unable to load offer history.')
      } finally {
        setHistoryLoading(false)
      }
    }

    loadHistory()
  }, [selectedOffer, historyWindow])

  const modalOfferDetails = useMemo(() => {
    if (!selectedOffer) {
      return null
    }
    if (!offerHistory) {
      return selectedOffer
    }
    return {
      ...selectedOffer,
      ...offerHistory
    }
  }, [offerHistory, selectedOffer])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Affiliate Offer EPC Monitor</h1>
            <p className="text-sm text-slate-600">
              Track PartnerMatic EPC trends to surface hot affiliate offers.
            </p>
          </div>
          <FilterBar
            windowSize={windowSize}
            windowOptions={WINDOW_OPTIONS}
            onWindowChange={setWindowSize}
            sortMode={sortMode}
            sortOptions={SORT_OPTIONS}
            onSortModeChange={setSortMode}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onRefresh={fetchOffers}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <OffersTable
          offers={offers}
          loading={loading}
          error={error}
          onSelectOffer={handleSelectOffer}
        />
      </main>

      <OfferDetailModal
        isOpen={Boolean(selectedOffer)}
        offer={modalOfferDetails}
        historyData={offerHistory}
        historyWindow={historyWindow}
        historyWindows={HISTORY_WINDOWS}
        onHistoryWindowChange={setHistoryWindow}
        loading={historyLoading}
        error={historyError}
        onClose={closeModal}
      />
    </div>
  )
}

export default App
