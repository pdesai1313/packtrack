import api from './axios'

export const getPacks = () => api.get('/packs').then((r) => r.data)
export const createPack = (data) => api.post('/packs', data).then((r) => r.data)
export const updatePack = (id, data) => api.put(`/packs/${id}`, data).then((r) => r.data)
export const deletePack = (id) => api.delete(`/packs/${id}`).then((r) => r.data)
