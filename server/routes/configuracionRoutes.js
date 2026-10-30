const express = require('express');
const router = express.Router();
const configuracionService = require('../services/configuracionService');

/**
 * GET /api/configuracion
 * Obtiene todas las configuraciones del sistema agrupadas por categoría
 */
router.get('/', async (req, res) => {
    try {
        const data = await configuracionService.getAll();
        res.json({
            success: true,
            data
        });
    } catch (err) {
        console.error('[CONFIGURACION API] Error al obtener configuraciones:', err.message);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuraciones del sistema',
            error: err.message
        });
    }
});

/**
 * PUT /api/configuracion
 * Actualiza configuraciones en bloque
 * Body: { items: { clave: valor, ... } }
 */
router.put('/', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const rawPayload = req.body.items || req.body.configs || req.body;

        let itemsObj = {};
        if (Array.isArray(rawPayload)) {
            rawPayload.forEach(item => {
                if (item && item.clave) {
                    itemsObj[item.clave] = item.valor;
                }
            });
        } else if (rawPayload && typeof rawPayload === 'object') {
            itemsObj = rawPayload;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Debe enviar un objeto o array con las configuraciones a actualizar.'
            });
        }

        const result = await configuracionService.updateBatch(itemsObj, userEmail);
        const dataActualizada = await configuracionService.getAll();

        res.json({
            success: true,
            message: 'Configuraciones actualizadas exitosamente',
            result,
            data: dataActualizada
        });
    } catch (err) {
        console.error('[CONFIGURACION API] Error al actualizar configuraciones:', err.message);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuraciones',
            error: err.message
        });
    }
});

/**
 * POST /api/configuracion/reset
 * Restablece configuraciones a los valores de fábrica
 * Body: { categoria: 'email_supervisor' | 'all' }
 */
router.post('/reset', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const { categoria } = req.body;

        const result = await configuracionService.resetToDefaults(categoria || null, userEmail);
        const dataActualizada = await configuracionService.getAll();

        res.json({
            success: true,
            message: `Valores de fábrica restablecidos (${categoria || 'todos'}).`,
            result,
            data: dataActualizada
        });
    } catch (err) {
        console.error('[CONFIGURACION API] Error al restablecer configuraciones:', err.message);
        res.status(500).json({
            success: false,
            message: 'Error al restablecer configuraciones',
            error: err.message
        });
    }
});


/**
 * GET /api/configuracion/test-recipient
 * Retorna el email configurado por defecto para pruebas
 */
router.get('/test-recipient', (req, res) => {
    const testRecipient = (process.env.EMAIL_TEST_RECIPIENT || process.env.ALERTA_SMTP_USER || 'gabrielt@donyeyo.com.ar').replace(/"/g, '');
    res.json({
        success: true,
        test_recipient: testRecipient
    });
});

/**
 * POST /api/configuracion/enviar-muestra
 * Envía un correo de muestra del tipo seleccionado a la casilla especificada usando los datos de un reclamo
 * Body: { email_tipo, claim_id, destinatario }
 */
router.post('/enviar-muestra', async (req, res) => {
    try {
        const { email_tipo, claim_id, destinatario } = req.body;
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';

        if (!email_tipo) {
            return res.status(400).json({ success: false, message: 'Debe especificar el tipo de email a probar.' });
        }
        if (!claim_id) {
            return res.status(400).json({ success: false, message: 'Debe especificar el número de reclamo.' });
        }

        const targetEmail = (destinatario || process.env.EMAIL_TEST_RECIPIENT || process.env.ALERTA_SMTP_USER || 'gabrielt@donyeyo.com.ar').replace(/"/g, '').trim();
        if (!targetEmail || !targetEmail.includes('@')) {
            return res.status(400).json({ success: false, message: 'Debe indicar una dirección de correo válida.' });
        }

        const googleSheetsService = require('../services/googleSheetsService');
        const emailWorkflowService = require('../services/emailWorkflowService');

        const claim = await googleSheetsService.getReclamoById(claim_id);
        if (!claim) {
            return res.status(404).json({ success: false, message: `No se encontró el Reclamo #${claim_id}.` });
        }

        // Crear una copia de los datos del reclamo asegurando que el email sea el destinatario solicitado para la prueba
        const testClaim = {
            ...claim,
            email: targetEmail,
            supervisor_email: targetEmail
        };

        const originalEnvMode = process.env.EMAIL_TEST_MODE;
        const originalEnvRecipient = process.env.EMAIL_TEST_RECIPIENT;

        // Forzar modo testeo temporal apuntando a la casilla targetEmail especificada
        process.env.EMAIL_TEST_MODE = 'true';
        process.env.EMAIL_TEST_RECIPIENT = targetEmail;

        try {
            switch (email_tipo) {
                case 'consumidor_satisfaccion':
                case 'consumidor':
                    await emailWorkflowService.sendConsumerFollowupEmail(testClaim, {
                        reintentoNro: 1,
                        actor: 'admin_test',
                        actorEmail: userEmail
                    });
                    break;

                case 'consumidor_fin': {
                    const headerHtml = await emailWorkflowService.getLogoHeaderHtml('Reclamo Finalizado y Resuelto', 'Atención al Consumidor');
                    await emailWorkflowService.sendMail({
                        to: targetEmail,
                        subject: `[Don Yeyo] Reclamo #${claim.id} Finalizado y Resuelto`,
                        html: `<div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                            ${headerHtml}
                            <div style="padding:22px; color:#1e293b; line-height:1.6;">
                                <p>Estimado/a <strong>${claim.nombre} ${claim.apellido}</strong>,</p>
                                <p>Queremos agradecerte por tu tiempo y colaboración. Tu reclamo sobre <strong>${(claim.items && claim.items[0]?.producto) || 'nuestros productos'}</strong> ha sido completado y finalizado formalmente.</p>
                                <p>Seguimos a tu entera disposición ante cualquier otra consulta.</p>
                            </div>
                        </div>`
                    }, 'consumer', {
                        reclamoId: claim.id,
                        destinatarioTipo: 'consumidor',
                        tipoDisparo: 'manual',
                        motivo: `Envío de email de muestra (Consumidor Fin) a ${targetEmail}`,
                        actor: 'admin_test',
                        actorEmail: userEmail
                    });
                    break;
                }

                case 'supervisor':
                    await emailWorkflowService.sendSupervisorActionEmail(testClaim, {
                        manual: true,
                        actor: 'admin_test',
                        actorEmail: userEmail,
                        motivo: `Envío de email de muestra (Supervisor) a ${targetEmail}`
                    });
                    break;

                case 'inocuidad':
                    await emailWorkflowService.sendInocuidadActionEmail(testClaim, {
                        manual: true,
                        actor: 'admin_test',
                        actorEmail: userEmail,
                        motivo: `Envío de email de muestra (Inocuidad) a ${targetEmail}`
                    });
                    break;

                case 'elevacion':
                    await emailWorkflowService.sendElevationAlert(testClaim, 'Prueba de muestra de alerta de elevación directiva por agotamiento de repeticiones');
                    break;

                case 'fraude':
                    await emailWorkflowService.sendFraudAlertToAdmins(testClaim, 'Prueba de muestra de alerta crítica por discrepancia / sospecha de fraude comercial');
                    break;

                default:
                    return res.status(400).json({ success: false, message: `Tipo de email no reconocido: ${email_tipo}` });
            }
        } finally {
            process.env.EMAIL_TEST_MODE = originalEnvMode;
            process.env.EMAIL_TEST_RECIPIENT = originalEnvRecipient;
        }

        res.json({
            success: true,
            message: `Correo de muestra ("${email_tipo}") enviado con éxito a ${targetEmail} usando los datos del Reclamo #${claim.id}.`,
            destinatario: targetEmail,
            claim_id: claim.id
        });
    } catch (err) {
        console.error('[CONFIGURACION API] Error al enviar email de muestra:', err.message);
        res.status(500).json({
            success: false,
            message: 'Error al despachar el email de muestra: ' + err.message
        });
    }
});

module.exports = router;
