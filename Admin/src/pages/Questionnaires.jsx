import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal,
} from '../components/ui'
import { formatDateTime } from '../lib/utils'
import { FIELD_LABELS } from '../lib/constants'

const Questionnaires = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/admin/questionnaires?page=${page}&limit=15`)
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
      <PageHeader title="Questionnaires" subtitle="User personality & preference responses" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No questionnaires found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>Submitted</Th>
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
                    <Td>{formatDateTime(item.createdAt)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => setViewing(item)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        title="View responses"
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

      <Modal open={!!viewing} title={`Questionnaire — ${viewing?.user?.name || ''}`} onClose={() => setViewing(null)} wide>
        {viewing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.keys(FIELD_LABELS).filter((key) => viewing[key]).map((key) => (
              <div key={key} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500">{FIELD_LABELS[key]}</p>
                <p className="mt-1 text-sm text-slate-800">{viewing[key]}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default Questionnaires