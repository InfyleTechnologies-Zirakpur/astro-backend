import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Heart, ClipboardList, Sparkles, Mail, Smartphone } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageHeader, Spinner, ErrorState, Badge, EmptyState } from '../components/ui'
import { formatDate, formatDateTime } from '../lib/utils'
import { FIELD_LABELS, RELATIONSHIP_GOALS, MATCH_STATUS } from '../lib/constants'

const Section = ({ title, icon: Icon, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
      <Icon className="h-4 w-4 text-indigo-600" />
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
)

const Field = ({ label, value }) => (
  <div>
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
  </div>
)

const UserDetail = () => {
  const { userId } = useParams()
  const { data, loading, error, reload } = useFetch(`/admin/users/${userId}`)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const { user, profile, questionnaire, horoscope, matches, messagesSent, deviceTokens } = data.data || {}

  return (
    <div>
      <Link to="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>
      <PageHeader title={user?.name} subtitle={user?.email} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="User Details" icon={Heart}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gender" value={user?.gender} />
            <Field label="Role" value={<Badge className={user?.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}>{user?.role}</Badge>} />
            <Field label="Status" value={<Badge className={user?.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{user?.isActive ? 'Active' : 'Inactive'}</Badge>} />
            <Field label="Joined" value={formatDateTime(user?.createdAt)} />
          </div>
        </Section>

        <Section title="Profile" icon={Heart}>
          {profile ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of Birth" value={formatDate(profile.dateOfBirth)} />
              <Field label="City" value={profile.currentCity} />
              <Field label="Education" value={profile.education} />
              <Field label="Occupation" value={profile.occupation} />
              <Field label="Relationship Goal" value={RELATIONSHIP_GOALS[profile.relationshipGoal] || '—'} />
              <Field label="Photos" value={profile.photos?.length || 0} />
              <div className="col-span-2">
                <Field label="About" value={profile.about} />
              </div>
            </div>
          ) : (
            <EmptyState message="No profile found" />
          )}
        </Section>

        <Section title="Questionnaire" icon={ClipboardList}>
          {questionnaire ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.keys(FIELD_LABELS).filter((key) => questionnaire[key]).map((key) => (
                <Field key={key} label={FIELD_LABELS[key]} value={questionnaire[key]} />
              ))}
            </div>
          ) : (
            <EmptyState message="No questionnaire submitted" />
          )}
        </Section>

        <Section title="Horoscope" icon={Sparkles}>
          {horoscope ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of Birth" value={formatDate(horoscope.dateOfBirth)} />
              <Field label="Time of Birth" value={horoscope.timeOfBirth} />
              <Field label="Place of Birth" value={horoscope.placeOfBirth} />
              <Field label="Sun Sign" value={horoscope.sunSign} />
              <Field label="Moon Sign" value={horoscope.moonSign} />
              <Field label="Nakshatra" value={horoscope.nakshatra} />
            </div>
          ) : (
            <EmptyState message="No horoscope data" />
          )}
        </Section>

        <Section title={`Matches (${matches?.length || 0})`} icon={Heart}>
          {matches?.length ? (
            <div className="space-y-2">
              {matches.map((match) => (
                <Link
                  key={match._id}
                  to={`/matches/${match._id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-700">Match #{match._id.slice(-6)}</span>
                  <Badge className={MATCH_STATUS[match.status]?.className}>{match.status}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="No matches" />
          )}
        </Section>

        <div className="space-y-5">
          <Section title="Messages Sent" icon={Mail}>
            <p className="text-3xl font-bold text-slate-900">{messagesSent ?? '—'}</p>
          </Section>
          <Section title={`Device Tokens (${deviceTokens?.length || 0})`} icon={Smartphone}>
            {deviceTokens?.length ? (
              <div className="space-y-2">
                {deviceTokens.map((token) => (
                  <div key={token._id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{token.platform}</span>
                    <Badge className={token.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                      {token.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No device tokens" />
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

export default UserDetail