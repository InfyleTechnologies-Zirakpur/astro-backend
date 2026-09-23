import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Input, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState,
} from '../components/ui'
import { formatDateTime } from '../lib/utils'
import { MATCH_STATUS } from '../lib/constants'

const Matches = () => {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      const response = await api.get(`/admin/matches?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Matches" subtitle="Compatibility matches between users" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Input label="Search" placeholder="Search by user name…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        </div>
        <Select label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No matches found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>Users</Th>
                  <Th>Score</Th>
                  <Th>Label</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((match) => (
                  <tr key={match._id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{match.userA?.name || 'Unknown'}</span>
                        <span className="text-slate-400">×</span>
                        <span className="font-medium text-slate-900">{match.userB?.name || 'Unknown'}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-semibold text-slate-900">{Math.round(match.score)}%</span>
                    </Td>
                    <Td>{match.overallLabel || '—'}</Td>
                    <Td>
                      <Badge className={MATCH_STATUS[match.status]?.className}>{match.status}</Badge>
                    </Td>
                    <Td>{formatDateTime(match.updatedAt)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/matches/${match._id}`)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        title="View match"
                      >
                        <ExternalLink className="h-4 w-4" />
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
    </div>
  )
}

export default Matches