const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');

/**
 * GET /api/estados
 * Devuelve todos los estados configurados en el sistema con sus descripciones para tooltips y visualización
 */
router.get('/', async (req, res) => {
    try {
        const estados = await reclamosDatabaseService.getWorkflowEstados();
        res.json({
            success: true,
            estados
        });
    } catch (err) {
        console.error('Error al obtener estados de workflow:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/estados/:id
 * Permite a los Administradores actualizar la descripción (tooltip) y el color del badge del estado
 * Protegido: No permite modificar actor, código ni nombre para preservar la integridad de los workflows
 */
router.put('/:id', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    const { id } = req.params;
    const { descripcion, color } = req.body;

    if (descripcion === undefined && color === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Debe proporcionar al menos la descripción o el color para actualizar.'
        });
    }

    if (descripcion !== undefined && typeof descripcion !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'La descripción debe ser un texto.'
        });
    }

    if (color !== undefined) {
        if (typeof color !== 'string' || color.trim().length > 30) {
            return res.status(400).json({
                success: false,
                error: 'El color debe ser un texto válido (ej. #10b981) de hasta 30 caracteres.'
            });
        }
    }

    try {
        const estadoActualizado = await reclamosDatabaseService.updateWorkflowEstadoConfig(
            id,
            { descripcion, color }
        );

        if (!estadoActualizado) {
            return res.status(404).json({
                success: false,
                error: 'Estado de workflow no encontrado.'
            });
        }

        res.json({
            success: true,
            message: `Estado "${estadoActualizado.nombre}" actualizado correctamente.`,
            estado: estadoActualizado
        });
    } catch (err) {
        console.error(`Error actualizando estado #${id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
