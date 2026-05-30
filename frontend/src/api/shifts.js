import api from './axios'

export const getShifts = () => api.get('/shifts').then((r) => r.data)
export const createShift = (data) => api.post('/shifts', data).then((r) => r.data)
export const getShiftPackStates = (id) => api.get(`/shifts/${id}/packstates`).then((r) => r.data)
export const scanTicket = (shiftId, packId, scannedTicket) =>
  api.post(`/shifts/${shiftId}/packs/${packId}/scan`, { scannedTicket }).then((r) => r.data)
export const setStartTicket = (shiftId, packId, startTicket) =>
  api.put(`/shifts/${shiftId}/packs/${packId}/start`, { startTicket }).then((r) => r.data)
export const commitShift = (shiftId, packCommits) =>
  api.post(`/shifts/${shiftId}/commit`, { packCommits }).then((r) => r.data)
export const getExceptions = (shiftId) => api.get(`/shifts/${shiftId}/exceptions`).then((r) => r.data)
export const getDailySummary = (date) => api.get(`/shifts/daily?date=${date}`).then((r) => r.data)
export const updateReconciliation = (shiftId, data) =>
  api.put(`/shifts/${shiftId}/reconciliation`, data).then((r) => r.data)
export const exportCsv = async (shiftId, filename) => {
  const res = await api.get(`/shifts/${shiftId}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename || `shift-${shiftId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
export const deleteShift = (shiftId) => api.delete(`/shifts/${shiftId}`).then((r) => r.data)
export const reopenShift = (shiftId, newDate) =>
  api.post(`/shifts/${shiftId}/reopen`, newDate ? { newDate } : {}).then((r) => r.data)
