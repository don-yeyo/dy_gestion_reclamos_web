const jwt = require('jsonwebtoken');

const APP_SECRET = process.env.APP_SECRET || 'dy_secret_reclamos_super_seguro_2026_cambiar_en_produccion';

/**
 * Middleware de Autenticación HTTP Basic para endpoints de consulta de catálogo de productos.
 * Soporta:
 *  1. Header standard 'Authorization: Basic <base64(usuario:contraseña)>'
 *     Variables de entorno: PRODUCTOS_API_BASIC_USER y PRODUCTOS_API_BASIC_PASS
 *  2. Header 'Authorization: Bearer <jwt>' (compatibilidad con sesiones administrativas autenticadas del sistema)
 */
function basicAuthProductos(req, res, next) {
    const authHeader = req.headers.authorization || '';

    // Si viene Bearer token administrativo válido, permitir acceso
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            jwt.verify(token, APP_SECRET);
            return next();
        } catch (e) {
            // Token inválido, continuar a verificar si hay credenciales básicas
        }
    }

    // Verificar si cuenta con cabecera Basic
    if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Catalogo de Productos Don Yeyo"');
        return res.status(401).json({
            success: false,
            message: 'Autenticación básica requerida. Proporcione la cabecera Authorization: Basic <base64(usuario:contraseña)>'
        });
    }

    const base64Credentials = authHeader.substring(6).trim();
    let decoded = '';
    try {
        decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
    } catch (err) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Catalogo de Productos Don Yeyo"');
        return res.status(401).json({
            success: false,
            message: 'Credenciales de autenticación básica con codificación Base64 inválida'
        });
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Catalogo de Productos Don Yeyo"');
        return res.status(401).json({
            success: false,
            message: 'Formato de credenciales básicas inválido. Se espera usuario:contraseña'
        });
    }

    const user = decoded.substring(0, separatorIndex);
    const pass = decoded.substring(separatorIndex + 1);

    const expectedUser = process.env.PRODUCTOS_API_BASIC_USER || 'donyeyo_api';
    const expectedPass = process.env.PRODUCTOS_API_BASIC_PASS || 'dy_prod_2026_secure';

    if (user !== expectedUser || pass !== expectedPass) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Catalogo de Productos Don Yeyo"');
        return res.status(401).json({
            success: false,
            message: 'Usuario o contraseña de autenticación básica incorrectos'
        });
    }

    req.authMethod = 'basic';
    req.authUser = user;
    next();
}

module.exports = {
    basicAuthProductos
};
