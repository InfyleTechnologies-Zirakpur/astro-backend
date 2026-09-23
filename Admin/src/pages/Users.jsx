import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ToggleLeft, ToggleRight, UserX } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Button, Input, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal,
} from '../components/ui'
import { formatDateTime } from '../lib/utils'

const Users = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      if (gender) params.set('gender', gender)
      if (status) params.set('status', status)
      if (role) params.set('role', role)
      const response = await api.get(`/admin/users?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, gender, status, role])

  useEffect(() => { load() }, [load])

  const toggleStatus = async (user) => {
    await api.patch(`/admin/users/${user._id}/status`, { isActive: !user.isActive })
    load()
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${deleteTarget._id}`)
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
      <PageHeader title="Users" subtitle="Manage all registered users" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Input
            label="Search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
        </div>
        <Select label="Gender" value={gender} onChange={(event) => { setGender(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
        <Select label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Select label="Role" value={role} onChange={(event) => { setRole(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>Gender</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {user.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{user.gender || '—'}</Td>
                    <Td>
                      <Badge className={user.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}>
                        {user.role}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge className={user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(user.createdAt)}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/users/${user._id}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                          title="View details"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleStatus(user)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                          title={user.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {user.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                        </button>
                        {user.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            title="Delete user"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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

      <Modal open={!!deleteTarget} title="Delete user" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-slate-600">
          Are you sure you want to permanently delete <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>?
          This will remove their profile, questionnaire, horoscope, messages and matches.
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

export default Users