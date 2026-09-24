import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageHeader, Spinner, ErrorState, Badge, EmptyState } from '../components/ui'
import { formatDateTime } from '../lib/utils'
import { MATCH_STATUS } from '../lib/constants'
import api from '../services/api'
import { useState } from 'react'

const MatchDetail = () => {
  const { matchId } = useParams()
  const { data, loading, error, reload } = useFetch(`/admin/matches/${matchId}`)
  const [updating, setUpdating] = useState(false)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const match = data?.data
  if (!match) return <EmptyState message="Match not found" />

  const setStatus = async (status) => {
    setUpdating(true)
    try {
      await api.patch(`/admin/matches/${matchId}/status`, { status })
      reload()
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div>
      <Link to="/matches" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
        <ArrowLeft className="h-4 w-4" /> Back to matches
      </Link>
      <PageHeader title="Match Detail" subtitle={`Match #${matchId.slice(-6)}`} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">{match.userA?.name}</span>
              <span className="text-slate-400">×</span>
              <span className="font-medium text-slate-700">{match.userB?.name}</span>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-indigo-600">{Math.round(match.score)}%</p>
              <p className="mt-1 text-sm text-slate-500">{match.overallLabel}</p>
            </div>
            <div className="flex justify-center">
              <Badge className={MATCH_STATUS[match.status]?.className}>{match.status}</Badge>
            </div>
            <p className="text-xs text-slate-500">Updated {formatDateTime(match.updatedAt)}</p>
            {match.status !== 'pending' && (
              <button
                type="button"
                disabled={updating}
                onClick={() => setStatus('pending')}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset to pending
              </button>
            )}
            {match.status !== 'accepted' && (
              <button
                type="button"
                disabled={updating}
                onClick={() => setStatus('accepted')}
                className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Accept match
              </button>
            )}
            {match.status !== 'rejected' && (
              <button
                type="button"
                disabled={updating}
                onClick={() => setStatus('rejected')}
                className="w-full rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
              >
                Reject match
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Compatibility Breakdown</h2>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['personality', 'Personality'],
                ['emotional', 'Emotional'],
                ['communication', 'Communication'],
                ['trustAndCommitment', 'Trust & Commitment'],
                ['maturity', 'Maturity'],
                ['understanding', 'Understanding'],
                ['lifestyle', 'Lifestyle'],
                ['familyValues', 'Family Values'],
                ['careerAndFinance', 'Career & Finance'],
                ['relationshipExpectations', 'Relationship Expectations'],
                ['longTermPotential', 'Long Term Potential'],
              ].map(([key, label]) => {
                const category = match[key]
                return (
                  <div key={key} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-700">{label}</p>
                      <Badge className={category?.level === 'High' ? 'bg-emerald-100 text-emerald-700' : category?.level === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}>
                        {category?.level}
                      </Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.round((category?.score || 0) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">{category?.description}</p>
                  </div>
                )
              })}
            </div>
            {match.astrology && (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <p className="text-sm font-semibold text-violet-700">Astrology: {match.astrology.level} ({Math.round((match.astrology.score || 0) * 100)}%)</p>
                <p className="mt-1 text-xs text-violet-600">{match.astrology.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MatchDetail