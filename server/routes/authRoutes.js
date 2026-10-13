const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { resolveUserRole } = require('../config/roles');

const APP_SECRET = process.env.APP_SECRET || 'dy_secret_reclamos_super_seguro_2026_cambiar_en_produccion';

/**
 * Valida la identidad corporativa y emite un token JWT de sesión firmado por el servidor.
 * Protege contra manipulación de roles: el rol se deriva exclusivamente en el backend.
 */
router.post('/validate', (req, res) => {
    const { email, name } = req.body;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, error: 'Email requerido.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const role = resolveUserRole(normalizedEmail);

    if (role === 'invitado') {
        return res.status(403).json({
            success: false,
            error: 'Tu usuario corporativo no tiene permisos para acceder a esta aplicación.'
        });
    }

    // Emitir JWT firmado
    const token = jwt.sign(
        {
            email: normalizedEmail,
            name: name || normalizedEmail.split('@')[0],
            role
        },
        APP_SECRET,
        { expiresIn: '8h' }
    );

    res.json({
        success: true,
        token,
        user: {
            email: normalizedEmail,
            name: name || normalizedEmail.split('@')[0],
            role
        }
    });
});

/**
 * Verifica la validez del token de sesión actual y devuelve el perfil con el rol verificado por el servidor.
 * No acepta parámetros en body/query; valida estrictamente la firma del JWT.
 */
const { authMiddleware } = require('../middlewares/authMiddleware');

router.get('/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

module.exports = router;
