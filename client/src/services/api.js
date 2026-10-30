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
    updateEstadoAdmin: (id, estado, motivo_desaprobado = '', tipo_desaprobacion = '', prioridad = null, regla_cortesia = null) => {
        let payload = { estado };
        if (typeof motivo_desaprobado === 'object' && motivo_desaprobado !== null) {
            payload = { estado, ...motivo_desaprobado };
        } else {
            payload = { estado, motivo_desaprobado, tipo_desaprobacion, prioridad, regla_cortesia };
        }
        return api.patch(`/reclamos/${id}/estado-admin`, payload);
    },
    updateEstadoInocuidad: (id, estado) =>
        api.patch(`/reclamos/${id}/estado-inocuidad`, { estado }),
    updateSupervisor: (id, supervisor, email) =>
        api.patch(`/reclamos/${id}/supervisor`, { supervisor, email }),
    updateEstadoSupervisor: (id, estado, motivo_imposibilidad = '', tipo_imposibilidad = '') =>
        api.patch(`/reclamos/${id}/estado-supervisor`, { estado, motivo_imposibilidad, tipo_imposibilidad }),
    updateEstadoConsumidor: (id, estado) =>
        api.patch(`/reclamos/${id}/estado-consumidor`, { estado }),
    reenviarEmailInocuidad: (id) =>
        api.post(`/reclamos/${id}/reenviar-inocuidad`),
    reenviarEmailSupervisor: (id) =>
        api.post(`/reclamos/${id}/reenviar-supervisor`)
};

export const publicApi = {
    verifyToken: (token) => api.get('/public/actions/verify', { params: { token } }),
    submitImposibilidad: (token, motivo, tipo_imposibilidad = '') =>
        api.post('/public/actions/supervisor-imposibilidad', { token, motivo, tipo_imposibilidad }),
    submitEncuestaConsumidor: (data) =>
        api.post('/public/actions/consumidor-encuesta', data)
};

export const supervisoresApi = {
    getInfo: () => api.get('/supervisores/info'),
    getRawGeoJSON: () => api.get('/supervisores/raw'),
    lookup: (lat, lng) => api.get('/supervisores/lookup', { params: { lat, lng } }),
    uploadGeoJSON: (geojsonData) => api.post('/supervisores/upload', geojsonData)
};

export const cortesiaApi = {
    getConfig: () => api.get('/cortesia/config'),
    updateConfig: (data) => api.put('/cortesia/config', data),
    simular: (defecto) => api.post('/cortesia/simular', { defecto })
};

export const prioridadesApi = {
    getAll: () => api.get('/prioridades'),
    updateReglas: (codigo, reglas_cortesia, sla = null) =>
        api.put(`/prioridades/${codigo}/reglas`, {
            reglas_cortesia,
            reglas: reglas_cortesia,
            sla
        })
};

export const estadosApi = {
    getAll: () => api.get('/estados'),
    updateConfig: (id, { descripcion, color }) => api.put(`/estados/${id}`, { descripcion, color }),
    updateDescripcion: (id, descripcion, color) => api.put(`/estados/${id}`, { descripcion, color })
};

export const seguimientosApi = {
    getAll: (params) => api.get('/seguimientos', { params }),
    getById: (id) => api.get(`/seguimientos/${id}`),
    create: (data) => api.post('/seguimientos', data),
    update: (id, data) => api.put(`/seguimientos/${id}`, data),
    toggle: (id) => api.patch(`/seguimientos/${id}/toggle`),
    delete: (id) => api.delete(`/seguimientos/${id}`)
};

export const logsApi = {
    getLogs: (params) => api.get('/logs', { params }),
    getStats: () => api.get('/logs/stats')
};

export const configuracionApi = {
    getAll: () => api.get('/configuracion'),
    updateBatch: (configs) => api.put('/configuracion', { configs }),
    resetToDefaults: () => api.post('/configuracion/reset'),
    getTestRecipient: () => api.get('/configuracion/test-recipient'),
    enviarMuestraEmail: (data) => api.post('/configuracion/enviar-muestra', data)
};

export const categoriasApi = {
    getAll: (params) => api.get('/categorias', { params }),
    create: (data) => api.post('/categorias', data),
    update: (id, data) => api.put(`/categorias/${id}`, data),
    toggle: (id) => api.patch(`/categorias/${id}/toggle`)
};

export const productosApi = {
    getAll: (params) => api.get('/productos', { params }),
    searchPublic: (query) => api.get('/public/productos', { params: { q: query } }),
    create: (data) => api.post('/productos', data),
    update: (id, data) => api.put(`/productos/${id}`, data),
    toggle: (id) => api.patch(`/productos/${id}/toggle`)
};

export const simuladorApi = {
    getEstadoReclamo: (id) => api.get(`/simulador/reclamo/${id}/estado`),
    avanzarReclamo: (id, data) => api.post(`/simulador/reclamo/${id}/avanzar`, data),
    resetNotificaciones: (id) => api.post(`/simulador/reclamo/${id}/reset-notificaciones`)
};

export default api;
