import api from './axios'

export const getReport = (from, to) =>
  api.get(`/reports?from=${from}&to=${to}`).then((r) => r.data)
