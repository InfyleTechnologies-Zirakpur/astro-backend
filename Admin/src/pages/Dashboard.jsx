import {
  Users,
  UserPlus,
  FileText,
  Heart,
  HeartHandshake,
  CalendarDays,
} from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageHeader, StatCard, Spinner, ErrorState } from '../components/ui'
import { formatNumber } from '../lib/utils'

const Dashboard = () => {
  const { data, loading, error, reload } = useFetch('/admin/stats')

  if (loading) return <Spinner className="h-10 w-10" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const stats = data?.data || {}
  const maxDay = Math.max(1, ...(stats.last7Days || []).map((day) => day.registrations))

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your astrology platform" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={formatNumber(stats.totalUsers)} sublabel={`${formatNumber(stats.activeUsers)} active`} tone="indigo" />
        <StatCard icon={UserPlus} label="New Users (7d)" value={formatNumber(stats.newUsersWeek)} sublabel={`${formatNumber(stats.newUsersToday)} today`} tone="emerald" />
        <StatCard icon={FileText} label="Completed Profiles" value={formatNumber(stats.completedProfiles)} tone="sky" />
        <StatCard icon={Heart} label="Total Matches" value={formatNumber(stats.totalMatches)} sublabel={`${formatNumber(stats.pendingMatches)} pending`} tone="rose" />
        <StatCard icon={HeartHandshake} label="Accepted Matches" value={formatNumber(stats.acceptedMatches)} tone="emerald" />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
          <CalendarDays className="h-4 w-4 text-indigo-600" />
          Registrations — Last 7 Days
        </h2>
        {stats.last7Days && stats.last7Days.length > 0 ? (
          <div className="flex items-end gap-4 overflow-x-auto pb-2">
            {stats.last7Days.map((day) => (
              <div key={day.date} className="flex min-w-[80px] flex-col items-center gap-1">
                <div className="flex h-40 items-end">
                  <div
                    className="w-5 rounded-t bg-indigo-500"
                    style={{ height: `${Math.max(4, (day.registrations / maxDay) * 100)}%` }}
                    title={`${day.registrations} registrations`}
                  />
                </div>
                <p className="text-xs font-medium text-slate-500">{day.date.slice(5)}</p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-indigo-500" /> Registrations</span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard