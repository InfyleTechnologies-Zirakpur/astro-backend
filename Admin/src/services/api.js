import axios from 'axios'

const apiOrigin = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')

const api = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api` : '/api',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('adminToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || 'Something went wrong'
    return Promise.reject(new Error(message))
  }
)

export default api