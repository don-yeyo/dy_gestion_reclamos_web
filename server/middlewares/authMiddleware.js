const jwt = require('jsonwebtoken');
const { resolveUserRole } = require('../config/roles');

const APP_SECRET = process.env.APP_SECRET || 'dy_secret_reclamos_super_seguro_2026_cambiar_en_produccion';

/**
 * Middleware para autenticar la identidad del usuario.
 * Acepta JWT firmado por el backend o token de sesión verificado.
 * En modo desarrollo con VITE_MOCK_AUTH o header x-mock-auth, valida contra lista blanca corporativa.
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let userEmail = null;
    let userName = null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Acceso no autorizado. Se requiere un token de sesión válido emitido por el servidor.'
        });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, APP_SECRET);
        userEmail = decoded.email;
        userName = decoded.name;
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Sesión inválida, alterada o expirada. Por favor iniciá sesión nuevamente.'
        });
    }

    // EL ROL SE RESUELVE DE FORMA SEGURA Y EXCLUSIVA EN EL SERVIDOR EN TIEMPO REAL
    // Imposible de manipular desde el DOM, headers o localStorage
    const serverResolvedRole = resolveUserRole(userEmail);

    if (serverResolvedRole === 'invitado') {
        return res.status(403).json({
            success: false,
            error: 'Tu usuario corporativo no tiene permisos asignados para acceder al sistema de reclamos.'
        });
    }

    req.user = {
        email: userEmail.toLowerCase().trim(),
        name: userName || userEmail,
        role: serverResolvedRole
    };

    next();
}

/**
 * Middleware para restringir acceso por roles permitidos.
 * @param {string[]} allowedRoles Array de roles permitidos (ej. ['admin', 'sysadmin'])
 */
function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        if (req.user.role === 'sysadmin') {
            return next(); // Sysadmin tiene acceso irrestricto
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Acceso denegado. Se requiere rol [${allowedRoles.join(', ')}]. Tu rol actual es: ${req.user.role}`
            });
        }

        next();
    };
}

module.exports = {
    authMiddleware,
    requireRole
};
