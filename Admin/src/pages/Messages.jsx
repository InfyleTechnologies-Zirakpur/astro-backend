import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Input, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal, Button,
} from '../components/ui'
import { formatDateTime, truncate } from '../lib/utils'
import { MESSAGE_TYPES } from '../lib/constants'

const Messages = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      if (type) params.set('type', type)
      if (mediaType) params.set('mediaType', mediaType)
      const response = await api.get(`/admin/messages?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, type, mediaType])

  useEffect(() => { load() }, [load])

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/admin/messages/${deleteTarget._id}`)
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Messages" subtitle="Moderate user messages" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Input label="Search" placeholder="Search message text…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        </div>
        <Select label="Type" value={type} onChange={(event) => { setType(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="text">Text</option>
          <option value="sticker">Sticker</option>
          <option value="media">Media</option>
        </Select>
        <Select label="Media Type" value={mediaType} onChange={(event) => { setMediaType(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No messages found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>Sender</Th>
                  <Th>Recipient</Th>
                  <Th>Type</Th>
                  <Th>Content</Th>
                  <Th>Sent</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((message) => (
                  <tr key={message._id} className="hover:bg-slate-50">
                    <Td className="max-w-[140px]">
                      <p className="truncate font-medium text-slate-900">{message.sender?.name || 'Unknown'}</p>
                    </Td>
                    <Td className="max-w-[140px]">
                      <p className="truncate text-slate-600">{message.recipient?.name || 'Unknown'}</p>
                    </Td>
                    <Td>
                      <Badge className={MESSAGE_TYPES[message.type]?.className}>
                        {message.type}{message.mediaType ? ` · ${message.mediaType}` : ''}
                      </Badge>
                    </Td>
                    <Td className="max-w-[220px]">
                      {message.mediaUrl ? (
                        <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                          {truncate(message.mediaUrl, 30)}
                        </a>
                      ) : (
                        <span className="text-slate-600">{truncate(message.text || 'Sticker', 60)}</span>
                      )}
                    </Td>
                    <Td>{formatDateTime(message.createdAt)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(message)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete message"
                      >
                        <Trash2 className="h-4 w-4" />
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

      <Modal open={!!deleteTarget} title="Delete message" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-slate-600">
          Are you sure you want to permanently delete this message? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" disabled={deleting} onClick={confirmDelete}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default Messages