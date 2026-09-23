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
                  <Th>Sun Sign</Th>
                  <Th>Moon Sign</Th>
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
              <div><p className="text-xs text-slate-500">Sun Sign</p><p className="text-sm font-medium">{detail.sunSign}</p></div>
              <div><p className="text-xs text-slate-500">Moon Sign</p><p className="text-sm font-medium">{detail.moonSign}</p></div>
              <div><p className="text-xs text-slate-500">Nakshatra</p><p className="text-sm font-medium">{detail.nakshatra || '—'}</p></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vedic Chart</p>
              <pre className="max-h-80 overflow-y-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                {JSON.stringify(detail.vedicChart, null, 2)}
              </pre>
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