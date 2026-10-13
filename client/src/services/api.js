import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor para inyectar token de autorización criptográfico
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('dy_auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor para manejo de errores de autenticación
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            console.warn('Sesión no autorizada, token manipulado o expirado.');
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    validate: (email, name) => api.post('/auth/validate', { email, name }),
    me: () => api.get('/auth/me')
};

export const reclamosApi = {
    getAll: (cutoff = null) => api.get('/reclamos', { params: cutoff ? { cutoff } : {} }),
    getById: (id) => api.get(`/reclamos/${id}`),
    updateEstadoAdmin: (id, estado, motivo_desaprobado = '') =>
        api.patch(`/reclamos/${id}/estado-admin`, { estado, motivo_desaprobado }),
    updateEstadoInocuidad: (id, estado) =>
        api.patch(`/reclamos/${id}/estado-inocuidad`, { estado }),
    updateSupervisor: (id, supervisor, email) =>
        api.patch(`/reclamos/${id}/supervisor`, { supervisor, email }),
    updateEstadoSupervisor: (id, estado, motivo_imposibilidad = '') =>
        api.patch(`/reclamos/${id}/estado-supervisor`, { estado, motivo_imposibilidad }),
    updateEstadoConsumidor: (id, estado) =>
        api.patch(`/reclamos/${id}/estado-consumidor`, { estado })
};

export const publicApi = {
    verifyToken: (token) => api.get('/public/actions/verify', { params: { token } }),
    submitImposibilidad: (token, motivo) =>
        api.post('/public/actions/supervisor-imposibilidad', { token, motivo })
};

export default api;
