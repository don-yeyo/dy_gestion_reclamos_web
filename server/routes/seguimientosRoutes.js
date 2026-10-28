const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');
const seguimientosService = require('../services/seguimientosService');

/**
 * GET /api/seguimientos
 * Devuelve todas las reglas de seguimiento configuradas
 */
router.get('/', async (req, res) => {
    try {
        const filters = {
            rol: req.query.rol,
            prioridad_codigo: req.query.prioridad_codigo,
            activo: req.query.activo
        };
        const seguimientos = await seguimientosService.getAll(filters);
        res.json({
            success: true,
            seguimientos
        });
    } catch (err) {
        console.error('Error al obtener reglas de seguimiento:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/seguimientos/:id
 * Obtiene una regla específica
 */
router.get('/:id', async (req, res) => {
    try {
        const seguimiento = await seguimientosService.getById(req.params.id);
        if (!seguimiento) {
            return res.status(404).json({ success: false, error: 'Regla de seguimiento no encontrada' });
        }
        res.json({
            success: true,
            seguimiento
        });
    } catch (err) {
        console.error('Error al obtener regla de seguimiento:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/seguimientos
 * Crea una nueva regla de seguimiento (requiere rol admin)
 */
router.post('/', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const userEmail = req.user?.email || 'admin';
        const nuevaRegla = await seguimientosService.create(req.body, userEmail);

        // Registro de log de configuración
        const systemLogService = require('../services/systemLogService');
        await systemLogService.logConfigChange({
            modulo: 'reglas_seguimiento',
            accion: 'creacion',
            descripcion: `Creación de regla de seguimiento para Rol: "${nuevaRegla.rol}", Estado: "${nuevaRegla.estado_codigo}", Prioridad: "${nuevaRegla.prioridad_nombre || nuevaRegla.prioridad_codigo}" (Disparo: ${nuevaRegla.disparo_dias}d, Repeticiones: ${nuevaRegla.repeticiones})`,
            actor: req.user?.role || 'admin',
            actorEmail: userEmail,
            valoresNuevos: nuevaRegla
        });

        res.status(201).json({
            success: true,
            message: 'Regla de seguimiento creada exitosamente.',
            seguimiento: nuevaRegla
        });
    } catch (err) {
        console.error('Error al crear regla de seguimiento:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/seguimientos/:id
 * Modifica una regla de seguimiento (requiere rol admin)
 */
router.put('/:id', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const userEmail = req.user?.email || 'admin';
        const reglaActualizada = await seguimientosService.update(req.params.id, req.body, userEmail);

        // Registro de log de configuración
        const systemLogService = require('../services/systemLogService');
        await systemLogService.logConfigChange({
            modulo: 'reglas_seguimiento',
            accion: 'modificacion',
            descripcion: `Modificación de regla de seguimiento #${req.params.id} (Rol: "${reglaActualizada.rol}", Estado: "${reglaActualizada.estado_codigo}", Prioridad: "${reglaActualizada.prioridad_nombre || reglaActualizada.prioridad_codigo}")`,
            actor: req.user?.role || 'admin',
            actorEmail: userEmail,
            valoresNuevos: reglaActualizada
        });

        res.json({
            success: true,
            message: 'Regla de seguimiento actualizada exitosamente.',
            seguimiento: reglaActualizada
        });
    } catch (err) {
        console.error('Error al actualizar regla de seguimiento:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/seguimientos/:id/toggle
 * Activa o desactiva una regla
 */
router.patch('/:id/toggle', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const userEmail = req.user?.email || 'admin';
        const reglaActualizada = await seguimientosService.toggleActivo(req.params.id, userEmail);

        // Registro de log de configuración
        const systemLogService = require('../services/systemLogService');
        await systemLogService.logConfigChange({
            modulo: 'reglas_seguimiento',
            accion: 'toggle_activo',
            descripcion: `Regla de seguimiento #${req.params.id} ${reglaActualizada.activo ? 'activada' : 'desactivada'} (Rol: ${reglaActualizada.rol}, Estado: ${reglaActualizada.estado_codigo})`,
            actor: req.user?.role || 'admin',
            actorEmail: userEmail,
            valoresNuevos: { id: req.params.id, activo: reglaActualizada.activo }
        });

        res.json({
            success: true,
            message: `Regla de seguimiento ${reglaActualizada.activo ? 'activada' : 'desactivada'} correctamente.`,
            seguimiento: reglaActualizada
        });
    } catch (err) {
        console.error('Error al alternar estado de regla de seguimiento:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/seguimientos/:id
 * Elimina una regla de seguimiento
 */
router.delete('/:id', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const userEmail = req.user?.email || 'admin';
        await seguimientosService.delete(req.params.id, userEmail);

        // Registro de log de configuración
        const systemLogService = require('../services/systemLogService');
        await systemLogService.logConfigChange({
            modulo: 'reglas_seguimiento',
            accion: 'eliminacion',
            descripcion: `Eliminación permanente de regla de seguimiento #${req.params.id}`,
            actor: req.user?.role || 'admin',
            actorEmail: userEmail,
            valoresAnteriores: { id: req.params.id }
        });

        res.json({
            success: true,
            message: 'Regla de seguimiento eliminada correctamente.'
        });
    } catch (err) {
        console.error('Error al eliminar regla de seguimiento:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
