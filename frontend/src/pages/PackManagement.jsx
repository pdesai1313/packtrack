import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPacks, createPack, updatePack, deletePack } from '../api/packs'
import { getSettings } from '../api/settings'
import StatusPill from '../components/StatusPill'

function PackForm({ initial, onSave, onCancel, loading, error, orgDefault }) {
  const [form, setForm] = useState(initial
    ? { ...initial, ticketOrder: initial.ticketOrder || orgDefault || 'DESCENDING' }
    : { packId: '', packSize: '', ticketValue: '', gameName: '', scannerNumber: '', ticketOrder: orgDefault || 'DESCENDING' }
  )
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const orderLocked = !!initial && (initial._count?.packSales || 0) > 0

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ ...form, packSize: Number(form.packSize), ticketValue: Number(form.ticketValue) })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Pack ID *</label>
          <input className="input" value={form.packId} onChange={set('packId')} placeholder="PACK-001" required disabled={!!initial} />
        </div>
        <div>
          <label className="label">Scanner # *</label>
          <input className="input" value={form.scannerNumber} onChange={set('scannerNumber')} placeholder="SCN-01" required />
        </div>
        <div>
          <label className="label">Pack Size *</label>
          <input className="input" type="number" min="1" value={form.packSize} onChange={set('packSize')} placeholder="50" required />
        </div>
        <div>
          <label className="label">Ticket Value ($) *</label>
          <input className="input" type="number" min="0.01" step="0.01" value={form.ticketValue} onChange={set('ticketValue')} placeholder="2.00" required />
        </div>
        <div className="col-span-2">
          <label className="label">Game Name</label>
          <input className="input" value={form.gameName} onChange={set('gameName')} placeholder="Lucky7" />
        </div>
        <div className="col-span-2">
          <label className="label flex items-center gap-2">
            Ticket Order
            {orderLocked && <span className="text-amber-600 text-[10px]">🔒 Locked — has committed sales</span>}
          </label>
          <div className="flex gap-2">
            <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
              form.ticketOrder === 'DESCENDING' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
            } ${orderLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="ticketOrder"
                value="DESCENDING"
                checked={form.ticketOrder === 'DESCENDING'}
                onChange={set('ticketOrder')}
                disabled={orderLocked}
              />
              <span className="text-xs">Descending ({form.packSize ? form.packSize - 1 : '99'} → 0)</span>
            </label>
            <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
              form.ticketOrder === 'ASCENDING' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
            } ${orderLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="ticketOrder"
                value="ASCENDING"
                checked={form.ticketOrder === 'ASCENDING'}
                onChange={set('ticketOrder')}
                disabled={orderLocked}
              />
              <span className="text-xs">Ascending (0 → {form.packSize ? form.packSize - 1 : '99'})</span>
            </label>
          </div>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={loading}>
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function PackModal({ title, initial, onSave, onClose, loading, error, orgDefault }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-5">
          <PackForm initial={initial} onSave={onSave} onCancel={onClose} loading={loading} error={error} orgDefault={orgDefault} />
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ pack, onConfirm, onClose, isPending }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-lg mb-1">Delete {pack.packId}?</h3>
        <p className="text-gray-500 text-sm mb-5">
          This will permanently remove the pack and all its scan history from every shift. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={isPending}>Cancel</button>
          <button className="btn-danger flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PackManagement() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)       // null | 'create' | pack object
  const [confirmDelete, setConfirmDelete] = useState(null) // null | pack object
  const [formError, setFormError] = useState('')

  const { data: packs = [], isLoading } = useQuery({ queryKey: ['packs'], queryFn: getPacks })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const orgDefault = settings?.ticketOrder || 'DESCENDING'

  const createMutation = useMutation({
    mutationFn: createPack,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packs'] }); setModal(null) },
    onError: (e) => setFormError(e.response?.data?.error || 'Failed to create pack'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updatePack(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packs'] }); setModal(null) },
    onError: (e) => setFormError(e.response?.data?.error || 'Failed to update pack'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => updatePack(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packs'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deletePack(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['packs'] }); setConfirmDelete(null) },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Pack Management</h2>
        <button className="btn-primary btn-sm" onClick={() => { setModal('create'); setFormError('') }}>
          + Add Pack
        </button>
      </div>

      {modal && (
        <PackModal
          title={modal === 'create' ? 'Add Pack' : `Edit ${modal.packId}`}
          initial={modal === 'create' ? null : modal}
          orgDefault={orgDefault}
          onSave={(data) =>
            modal === 'create'
              ? createMutation.mutate(data)
              : updateMutation.mutate({ id: modal.id, data })
          }
          onClose={() => setModal(null)}
          loading={createMutation.isPending || updateMutation.isPending}
          error={formError}
        />
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          pack={confirmDelete}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Pack ID', 'Game', 'Scanner', 'Size', 'Value', 'Order', 'Last Ticket', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {packs.map((p) => (
                <tr key={p.id} className={!p.active ? 'opacity-50' : ''}>
                  <td className="px-4 py-2 font-mono font-medium">{p.packId}</td>
                  <td className="px-4 py-2">{p.gameName || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.scannerNumber}</td>
                  <td className="px-4 py-2">{p.packSize}</td>
                  <td className="px-4 py-2">${p.ticketValue.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      p.ticketOrder === 'ASCENDING' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {p.ticketOrder === 'ASCENDING' ? `0→${p.packSize - 1}` : `${p.packSize - 1}→0`}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono">{p.scannerState?.lastCommittedTicket ?? 0}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={p.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => { setModal(p); setFormError('') }}
                      >
                        Edit
                      </button>
                      <button
                        className={`btn-sm ${p.active ? 'btn-secondary' : 'btn-secondary'}`}
                        onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                        disabled={toggleMutation.isPending}
                      >
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => setConfirmDelete(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
