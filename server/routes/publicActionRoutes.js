const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const reclamosDatabaseService = require('../services/reclamosDatabaseService');
const emailWorkflowService = require('../services/emailWorkflowService');
const supervisorLookupService = require('../services/supervisorLookupService');
const prioridadesService = require('../services/prioridadesService');
const productosService = require('../services/productosService');
const { APP_BASE_URL, API_BASE_URL } = require('../config/urls');

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

function formatFechaHora(dateVal) {
    if (!dateVal) return null;
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires'
        }) + ' hs';
    } catch {
        return null;
    }
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

const TIPOS_DESAPROBACION = [
    'No se constata defecto atribuible a elaboración o envasado',
    'Producto con fecha de vencimiento expirada al momento de la compra',
    'Defecto originado por inadecuada conservación en punto de venta',
    'Falta de evidencia probatoria o datos insuficientes de lote',
    'Reclamo duplicado o previamente compensado',
    'Otro motivo administrativo fundado'
];

/**
 * GET /api/public/actions/admin-quick
 * Endpoint webhook seguro para administradores desde el email de nuevo reclamo.
 * Soporta tanto Aprobar el reclamo (seleccionando urgencia y supervisor) como
 * Desaprobarlo/Rechazarlo (seleccionando motivo formal para el consumidor y observación interna).
 */
router.get('/admin-quick', async (req, res) => {
    const { token, mode } = req.query;
    const payload = emailWorkflowService.verifyToken(token);

    if (!payload || payload.actor !== 'admin' || !['en_curso', 'desaprobar'].includes(payload.action) || !payload.claimId) {
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

        const estadoAdminActual = claim.estado_admin || 'Pendiente';
        const yaGestionadoAdmin = estadoAdminActual !== 'Pendiente';
        if (yaGestionadoAdmin) {
            const configuracionService = require('../services/configuracionService');
            const mensajeReapertura = await configuracionService.get(
                'mensaje_reapertura_personal',
                'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.'
            );
            const fechaAdminStr = formatFechaHora(claim.fecha_estado_admin);
            const supervisorInfo = claim.supervisor ? `${claim.supervisor} (${claim.supervisor_email || 'Sin email registrado'})` : 'No asignado';
            const isDesaprobado = estadoAdminActual === 'Desaprobado';
            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Reclamo Ya Gestionado - Don Yeyo</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; }
                        .card { background: #151C5B; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                        .icon { width: 64px; height: 64px; line-height: 64px; background: rgba(59, 130, 246, 0.15); border: 2px solid #3b82f6; border-radius: 50%; font-size: 30px; color: #60a5fa; margin: 0 auto 20px; }
                        h2 { margin: 0 0 12px 0; color: #ffffff; font-size: 1.45rem; }
                        .badge { display: inline-block; background: ${isDesaprobado ? '#dc2626' : '#2563eb'}; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; margin-bottom: 16px; }
                        p { color: #cbd5e1; line-height: 1.6; margin: 8px 0; font-size: 0.95rem; }
                        .info-box { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; margin: 20px 0; text-align: left; font-size: 0.9rem; border-left: 4px solid ${isDesaprobado ? '#ef4444' : '#10b981'}; line-height: 1.6; }
                        .reopen-box { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 14px; margin: 16px 0; text-align: left; font-size: 0.85rem; color: #fbbf24; line-height: 1.5; }
                        .btn { display: inline-block; background: #E5353B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; margin-top: 12px; transition: background 0.2s; }
                        .btn:hover { background: #b91c1c; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">ℹ️</div>
                        <div class="badge">ESTADO REGISTRADO: ${escapeHtml(estadoAdminActual.toUpperCase())}</div>
                        <h2>El Reclamo Ya Fue Gestionado</h2>
                        <p>Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong>.</p>
                        <div class="info-box">
                            • <strong>Estado actual:</strong> ${escapeHtml(estadoAdminActual)}<br/>
                            ${fechaAdminStr ? `• <strong>Fecha y hora de registro:</strong> ${escapeHtml(fechaAdminStr)}<br/>` : ''}
                            ${isDesaprobado ? `
                                • <strong>Motivo Consumidor:</strong> ${escapeHtml(claim.tipo_desaprobacion || 'No especificado')}<br/>
                                • <strong>Obs. Interna:</strong> ${escapeHtml(claim.admin_motivo_desaprobado || 'Sin detalle')}
                            ` : `
                                • <strong>Urgencia Asignada:</strong> ${escapeHtml(claim.prioridad_nombre || 'No especificada')} (SLA: ${claim.sla_dias || 'N/A'} días)<br/>
                                • <strong>Supervisor:</strong> ${escapeHtml(supervisorInfo)}<br/>
                                • <strong>Regla Cortesía:</strong> ${escapeHtml(claim.regla_cortesia_aplicada || 'Estándar')}
                            `}
                        </div>
                        <div class="reopen-box">
                            <strong>📌 ¿Necesitás modificar la decisión o reabrir el caso?</strong><br/>
                            ${escapeHtml(mensajeReapertura)}
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
        const initialReject = mode === 'desaprobar' || payload.action === 'desaprobar';

        return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Evaluar Reclamo #${claim.id} - Don Yeyo</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #f8fafc; padding: 20px; box-sizing: border-box; }
                    .card { background: #151C5B; padding: 36px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.15); text-align: left; max-width: 580px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
                    .mode-tabs { display: flex; gap: 8px; margin-bottom: 20px; background: rgba(0,0,0,0.25); padding: 5px; border-radius: 10px; }
                    .mode-tab { flex: 1; text-align: center; padding: 10px 12px; border-radius: 7px; font-weight: 700; font-size: 0.88rem; cursor: pointer; border: none; background: transparent; color: #94a3b8; transition: all 0.2s; }
                    .mode-tab.active-approve { background: #10b981; color: #ffffff; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35); }
                    .mode-tab.active-reject { background: #dc2626; color: #ffffff; box-shadow: 0 2px 8px rgba(220, 38, 38, 0.35); }
                    h2 { margin: 0 0 10px 0; color: #ffffff; font-size: 1.4rem; }
                    p.intro { color: #cbd5e1; line-height: 1.5; margin: 0 0 18px 0; font-size: 0.9rem; }
                    .claim-summary { background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; font-size: 0.88rem; border-left: 4px solid #3b82f6; line-height: 1.6; }
                    .claim-summary strong { color: #f8fafc; }
                    .form-group { margin-bottom: 18px; }
                    label { display: block; font-weight: 600; margin-bottom: 6px; color: #e2e8f0; font-size: 0.92rem; }
                    .required-star { color: #ef4444; }
                    select, textarea { width: 100%; padding: 12px 14px; background: #0b0f24; border: 1px solid #3b82f6; border-radius: 8px; color: #ffffff; font-size: 0.92rem; outline: none; transition: border-color 0.2s; box-sizing: border-box; font-family: inherit; }
                    select:focus, textarea:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3); }
                    select option { background: #0b0f24; color: #ffffff; }
                    .help-text { font-size: 0.78rem; color: #94a3b8; margin-top: 4px; }
                    .supervisor-box { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 0.88rem; color: #6ee7b7; }
                    .btn-submit { width: 100%; background: #10b981; color: #ffffff; border: none; padding: 14px 20px; border-radius: 8px; font-weight: bold; font-size: 0.98rem; cursor: pointer; transition: background 0.2s, transform 0.1s; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
                    .btn-submit:hover { background: #059669; }
                    .btn-reject { width: 100%; background: #E5353B; color: #ffffff; border: none; padding: 14px 20px; border-radius: 8px; font-weight: bold; font-size: 0.98rem; cursor: pointer; transition: background 0.2s, transform 0.1s; box-shadow: 0 4px 14px rgba(229, 53, 59, 0.4); display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
                    .btn-reject:hover { background: #b91c1c; }
                    .footer-link { text-align: center; margin-top: 18px; font-size: 0.84rem; }
                    .footer-link a { color: #93c5fd; text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="mode-tabs">
                        <button type="button" id="tabApprove" class="mode-tab ${!initialReject ? 'active-approve' : ''}" onclick="switchMode('approve')">
                            ✓ Aprobar Reclamo
                        </button>
                        <button type="button" id="tabReject" class="mode-tab ${initialReject ? 'active-reject' : ''}" onclick="switchMode('reject')">
                            ✕ Rechazar / Desaprobar
                        </button>
                    </div>

                    <div class="claim-summary">
                        <div><strong>Reclamo:</strong> #${escapeHtml(claim.id)}</div>
                        <div><strong>Consumidor:</strong> ${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</div>
                        <div><strong>Ubicación:</strong> ${escapeHtml(claim.localidad)}, ${escapeHtml(claim.provincia)}</div>
                        <div><strong>Producto(s):</strong> ${escapeHtml(productosResumen)}</div>
                        <div><strong>Defecto reportado:</strong> ${escapeHtml(claim.defecto || 'No especificado')}</div>
                    </div>

                    <!-- SECCIÓN APROBAR -->
                    <div id="sectionApprove" style="display: ${!initialReject ? 'block' : 'none'};">
                        <h2>Aprobar Reclamo #${claim.id}</h2>
                        <p class="intro">
                            Para poner el reclamo <strong>En curso</strong> y habilitar las acciones de compensación e investigación,
                            <strong>es obligatorio definir el nivel de urgencia según la gravedad del caso</strong>.
                        </p>

                        <form method="POST" action="/api/public/actions/admin-confirm-approval">
                            <input type="hidden" name="token" value="${escapeHtml(token)}" />

                            <div class="form-group">
                                <label for="prioridadSelect">Nivel de Urgencia según gravedad <span class="required-star">*</span>:</label>
                                <select id="prioridadSelect" name="prioridad" required>
                                    <option value="" disabled selected>-- Seleccionar nivel de urgencia (obligatorio) --</option>
                                    ${prioridades.map(p => `
                                        <option value="${p.codigo}">
                                            ${escapeHtml(p.nombre)} (SLA ${p.sla} días) — ${escapeHtml(p.descripcion)}
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="help-text">La urgencia define el SLA de respuesta y la regla de cortesía aplicable.</div>
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
                                ✓ Confirmar Urgencia y Aprobar Reclamo
                            </button>
                        </form>
                    </div>

                    <!-- SECCIÓN RECHAZAR / DESAPROBAR -->
                    <div id="sectionReject" style="display: ${initialReject ? 'block' : 'none'};">
                        <h2>Desaprobar Reclamo #${claim.id}</h2>
                        <p class="intro">
                            Al desaprobar el reclamo, su estado para el consumidor pasará a <strong>Cerrado</strong> y se cancelarán las derivaciones a Supervisión e Inocuidad.
                        </p>

                        <form method="POST" action="/api/public/actions/admin-confirm-rejection">
                            <input type="hidden" name="token" value="${escapeHtml(token)}" />

                            <div class="form-group">
                                <label for="tipoDesaprobacionSelect">Motivo Formal para el Consumidor <span class="required-star">*</span>:</label>
                                <select id="tipoDesaprobacionSelect" name="tipo_desaprobacion" required>
                                    ${TIPOS_DESAPROBACION.map(t => `
                                        <option value="${escapeHtml(t)}">${escapeHtml(t)}</option>
                                    `).join('')}
                                </select>
                                <div class="help-text">Este motivo podrá ser visualizado por el consumidor al consultar el estado de su reclamo.</div>
                            </div>

                            <div class="form-group">
                                <label for="motivoDesaprobadoInput">🔒 Observación Interna Obligatoria <span class="required-star">*</span>:</label>
                                <textarea id="motivoDesaprobadoInput" name="motivo_desaprobado" rows="3" placeholder="Detallá el fundamento interno del rechazo (confidencial para auditoría interna)..." required></textarea>
                                <div class="help-text">Visible únicamente por el personal interno de Don Yeyo S.A.</div>
                            </div>

                            <button type="submit" class="btn-reject">
                                ✕ Confirmar Rechazo / Desaprobación
                            </button>
                        </form>
                    </div>

                    <div class="footer-link">
                        <a href="${APP_BASE_URL}/reclamos/${claim.id}">Abrir en el Gestor Web para consultar detalles completos</a>
                    </div>
                </div>

                <script>
                    function switchMode(m) {
                        var secApp = document.getElementById('sectionApprove');
                        var secRej = document.getElementById('sectionReject');
                        var tabApp = document.getElementById('tabApprove');
                        var tabRej = document.getElementById('tabReject');
                        if (m === 'reject') {
                            secApp.style.display = 'none';
                            secRej.style.display = 'block';
                            tabApp.className = 'mode-tab';
                            tabRej.className = 'mode-tab active-reject';
                        } else {
                            secApp.style.display = 'block';
                            secRej.style.display = 'none';
                            tabApp.className = 'mode-tab active-approve';
                            tabRej.className = 'mode-tab';
                        }
                    }
                </script>
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

    if (!payload || payload.actor !== 'admin' || !['en_curso', 'desaprobar'].includes(payload.action) || !payload.claimId) {
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
                <h2>Error: Urgencia Obligatoria</h2>
                <p>El nivel de urgencia es mandatorio para aprobar el reclamo. Por favor volvé atrás y seleccioná uno.</p>
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

        if (claim.estado_admin && claim.estado_admin !== 'Pendiente') {
            return res.redirect(`/api/public/actions/admin-quick?token=${encodeURIComponent(token)}`);
        }

        const prioridadObj = await prioridadesService.getPrioridadByCodigo(prioridadNum);
        if (!prioridadObj) {
            return res.status(400).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f1535; color:#fff; min-height:100vh;">
                    <h2>Error: Urgencia Inválida</h2>
                    <p>El código de urgencia (${prioridadNum}) no existe.</p>
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
            motivo: `Aprobado con urgencia ${prioridadObj.nombre} (SLA: ${slaDias}d) desde enlace seguro de correo`
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
                        • <strong>Nivel de Urgencia:</strong> ${escapeHtml(prioridadObj.nombre)} (Código ${prioridadObj.codigo})<br/>
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
 * POST /api/public/actions/admin-confirm-rejection
 * Rechaza / desaprueba el reclamo desde el enlace del correo del administrador
 */
router.post('/admin-confirm-rejection', async (req, res) => {
    const { token, tipo_desaprobacion, motivo_desaprobado } = req.body;
    if (!token) return res.status(400).send('Falta token de autorización.');

    const payload = emailWorkflowService.verifyToken(token);
    if (!payload || payload.actor !== 'admin') {
        return res.status(401).send('Token inválido o expirado.');
    }

    const motivoInterno = (motivo_desaprobado || '').trim();
    if (!motivoInterno) {
        return res.status(400).send('La observación interna obligatoria es requerida para desaprobar el reclamo.');
    }

    try {
        const claim = await googleSheetsService.getReclamoById(payload.claimId);
        if (!claim) return res.status(404).send('Reclamo no encontrado.');

        // Protección anti-replay: si el caso ya fue gestionado por Admin
        if (claim.estado_admin && claim.estado_admin !== 'Pendiente') {
            return res.status(409).send('Este reclamo ya fue procesado anteriormente (Estado actual: ' + escapeHtml(claim.estado_admin) + ').');
        }

        const tipoFormal = (tipo_desaprobacion && TIPOS_DESAPROBACION.includes(tipo_desaprobacion))
            ? tipo_desaprobacion
            : TIPOS_DESAPROBACION[0];

        await googleSheetsService.updateReclamo(payload.claimId, {
            'AO': 'Desaprobado',
            'AP': motivoInterno,
            'tipo_desaprobacion': tipoFormal,
            'AQ': 'Sin acciones',
            'AT': 'Sin acciones',
            'AS': 'Cerrado'
        }, {
            actor: 'admin_link',
            actorEmail: 'admin@donyeyo.com.ar',
            motivo: `[${tipoFormal}] Desaprobado desde enlace de email Admin: ${motivoInterno}`
        });

        let headerLogoHtml = '';
        try {
            const configuracionService = require('../services/configuracionService');
            const logoUrl = (await configuracionService.getParametro('logo_header_url', '')).trim();
            if (logoUrl && logoUrl.startsWith('http')) {
                headerLogoHtml = `<div style="margin-bottom: 16px;"><img src="${escapeHtml(logoUrl)}" alt="Don Yeyo" style="max-height: 52px; max-width: 200px; height: auto; width: auto;" /></div>`;
            }
        } catch (_) {}

        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reclamo Desaprobado — Don Yeyo</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                        background: linear-gradient(135deg, #1E1B18 0%, #2C2623 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .card {
                        background: #FFFFFF;
                        max-width: 560px;
                        width: 100%;
                        padding: 36px 32px;
                        border-radius: 16px;
                        box-shadow: 0 20px 50px rgba(0,0,0,0.4);
                        text-align: center;
                        border-top: 6px solid #dc2626;
                    }
                    .icon {
                        width: 68px;
                        height: 68px;
                        border-radius: 50%;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 32px;
                        margin-bottom: 18px;
                        background: #fef2f2;
                        color: #dc2626;
                    }
                    h2 { color: #1E1B18; font-size: 23px; margin-bottom: 10px; font-weight: 800; }
                    p { color: #57534E; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
                    .badge {
                        display: inline-block;
                        padding: 6px 14px;
                        border-radius: 999px;
                        font-size: 12px;
                        font-weight: 700;
                        background: #fef2f2;
                        color: #991b1b;
                        margin-bottom: 16px;
                    }
                    .info-box {
                        background: #fef2f2;
                        border: 1px solid #fecaca;
                        padding: 16px;
                        border-radius: 10px;
                        text-align: left;
                        font-size: 13px;
                        color: #7f1d1d;
                        margin-bottom: 22px;
                        line-height: 1.7;
                    }
                    .btn {
                        display: inline-block;
                        background: #1E1B18;
                        color: #FFFFFF;
                        text-decoration: none;
                        padding: 13px 26px;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 14px;
                    }
                    .footer {
                        margin-top: 26px;
                        padding-top: 16px;
                        border-top: 1px solid #E7E5E4;
                        font-size: 12px;
                        color: #A8A29E;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    ${headerLogoHtml}
                    <div class="icon">✕</div>
                    <div class="badge">ESTADO: DESAPROBADO</div>
                    <h2>Reclamo Desaprobado y Cerrado</h2>
                    <p>El Reclamo <strong>#${payload.claimId}</strong> correspondiente a <strong>${escapeHtml(claim.nombre)} ${escapeHtml(claim.apellido)}</strong> ha sido marcado como desaprobado.</p>
                    
                    <div class="info-box">
                        <strong>Detalles del Rechazo Registrados:</strong><br/>
                        • <strong>Motivo Formal (visible al consumidor):</strong> ${escapeHtml(tipoFormal)}<br/>
                        • <strong>Observación Interna (auditoría):</strong> ${escapeHtml(motivoInterno)}<br/>
                        • <strong>Estado Consumidor:</strong> Cerrado<br/>
                        • <strong>Ramas Operativas (Supervisor / Inocuidad):</strong> Sin acciones
                    </div>

                    <a href="${APP_BASE_URL}/reclamos/${payload.claimId}" class="btn">Ver en el Gestor Web</a>

                    <div class="footer">
                        Don Yeyo S.A. | Sistema de Gestión Automatizado de Reclamos
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error en admin-confirm-rejection webhook:', err);
        res.status(500).send(`Error al procesar el rechazo: ${err.message}`);
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
 * Endpoint para generar los enlaces firmados seguros (Aprobar y Rechazar) para un reclamo dado
 */
router.get('/generate-admin-link', (req, res) => {
    const { claimId } = req.query;
    if (!claimId) {
        return res.status(400).json({ success: false, error: 'claimId es requerido.' });
    }
    const token = emailWorkflowService.generateAdminActionToken(claimId);
    const url = emailWorkflowService.generateAdminActionUrl(claimId);
    const token_rechazar = emailWorkflowService.generateAdminRejectToken(claimId);
    const url_rechazar = emailWorkflowService.generateAdminRejectUrl(claimId);
    res.json({
        success: true,
        claimId,
        token,
        url,
        url_aprobar: url,
        token_rechazar,
        url_rechazar
    });
});

/**
 * POST /api/public/actions/notify-new-claim
 * Envía el primer correo al Administrador con botones de Aprobar y Rechazar para un reclamo recién ingresado
 */
router.post('/notify-new-claim', async (req, res) => {
    const { claimId } = req.body;
    if (!claimId) {
        return res.status(400).json({ success: false, error: 'claimId es requerido.' });
    }
    try {
        const claim = await googleSheetsService.getReclamoById(claimId);
        if (!claim) {
            return res.status(404).json({ success: false, error: `Reclamo #${claimId} no encontrado.` });
        }
        await emailWorkflowService.sendAdminNewClaimEmail(claim, {
            actor: 'sistema_web',
            motivo: `Notificación de nuevo reclamo #${claimId} a Administradores (con botones Aprobar y Rechazar)`
        });
        res.json({
            success: true,
            claimId,
            url_aprobar: emailWorkflowService.generateAdminActionUrl(claimId),
            url_rechazar: emailWorkflowService.generateAdminRejectUrl(claimId)
        });
    } catch (err) {
        console.error('[PUBLIC API] Error en notify-new-claim:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
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

        const yaRespondioConsumidor = (
            claim.estado_consumidor &&
            claim.estado_consumidor !== 'Pendiente' &&
            claim.estado_consumidor !== 'En curso' &&
            claim.estado_consumidor !== 'Resuelto sin confirmar'
        ) || Boolean(claim.consumidor_puntuacion || claim.consumidor_tipo_problema);

        const yaAccionoSupervisor = (
            claim.estado_supervisor &&
            claim.estado_supervisor !== 'Pendiente'
        );

        res.json({
            success: true,
            claimId: payload.claimId,
            actor: payload.actor,
            action: payload.action,
            ya_respondio_consumidor: yaRespondioConsumidor,
            ya_acciono_supervisor: yaAccionoSupervisor,
            mensaje_reapertura: await require('../services/configuracionService').get('mensaje_reapertura_personal', 'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.'),
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
                fecha_estado_supervisor: claim.fecha_estado_supervisor || null,
                estado_consumidor: claim.estado_consumidor,
                fecha_estado_consumidor: claim.fecha_estado_consumidor || null,
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

        // Si el supervisor ya accionó previamente sobre el reclamo (ej: Resuelto, Imposibilidad, etc.), no permitir continuar
        const estadoSupervisorActual = claim.estado_supervisor;
        const yaAcciono = estadoSupervisorActual && estadoSupervisorActual !== 'Pendiente';

        const configuracionService = require('../services/configuracionService');
        const logoUrl = await configuracionService.get('email_logo_url', '');

        if (yaAcciono) {
            const mensajeReapertura = await configuracionService.get(
                'mensaje_reapertura_personal',
                'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.'
            );
            const fechaStr = formatFechaHora(claim.fecha_estado_supervisor);

            return res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Acción Ya Registrada - Don Yeyo</title>
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
                            padding: 36px 30px;
                            border-radius: 16px;
                            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                            text-align: center;
                            max-width: 520px;
                            width: 100%;
                            box-sizing: border-box;
                        }
                        .badge {
                            display: inline-block;
                            background: rgba(59, 130, 246, 0.15);
                            color: #60a5fa;
                            border: 1px solid rgba(59, 130, 246, 0.3);
                            padding: 4px 12px;
                            border-radius: 20px;
                            font-size: 0.78rem;
                            font-weight: 700;
                            letter-spacing: 0.5px;
                            text-transform: uppercase;
                            margin-bottom: 16px;
                        }
                        .icon {
                            width: 60px;
                            height: 60px;
                            border-radius: 50%;
                            background: rgba(59, 130, 246, 0.12);
                            color: #60a5fa;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 30px;
                            margin: 0 auto 16px auto;
                        }
                        h2 { color: #ffffff; margin: 0 0 10px 0; font-size: 1.35rem; }
                        p { color: #cbd5e1; font-size: 0.92rem; line-height: 1.55; margin: 0 0 16px 0; }
                        .info-box {
                            background: rgba(255, 255, 255, 0.04);
                            border: 1px solid rgba(255, 255, 255, 0.08);
                            border-radius: 10px;
                            padding: 14px 16px;
                            margin: 18px 0;
                            text-align: left;
                            font-size: 0.86rem;
                            line-height: 1.6;
                        }
                        .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
                        .info-label { color: #94a3b8; }
                        .info-val { color: #f8fafc; font-weight: 600; }
                        .reopen-box {
                            background: rgba(245, 158, 11, 0.1);
                            border: 1px solid rgba(245, 158, 11, 0.3);
                            border-radius: 10px;
                            padding: 14px;
                            margin: 20px 0;
                            text-align: left;
                            font-size: 0.85rem;
                            color: #fbbf24;
                            line-height: 1.5;
                        }
                        .reopen-title { font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
                        .btn-close {
                            background: #1e293b;
                            color: #f8fafc;
                            border: 1px solid #334155;
                            padding: 10px 24px;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            font-size: 0.88rem;
                            transition: all 0.2s;
                        }
                        .btn-close:hover { background: #334155; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Don Yeyo" style="max-height:44px; margin-bottom:14px;" />` : ''}
                        <div class="icon">ℹ️</div>
                        <div class="badge">Acción Registrada Previamente</div>
                        <h2>Reclamo #${escapeHtml(payload.claimId)} ya gestionado</h2>
                        <p>Ya se cuenta con una acción registrada para este reclamo en el circuito de supervisión comercial.</p>
                        
                        <div class="info-box">
                            <div class="info-row">
                                <span class="info-label">Estado actual registrado:</span>
                                <span class="info-val">${escapeHtml(estadoSupervisorActual)}</span>
                            </div>
                            ${fechaStr ? `
                            <div class="info-row" style="margin-bottom:0;">
                                <span class="info-label">Fecha y hora de registro:</span>
                                <span class="info-val">${escapeHtml(fechaStr)}</span>
                            </div>
                            ` : ''}
                            ${claim.supervisor_motivo_imposibilidad ? `
                            <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08); font-size:0.82rem; color:#cbd5e1;">
                                <strong>Motivo informado:</strong> ${escapeHtml(claim.supervisor_motivo_imposibilidad)}
                            </div>
                            ` : ''}
                        </div>

                        <div class="reopen-box">
                            <div class="reopen-title">
                                <span>📌</span>
                                <span>¿Necesitás modificar tu decisión o reabrir el caso?</span>
                            </div>
                            <div>${escapeHtml(mensajeReapertura)}</div>
                        </div>

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
                        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Don Yeyo" style="max-height:44px; margin-bottom:14px;" />` : ''}
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
                            <a href="?token=${encodeURIComponent(token)}&confirm=1" class="btn-confirm">
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
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Don Yeyo" style="max-height:44px; margin-bottom:14px;" />` : ''}
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

        // Si el supervisor ya accionó previamente, bloquear y devolver mensaje orientativo configurable
        const estadoSupervisorActual = claim.estado_supervisor;
        if (estadoSupervisorActual && estadoSupervisorActual !== 'Pendiente') {
            const configuracionService = require('../services/configuracionService');
            const mensajeReapertura = await configuracionService.get(
                'mensaje_reapertura_personal',
                'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.'
            );
            return res.status(409).json({
                success: false,
                ya_accionado: true,
                estado_actual: estadoSupervisorActual,
                fecha_estado: claim.fecha_estado_supervisor || null,
                error: `Este reclamo ya cuenta con una acción previa registrada ("${estadoSupervisorActual}"). ${mensajeReapertura}`
            });
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

        // Si el consumidor ya respondió previamente (o el reclamo ya se encuentra en un estado final de consumidor), bloquear acción duplicada
        const estadoConsumidorActual = claim.estado_consumidor;
        const yaRespondioConsumidor = (
            estadoConsumidorActual &&
            estadoConsumidorActual !== 'Pendiente' &&
            estadoConsumidorActual !== 'En curso' &&
            estadoConsumidorActual !== 'Resuelto sin confirmar'
        ) || Boolean(claim.consumidor_puntuacion || claim.consumidor_tipo_problema);

        if (yaRespondioConsumidor) {
            const fechaStr = formatFechaHora(claim.fecha_estado_consumidor);
            return res.status(409).json({
                success: false,
                ya_respondio: true,
                estado_actual: estadoConsumidorActual,
                fecha_registro: claim.fecha_estado_consumidor || null,
                puntuacion: claim.consumidor_puntuacion || null,
                tipo_problema: claim.consumidor_tipo_problema || '',
                comentario: claim.consumidor_comentario || '',
                error: `Ya se cuenta con una acción anterior registrada para este reclamo ("${estadoConsumidorActual}"${fechaStr ? ` el ${fechaStr}` : ''}). No es posible modificar la respuesta.`
            });
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
