import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import api from '../services/api'
import {
  PageHeader, Input, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState,
} from '../components/ui'
import { formatDate } from '../lib/utils'
import { RELATIONSHIP_GOALS } from '../lib/constants'

const Profiles = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [relationshipGoal, setRelationshipGoal] = useState('')
  const [completed, setCompleted] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      if (city) params.set('city', city)
      if (relationshipGoal) params.set('relationshipGoal', relationshipGoal)
      if (completed) params.set('completed', completed)
      const response = await api.get(`/admin/profiles?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, city, relationshipGoal, completed])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Profiles" subtitle="Browse completed user profiles" />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Search" placeholder="User name…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <Input label="City" placeholder="City…" value={city} onChange={(event) => { setCity(event.target.value); setPage(1) }} />
        <Select label="Relationship Goal" value={relationshipGoal} onChange={(event) => { setRelationshipGoal(event.target.value); setPage(1) }}>
          <option value="">All</option>
          {Object.entries(RELATIONSHIP_GOALS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select label="Completion" value={completed} onChange={(event) => { setCompleted(event.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="true">Completed</option>
          <option value="false">Incomplete</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState message="No profiles found" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>DOB</Th>
                  <Th>City</Th>
                  <Th>Occupation</Th>
                  <Th>Goal</Th>
                  <Th>Photos</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((profile) => (
                  <tr key={profile._id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {profile.user?.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{profile.user?.name || 'Unknown'}</p>
                          <p className="text-xs text-slate-500">{profile.user?.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{formatDate(profile.dateOfBirth)}</Td>
                    <Td>{profile.currentCity}</Td>
                    <Td>{profile.occupation}</Td>
                    <Td>{RELATIONSHIP_GOALS[profile.relationshipGoal] || '—'}</Td>
                    <Td>{profile.photos?.length || 0}</Td>
                    <Td>
                      <Badge className={profile.profileCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                        {profile.profileCompleted ? 'Completed' : 'Incomplete'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <Link
                        to={`/users/${profile.user?._id}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                        title="View profile"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
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

export default Profiles