import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings } from '../api/settings'
import { getUsers, createUser, updateUser } from '../api/users'

function SettingsPanel() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [tolerance, setTolerance] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (settings) setTolerance(String(settings.toleranceTickets)) }, [settings])

  const mutation = useMutation({
    mutationFn: () => updateSettings({ toleranceTickets: Number(tolerance) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  return (
    <div className="card mb-6">
      <h3 className="font-medium mb-3">App Settings</h3>
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <label className="label">Mismatch Tolerance (tickets)</label>
          <input className="input" type="number" min="0" max="100" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
          <p className="text-gray-400 text-xs mt-1">Mismatches within this threshold show as warning, not error.</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function PosSettingsPanel() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [token, setToken] = useState('')
  const [storeId, setStoreId] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setToken(settings.posApiToken || '')
      setStoreId(settings.posStoreId || '')
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: () => updateSettings({ posApiToken: token, posStoreId: storeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  return (
    <div className="card mb-6">
      <h3 className="font-medium mb-3">POS Integration</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">API Token</label>
          <input
            className="input"
            type="text"
            placeholder="u53770-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-gray-400 text-xs mt-1">Token from NRS POS URL (long-lived, paste once)</p>
        </div>
        <div>
          <label className="label">Store ID</label>
          <input
            className="input"
            type="text"
            placeholder="65302"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          />
          <p className="text-gray-400 text-xs mt-1">Your store ID from the POS URL</p>
        </div>
      </div>
      <button className="btn-primary btn-sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {saved ? '✓ Saved' : 'Save'}
      </button>
    </div>
  )
}

function UsersPanel() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OPERATOR' })
  const [formError, setFormError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); setForm({ name: '', email: '', password: '', role: 'OPERATOR' }) },
    onError: (e) => setFormError(e.response?.data?.error || 'Failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => updateUser(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Users</h3>
        <button className="btn-primary btn-sm" onClick={() => { setShowCreate(true); setFormError('') }}>+ Add User</button>
      </div>

      {showCreate && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <div><label className="label">Password</label><input className="input" type="password" value={form.password} onChange={set('password')} /></div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={set('role')}>
                <option value="OPERATOR">Operator</option>
                <option value="REVIEWER">Reviewer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          {formError && <p className="text-red-600 text-xs mb-2">{formError}</p>}
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</button>
            <button className="btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-gray-400 text-xs">Loading…</p> : (
        <div className="divide-y divide-gray-50">
          {users.map((u) => (
            <div key={u.id} className={`flex items-center justify-between py-2 ${!u.active ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-medium text-sm">{u.name}</p>
                <p className="text-gray-400 text-xs">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${u.role === 'ADMIN' ? 'badge-red' : u.role === 'REVIEWER' ? 'badge-blue' : 'badge-green'}`}>{u.role}</span>
                <button
                  className={`btn-sm ${u.active ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => toggleMutation.mutate({ id: u.id, active: !u.active })}
                >
                  {u.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Settings &amp; Users</h2>
      <SettingsPanel />
      <PosSettingsPanel />
      <UsersPanel />
    </div>
  )
}
