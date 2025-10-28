import PropTypes from 'prop-types'

function FilterBar({
  windowSize,
  windowOptions,
  onWindowChange,
  sortMode,
  sortOptions,
  onSortModeChange,
  searchTerm,
  onSearchTermChange,
  onRefresh
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-slate-50 p-4 shadow-lg md:flex-row md:items-center md:justify-end">
      <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Window</span>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            value={windowSize}
            onChange={(event) => onWindowChange(Number(event.target.value))}
          >
            {windowOptions.map((option) => (
              <option key={option} value={option}>{`${option} days`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Sort by</span>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-1 items-center gap-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search offers or GEOs"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onRefresh}
            className="hidden rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 md:block"
          >
            Refresh
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 md:hidden"
      >
        Refresh data
      </button>
    </div>
  )
}

FilterBar.propTypes = {
  windowSize: PropTypes.number.isRequired,
  windowOptions: PropTypes.arrayOf(PropTypes.number).isRequired,
  onWindowChange: PropTypes.func.isRequired,
  sortMode: PropTypes.string.isRequired,
  sortOptions: PropTypes.arrayOf(
    PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })
  ).isRequired,
  onSortModeChange: PropTypes.func.isRequired,
  searchTerm: PropTypes.string.isRequired,
  onSearchTermChange: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired
}

export default FilterBar
