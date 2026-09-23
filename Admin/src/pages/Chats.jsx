import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Image } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Badge,
} from '../components/ui'
import { formatDateTime } from '../lib/utils'

const Chats = () => {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/admin/conversations?page=${page}&limit=15`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Chats" subtitle="Active conversations between matched users" />

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
                  <Th>Users</Th>
                  <Th>Match Status</Th>
                  <Th>Messages</Th>
                  <Th>Media</Th>
                  <Th>Last Activity</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((conversation) => (
                  <tr
                    key={conversation.match?._id || conversation._id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => conversation.match && navigate(`/matches/${conversation.match._id}`)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{conversation.match?.userA?.name || 'Unknown'}</span>
                        <span className="text-slate-400">×</span>
                        <span className="font-medium text-slate-900">{conversation.match?.userB?.name || 'Unknown'}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge className="bg-slate-100 text-slate-600">{conversation.match?.status || '—'}</Badge>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <MessageSquare className="h-4 w-4 text-slate-400" />
                        {conversation.messageCount}
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <Image className="h-4 w-4 text-slate-400" />
                        {conversation.mediaCount}
                      </span>
                    </Td>
                    <Td>{formatDateTime(conversation.lastMessageAt)}</Td>
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

export default Chats