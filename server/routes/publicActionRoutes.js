const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');
const emailWorkflowService = require('../services/emailWorkflowService');
const supervisorLookupService = require('../services/supervisorLookupService');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

const SUPERVISORES_OFICIALES = [
    { nombre: 'Hugo Basile', email: 'hugob@donyeyo.com.ar' },
    { nombre: 'Gustavo Orgaz', email: 'gustavoeo@donyeyo.com.ar' },
    { nombre: 'Alexis Gonzalez', email: 'alexisg@donyeyo.com.ar' },
    { nombre: 'Edgar Barberis', email: 'edgarb@donyeyo.com.ar' },
    { nombre: 'Guadalupe Azcue', email: 'guadalupea@donyeyo.com.ar' },
    { nombre: 'Ricardo Altamirano', email: 'ricardoa@donyeyo.com.ar' },
    { nombre: 'Hector Borgogno', email: 'hectorb@donyeyo.com.ar' },
    { nombre: 'Facundo Carmody', email: 'facundoc@donyeyo.com.ar' },
    { nombre: 'Mariano Marinelli', email: 'marianom@donyeyo.com.ar' },
    { nombre: 'Pablo Gallo', email: 'juanpablog@donyeyo.com.ar' }
];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function hasSupervisorValido(claim) {
    if (!claim || !claim.supervisor) return false;
    const sup = String(claim.supervisor).trim().toLowerCase();
    if (!sup || sup === 'sin asignar' || sup === 'no asignado' || sup === 'null' || sup === 'undefined' || sup === '-') {
        return false;
    }
    return true;
}

async function getSupervisoresDisponibles() {
    const list = [...SUPERVISORES_OFICIALES];
    try {
        const info = await supervisorLookupService.getInfo();
        if (info && Array.isArray(info.supervisores)) {
            for (const s of info.supervisores) {
                if (s.nombre && !list.some(item => item.nombre.toLowerCase() === s.nombre.toLowerCase())) {
                    list.push({ nombre: s.nombre, email: s.email || '' });
                }
            }
        }
    } catch (e) {
        // Fallback silencioso a SUPERVISORES_OFICIALES
    }
    return list;
}

/**
 * GET /api/public/actions/admin-quick
 * Endpoint webhook seguro para administradores desde el email de nuevo reclamo.
 * Si NO tiene supervisor asignado: advierte y permite asignarlo allí mismo sin avanzar a En curso.
 * Si TIENE supervisor: pone el reclamo en "En curso" y dispara el email de acción.
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

        // =========================================================================
        // VALIDACIÓN CRÍTICA: NO AVANZAR NUNCA SIN SUPERVISOR ASIGNADO
        // =========================================================================
        if (!hasSupervisorValido(claim)) {
            const supervisores = await getSupervisoresDisponibles();
            const productosResumen = claim.items && claim.items.length
                ? claim.items.map(it => `${it.cantidad || 1}x ${it.producto || it.marca || 'Producto'}`).join(', ')
                : (claim.defecto || 'Sin detalle de producto');

            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Reclamo #${claim.id} - Asignar Supervisor Requerido</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; box-sizing: border-box; }
                        .card { background: #151C5B; padding: 36px; border-radius: 16px; border: 1px solid rgba(234, 179, 8, 0.4); text-align: center; max-width: 540px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
                        .alert-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(234, 179, 8, 0.15); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.4); padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
                        .icon { width: 56px; height: 56px; line-height: 56px; background: rgba(234, 179, 8, 0.12); border: 2px solid #eab308; border-radius: 50%; font-size: 28px; color: #eab308; margin: 0 auto 16px; }
                        h2 { margin: 0 0 10px 0; color: #ffffff; font-size: 1.45rem; }
                        p.intro { color: #cbd5e1; line-height: 1.55; margin: 0 0 20px 0; font-size: 0.94rem; }
                        .claim-summary { background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 16px; margin-bottom: 22px; text-align: left; font-size: 0.88rem; border-left: 4px solid #eab308; line-height: 1.6; }
                        .claim-summary strong { color: #f8fafc; }
                        .form-group { text-align: left; margin-bottom: 20px; }
                        label { display: block; font-weight: 600; margin-bottom: 8px; color: #e2e8f0; font-size: 0.92rem; }
                        select { width: 100%; padding: 13px 14px; background: #0b0f24; border: 1px solid #3b82f6; border-radius: 8px; color: #ffffff; font-size: 0.95rem; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
                        select:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3); }
                        select option { background: #0b0f24; color: #ffffff; }
                        .btn-submit { width: 100%; background: #E5353B; color: #ffffff; border: none; padding: 14px 20px; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: background 0.2s, transform 0.1s; box-shadow: 0 4px 14px rgba(229, 53, 59, 0.4); display: flex; align-items: center; justify-content: center; gap: 8px; }
                        .btn-submit:hover { background: #b91c1c; }
                        .btn-submit:active { transform: scale(0.99); }
                        .footer-link { margin-top: 20px; font-size: 0.84rem; }
                        .footer-link a { color: #93c5fd; text-decoration: underline; }
                        .note { font-size: 0.78rem; color: #94a3b8; margin-top: 14px; line-height: 1.4; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">⚠️</div>
                        <div class="alert-badge">Supervisor no asignado</div>
                        <h2>Reclamo #${claim.id}: Falta Asignar Supervisor</h2>
                        <p class="intro">
                            Para iniciar la <strong>Acción de Compensación</strong> y poner el reclamo <strong>En curso</strong>,
                            es indispensable que cuente con un supervisor comercial responsable que ejecute la reposición.
                            <strong>El reclamo no avanzará hasta que selecciones un supervisor.</strong>
                        </p>

                        <div class="claim-summary">
                            <div><strong>Consumidor:</strong> ${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</div>
                            <div><strong>Ubicación:</strong> ${escapeHtml(claim.localidad)}, ${escapeHtml(claim.provincia)} (${escapeHtml(claim.domicilio || 'Sin domicilio')})</div>
                            <div><strong>Contacto:</strong> ${escapeHtml(claim.telefono || 'Sin teléfono')} | ${escapeHtml(claim.email || 'Sin email')}</div>
                            <div><strong>Producto(s):</strong> ${escapeHtml(productosResumen)}</div>
                        </div>

                        <form method="POST" action="/api/public/actions/admin-assign-and-start">
                            <input type="hidden" name="token" value="${escapeHtml(token)}" />
                            
                            <div class="form-group">
                                <label for="supervisorSelect">Asignar Supervisor Comercial Responsable:</label>
                                <select id="supervisorSelect" name="supervisor" required>
                                    <option value="" disabled selected>-- Seleccioná un supervisor comercial --</option>
                                    ${supervisores.map(s => `
                                        <option value="${escapeHtml(s.nombre)}|${escapeHtml(s.email)}">
                                            ${escapeHtml(s.nombre)} (${escapeHtml(s.email || 'Sin correo')})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <button type="submit" class="btn-submit">
                                ✓ Asignar Supervisor y Poner En Curso
                            </button>
                        </form>

                        <div class="footer-link">
                            <a href="${APP_BASE_URL}/reclamos/${claim.id}">O abrir en el Gestor Web para consultar el mapa de coberturas</a>
                        </div>
                        <div class="note">
                            Al confirmar, el sistema registrará la asignación, pasará el reclamo a <strong>En curso</strong> y notificará al supervisor por correo con las instrucciones de compensación.
                        </div>
                    </div>
                </body>
                </html>
            `);
        }

        if (!yaEstabaEnCurso) {
            const updates = {
                'AO': 'En curso',
                'AS': 'En curso',
                'AP': '',
                'AQ': 'Pendiente',
                'AT': 'Pendiente'
            };

            await googleSheetsService.updateReclamo(payload.claimId, updates, {
                actor: 'admin_link',
                motivo: 'Aprobación rápida desde email'
            });

            // Calcular y persistir producto de cortesía en Sheets y DB
            try {
                await googleSheetsService.aplicarProductoCortesia(payload.claimId);
            } catch (errCortesia) {
                console.error(`[CORTESIA] Error aplicando producto cortesía al reclamo #${payload.claimId}:`, errCortesia.message);
            }

            // Disparar email al supervisor y a Calidad/Inocuidad
            const updatedClaim = await googleSheetsService.getReclamoById(payload.claimId);
            emailWorkflowService.sendSupervisorActionEmail(updatedClaim).catch(err => {
                console.error(`[WORKFLOW] Error enviando email a supervisor (${claim.supervisor_email}):`, err.message);
            });
            emailWorkflowService.sendInocuidadActionEmail(updatedClaim).catch(err => {
                console.error('[WORKFLOW] Error enviando email a inocuidad:', err.message);
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
                    <p>Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong> (${escapeHtml(claim.localidad)}, ${escapeHtml(claim.provincia)}).</p>
                    
                    <div class="info-box">
                        <strong>Acción Ejecutada:</strong><br/>
                        • <strong>Estado Admin:</strong> En curso<br/>
                        • <strong>Estado Consumidor:</strong> En curso<br/>
                        • <strong>Supervisor Notificado:</strong> ${escapeHtml(supervisorInfo)}<br/>
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
 * POST /api/public/actions/admin-assign-and-start
 * Asigna supervisor y pasa a "En curso" desde la pantalla de advertencia
 */
router.post('/admin-assign-and-start', async (req, res) => {
    const { token, supervisor } = req.body;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'admin' || payload.action !== 'en_curso' || !payload.claimId) {
        return res.status(401).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                <h2>Enlace Inválido o Expirado</h2>
                <p>El token de autenticación ha caducado. Por favor ingresá al Gestor Web.</p>
            </div>
        `);
    }

    if (!supervisor || typeof supervisor !== 'string' || supervisor.trim() === '') {
        return res.status(400).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                <h2>Error: Supervisor Requerido</h2>
                <p>No se seleccionó ningún supervisor válido. Por favor volvé atrás e intentá de nuevo.</p>
            </div>
        `);
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) {
            return res.status(404).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                    <h2>Reclamo #${payload.claimId} no encontrado</h2>
                </div>
            `);
        }

        // Parsea nombre y email
        let supNombre = supervisor.trim();
        let supEmail = '';

        if (supervisor.includes('|')) {
            const parts = supervisor.split('|');
            supNombre = (parts[0] || '').trim();
            supEmail = (parts[1] || '').trim();
        }

        if (!supEmail) {
            const match = SUPERVISORES_OFICIALES.find(s => s.nombre.toLowerCase() === supNombre.toLowerCase());
            if (match) {
                supEmail = match.email;
            }
        }

        if (!supNombre || supNombre.toLowerCase().includes('sin asignar')) {
            return res.status(400).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                    <h2>Supervisor Inválido</h2>
                    <p>Debés seleccionar un supervisor comercial válido de la lista.</p>
                </div>
            `);
        }

        // Actualizar supervisor y poner en curso con derivaciones a supervisor e inocuidad
        const updates = {
            'L': supNombre,
            'AG': supEmail,
            'AO': 'En curso',
            'AS': 'En curso',
            'AP': '',
            'AQ': 'Pendiente',
            'AT': 'Pendiente'
        };

        await googleSheetsService.updateReclamo(payload.claimId, updates, {
            actor: 'admin_link',
            actorEmail: 'admin@donyeyo.com.ar',
            motivo: `Supervisor ${supNombre} asignado y puesto En curso desde enlace web de correo`
        });

        // Disparar emails al supervisor asignado y a Calidad/Inocuidad
        const updatedClaim = await googleSheetsService.getReclamoById(payload.claimId);
        emailWorkflowService.sendSupervisorActionEmail(updatedClaim).catch(err => {
            console.error(`[WORKFLOW] Error enviando email a supervisor (${supEmail}):`, err.message);
        });
        emailWorkflowService.sendInocuidadActionEmail(updatedClaim).catch(err => {
            console.error('[WORKFLOW] Error enviando email a inocuidad:', err.message);
        });

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Supervisor Asignado y En Curso - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; }
                    .card { background: #151C5B; padding: 40px; border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 520px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
                    .icon { width: 64px; height: 64px; line-height: 64px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; border-radius: 50%; font-size: 32px; color: #10b981; margin: 0 auto 20px; }
                    h2 { margin: 0 0 12px 0; color: #ffffff; font-size: 1.5rem; }
                    .badge { display: inline-block; background: #10b981; color: #ffffff; padding: 5px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; margin-bottom: 16px; letter-spacing: 0.05em; }
                    p { color: #cbd5e1; line-height: 1.6; margin: 8px 0; font-size: 0.95rem; }
                    .info-box { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; margin: 20px 0; text-align: left; font-size: 0.9rem; border-left: 4px solid #10b981; line-height: 1.7; }
                    .btn { display: inline-block; background: #E5353B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; margin-top: 16px; transition: background 0.2s; }
                    .btn:hover { background: #b91c1c; }
                    .footer { margin-top: 24px; font-size: 0.78rem; color: #64748b; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <div class="badge">SUPERVISOR ASIGNADO • EN CURSO</div>
                    <h2>¡Supervisor Asignado con Éxito!</h2>
                    <p>El Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong> ahora cuenta con supervisor y se encuentra <strong>En curso</strong>.</p>
                    
                    <div class="info-box">
                        <strong>Acciones Completadas:</strong><br/>
                        • <strong>Supervisor Asignado:</strong> ${escapeHtml(supNombre)} (${escapeHtml(supEmail || 'Sin email registrado')})<br/>
                        • <strong>Estado Admin:</strong> En curso<br/>
                        • <strong>Estado Consumidor:</strong> En curso<br/>
                        • <strong>Acción de Compensación:</strong> Notificación enviada al supervisor por correo electrónico.<br/>
                        • <strong>Calidad & Inocuidad:</strong> Expediente técnico enviado al departamento de calidad para análisis de lote.
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
        console.error('Error al asignar supervisor y poner en curso:', err);
        res.status(500).send(`Error al procesar la asignación: ${err.message}`);
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
        }, {
            actor: 'supervisor_link',
            motivo: 'Supervisor confirmó resolución/entrega de producto desde email'
        });

        // Evaluar cierre automatico del reclamo si se cumplieron todas las condiciones
        reclamosDatabaseService.checkAndFinalizeAdminState(payload.claimId).catch(console.error);

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

        // Persistir estado y motivo en Google Sheets y MySQL
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AQ': 'Imposibilidad',
            'AR': String(motivo).trim()
        }, {
            actor: 'supervisor_link',
            actorEmail: claim.supervisor_email || '',
            motivo: String(motivo).trim()
        });

        // Notificar por email a los administradores
        emailWorkflowService.sendSupervisorImpossibilityAlertToAdmins(claim, motivo).catch(err => {
            console.error('Error enviando alerta a administradores:', err.message);
        });

        // Evaluar cierre automatico del reclamo si se cumplieron todas las condiciones
        reclamosDatabaseService.checkAndFinalizeAdminState(payload.claimId).catch(console.error);

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

        // Persistir estado_consumidor en Google Sheets y MySQL con auditoría
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AS': estadoFinal
        }, {
            actor: 'consumidor_link',
            actorEmail: claim ? claim.email : '',
            motivo: `Consumidor respondió encuesta: ${payload.action}`
        });

        // Notificar a los administradores
        if (claim) {
            emailWorkflowService.sendConsumerFeedbackAlertToAdmins(claim, estadoFinal).catch(err => {
                console.error('Error notificando respuesta a admins:', err.message);
            });
        }

        // Evaluar cierre automatico del reclamo si se cumplieron todas las condiciones
        reclamosDatabaseService.checkAndFinalizeAdminState(payload.claimId).catch(console.error);

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
