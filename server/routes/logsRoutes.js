const express = require('express');
const router = express.Router();
const systemLogService = require('../services/systemLogService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

/**
 * GET /api/logs
 * Devuelve el historial de logs (emails y configuraciones)
 * Protegido: Requiere rol admin o sysadmin
 */
router.get('/', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const filters = {
            categoria: req.query.categoria || 'all',
            tipoDisparo: req.query.tipo_disparo || 'all',
            modulo: req.query.modulo || null,
            estadoEnvio: req.query.estado_envio || 'all',
            search: req.query.search || '',
            fechaDesde: req.query.fecha_desde || null,
            fechaHasta: req.query.fecha_hasta || null,
            limit: req.query.limit || 50,
            page: req.query.page || 1
        };

        const result = await systemLogService.getLogs(filters);
        res.json({
            success: true,
            ...result
        });
    } catch (err) {
        console.error('[LOGS ROUTE ERROR] Error al consultar logs:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/logs/stats
 * Devuelve estadísticas de auditoría (totales, proporciones, métricas del día)
 */
router.get('/stats', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const stats = await systemLogService.getStats();
        res.json({
            success: true,
            stats
        });
    } catch (err) {
        console.error('[LOGS ROUTE STATS ERROR]:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
