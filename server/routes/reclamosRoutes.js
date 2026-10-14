const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');
const emailWorkflowService = require('../services/emailWorkflowService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

// Todos los endpoints de gestión requieren autenticación y rol válido
router.use(authMiddleware);

/**
 * GET /api/reclamos
 * Retorna todos los reclamos a partir del corte numérico
 */
router.get('/', async (req, res) => {
    try {
        const cutoff = req.query.cutoff || process.env.RECLAMOS_NUMERO_CORTE || '0';
        const reclamos = await googleSheetsService.getReclamos(cutoff);
        res.json({
            success: true,
            total: reclamos.length,
            cutoff,
            data: reclamos
        });
    } catch (err) {
        console.error('Error al listar reclamos:', err);
        res.status(500).json({ success: false, error: 'Error al consultar reclamos: ' + err.message });
    }
});

/**
 * POST /api/reclamos/sync
 * Sincronización manual forzada desde Google Sheets hacia MySQL (solo administradores)
 */
router.post('/sync', requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const cutoff = req.query.cutoff || process.env.RECLAMOS_NUMERO_CORTE || '0';
        const result = await googleSheetsService.syncSheetsToDatabase(cutoff);
        res.json({
            success: true,
            message: `Sincronización completada. Se sincronizaron ${result.synced} de ${result.totalSheets} registros hacia MySQL.`,
            ...result
        });
    } catch (err) {
        console.error('Error en sincronización manual:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/reclamos/:id
 * Retorna el detalle completo de un reclamo
 */
router.get('/:id', async (req, res) => {
    try {
        const claim = await googleSheetsService.getReclamoById(req.params.id);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'Reclamo no encontrado.' });
        }
        res.json({ success: true, data: claim });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/reclamos/:id/auditoria
 * Retorna el historial de cambios de estado y acciones ejecutadas sobre el reclamo
 */
router.get('/:id/auditoria', async (req, res) => {
    try {
        const history = await reclamosDatabaseService.getAuditLog(req.params.id);
        res.json({ success: true, reclamoId: req.params.id, total: history.length, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/reclamos/:id/estado-admin
 * Permite a los Administradores cambiar estado_admin (Pendiente | En curso | Aprobado | Desaprobado)
 * - Si es "En curso": sincroniza estado_consumidor a "En curso", blanquea motivos y dispara email con instrucciones al Supervisor.
 * - Si es "Desaprobado": pasa supervisor, consumidor e inocuidad a "Sin acciones" y guarda motivo.
 * - Si es "Aprobado": marca aprobado y limpia motivos.
 */
router.patch('/:id/estado-admin', requireRole(['admin', 'sysadmin']), async (req, res) => {
    const { estado, motivo_desaprobado } = req.body;
    const claimId = req.params.id;

    if (!['Pendiente', 'En curso', 'Aprobado', 'Desaprobado'].includes(estado)) {
        return res.status(400).json({
            success: false,
            error: 'Estado inválido. Debe ser Pendiente, En curso, Aprobado o Desaprobado.'
        });
    }

    try {
        const claim = await googleSheetsService.getReclamoById(claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'Reclamo no encontrado.' });
        }

        if (estado === 'En curso' || estado === 'Aprobado') {
            const rawSup = (claim.supervisor || '').trim().toLowerCase();
            const hasSupervisor = rawSup !== '' &&
                rawSup !== 'sin asignar' &&
                rawSup !== 'no asignado' &&
                rawSup !== 'null' &&
                rawSup !== 'undefined' &&
                rawSup !== '-';

            if (!hasSupervisor) {
                return res.status(400).json({
                    success: false,
                    error: 'No se puede avanzar el reclamo a En curso sin un supervisor comercial asignado. Por favor asigná un supervisor primero.'
                });
            }
        }

        const updates = { 'AO': estado };

        if (estado === 'En curso') {
            updates['AP'] = ''; // Blanquear motivos de desaprobado
            updates['AS'] = 'En curso'; // estado_consumidor pasa a En curso
            // Si el supervisor estaba en Sin acciones, vuelve a Pendiente
            if (claim.estado_supervisor === 'Sin acciones') {
                updates['AQ'] = 'Pendiente';
            }
        } else if (estado === 'Desaprobado') {
            updates['AP'] = motivo_desaprobado || 'Desaprobado por administración';
            // Regla solicitada: al desaprobar, cambiar los demás a "Sin acciones"
            updates['AQ'] = 'Sin acciones'; // estado_supervisor
            updates['AS'] = 'Sin acciones'; // estado_consumidor
            updates['AT'] = 'Sin acciones'; // estado_inocuidad
        } else if (estado === 'Aprobado') {
            updates['AP'] = '';
            if (claim.estado_supervisor === 'Sin acciones') {
                updates['AQ'] = 'Pendiente';
            }
        } else if (estado === 'Pendiente') {
            updates['AP'] = '';
        }

        const auditInfo = {
            actor: req.user ? req.user.role : 'admin',
            actorEmail: req.user ? req.user.email : null,
            motivo: motivo_desaprobado || null
        };

        await googleSheetsService.updateReclamo(claimId, updates, auditInfo);

        // Si fue pasado a "En curso" (o Aprobado directamente), disparar acción y email al supervisor
        if (estado === 'En curso' || estado === 'Aprobado') {
            const updatedClaim = await googleSheetsService.getReclamoById(claimId);
            emailWorkflowService.sendSupervisorActionEmail(updatedClaim).catch(err => {
                console.error(`[WORKFLOW] Error enviando email a supervisor (${claim.supervisor_email}):`, err.message);
            });
        }

        res.json({
            success: true,
            message: `Estado de administración actualizado a "${estado}".`,
            updates
        });
    } catch (err) {
        console.error('Error al actualizar estado admin:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/reclamos/:id/estado-inocuidad
 * Administradores o personal de inocuidad pueden gestionar este estado
 * Valores: "Sin acciones", "Pendiente", "Resuelto", "Imposibilidad"
 */
router.patch('/:id/estado-inocuidad', requireRole(['admin', 'inocuidad', 'sysadmin']), async (req, res) => {
    const { estado } = req.body;
    const claimId = req.params.id;

    if (!['Sin acciones', 'Pendiente', 'Resuelto', 'Imposibilidad'].includes(estado)) {
        return res.status(400).json({ success: false, error: 'Estado de inocuidad no válido.' });
    }

    try {
        const claim = await googleSheetsService.getReclamoById(claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'Reclamo no encontrado.' });
        }

        await googleSheetsService.updateReclamo(claimId, { 'AT': estado });

        // Si se cambia a Pendiente, notificar a Inocuidad con todo el material
        if (estado === 'Pendiente') {
            emailWorkflowService.sendInocuidadActionEmail(claim).catch(err => {
                console.error('[INOCUIDAD] Error enviando email a inocuidad:', err.message);
            });
        }

        res.json({ success: true, message: `Estado de inocuidad actualizado a "${estado}".` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/reclamos/:id/supervisor
 * Permite cambiar el supervisor y su email asociado
 */
router.patch('/:id/supervisor', requireRole(['admin', 'sysadmin']), async (req, res) => {
    const { supervisor, email } = req.body;
    const claimId = req.params.id;

    if (!supervisor) {
        return res.status(400).json({ success: false, error: 'Nombre de supervisor requerido.' });
    }

    try {
        const updates = {
            'L': supervisor,
            'AG': email || ''
        };
        await googleSheetsService.updateReclamo(claimId, updates);
        res.json({ success: true, message: 'Supervisor reasignado correctamente.', updates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/reclamos/:id/estado-supervisor
 * Actualización manual o forzada de estado_supervisor desde el panel
 */
router.patch('/:id/estado-supervisor', requireRole(['admin', 'sysadmin']), async (req, res) => {
    const { estado, motivo_imposibilidad } = req.body;
    const claimId = req.params.id;

    if (!['Pendiente', 'Resuelto', 'Imposibilidad', 'Sin respuesta', 'Sin acciones'].includes(estado)) {
        return res.status(400).json({ success: false, error: 'Estado de supervisor no válido.' });
    }

    try {
        const updates = { 'AQ': estado };
        if (motivo_imposibilidad !== undefined) {
            updates['AR'] = motivo_imposibilidad;
        }

        await googleSheetsService.updateReclamo(claimId, updates);
        res.json({ success: true, message: `Estado del supervisor actualizado a "${estado}".` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/reclamos/:id/estado-consumidor
 * Actualización manual de estado_consumidor desde el panel
 */
router.patch('/:id/estado-consumidor', requireRole(['admin', 'sysadmin']), async (req, res) => {
    const { estado } = req.body;
    const claimId = req.params.id;

    if (!['Pendiente', 'Resuelto conforme', 'Resuelto disconforme', 'No resuelto', 'Sin respuesta', 'Sin acciones'].includes(estado)) {
        return res.status(400).json({ success: false, error: 'Estado del consumidor no válido.' });
    }

    try {
        await googleSheetsService.updateReclamo(claimId, { 'AS': estado });
        res.json({ success: true, message: `Estado del consumidor actualizado a "${estado}".` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
