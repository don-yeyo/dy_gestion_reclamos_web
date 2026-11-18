/**
 * Configuración de roles y permisos del servidor (Don Yeyo S.A.)
 *
 * REGLA DE SEGURIDAD ESTRICTA (LISTA BLANCA CERRADA):
 * 1. Las autorizaciones se evalúan EXCLUSIVAMENTE en el servidor.
 * 2. Ningún valor almacenado en el DOM, cookies o localStorage puede elevar privilegios.
 * 3. Si un correo electrónico (incluso con dominio corporativo @donyeyo.com.ar) NO figura
 *    explícitamente en alguna de las listas de variables de entorno (EMAILS_SYSADMINS,
 *    EMAILS_ADMINS o EMAILS_INOCUIDAD), su rol será 'invitado' y tendrá el acceso
 *    totalmente denegado (HTTP 403 Forbidden).
 * 4. Los correos no corporativos o desconocidos tampoco tienen ningún tipo de acceso.
 */

function parseEmails(envVarValue, fallback = '') {
    const raw = envVarValue !== undefined && envVarValue !== null ? String(envVarValue) : fallback;
    return raw
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Obtiene la lista activa de superadministradores desde variable de entorno EMAILS_SYSADMINS
 */
function getSysadminEmails() {
    return parseEmails(process.env.EMAILS_SYSADMINS, 'gabrielt@donyeyo.com.ar,sistemas@donyeyo.com.ar');
}

/**
 * Obtiene la lista activa de administradores desde variable de entorno EMAILS_ADMINS
 */
function getAdminEmails() {
    return parseEmails(process.env.EMAILS_ADMINS, 'administracion@donyeyo.com.ar');
}

/**
 * Obtiene la lista activa de personal de inocuidad desde variable de entorno EMAILS_INOCUIDAD
 */
function getInocuidadEmails() {
    return parseEmails(process.env.EMAILS_INOCUIDAD, 'inocuidad@donyeyo.com.ar');
}

/**
 * Resuelve el rol del usuario a partir de su correo electrónico validado.
 * Implementa una LISTA BLANCA ESTRICTA:
 * - 'sysadmin': Superadministrador con privilegios globales totales.
 * - 'admin': Administrador comercial (gestión de reclamos, aprobación, supervisores, configuración).
 * - 'inocuidad': Personal técnico de laboratorio y control de calidad (dictamen técnico).
 * - 'invitado': Cualquier otro correo (corporativo o externo sin asignación explícita) -> ACCESO DENEGADO.
 *
 * @param {string} email
 * @returns {'sysadmin' | 'admin' | 'inocuidad' | 'invitado'}
 */
function resolveUserRole(email) {
    if (!email || typeof email !== 'string') return 'invitado';
    const normalized = email.trim().toLowerCase();

    // 1. Superadministradores
    if (getSysadminEmails().includes(normalized)) {
        return 'sysadmin';
    }

    // 2. Administradores comerciales
    if (getAdminEmails().includes(normalized)) {
        return 'admin';
    }

    // 3. Calidad e Inocuidad
    if (getInocuidadEmails().includes(normalized)) {
        return 'inocuidad';
    }

    // LISTA BLANCA CERRADA: Si no está explícitamente autorizado, es 'invitado' (acceso denegado)
    return 'invitado';
}

module.exports = {
    getSysadminEmails,
    getAdminEmails,
    getInocuidadEmails,
    resolveUserRole,
    // Propiedades de retrocompatibilidad getter
    get SYSADMIN_EMAILS() { return getSysadminEmails(); },
    get ADMIN_EMAILS() { return getAdminEmails(); },
    get INOCUIDAD_EMAILS() { return getInocuidadEmails(); }
};
