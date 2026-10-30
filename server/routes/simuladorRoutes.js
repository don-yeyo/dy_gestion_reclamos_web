const express = require('express');
const router = express.Router();
const cronFollowupService = require('../services/cronFollowupService');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');
const seguimientosService = require('../services/seguimientosService');

/**
 * GET /api/simulador/reclamo/:id/estado
 * Obtiene el estado de seguimiento y notificaciones de un reclamo para el modal de simulación
 */
router.get('/reclamo/:id/estado', async (req, res) => {
    try {
        const idStr = String(req.params.id);
        const claim = await reclamosDatabaseService.getReclamoById(idStr);
        if (!claim) {
            return res.status(404).json({ success: false, message: `Reclamo #${idStr} no encontrado` });
        }

        const notifSupervisorCount = await reclamosDatabaseService.getNotificationCount(idStr, 'supervisor');
        const notifConsumidorCount = await reclamosDatabaseService.getNotificationCount(idStr, 'consumidor');
        const ultimaNotifSupervisor = await reclamosDatabaseService.getLastNotificationDate(idStr, 'supervisor');
        const ultimaNotifConsumidor = await reclamosDatabaseService.getLastNotificationDate(idStr, 'consumidor');

        const prioridadCodigo = Number(claim.prioridad) || 20;
        let reglas = [];
        try {
            reglas = await seguimientosService.getAll({ activo: true });
        } catch (_) {}

        const reglaSupervisor = reglas.find(r => 
            r.rol === 'supervisor' && 
            r.estado_codigo === 'Pendiente' && 
            Number(r.prioridad_codigo) === prioridadCodigo
        ) || { disparo_dias: 2, intervalo_n_dias: 1, repeticiones: 3 };

        const reglaConsumidor = reglas.find(r => 
            r.rol === 'consumidor' && 
            (r.estado_codigo === 'En curso' || r.estado_codigo === 'Pendiente') && 
            Number(r.prioridad_codigo) === prioridadCodigo
        ) || { disparo_dias: 3, intervalo_n_dias: 2, repeticiones: 2 };

        const now = new Date();
        const fechaCarga = claim.fecha_carga ? new Date(claim.fecha_carga) : (claim.created_at ? new Date(claim.created_at) : now);
        const diasTranscurridosReales = Math.floor((now - fechaCarga) / (1000 * 60 * 60 * 24));

        res.json({
            success: true,
            claim: {
                id: claim.id,
                nombre: claim.nombre,
                apellido: claim.apellido,
                estado_admin: claim.estado_admin,
                estado_supervisor: claim.estado_supervisor,
                estado_consumidor: claim.estado_consumidor,
                prioridad: claim.prioridad,
                prioridad_nombre: claim.prioridad_nombre,
                supervisor: claim.supervisor,
                supervisor_email: claim.supervisor_email,
                fecha_carga: claim.fecha_carga,
                dias_transcurridos_reales: diasTranscurridosReales
            },
            notificaciones: {
                supervisor: {
                    enviadas: notifSupervisorCount,
                    max_repeticiones: Number(reglaSupervisor.repeticiones) || 3,
                    disparo_inicial_dias: Number(reglaSupervisor.disparo_dias) || 2,
                    intervalo_n_dias: Number(reglaSupervisor.intervalo_n_dias) || 1,
                    ultima_notificacion: ultimaNotifSupervisor
                },
                consumidor: {
                    enviadas: notifConsumidorCount,
                    max_repeticiones: Number(reglaConsumidor.repeticiones) || 2,
                    disparo_inicial_dias: Number(reglaConsumidor.disparo_dias) || 3,
                    intervalo_n_dias: Number(reglaConsumidor.intervalo_n_dias) || 2,
                    ultima_notificacion: ultimaNotifConsumidor
                }
            },
            test_recipient: (process.env.EMAIL_TEST_RECIPIENT || 'gabrielt@donyeyo.com.ar').replace(/"/g, '')
        });
    } catch (err) {
        console.error('[SIMULADOR API] Error al obtener estado:', err.message);
        res.status(500).json({ success: false, message: 'Error al obtener estado de simulación: ' + err.message });
    }
});

/**
 * POST /api/simulador/reclamo/:id/avanzar
 * Ejecuta el avance temporal del cron para el reclamo especificado
 */
router.post('/reclamo/:id/avanzar', async (req, res) => {
    try {
        const idStr = String(req.params.id);
        const { diasAvanzar, syncGoogleSheets, enviarEmails, testRecipient } = req.body;
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';

        const result = await cronFollowupService.simularSeguimientoReclamo(idStr, {
            diasAvanzar: Number(diasAvanzar) || 0,
            syncGoogleSheets: Boolean(syncGoogleSheets),
            enviarEmails: enviarEmails !== false,
            testRecipient,
            userEmail
        });

        res.json(result);
    } catch (err) {
        console.error('[SIMULADOR API] Error al avanzar simulación:', err.message);
        res.status(500).json({ success: false, message: 'Error ejecutando simulación: ' + err.message });
    }
});

/**
 * POST /api/simulador/reclamo/:id/reset-notificaciones
 * Reinicia el historial de notificaciones de prueba de un reclamo
 */
router.post('/reclamo/:id/reset-notificaciones', async (req, res) => {
    try {
        const idStr = String(req.params.id);
        const result = await cronFollowupService.resetearNotificacionesReclamo(idStr);
        res.json(result);
    } catch (err) {
        console.error('[SIMULADOR API] Error al reiniciar notificaciones:', err.message);
        res.status(500).json({ success: false, message: 'Error al reiniciar historial: ' + err.message });
    }
});

module.exports = router;

