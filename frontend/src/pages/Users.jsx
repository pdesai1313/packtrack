import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, createUser, updateUser } from '../api/users'
import StatusPill from '../components/StatusPill'

const ROLES = ['ADMIN', 'REVIEWER', 'OPERATOR']

function UserModal({ initial, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!initial
  const [form, setForm] = useState(
    initial
      ? { name: initial.name, role: initial.role, password: '', active: initial.active }
      : { name: '', email: '', password: '', role: 'OPERATOR' }
  )
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateUser(initial.id, data) : createUser(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (e) => setError(e.response?.data?.error || 'Failed to save'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    const data = { ...form }
    if (isEdit && !data.password) delete data.password
    mutation.mutate(data)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? `Edit ${initial.name}` : 'Add User'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          {!isEdit && (
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} required />
            </div>
          )}
          <div>
            <label className="label">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} required={!isEdit} minLength={6} />
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="input" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          )}
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary btn-sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Users() {
  const [modal, setModal] = useState(null)
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Users</h2>
        <button className="btn-primary btn-sm" onClick={() => setModal('create')}>+ Add User</button>
      </div>

      {modal && (
        <UserModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Name', 'Email', 'Role', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className={!u.active ? 'opacity-50' : ''}>
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-gray-500">{u.email}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={u.role} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={u.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="px-4 py-2">
                    <button className="btn-secondary btn-sm" onClick={() => setModal(u)}>Edit</button>
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
