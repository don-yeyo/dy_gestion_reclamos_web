/**
 * Configuración de roles y permisos del servidor (Don Yeyo S.A.)
 *
 * REGLA DE SEGURIDAD ESTRICTA:
 * Las autorizaciones se evalúan EXCLUSIVAMENTE en el servidor.
 * Ningún valor almacenado en el DOM, cookies o localStorage puede elevar privilegios.
 */

// Lista de administradores del sistema
const ADMIN_EMAILS = (process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar')
    .split(',')
    .map(e => e.trim().toLowerCase());

// Lista de personal de inocuidad y control de calidad
const INOCUIDAD_EMAILS = (process.env.EMAILS_INOCUIDAD || 'inocuidad@donyeyo.com.ar')
    .split(',')
    .map(e => e.trim().toLowerCase());

// Superadministradores con acceso total
const SYSADMIN_EMAILS = [
    'gabrielt@donyeyo.com.ar',
    'sistemas@donyeyo.com.ar'
];

/**
 * Resuelve el rol del usuario a partir de su correo electrónico validado.
 * @param {string} email
 * @returns {string} 'sysadmin' | 'admin' | 'inocuidad' | 'invitado'
 */
function resolveUserRole(email) {
    if (!email || typeof email !== 'string') return 'invitado';
    const normalized = email.trim().toLowerCase();

    if (SYSADMIN_EMAILS.includes(normalized)) {
        return 'sysadmin';
    }
    if (ADMIN_EMAILS.includes(normalized)) {
        return 'admin';
    }
    if (INOCUIDAD_EMAILS.includes(normalized)) {
        return 'inocuidad';
    }

    // Si pertenece al dominio @donyeyo.com.ar pero no tiene rol asignado
    if (normalized.endsWith('@donyeyo.com.ar')) {
        return 'admin'; // Acceso base para personal interno corporativo
    }

    return 'invitado';
}

module.exports = {
    ADMIN_EMAILS,
    INOCUIDAD_EMAILS,
    SYSADMIN_EMAILS,
    resolveUserRole
};
