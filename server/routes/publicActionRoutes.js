const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');
const emailWorkflowService = require('../services/emailWorkflowService');
const supervisorLookupService = require('../services/supervisorLookupService');
const prioridadesService = require('../services/prioridadesService');
const productosService = require('../services/productosService');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

/**
 * GET /productos o /api/public/productos?q={busqueda}
 * Endpoint público con búsqueda predictiva por nombre de empaque ( packaging )
 * Orden alfabético ASC para selección ágil en formulario web de consumidores
 */
router.get('/productos', async (req, res) => {
    try {
        const query = req.query.q || '';
        const productos = await productosService.searchPublic(query);
        res.json({
            success: true,
            total: productos.length,
            data: productos
        });
    } catch (err) {
        console.error('[PUBLIC API] Error en búsqueda predictiva de productos:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

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
 * Muestra obligatoriamente la pantalla de aprobación para seleccionar la prioridad según gravedad
 * y el supervisor (si aún no estuviera asignado).
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
        if (yaEstabaEnCurso) {
            const supervisorInfo = claim.supervisor ? `${claim.supervisor} (${claim.supervisor_email || 'Sin email registrado'})` : 'No asignado';
            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Reclamo Ya En Curso - Don Yeyo</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; }
                        .card { background: #151C5B; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                        .icon { width: 64px; height: 64px; line-height: 64px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; border-radius: 50%; font-size: 32px; color: #10b981; margin: 0 auto 20px; }
                        h2 { margin: 0 0 12px 0; color: #ffffff; font-size: 1.5rem; }
                        .badge { display: inline-block; background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; margin-bottom: 16px; }
                        p { color: #cbd5e1; line-height: 1.6; margin: 8px 0; font-size: 0.95rem; }
                        .info-box { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; margin: 20px 0; text-align: left; font-size: 0.9rem; border-left: 4px solid #10b981; line-height: 1.6; }
                        .btn { display: inline-block; background: #E5353B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; margin-top: 16px; transition: background 0.2s; }
                        .btn:hover { background: #b91c1c; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">✓</div>
                        <div class="badge">ESTADO: EN CURSO</div>
                        <h2>El Reclamo Ya Se Encuentra En Curso</h2>
                        <p>Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong>.</p>
                        <div class="info-box">
                            • <strong>Prioridad Asignada:</strong> ${escapeHtml(claim.prioridad_nombre || 'No especificada')} (SLA: ${claim.sla_dias || 'N/A'} días)<br/>
                            • <strong>Supervisor:</strong> ${escapeHtml(supervisorInfo)}<br/>
                            • <strong>Regla Cortesía:</strong> ${escapeHtml(claim.regla_cortesia_aplicada || 'Estándar')}
                        </div>
                        <a href="${APP_BASE_URL}/reclamos/${payload.claimId}" class="btn">Abrir en el Gestor Web</a>
                    </div>
                </body>
                </html>
            `);
        }

        const prioridades = await prioridadesService.getPrioridades();
        const needsSupervisor = !hasSupervisorValido(claim);
        const supervisores = needsSupervisor ? await getSupervisoresDisponibles() : [];
        const productosResumen = claim.items && claim.items.length
            ? claim.items.map(it => `${it.cantidad || 1}x ${it.producto || it.marca || 'Producto'}`).join(', ')
            : (claim.defecto || 'Sin detalle de producto');

        return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Aprobar Reclamo #${claim.id} - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; box-sizing: border-box; }
                    .card { background: #151C5B; padding: 36px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.15); text-align: left; max-width: 580px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
                    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 5px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; margin-bottom: 14px; }
                    h2 { margin: 0 0 10px 0; color: #ffffff; font-size: 1.45rem; }
                    p.intro { color: #cbd5e1; line-height: 1.5; margin: 0 0 18px 0; font-size: 0.92rem; }
                    .claim-summary { background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; font-size: 0.88rem; border-left: 4px solid #3b82f6; line-height: 1.6; }
                    .claim-summary strong { color: #f8fafc; }
                    .form-group { margin-bottom: 18px; }
                    label { display: block; font-weight: 600; margin-bottom: 6px; color: #e2e8f0; font-size: 0.92rem; }
                    .required-star { color: #ef4444; }
                    select { width: 100%; padding: 12px 14px; background: #0b0f24; border: 1px solid #3b82f6; border-radius: 8px; color: #ffffff; font-size: 0.93rem; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
                    select:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3); }
                    select option { background: #0b0f24; color: #ffffff; }
                    .help-text { font-size: 0.78rem; color: #94a3b8; margin-top: 4px; }
                    .supervisor-box { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 0.88rem; color: #6ee7b7; }
                    .btn-submit { width: 100%; background: #E5353B; color: #ffffff; border: none; padding: 14px 20px; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: background 0.2s, transform 0.1s; box-shadow: 0 4px 14px rgba(229, 53, 59, 0.4); display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
                    .btn-submit:hover { background: #b91c1c; }
                    .btn-submit:active { transform: scale(0.99); }
                    .footer-link { text-align: center; margin-top: 18px; font-size: 0.84rem; }
                    .footer-link a { color: #93c5fd; text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="badge">Aprobación Mandatoria</div>
                    <h2>Aprobar Reclamo #${claim.id}</h2>
                    <p class="intro">
                        Para poner el reclamo <strong>En curso</strong> y habilitar las acciones de compensación e investigación,
                        <strong>es obligatorio definir el nivel de prioridad según la gravedad del caso</strong>.
                    </p>

                    <div class="claim-summary">
                        <div><strong>Consumidor:</strong> ${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</div>
                        <div><strong>Ubicación:</strong> ${escapeHtml(claim.localidad)}, ${escapeHtml(claim.provincia)}</div>
                        <div><strong>Producto(s):</strong> ${escapeHtml(productosResumen)}</div>
                        <div><strong>Defecto reportado:</strong> ${escapeHtml(claim.defecto || 'No especificado')}</div>
                    </div>

                    <form method="POST" action="/api/public/actions/admin-confirm-approval">
                        <input type="hidden" name="token" value="${escapeHtml(token)}" />

                        <div class="form-group">
                            <label for="prioridadSelect">Nivel de Prioridad según gravedad <span class="required-star">*</span>:</label>
                            <select id="prioridadSelect" name="prioridad" required>
                                <option value="" disabled selected>-- Seleccionar nivel de prioridad (obligatorio) --</option>
                                ${prioridades.map(p => `
                                    <option value="${p.codigo}">
                                        ${escapeHtml(p.nombre)} (SLA ${p.sla} días) — ${escapeHtml(p.descripcion)}
                                    </option>
                                `).join('')}
                            </select>
                            <div class="help-text">La prioridad define el SLA de respuesta y la regla de cortesía aplicable.</div>
                        </div>

                        ${needsSupervisor ? `
                            <div class="form-group">
                                <label for="supervisorSelect">Asignar Supervisor Comercial Responsable <span class="required-star">*</span>:</label>
                                <select id="supervisorSelect" name="supervisor" required>
                                    <option value="" disabled selected>-- Seleccioná un supervisor comercial --</option>
                                    ${supervisores.map(s => `
                                        <option value="${escapeHtml(s.nombre)}|${escapeHtml(s.email)}">
                                            ${escapeHtml(s.nombre)} (${escapeHtml(s.email || 'Sin correo')})
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="help-text">Requerido para coordinar la entrega o reposición en la zona.</div>
                            </div>
                        ` : `
                            <div class="supervisor-box">
                                ✓ <strong>Supervisor comercial asignado:</strong> ${escapeHtml(claim.supervisor)} ${claim.supervisor_email ? `(${escapeHtml(claim.supervisor_email)})` : ''}
                            </div>
                        `}

                        <button type="submit" class="btn-submit">
                            ✓ Confirmar Prioridad y Aprobar Reclamo
                        </button>
                    </form>

                    <div class="footer-link">
                        <a href="${APP_BASE_URL}/reclamos/${claim.id}">Abrir en el Gestor Web para consultar detalles completos</a>
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
 * POST /api/public/actions/admin-confirm-approval
 * Procesa la aprobación obligando a especificar prioridad (y supervisor si faltaba).
 */
router.post('/admin-confirm-approval', async (req, res) => {
    const { token, prioridad, supervisor } = req.body;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'admin' || payload.action !== 'en_curso' || !payload.claimId) {
        return res.status(401).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                <h2>Enlace Inválido o Expirado</h2>
                <p>El token de autenticación ha caducado. Por favor ingresá al Gestor Web.</p>
            </div>
        `);
    }

    const prioridadNum = parseInt(prioridad, 10);
    if (!prioridadNum || isNaN(prioridadNum)) {
        return res.status(400).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                <h2>Error: Prioridad Obligatoria</h2>
                <p>El nivel de prioridad es mandatorio para aprobar el reclamo. Por favor volvé atrás y seleccioná uno.</p>
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

        const prioridadObj = await prioridadesService.getPrioridadByCodigo(prioridadNum);
        if (!prioridadObj) {
            return res.status(400).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                    <h2>Error: Prioridad Inválida</h2>
                    <p>El código de prioridad (${prioridadNum}) no existe.</p>
                </div>
            `);
        }

        let supNombre = claim.supervisor || '';
        let supEmail = claim.supervisor_email || '';

        if (!hasSupervisorValido(claim)) {
            if (!supervisor || typeof supervisor !== 'string' || supervisor.trim() === '') {
                return res.status(400).send(`
                    <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                        <h2>Error: Supervisor Requerido</h2>
                        <p>No se seleccionó ningún supervisor comercial válido.</p>
                    </div>
                `);
            }
            if (supervisor.includes('|')) {
                const parts = supervisor.split('|');
                supNombre = (parts[0] || '').trim();
                supEmail = (parts[1] || '').trim();
            } else {
                supNombre = supervisor.trim();
            }
            if (!supEmail) {
                const match = SUPERVISORES_OFICIALES.find(s => s.nombre.toLowerCase() === supNombre.toLowerCase());
                if (match) supEmail = match.email;
            }
        }

        const slaDias = prioridadObj.sla;
        const fechaLimiteSla = new Date(Date.now() + slaDias * 24 * 60 * 60 * 1000);
        let reglas = prioridadObj.reglas_cortesia;
        if (typeof reglas === 'string') {
            try { reglas = JSON.parse(reglas); } catch { reglas = []; }
        }
        const descripciones = Array.isArray(reglas)
            ? reglas.map(r => (typeof r === 'string' ? r : (r?.descripcion || '')).trim()).filter(Boolean)
            : [];
        const reglaDesc = descripciones.length > 0 ? descripciones.join(' + ') : '1 reemplazo';

        const updates = {
            'AO': 'En curso',
            'AS': 'En curso',
            'AP': '',
            'AQ': 'Pendiente',
            'AT': 'Pendiente',
            'prioridad': prioridadNum,
            'prioridad_nombre': prioridadObj.nombre,
            'sla_dias': slaDias,
            'fecha_limite_sla': fechaLimiteSla,
            'regla_cortesia_aplicada': reglaDesc
        };

        if (supNombre && (!claim.supervisor || !hasSupervisorValido(claim))) {
            updates['L'] = supNombre;
            updates['AG'] = supEmail;
        }

        await googleSheetsService.updateReclamo(payload.claimId, updates, {
            actor: 'admin_link',
            actorEmail: 'admin@donyeyo.com.ar',
            motivo: `Aprobado con prioridad ${prioridadObj.nombre} (SLA: ${slaDias}d) desde enlace seguro de correo`
        });

        // Aplicar producto de cortesía derivado de la prioridad
        try {
            await googleSheetsService.aplicarProductoCortesia(payload.claimId, reglaDesc);
        } catch (errCortesia) {
            console.error(`[CORTESIA] Error aplicando cortesía al reclamo #${payload.claimId}:`, errCortesia.message);
        }

        // Disparar emails al supervisor y a Calidad/Inocuidad
        const updatedClaim = await googleSheetsService.getReclamoById(payload.claimId);
        emailWorkflowService.sendSupervisorActionEmail(updatedClaim).catch(err => {
            console.error(`[WORKFLOW] Error enviando email a supervisor (${supEmail}):`, err.message);
        });
        emailWorkflowService.sendInocuidadActionEmail(updatedClaim).catch(err => {
            console.error('[WORKFLOW] Error enviando email a inocuidad:', err.message);
        });

        const supervisorDisplay = supNombre ? `${supNombre} (${supEmail || 'Sin email'})` : 'No asignado';

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reclamo Aprobado y En Curso - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; }
                    .card { background: #151C5B; padding: 40px; border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 540px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
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
                    <div class="badge">ESTADO: EN CURSO</div>
                    <h2>¡Reclamo Aprobado con Éxito!</h2>
                    <p>Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong> (${escapeHtml(claim.localidad)}, ${escapeHtml(claim.provincia)}).</p>
                    
                    <div class="info-box">
                        <strong>Detalles de Aprobación Registrados:</strong><br/>
                        • <strong>Nivel de Prioridad:</strong> ${escapeHtml(prioridadObj.nombre)} (Código ${prioridadObj.codigo})<br/>
                        • <strong>SLA Comprometido:</strong> ${slaDias} días corridos<br/>
                        • <strong>Regla de Cortesía:</strong> ${escapeHtml(reglaDesc || 'Sin cortesía')}<br/>
                        • <strong>Supervisor Responsable:</strong> ${escapeHtml(supervisorDisplay)}<br/>
                        • <strong>Notificaciones:</strong> Supervisor e Inocuidad notificados para gestión inmediata.
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
        console.error('Error en admin-confirm-approval webhook:', err);
        res.status(500).send(`Error al procesar la aprobación: ${err.message}`);
    }
});

/**
 * POST /api/public/actions/admin-assign-and-start (Retrocompatibilidad)
 */
router.post('/admin-assign-and-start', async (req, res) => {
    // Redirige al nuevo handler o procesa
    req.url = '/admin-confirm-approval';
    return router.handle(req, res);
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
            logo_url: await require('../services/configuracionService').get('email_logo_url', ''),
            claim: {
                id: claim.id,
                consumidor: `${claim.nombre} ${claim.apellido}`,
                nombre: claim.nombre,
                apellido: claim.apellido,
                domicilio: claim.domicilio,
                localidad: claim.localidad,
                supervisor: claim.supervisor,
                estado_supervisor: claim.estado_supervisor,
                estado_consumidor: claim.estado_consumidor,
                consumidor_puntuacion: claim.consumidor_puntuacion || null,
                consumidor_tipo_problema: claim.consumidor_tipo_problema || '',
                consumidor_comentario: claim.consumidor_comentario || '',
                items: claim.items
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/public/actions/supervisor-quick
/**
 * GET /api/public/actions/supervisor-quick
 * Endpoint al hacer clic en "Pude Resolver la Acción" desde el email.
 * Muestra primero una pantalla de confirmación advirtiendo que se notificará al consumidor.
 */
router.get('/supervisor-quick', async (req, res) => {
    const { token, confirm } = req.query;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'supervisor' || payload.action !== 'resuelto') {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Enlace Inválido - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f1535; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; }
                    .card { background: #18224b; padding: 40px; border-radius: 16px; text-align: center; max-width: 440px; border: 1px solid rgba(239, 68, 68, 0.4); }
                    .icon { font-size: 48px; color: #ef4444; margin-bottom: 16px; }
                    h2 { margin: 0 0 10px 0; color: #ffffff; }
                    p { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; margin: 0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✕</div>
                    <h2>Enlace inválido o expirado</h2>
                    <p>El enlace que utilizaste ya no es válido o ha caducado. Por favor comunicate con la administración.</p>
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
                </div>
            `);
        }

        // Si ya fue resuelto previamente, informar
        if (claim.estado_supervisor === 'Resuelto') {
            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Reclamo ya Resuelto - Don Yeyo</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                        .card { background: #ffffff; padding: 36px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); text-align: center; max-width: 480px; width: 100%; border: 1px solid #e2e8f0; }
                        .icon { font-size: 46px; color: #10b981; margin-bottom: 12px; }
                        h2 { color: #0d2c5c; margin: 0 0 8px 0; }
                        p { color: #64748b; font-size: 0.92rem; line-height: 1.5; margin: 0 0 20px 0; }
                        .btn-close { background: #0d2c5c; color: #ffffff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">✓</div>
                        <h2>Reclamo ya Resuelto</h2>
                        <p>El Reclamo <strong>#${payload.claimId}</strong> ya había sido confirmado previamente como <strong>Resuelto</strong> en el sistema corporativo.</p>
                        <button class="btn-close" onclick="window.close()">Cerrar Ventana</button>
                    </div>
                </body>
                </html>
            `);
        }

        // Si NO confirmó aún, mostrar pantalla de confirmación previa
        if (confirm !== '1') {
            const consumidorNombre = `${claim.nombre || ''} ${claim.apellido || ''}`.trim() || 'el consumidor';
            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Confirmar Resolución - Don Yeyo</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: #090e1a;
                            background-image: radial-gradient(circle at 50% 10%, #152238 0%, #090e1a 100%);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            margin: 0;
                            padding: 24px 16px;
                            color: #f8fafc;
                            box-sizing: border-box;
                        }
                        .card {
                            background: #10192e;
                            border: 1px solid #1e2e50;
                            padding: 32px;
                            border-radius: 16px;
                            box-shadow: 0 20px 40px rgba(0,0,0,0.45);
                            max-width: 520px;
                            width: 100%;
                            box-sizing: border-box;
                        }
                        .header-tag {
                            font-size: 0.75rem;
                            font-weight: 700;
                            color: #f59e0b;
                            letter-spacing: 1px;
                            text-transform: uppercase;
                            margin-bottom: 6px;
                        }
                        h2 {
                            color: #ffffff;
                            margin: 0 0 14px 0;
                            font-size: 1.45rem;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }
                        .info-box {
                            background: #16233f;
                            border: 1px solid #233454;
                            border-radius: 10px;
                            padding: 16px;
                            margin-bottom: 20px;
                            font-size: 0.88rem;
                            line-height: 1.6;
                        }
                        .info-item {
                            display: flex;
                            margin-bottom: 6px;
                        }
                        .info-label {
                            color: #94a3b8;
                            width: 120px;
                            flex-shrink: 0;
                        }
                        .info-val {
                            color: #f8fafc;
                            font-weight: 600;
                        }
                        .warning-box {
                            background: rgba(245, 158, 11, 0.12);
                            border: 1px solid #f59e0b;
                            border-radius: 10px;
                            padding: 16px;
                            margin-bottom: 24px;
                            color: #fef3c7;
                            font-size: 0.86rem;
                            line-height: 1.5;
                        }
                        .warning-title {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            font-weight: 700;
                            color: #fbbf24;
                            margin-bottom: 6px;
                            font-size: 0.92rem;
                        }
                        .actions {
                            display: flex;
                            gap: 12px;
                            justify-content: flex-end;
                            flex-wrap: wrap;
                        }
                        .btn-cancel {
                            background: transparent;
                            border: 1px solid #334155;
                            color: #94a3b8;
                            padding: 12px 20px;
                            border-radius: 8px;
                            font-size: 0.9rem;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        .btn-cancel:hover {
                            background: #1e293b;
                            color: #f8fafc;
                        }
                        .btn-confirm {
                            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                            border: none;
                            color: #ffffff;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-size: 0.92rem;
                            font-weight: 700;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
                            transition: all 0.2s;
                            text-decoration: none;
                        }
                        .btn-confirm:hover {
                            transform: translateY(-1px);
                            box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
                        }
                        .cancel-notice {
                            display: none;
                            margin-top: 16px;
                            padding: 12px;
                            background: #1e293b;
                            border-radius: 8px;
                            text-align: center;
                            font-size: 0.84rem;
                            color: #94a3b8;
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="header-tag">Don Yeyo S.A. &bull; Portal de Supervisión</div>
                        <h2>Confirmar Entrega de Solución</h2>
                        
                        <div class="info-box">
                            <div class="info-item">
                                <span class="info-label">Reclamo:</span>
                                <span class="info-val">#${escapeHtml(payload.claimId)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Consumidor:</span>
                                <span class="info-val">${escapeHtml(consumidorNombre)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Localidad:</span>
                                <span class="info-val">${escapeHtml(claim.localidad || 'No indicada')}, ${escapeHtml(claim.provincia || '')}</span>
                            </div>
                            <div class="info-item" style="margin-bottom:0;">
                                <span class="info-label">Supervisor:</span>
                                <span class="info-val">${escapeHtml(claim.supervisor || 'Comercial')}</span>
                            </div>
                        </div>

                        <div class="warning-box">
                            <div class="warning-title">
                                <span>⚠️</span>
                                <span>Aviso Importante</span>
                            </div>
                            Al presionar <strong>"Sí, Confirmar y Notificar"</strong>, el estado del reclamo se registrará como <strong>Resuelto</strong> en el sistema y se enviará automáticamente un correo electrónico a <strong>${escapeHtml(consumidorNombre)}</strong> para consultar su conformidad con la entrega realizada.
                        </div>

                        <div class="actions">
                            <button type="button" class="btn-cancel" onclick="handleCancel()">
                                Cancelar / Cerrar
                            </button>
                            <a href="${API_BASE_URL}/api/public/actions/supervisor-quick?token=${encodeURIComponent(token)}&confirm=1" class="btn-confirm">
                                ✓ Sí, Confirmar y Notificar
                            </a>
                        </div>

                        <div id="cancel-notice" class="cancel-notice">
                            Operación cancelada. No se modificó el estado del reclamo. Ya podés cerrar esta pestaña.
                        </div>
                    </div>

                    <script>
                        function handleCancel() {
                            document.getElementById('cancel-notice').style.display = 'block';
                            try { window.close(); } catch(e) {}
                        }
                    </script>
                </body>
                </html>
            `);
        }

        // Si YA CONFIRMÓ (confirm === '1') -> Proceder a actualizar
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AQ': 'Resuelto',
            'AS': 'Resuelto sin confirmar'
        }, {
            actor: 'supervisor_link',
            actorEmail: claim.supervisor_email || '',
            motivo: 'Supervisor confirmó resolución/entrega de producto desde enlace con confirmación previa'
        });

        // Evaluar cierre automatico del reclamo si se cumplieron todas las condiciones
        reclamosDatabaseService.checkAndFinalizeAdminState(payload.claimId).catch(console.error);

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Acción Registrada - Don Yeyo</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: #090e1a;
                        background-image: radial-gradient(circle at 50% 10%, #152238 0%, #090e1a 100%);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 24px 16px;
                        color: #f8fafc;
                        box-sizing: border-box;
                    }
                    .card {
                        background: #10192e;
                        border: 1px solid rgba(16, 185, 129, 0.4);
                        padding: 40px 32px;
                        border-radius: 16px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.45);
                        text-align: center;
                        max-width: 480px;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .icon {
                        width: 64px;
                        height: 64px;
                        border-radius: 50%;
                        background: rgba(16, 185, 129, 0.15);
                        color: #10b981;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 32px;
                        margin: 0 auto 16px auto;
                    }
                    h2 { color: #ffffff; margin: 0 0 10px 0; font-size: 1.4rem; }
                    p { color: #cbd5e1; font-size: 0.92rem; line-height: 1.5; margin: 0 0 10px 0; }
                    .subtext { color: #94a3b8; font-size: 0.82rem; margin: 0 0 24px 0; }
                    .btn-close {
                        background: #1e293b;
                        color: #ffffff;
                        border: 1px solid #334155;
                        padding: 10px 24px;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 0.88rem;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .btn-close:hover {
                        background: #334155;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <h2>¡Acción Registrada con Éxito!</h2>
                    <p>Muchas gracias por gestionar la entrega del Reclamo <strong>#${escapeHtml(payload.claimId)}</strong>.</p>
                    <p class="subtext">El estado se actualizó a <strong>Resuelto</strong> en el sistema corporativo y se enviará la encuesta de conformidad al consumidor.</p>
                    <button class="btn-close" onclick="window.close()">Cerrar Ventana</button>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error en supervisor-quick:', err);
        res.status(500).send(`Error al registrar la acción: ${err.message}`);
    }
});

/**
 * POST /api/public/actions/supervisor-imposibilidad
 * Envío del formulario de motivo de imposibilidad completado por el supervisor
 */
router.post('/supervisor-imposibilidad', async (req, res) => {
    const { token, motivo, tipo_imposibilidad } = req.body;
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

        const tipoFinal = tipo_imposibilidad || 'Imposibilidad de entrega en domicilio';

        // Persistir estado y motivos en MySQL y Sheets:
        // Regla: si el supervisor establece imposibilidad, el consumidor pasa a Cerrado e Inocuidad a Sin acciones
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AQ': 'Imposibilidad',
            'AR': String(motivo).trim(),
            'tipo_imposibilidad': tipoFinal,
            'AS': 'Cerrado', // consumidor pasa a Cerrado
            'AT': 'Sin acciones' // inocuidad pasa a Sin acciones
        }, {
            actor: 'supervisor_link',
            actorEmail: claim.supervisor_email || '',
            motivo: `Imposibilidad: ${tipoFinal} - ${String(motivo).trim()}`
        });

        // Notificar por email a los administradores
        emailWorkflowService.sendSupervisorImpossibilityAlertToAdmins(claim, `${tipoFinal} - ${motivo}`).catch(err => {
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
 * POST /api/public/actions/consumidor-encuesta
 * Recibe la encuesta del consumidor (5 estrellas + comentario si fue Resuelto,
 * o tipo de problema + comentario si fue No Resuelto)
 */
router.post('/consumidor-encuesta', async (req, res) => {
    const { token, resultado, puntuacion, tipo_problema, comentario } = req.body;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'consumidor') {
        return res.status(401).json({ success: false, error: 'El enlace de la encuesta es inválido o ha expirado.' });
    }

    const modo = resultado || (payload.action === 'no_resuelto' || payload.action === 'disconforme' ? 'no_resuelto' : 'resuelto');

    let estadoFinal = 'Resuelto conforme';
    let puntuacionFinal = null;
    let tipoProblemaFinal = '';
    const comentarioFinal = comentario ? String(comentario).trim() : '';

    if (modo === 'resuelto') {
        const numStars = parseInt(puntuacion, 10);
        if (isNaN(numStars) || numStars < 1 || numStars > 5) {
            return res.status(400).json({ success: false, error: 'Por favor seleccioná una puntuación de 1 a 5 estrellas.' });
        }
        puntuacionFinal = numStars;
        estadoFinal = 'Resuelto conforme';
    } else if (modo === 'no_resuelto') {
        const tiposValidos = ['No recibí reposición', 'No estoy satisfecho con lo recibido'];
        if (!tipo_problema || !tiposValidos.includes(tipo_problema)) {
            return res.status(400).json({
                success: false,
                error: 'Por favor seleccioná el tipo de problema (No recibí reposición / No estoy satisfecho con lo recibido).'
            });
        }
        tipoProblemaFinal = tipo_problema;
        if (tipo_problema === 'No recibí reposición') {
            estadoFinal = 'No resuelto';
        } else {
            estadoFinal = 'Resuelto disconforme';
        }
    } else {
        return res.status(400).json({ success: false, error: 'Opción de respuesta no válida.' });
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: 'El reclamo no fue encontrado.' });
        }

        const motivoAuditoria = modo === 'resuelto'
            ? `Encuesta consumidor: Resuelto (${puntuacionFinal}/5 estrellas)${comentarioFinal ? ` - "${comentarioFinal}"` : ''}`
            : `Encuesta consumidor: No Resuelto (${tipoProblemaFinal})${comentarioFinal ? ` - "${comentarioFinal}"` : ''}`;

        // Persistir estado_consumidor en Google Sheets y datos de encuesta en MySQL
        await googleSheetsService.updateReclamo(payload.claimId, {
            'AS': estadoFinal,
            'consumidor_puntuacion': puntuacionFinal,
            'consumidor_tipo_problema': tipoProblemaFinal,
            'consumidor_comentario': comentarioFinal
        }, {
            actor: 'consumidor_link',
            actorEmail: claim.email || '',
            motivo: motivoAuditoria,
            metadata: {
                modo,
                estado_final: estadoFinal,
                puntuacion: puntuacionFinal,
                tipo_problema: tipoProblemaFinal,
                comentario: comentarioFinal
            }
        });

        // Detección de conflicto / posible fraude:
        // Si el supervisor informó "Resuelto" y el consumidor responde "No recibí reposición" -> estadoFinal === 'No resuelto'
        if (estadoFinal === 'No resuelto' && claim.estado_supervisor === 'Resuelto') {
            const motivoConflicto = `Discrepancia crítica: El supervisor ${claim.supervisor || ''} declaró haber entregado la reposición ("Resuelto"), pero el consumidor informó "${tipoProblemaFinal}"${comentarioFinal ? ` (${comentarioFinal})` : ''}. Posible engaño o fraude.`;
            await reclamosDatabaseService.marcarConflicto(payload.claimId, motivoConflicto);
            emailWorkflowService.sendFraudAlertToAdmins(claim, motivoConflicto).catch(err => {
                console.error('[FRAUDE/CONFLICTO] Error enviando alerta a administradores:', err.message);
            });
        }

        // Notificar a los administradores con los detalles de la encuesta
        emailWorkflowService.sendConsumerFeedbackAlertToAdmins(claim, estadoFinal, {
            puntuacion: puntuacionFinal,
            tipo_problema: tipoProblemaFinal,
            comentario: comentarioFinal
        }).catch(err => {
            console.error('Error notificando respuesta a admins:', err.message);
        });

        // Evaluar cierre automático del reclamo si se cumplieron todas las condiciones
        reclamosDatabaseService.checkAndFinalizeAdminState(payload.claimId).catch(console.error);

        res.json({
            success: true,
            estado_consumidor: estadoFinal,
            puntuacion: puntuacionFinal,
            tipo_problema: tipoProblemaFinal,
            comentario: comentarioFinal,
            message: '¡Muchas gracias! Tu respuesta ha sido registrada correctamente.'
        });
    } catch (err) {
        console.error('Error en consumidor-encuesta:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/public/actions/consumidor-response
 * Redirige enlaces de correos de seguimiento hacia la página web interactiva de encuesta del consumidor
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

    return res.redirect(`${APP_BASE_URL}/encuesta-consumidor?token=${encodeURIComponent(token)}`);
});

module.exports = router;
