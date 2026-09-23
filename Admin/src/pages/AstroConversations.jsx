import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Input, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal,
} from '../components/ui'
import { formatDateTime, truncate } from '../lib/utils'

const AstroConversations = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      const response = await api.get(`/admin/astro-conversations?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Astro Q&A" subtitle="User conversations with the astrology assistant" />

      <div className="mb-4 max-w-xs">
        <Input label="Search" placeholder="Search by question…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No conversations found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>Partner</Th>
                  <Th>Question</Th>
                  <Th>Answered</Th>
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
                    <Td>{item.partner?.name || '—'}</Td>
                    <Td className="max-w-[260px]">
                      <span className="text-slate-700">{truncate(item.question, 60)}</span>
                    </Td>
                    <Td>{formatDateTime(item.createdAt)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => setViewing(item)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        title="View conversation"
                      >
                        <Eye className="h-4 w-4" />
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

      <Modal open={!!viewing} title="Astro Q&A Detail" onClose={() => setViewing(null)} wide>
        {viewing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-medium text-indigo-500">Question</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{viewing.question}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Answer</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{viewing.answer}</p>
            </div>
            {viewing.sources?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sources ({viewing.sources.length})</p>
                <div className="space-y-2">
                  {viewing.sources.map((source, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                      {typeof source === 'string' ? source : (
                        <>
                          <p className="font-medium text-slate-800">{source.title || source.id || `Source ${index + 1}`}</p>
                          {source.section && <p>{source.section}</p>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AstroConversations