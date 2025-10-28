import PropTypes from 'prop-types'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

const tooltipFormatter = (value) => `$${Number(value).toFixed(2)}`
const tooltipLabelFormatter = (label) => new Date(label).toLocaleDateString()

function EpcHistoryChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 12 }} minTickGap={20} />
        <YAxis
          tickFormatter={(value) => `$${value}`}
          tick={{ fill: '#475569', fontSize: 12 }}
          width={70}
        />
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
          contentStyle={{ borderRadius: '12px', borderColor: '#4f46e5' }}
        />
        <Line type="monotone" dataKey="epc" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

EpcHistoryChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      epc: PropTypes.number.isRequired
    })
  ).isRequired
}

export default EpcHistoryChart
