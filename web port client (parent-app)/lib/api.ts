import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.waqti.pro'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
          localStorage.setItem('accessToken', data.accessToken)
          localStorage.setItem('refreshToken', data.refreshToken)
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
          return api(originalRequest)
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string }) => {
    const parts = data.name.trim().split(' ')
    const firstName = parts[0]
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
    return api.post('/auth/register', {
      email: data.email,
      password: data.password,
      firstName,
      lastName
    })
  },
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/parents/me'),
}

export const childrenApi = {
  list: () => api.get('/children'),
  create: (data: any) => api.post('/children', data),
  update: (id: string, data: any) => api.patch(`/children/${id}`, data),
  delete: (id: string) => api.delete(`/children/${id}`),
}

export const devicesApi = {
  list: () => api.get('/devices'),
  create: (data: any) => api.post('/devices', data),
  update: (id: string, data: any) => api.patch(`/devices/${id}`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
}

export const pairingApi = {
  start: (deviceId: string) => api.post(`/devices/${deviceId}/pair/start`),
  status: (deviceId: string) => api.get(`/devices/${deviceId}/pair/status`),
  stats: (deviceId: string) => api.get(`/devices/${deviceId}/pair/stats`),
  cancel: (deviceId: string) => api.delete(`/devices/${deviceId}/pair`),
}

export const sessionsApi = {
  list: () => api.get('/sessions'),
  start: (data: any) => api.post('/sessions/start', data),
  stop: (id: string) => api.post(`/sessions/${id}/stop`, {}),
}

export const reportsApi = {
  weekly: (params?: { childId?: string; offset?: number }) =>
    api.get('/reports/weekly', { params }),
  monthly: (params?: { childId?: string; offset?: number }) =>
    api.get('/reports/monthly', { params }),
}

export const usageApi = {
  daily: (childId: string, date?: string) =>
    api.get('/usage/daily', { params: { childId, date } }),
  weekly: (childId: string) => api.get('/usage/weekly', { params: { childId } }),
  device: (deviceId: string) => api.get(`/usage/device/${deviceId}`),
}

export const parentsApi = {
  profile: () => api.get('/parents/profile'),
  updateProfile: (data: { firstName?: string; lastName?: string }) =>
    api.patch('/parents/profile', data),
  deleteAccount: () => api.delete('/parents/profile'),
  subscription: () => api.get('/parents/subscription'),
}
