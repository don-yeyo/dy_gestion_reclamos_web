/**
 * Resolución unificada de URLs públicas del sistema (Don Yeyo S.A.)
 *
 * ¿Por qué existen dos URLs en desarrollo local y una sola en producción?
 * - En Producción (Netlify): Tanto el Frontend React como las funciones Backend (/api/*)
 *   viven bajo un único dominio (ej. https://dy-reclamos.netlify.app).
 *   Por ello basta con definir `PUBLIC_SITE_URL` (o incluso Netlify inyecta `URL` automáticamente).
 * - En Desarrollo Local: El cliente Vite corre en el puerto 5173 (`FRONTEND_URL`) y
 *   el servidor Express corre en el puerto 3001 (`BACKEND_URL`).
 *
 * Se mantiene compatibilidad total con los nombres anteriores (`APP_BASE_URL` y `API_BASE_URL`).
 */

function cleanUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/"/g, '').trim().replace(/\/+$/, '');
}

const publicSiteUrl = cleanUrl(process.env.PUBLIC_SITE_URL || process.env.URL || '');

// URL del Frontend SPA (Pantallas de React: /reclamos/:id, /imposibilidad, /encuesta-consumidor)
const FRONTEND_URL = cleanUrl(
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    publicSiteUrl ||
    'http://localhost:5173'
);

// URL del Backend API (Webhooks directos servidos por Express: /api/public/actions/supervisor-quick, /admin-quick)
const BACKEND_URL = cleanUrl(
    process.env.BACKEND_URL ||
    process.env.API_BASE_URL ||
    publicSiteUrl ||
    process.env.APP_BASE_URL ||
    'http://localhost:3001'
);

module.exports = {
    PUBLIC_SITE_URL: publicSiteUrl || FRONTEND_URL,
    FRONTEND_URL,
    BACKEND_URL,
    // Alias retrocompatibles
    APP_BASE_URL: FRONTEND_URL,
    API_BASE_URL: BACKEND_URL
};
