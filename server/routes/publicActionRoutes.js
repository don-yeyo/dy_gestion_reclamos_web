const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const emailWorkflowService = require('../services/emailWorkflowService');

/**
 * GET /api/public/actions/verify
 * Verifica si un token de acción es válido y devuelve datos del caso
 */
router.get('/verify', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, error: 'Token no provisto.' });

    const payload = emailWorkflowService.verifyToken(token);
    if (!payload) {
        return res.status(401).json({ success: false, error: 'El enlace es inválido o ha caducado.' });
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'El reclamo ya no existe.' });
        }

        res.json({
            success: true,
            claimId: payload.claimId,
            actor: payload.actor,
            action: payload.action,
            claim: {
                id: claim.id,
                consumidor: `${claim.nombre} ${claim.apellido}`,
                domicilio: claim.domicilio,
                localidad: claim.localidad,
                supervisor: claim.supervisor,
                estado_supervisor: claim.estado_supervisor,
                items: claim.items
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/public/actions/supervisor-quick
 * Endpoint directo al picar en "Pude Resolver la Acción" desde el email
 */
router.get('/supervisor-quick', async (req, res) => {
    const { token } = req.query;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'supervisor' || payload.action !== 'resuelto') {
        return res.status(401).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h2 style="color:#ef4444;">Enlace inválido o expirado</h2>
                <p>El enlace que utilizaste ya no es válido o ha caducado.</p>
            </div>
        `);
    }

    try {
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AQ': 'Resuelto'
        });

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Acción Registrada - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; max-width: 480px; }
                    .icon { font-size: 50px; color: #10b981; margin-bottom: 16px; }
                    h2 { color: #151C5B; margin-top: 0; }
                    p { color: #64748b; line-height: 1.5; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <h2>¡Acción Registrada con Éxito!</h2>
                    <p>Muchas gracias por gestionar la entrega del Reclamo <strong>#${payload.claimId}</strong>.</p>
                    <p>El estado se ha actualizado a <strong>Resuelto</strong> en el sistema corporativo.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(`Error al registrar la acción: ${err.message}`);
    }
});

/**
 * POST /api/public/actions/supervisor-imposibilidad
 * Envío del formulario de motivo de imposibilidad completado por el supervisor
 */
router.post('/supervisor-imposibilidad', async (req, res) => {
    const { token, motivo } = req.body;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'supervisor') {
        return res.status(401).json({ success: false, error: 'Token de acceso inválido o expirado.' });
    }

    if (!motivo || String(motivo).trim().length < 5) {
        return res.status(400).json({ success: false, error: 'Por favor indicá un motivo detallado.' });
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'Reclamo no encontrado.' });
        }

        // Persistir estado y motivo en Google Sheets
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AQ': 'Imposibilidad',
            'AR': String(motivo).trim()
        });

        // Notificar por email a los administradores
        emailWorkflowService.sendSupervisorImpossibilityAlertToAdmins(claim, motivo).catch(err => {
            console.error('Error enviando alerta a administradores:', err.message);
        });

        res.json({
            success: true,
            message: 'Motivo de imposibilidad registrado y notificado a la administración.'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/public/actions/consumidor-response
 * Endpoint al que llega el consumidor al hacer clic en uno de los 3 botones de su correo
 */
router.get('/consumidor-response', async (req, res) => {
    const { token } = req.query;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'consumidor') {
        return res.status(401).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h2 style="color:#ef4444;">Enlace inválido o expirado</h2>
            </div>
        `);
    }

    const feedbackMap = {
        'conforme': 'Resuelto conforme',
        'disconforme': 'Resuelto disconforme',
        'no_resuelto': 'No resuelto'
    };

    const estadoFinal = feedbackMap[payload.action] || 'Resuelto conforme';

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);

        // Persistir estado_consumidor en Google Sheets
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AS': estadoFinal
        });

        // Notificar a los administradores
        if (claim) {
            emailWorkflowService.sendConsumerFeedbackAlertToAdmins(claim, estadoFinal).catch(err => {
                console.error('Error notificando respuesta a admins:', err.message);
            });
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Gracias por tu respuesta - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; max-width: 480px; }
                    h2 { color: #151C5B; }
                    p { color: #64748b; line-height: 1.5; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>¡Muchas gracias por tu respuesta!</h2>
                    <p>Tu opinión sobre el Reclamo <strong>#${payload.claimId}</strong> ha sido registrada: <strong>${estadoFinal}</strong>.</p>
                    <p>Nos ayuda a seguir mejorando día a día la calidad de nuestros productos y atención.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(`Error al procesar: ${err.message}`);
    }
});

module.exports = router;
