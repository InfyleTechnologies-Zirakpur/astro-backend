import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import {
  PageHeader, Badge, Pagination, Th, Td, Spinner, EmptyState, ErrorState,
  Select, Input, StatCard,
} from '../components/ui'
import { formatDateTime, formatNumber } from '../lib/utils'
import { Wallet, Receipt, HandCoins } from 'lucide-react'

const Payments = () => {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState(null)
  const [txs, setTxs] = useState(null)
  const [payout, setPayout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'orders') {
        const params = new URLSearchParams({ page, limit: 15 })
        if (status) params.set('status', status)
        setOrders(await api.get(`/admin/recharge-orders?${params.toString()}`))
      } else if (tab === 'credits') {
        const params = new URLSearchParams({ page, limit: 15 })
        setTxs(await api.get(`/admin/recharge-transactions?${params.toString()}`))
      } else {
        const params = new URLSearchParams()
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        setPayout(await api.get(`/admin/payout-report?${params.toString()}`))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tab, page, status, from, to])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Payments" subtitle="Razorpay recharges, wallet credits and astrologer payout report (manual settlement)" />

      <div className="mb-4 flex gap-2">
        {['orders', 'credits', 'payouts'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1) }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            {t === 'orders' ? 'Recharge orders' : t === 'credits' ? 'Wallet credits' : 'Payout report'}
          </button>
        ))}
      </div>

      {tab === 'payouts' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      {tab === 'orders' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All</option>
            <option value="created">Created</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
      )}

      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          {tab === 'orders' && orders && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard icon={Wallet} label="Paid recharge total" value={`₹${formatNumber(orders.summary?.paidTotal)}`} tone="emerald" />
                <StatCard icon={Receipt} label="Orders" value={formatNumber(orders.pagination?.total)} tone="indigo" />
                <StatCard icon={HandCoins} label="Gateway" value={orders.summary?.razorpayConfigured ? 'Razorpay live' : 'Not configured'} tone="amber" />
              </div>
              {!orders.data.length ? <EmptyState message="No recharge orders" /> : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr><Th>User</Th><Th>Amount</Th><Th>Order</Th><Th>Status</Th><Th>Created</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.data.map((o) => (
                          <tr key={o._id} className="hover:bg-slate-50">
                            <Td><p className="font-medium text-slate-900">{o.user?.name}</p><p className="text-xs text-slate-500">{o.user?.email}</p></Td>
                            <Td>₹{o.amount}</Td>
                            <Td className="font-mono text-xs">{o.razorpayOrderId}</Td>
                            <Td><Badge className={o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : o.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}>{o.status}</Badge></Td>
                            <Td>{formatDateTime(o.createdAt)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-200 px-4 py-3">
                    <Pagination page={orders.pagination.page} total={orders.pagination.total} totalPages={orders.pagination.totalPages} onChange={setPage} />
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'credits' && txs && (
            !txs.data.length ? <EmptyState message="No wallet credits" /> : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr><Th>User</Th><Th>Amount</Th><Th>Payment</Th><Th>Balance after</Th><Th>Created</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {txs.data.map((t) => (
                        <tr key={t._id} className="hover:bg-slate-50">
                          <Td><p className="font-medium text-slate-900">{t.user?.name}</p><p className="text-xs text-slate-500">{t.user?.email}</p></Td>
                          <Td>₹{t.amount}</Td>
                          <Td className="font-mono text-xs">{t.providerPaymentId || t.meta?.paymentId || t.meta?.method || '—'}</Td>
                          <Td>₹{t.balanceAfter}</Td>
                          <Td>{formatDateTime(t.createdAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 px-4 py-3">
                  <Pagination page={txs.pagination.page} total={txs.pagination.total} totalPages={txs.pagination.totalPages} onChange={setPage} />
                </div>
              </div>
            )
          )}

          {tab === 'payouts' && payout && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard icon={HandCoins} label="Total payable (window)" value={`₹${formatNumber(payout.summary?.grandTotal)}`} sublabel={`${payout.summary?.count} astrologers`} tone="emerald" />
              </div>
              {!payout.data.length ? <EmptyState message="No earnings in this window" /> : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr><Th>Astrologer</Th><Th>Sessions</Th><Th>Payable</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payout.data.map((r) => (
                          <tr key={r.astrologerId} className="hover:bg-slate-50">
                            <Td><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></Td>
                            <Td>{r.sessions}</Td>
                            <Td className="font-semibold">₹{r.totalEarnings}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">Manual settlement: pay these amounts offline via bank transfer, then track externally.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Payments
