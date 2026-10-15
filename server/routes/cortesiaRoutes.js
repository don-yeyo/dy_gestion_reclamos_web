const express = require('express');
const router = express.Router();
const cortesiaService = require('../services/cortesiaService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

// Todas las rutas requieren estar autenticado
router.use(authMiddleware);

/**
 * GET /api/cortesia/config
 * Obtiene la configuración de cálculo de cortesía
 */
router.get('/config', async (req, res) => {
    try {
        const config = await cortesiaService.getConfig();
        res.json({
            success: true,
            data: config
        });
    } catch (err) {
        console.error('[CORTESIA ROUTE] Error al obtener config:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/cortesia/config
 * Permite a los administradores editar la regla de cortesía y sus defectos asociados
 */
router.put('/config', requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const { cortesia_estandar, cortesia_especial, defectos_estandar } = req.body;

        if (!cortesia_estandar || !cortesia_especial) {
            return res.status(400).json({
                success: false,
                error: 'Debe especificar tanto la cortesía estándar como la cortesía especial.'
            });
        }

        const userEmail = req.user?.email || 'admin';
        const updated = await cortesiaService.saveConfig({
            cortesia_estandar,
            cortesia_especial,
            defectos_estandar
        }, userEmail);

        res.json({
            success: true,
            message: 'Regla de producto de cortesía actualizada correctamente.',
            data: updated
        });
    } catch (err) {
        console.error('[CORTESIA ROUTE] Error al actualizar config:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/cortesia/simular
 * Simula el resultado para un defecto dado
 */
router.post('/simular', async (req, res) => {
    try {
        const { defecto, configOverride } = req.body;
        const resultado = await cortesiaService.calcularProductoCortesia(defecto, configOverride);
        res.json({
            success: true,
            defecto,
            producto_cortesia: resultado
        });
    } catch (err) {
        console.error('[CORTESIA ROUTE] Error al simular cálculo:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
