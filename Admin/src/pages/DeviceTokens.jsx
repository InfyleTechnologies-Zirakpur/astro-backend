import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState,
} from '../components/ui'
import { formatDateTime } from '../lib/utils'

const DeviceTokens = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [platform, setPlatform] = useState('')
  const [active, setActive] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (platform) params.set('platform', platform)
      if (active) params.set('active', active)
      const response = await api.get(`/admin/device-tokens?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, platform, active])

  useEffect(() => { load() }, [load])

  const toggle = async (token) => {
    await api.patch(`/admin/device-tokens/${token._id}`, { isActive: !token.isActive })
    load()
  }

  return (
    <div>
      <PageHeader title="Device Tokens" subtitle="Push notification tokens registered by users" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select label="Platform" value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
          <option value="web">Web</option>
          <option value="unknown">Unknown</option>
        </Select>
        <Select label="Status" value={active} onChange={(event) => { setActive(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No device tokens found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>Token</Th>
                  <Th>Platform</Th>
                  <Th>Status</Th>
                  <Th>Last Used</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((token) => (
                  <tr key={token._id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/users/${token.user?._id}`} className="font-medium text-indigo-600 hover:underline">
                        {token.user?.name || 'Unknown'}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs text-slate-500">{token.token}</Td>
                    <Td>
                      <Badge className="bg-slate-100 text-slate-600">{token.platform}</Badge>
                    </Td>
                    <Td>
                      <Badge className={token.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                        {token.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(token.lastUsedAt)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => toggle(token)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        title={token.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {token.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
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

export default DeviceTokens