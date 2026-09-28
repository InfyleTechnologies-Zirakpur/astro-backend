import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal,
} from '../components/ui'
import { formatDate } from '../lib/utils'

const Horoscopes = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/admin/horoscopes?page=${page}&limit=15`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const openDetail = async (item) => {
    setViewing(item)
    try {
      const response = await api.get(`/admin/horoscopes/user/${item.user?._id}`)
      setDetail(response.data)
    } catch {
      setDetail(null)
    }
  }

  return (
    <div>
      <PageHeader title="Horoscopes" subtitle="User birth chart & astrology data" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No horoscopes found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>DOB</Th>
                  <Th>Birth Time</Th>
                  <Th>Place</Th>
                  <Th>Tropical Sun</Th>
                  <Th>Tropical Moon</Th>
                  <Th>Nakshatra</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/users/${item.user?._id}`} className="font-medium text-indigo-600 hover:underline">
                        {item.user?.name || 'Unknown'}
                      </Link>
                    </Td>
                    <Td>{formatDate(item.dateOfBirth)}</Td>
                    <Td>{item.timeOfBirth || '—'}</Td>
                    <Td>{item.placeOfBirth || '—'}</Td>
                    <Td>{item.sunSign || '—'}</Td>
                    <Td>{item.moonSign || '—'}</Td>
                    <Td>{item.nakshatra || '—'}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(item)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        title="View chart"
                      >
                        <PlayCircle className="h-4 w-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <Pagination page={data.pagination.page} total={data.pagination.total} totalPages={data.pagination.totalPages} onChange={setPage} />
          </div>
        </div>
      )}

      <Modal open={!!viewing} title={`Horoscope — ${viewing?.user?.name || ''}`} onClose={() => { setViewing(null); setDetail(null) }} wide>
        {detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">DOB</p><p className="text-sm font-medium">{formatDate(detail.dateOfBirth)}</p></div>
              <div><p className="text-xs text-slate-500">Birth Time</p><p className="text-sm font-medium">{detail.timeOfBirth}</p></div>
              <div><p className="text-xs text-slate-500">Place</p><p className="text-sm font-medium">{detail.placeOfBirth || '—'}</p></div>
              <div><p className="text-xs text-slate-500">Tropical Sun</p><p className="text-sm font-medium">{detail.sunSign}</p></div>
              <div><p className="text-xs text-slate-500">Tropical Moon</p><p className="text-sm font-medium">{detail.moonSign}</p></div>
              <div><p className="text-xs text-slate-500">Vedic Ascendant</p><p className="text-sm font-medium">{detail.vedicChart?.ascendant?.rashi || '—'}</p></div>
              <div><p className="text-xs text-slate-500">Vedic Moon Rashi</p><p className="text-sm font-medium">{detail.vedicChart?.planets?.Moon?.rashi || '—'}</p></div>
              <div><p className="text-xs text-slate-500">Nakshatra</p><p className="text-sm font-medium">{detail.nakshatra || '—'}</p></div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vedic Sidereal Placements</p>
                <p className="text-xs text-slate-500">
                  {detail.vedicChart?.positionReference || 'Position basis unavailable'}
                  {Number.isFinite(detail.vedicChart?.ayanamshaUsed) && ` · ayanamsha ${detail.vedicChart.ayanamshaUsed.toFixed(4)}°`}
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr><Th>Body</Th><Th>Rashi</Th><Th>Degree</Th><Th>House</Th><Th>Navamsha</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.vedicChart?.ascendant && (
                      <tr>
                        <Td>Ascendant</Td>
                        <Td>{detail.vedicChart.ascendant.rashi}</Td>
                        <Td>{detail.vedicChart.ascendant.degreeInSign.toFixed(2)}°</Td>
                        <Td>1</Td>
                        <Td>{detail.vedicChart.ascendant.navamshaSign}</Td>
                      </tr>
                    )}
                    {Object.entries(detail.vedicChart?.planets || {}).map(([name, planet]) => (
                      <tr key={name}>
                        <Td>{name}</Td>
                        <Td>{planet.rashi}</Td>
                        <Td>{Number.isFinite(planet.degreeInSign) ? `${planet.degreeInSign.toFixed(2)}°` : '—'}</Td>
                        <Td>{planet.house ?? '—'}</Td>
                        <Td>{planet.navamshaSign || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No detailed chart available.</p>
        )}
      </Modal>
    </div>
  )
}

export default Horoscopes