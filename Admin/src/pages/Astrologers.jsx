import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import {
  PageHeader, Button, Input, Select, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState, Modal,
} from '../components/ui'

const emptyForm = {
  name: '', email: '', password: '', gender: 'other',
  displayName: '', bio: '', expertise: '', languages: '',
  experienceYears: 0, rateChatPerMin: 20, rateCallPerMin: 30,
  freeMinutesLimitMin: 10, isVerified: true,
}

const Astrologers = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [online, setOnline] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (search) params.set('search', search)
      if (online) params.set('online', online)
      const response = await api.get(`/admin/astrologers?${params.toString()}`)
      setData(response)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, online])

  useEffect(() => { load() }, [load])

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  const openEdit = (profile) => {
    setEditing(profile)
    setForm({
      ...emptyForm,
      displayName: profile.displayName || '',
      bio: profile.bio || '',
      expertise: (profile.expertise || []).join(', '),
      languages: (profile.languages || []).join(', '),
      experienceYears: profile.experienceYears || 0,
      rateChatPerMin: profile.rateChatPerMin || 0,
      rateCallPerMin: profile.rateCallPerMin || 0,
      freeMinutesLimitMin: profile.freeMinutesLimitMin ?? 10,
      isVerified: profile.isVerified,
    })
    setShowForm(true)
  }

  const submit = async () => {
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/admin/astrologers/${editing.user._id || editing.user}`, {
          displayName: form.displayName,
          bio: form.bio,
          expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
          languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
          experienceYears: Number(form.experienceYears),
          rateChatPerMin: Number(form.rateChatPerMin),
          rateCallPerMin: Number(form.rateCallPerMin),
          freeMinutesLimitMin: Number(form.freeMinutesLimitMin),
          isVerified: form.isVerified,
        })
      } else {
        await api.post('/admin/astrologers', {
          name: form.name,
          email: form.email,
          password: form.password,
          gender: form.gender,
          profile: {
            displayName: form.displayName || form.name,
            bio: form.bio,
            expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
            languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
            experienceYears: Number(form.experienceYears),
            rateChatPerMin: Number(form.rateChatPerMin),
            rateCallPerMin: Number(form.rateCallPerMin),
            freeMinutesLimitMin: Number(form.freeMinutesLimitMin),
            isVerified: form.isVerified,
          },
        })
      }
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (profile) => {
    const userId = profile.user._id || profile.user
    await api.patch(`/admin/users/${userId}/status`, { isActive: !profile.user.isActive })
    load()
  }

  return (
    <div>
      <PageHeader
        title="Astrologers"
        subtitle="Add astrologers, manage rates, verification and free minutes"
        actions={<Button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>Add astrologer</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Input label="Search" placeholder="Name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select label="Online" value={online} onChange={(e) => { setOnline(e.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="true">Online</option>
          <option value="false">Offline</option>
        </Select>
      </div>

      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : !data || data.data.length === 0 ? <EmptyState message="No astrologers found" /> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>Astrologer</Th>
                  <Th>Rates (chat/call)</Th>
                  <Th>Rating</Th>
                  <Th>Status</Th>
                  <Th>Sessions</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50">
                    <Td>
                      <p className="font-medium text-slate-900">{p.displayName}</p>
                      <p className="text-xs text-slate-500">{p.user?.email} • {(p.expertise || []).join(', ') || '—'}</p>
                    </Td>
                    <Td>₹{p.rateChatPerMin}/min • ₹{p.rateCallPerMin}/min</Td>
                    <Td>{p.ratingAvg?.toFixed(1)} ({p.ratingCount})</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Badge className={p.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{p.isOnline ? 'Online' : 'Offline'}</Badge>
                        <Badge className={p.isVerified ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}>{p.isVerified ? 'Verified' : 'Unverified'}</Badge>
                      </div>
                    </Td>
                    <Td>{p.totalConsultations} • ₹{p.totalEarnings}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" onClick={() => openEdit(p)}>Edit</Button>
                        <Button variant={p.user?.isActive ? 'outline' : 'success'} onClick={() => toggleActive(p)}>
                          {p.user?.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
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

      <Modal open={showForm} title={editing ? 'Edit astrologer' : 'Add astrologer'} onClose={() => { setShowForm(false); setEditing(null) }} wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editing && (
            <>
              <Input label="Name" value={form.name} onChange={set('name')} />
              <Input label="Email" value={form.email} onChange={set('email')} />
              <Input label="Password" type="password" value={form.password} onChange={set('password')} />
              <Select label="Gender" value={form.gender} onChange={set('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </>
          )}
          <Input label="Display name" value={form.displayName} onChange={set('displayName')} />
          <Input label="Experience (years)" type="number" value={form.experienceYears} onChange={set('experienceYears')} />
          <Input label="Expertise (comma separated)" value={form.expertise} onChange={set('expertise')} />
          <Input label="Languages (comma separated)" value={form.languages} onChange={set('languages')} />
          <Input label="Rate chat/min (₹)" type="number" value={form.rateChatPerMin} onChange={set('rateChatPerMin')} />
          <Input label="Rate call/min (₹)" type="number" value={form.rateCallPerMin} onChange={set('rateCallPerMin')} />
          <Input label="Free minutes (per user)" type="number" value={form.freeMinutesLimitMin} onChange={set('freeMinutesLimitMin')} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isVerified} onChange={set('isVerified')} /> Verified
          </label>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Bio</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} value={form.bio} onChange={set('bio')} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
        </div>
      </Modal>
    </div>
  )
}

export default Astrologers
