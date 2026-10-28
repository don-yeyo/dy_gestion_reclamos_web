const express = require('express');
const router = express.Router();
const prioridadesService = require('../services/prioridadesService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

/**
 * GET /api/prioridades
 * Obtiene la lista de prioridades canónicas con sus reglas de cortesía
 */
router.get('/', async (req, res) => {
    try {
        const prioridades = await prioridadesService.getPrioridades();
        res.json({
            success: true,
            data: prioridades,
            prioridades
        });
    } catch (err) {
        console.error('[PRIORIDADES ROUTE] Error al obtener prioridades:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/prioridades/:codigo/reglas
 * Permite a los administradores modificar EXCLUSIVAMENTE las reglas de cortesía de una prioridad
 * (No permite cambiar nombre, descripción ni eliminar/agregar prioridades).
 */
router.put('/:codigo/reglas', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const { codigo } = req.params;
        const reglas_cortesia = req.body.reglas_cortesia || req.body.reglas;
        const { sla } = req.body;

        if (!reglas_cortesia) {
            return res.status(400).json({
                success: false,
                error: 'Debe enviar el arreglo reglas_cortesia para actualizar.'
            });
        }

        const userEmail = req.user?.email || 'admin';
        const updated = await prioridadesService.updateReglasCortesia(codigo, reglas_cortesia, sla, userEmail);

        // Registro de log de auditoría de configuración
        const systemLogService = require('../services/systemLogService');
        await systemLogService.logConfigChange({
            modulo: 'prioridades_sla',
            accion: 'modificacion',
            descripcion: `Actualización de Reglas de Cortesía y SLA para prioridad "${updated.nombre}" (Código: ${codigo}, SLA: ${updated.sla} días)`,
            actor: req.user?.role || 'admin',
            actorEmail: userEmail,
            valoresNuevos: {
                codigo,
                nombre: updated.nombre,
                sla: updated.sla,
                reglas_cortesia
            }
        });

        res.json({
            success: true,
            message: `Reglas de cortesía y SLA para prioridad ${updated.nombre} actualizadas correctamente.`,
            data: updated
        });
    } catch (err) {
        console.error('[PRIORIDADES ROUTE] Error al actualizar reglas de cortesía:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
