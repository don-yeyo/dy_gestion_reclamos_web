const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const emailWorkflowService = require('../services/emailWorkflowService');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

/**
 * GET /api/public/actions/admin-quick
 * Endpoint webhook seguro para administradores desde el email de nuevo reclamo.
 * Pone el reclamo en "En curso", sincroniza consumidor a "En curso", blanquea motivos
 * y dispara el email de acción con instrucciones al Supervisor asignado.
 */
router.get('/admin-quick', async (req, res) => {
    const { token } = req.query;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'admin' || payload.action !== 'en_curso' || !payload.claimId) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Enlace Inválido - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f1535; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; }
                    .card { background: #1a2254; padding: 40px; border-radius: 16px; border: 1px solid rgba(229, 53, 59, 0.4); text-align: center; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
                    .icon { font-size: 48px; color: #E5353B; margin-bottom: 16px; }
                    h2 { margin-top: 0; color: #ffffff; }
                    p { color: #94a3b8; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">⚠️</div>
                    <h2>Enlace Inválido o Expirado</h2>
                    <p>El enlace único de acción utilizado no es válido, ha caducado o su firma digital no coincide.</p>
                    <p style="font-size:0.85rem; color:#64748b; margin-top:20px;">Por seguridad, podés gestionar este reclamo ingresando al Gestor Web autenticado.</p>
                </div>
            </body>
            </html>
        `);
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) {
            return res.status(404).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                    <h2>Reclamo #${payload.claimId} no encontrado</h2>
                    <p>No se encontró el registro en la base de reclamos.</p>
                </div>
            `);
        }

        const yaEstabaEnCurso = claim.estado_admin === 'En curso';

        if (!yaEstabaEnCurso) {
            const updates = {
                'AO': 'En curso',
                'AS': 'En curso',
                'AP': ''
            };
            if (claim.estado_supervisor === 'Sin acciones') {
                updates['AQ'] = 'Pendiente';
            }

            await googleSheetsService.updateReclamo(payload.claimId, updates);

            // Disparar email al supervisor
            const updatedClaim = await googleSheetsService.getReclamoById(payload.claimId);
            emailWorkflowService.sendSupervisorActionEmail(updatedClaim).catch(err => {
                console.error(`[WORKFLOW] Error enviando email a supervisor (${claim.supervisor_email}):`, err.message);
            });
        }

        const supervisorInfo = claim.supervisor ? `${claim.supervisor} (${claim.supervisor_email || 'Sin email registrado'})` : 'No asignado';

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reclamo En Curso - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; }
                    .card { background: #151C5B; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                    .icon { width: 64px; height: 64px; line-height: 64px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; border-radius: 50%; font-size: 32px; color: #10b981; margin: 0 auto 20px; }
                    h2 { margin: 0 0 12px 0; color: #ffffff; font-size: 1.5rem; }
                    .badge { display: inline-block; background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; margin-bottom: 16px; }
                    p { color: #cbd5e1; line-height: 1.6; margin: 8px 0; font-size: 0.95rem; }
                    .info-box { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; margin: 20px 0; text-align: left; font-size: 0.9rem; border-left: 4px solid #10b981; }
                    .btn { display: inline-block; background: #E5353B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; margin-top: 16px; transition: background 0.2s; }
                    .btn:hover { background: #b91c1c; }
                    .footer { margin-top: 24px; font-size: 0.78rem; color: #64748b; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <div class="badge">ESTADO: EN CURSO</div>
                    <h2>${yaEstabaEnCurso ? 'El Reclamo Ya Se Encuentra En Curso' : '¡Reclamo Puesto En Curso con Éxito!'}</h2>
                    <p>Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${claim.nombre} ${claim.apellido}</strong> (${claim.localidad}, ${claim.provincia}).</p>
                    
                    <div class="info-box">
                        <strong>Acción Ejecutada:</strong><br/>
                        • <strong>Estado Admin:</strong> En curso<br/>
                        • <strong>Estado Consumidor:</strong> En curso<br/>
                        • <strong>Supervisor Notificado:</strong> ${supervisorInfo}<br/>
                        • <strong>Instrucciones:</strong> Enviadas por correo electrónico para reposición o cortesía.
                    </div>

                    <a href="${APP_BASE_URL}/reclamos/${payload.claimId}" class="btn">Abrir en el Gestor Web</a>

                    <div class="footer">
                        Don Yeyo S.A. | Sistema de Gestión Automatizado de Reclamos
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error en admin-quick webhook:', err);
        res.status(500).send(`Error al procesar la acción: ${err.message}`);
    }
});

/**
 * GET /api/public/actions/generate-admin-link
 * Endpoint para generar el enlace firmado seguro para un reclamo dado
 */
router.get('/generate-admin-link', (req, res) => {
    const { claimId } = req.query;
    if (!claimId) {
        return res.status(400).json({ success: false, error: 'claimId es requerido.' });
    }
    const token = emailWorkflowService.generateAdminActionToken(claimId);
    const url = emailWorkflowService.generateAdminActionUrl(claimId);
    res.json({ success: true, claimId, token, url });
});

/**
 * GET /api/public/actions/verify
 * Verifica si un token de acción es válido y devuelve datos del caso para el frontend
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
