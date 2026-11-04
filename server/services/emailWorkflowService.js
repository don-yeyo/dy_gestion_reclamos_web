const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const configuracionService = require('./configuracionService');
const productosService = require('./productosService');

const APP_SECRET = process.env.APP_SECRET || 'dy_secret_reclamos_super_seguro_2026_cambiar_en_produccion';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

function formatTemplate(template = '', data = {}) {
    if (!template) return '';
    return template
        .replace(/{claim_id}/g, data.id || '')
        .replace(/{consumidor_nombre}/g, `${data.nombre || ''} ${data.apellido || ''}`.trim())
        .replace(/{localidad}/g, data.localidad || '')
        .replace(/{supervisor}/g, data.supervisor || '');
}

class EmailWorkflowService {

    /**
     * Retorna el bloque HTML de cabecera con el logotipo institucional.
     * Utiliza la URL pública absoluta configurada en /configuracion/parametros (clave: 'email_logo_url').
     * Si no está definida, muestra el nombre institucional corporativo en formato texto.
     */
    async getLogoHeaderHtml(titulo = '', subtitulo = '') {
        const logoDb = await configuracionService.get('email_logo_url', '');
        const configuredUrl = (logoDb || process.env.EMAIL_LOGO_URL || '').replace(/"/g, '').trim();

        const logoRender = configuredUrl
            ? `<img src="${configuredUrl}" alt="Don Yeyo" style="max-height:46px; max-width:200px; object-fit:contain; margin-bottom:8px;" />`
            : `<h1 style="margin:0; font-size:1.5rem; letter-spacing:1px; font-weight:800; color:#ffffff;">DON YEYO</h1>`;

        return `
        <div style="background:#0d2c5c; color:#ffffff; padding:22px 20px; text-align:center; border-bottom:4px solid #e40521;">
            ${logoRender}
            ${titulo ? `<h2 style="margin:6px 0 0 0; font-size:1.25rem; font-weight:700; color:#ffffff;">${titulo}</h2>` : ''}
            ${subtitulo ? `<p style="margin:4px 0 0 0; opacity:0.85; font-size:0.84rem;">${subtitulo}</p>` : ''}
        </div>
        `;
    }

    constructor() {
        // 1. Transporter para correos dirigidos a Consumidores (SMTP saliente institucional Don Yeyo)
        this.consumerTransporter = nodemailer.createTransport({
            host: (process.env.SMTP_HOST || 'mail.donyeyo.com.ar').replace(/"/g, ''),
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
            auth: {
                user: (process.env.SMTP_USER || '').replace(/"/g, ''),
                pass: (process.env.SMTP_PASS || '').replace(/"/g, '')
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
        const consumerFromName = (process.env.SMTP_FROM_NAME || 'Don Yeyo - Reclamos').replace(/"/g, '');
        const consumerFromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noresponder@donyeyo.com.ar').replace(/"/g, '');
        this.consumerFrom = `"${consumerFromName}" <${consumerFromEmail}>`;

        // 2. Transporter para Alertas y Correos Internos a las áreas de la empresa y supervisores (Outlook / Gabriel Tonelli)
        const alertaHost = (process.env.ALERTA_SMTP_HOST || 'smtp-mail.outlook.com').replace(/"/g, '');
        const alertaPort = parseInt(process.env.ALERTA_SMTP_PORT || '587', 10);
        const alertaEncrypt = ((process.env.ALERTA_SMTP_ENCRYPT || 'tls').replace(/"/g, '')).toLowerCase();
        const isAlertaSecure = alertaEncrypt === 'ssl' || alertaPort === 465;

        this.internalTransporter = nodemailer.createTransport({
            host: alertaHost,
            port: alertaPort,
            secure: isAlertaSecure,
            auth: {
                user: (process.env.ALERTA_SMTP_USER || '').replace(/"/g, ''),
                pass: (process.env.ALERTA_SMTP_PASSWORD || '').replace(/"/g, '')
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
        const alertaFromName = (process.env.ALERTA_SMTP_NAME || 'Gabriel Tonelli').replace(/"/g, '');
        const alertaFromEmail = (process.env.ALERTA_SMTP_USER || consumerFromEmail).replace(/"/g, '');
        this.internalFrom = `"${alertaFromName}" <${alertaFromEmail}>`;
    }

    /**
     * Envía un correo electrónico evaluando el canal (interno o consumidor) y el modo de testeo por entorno.
     * Si EMAIL_TEST_MODE es true, redirige el correo a EMAIL_TEST_RECIPIENT para proteger a terceros
     * y añade un banner informativo en la cabecera del correo con los destinatarios originales.
     * @param {Object} mailOptions Opciones de correo (to, subject, html, etc.)
     * @param {string} channel 'internal' (default) para áreas de la empresa y supervisores, o 'consumer' para clientes
     * @param {Object} logMeta Metadatos de auditoría para registro en historial
     */
    async sendMail(mailOptions, channel = 'internal', logMeta = {}) {
        const testMode = process.env.EMAIL_TEST_MODE === 'true' || process.env.EMAIL_TEST_MODE === '1';
        const isConsumer = channel === 'consumer';
        // En modo de pruebas o emails internos, usar siempre el servidor SMTP de Gabriel Tonelli (Outlook)
        const useInternal = !isConsumer || testMode;
        const transporter = useInternal ? this.internalTransporter : this.consumerTransporter;
        const defaultFrom = useInternal ? this.internalFrom : this.consumerFrom;

        const testRecipient = (process.env.EMAIL_TEST_RECIPIENT || process.env.ALERTA_SMTP_USER || process.env.SMTP_USER || '').replace(/"/g, '');

        let finalOptions = {
            from: defaultFrom,
            ...mailOptions
        };

        if (testMode && testRecipient) {
            const originalTo = Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : (mailOptions.to || '');
            const originalCc = mailOptions.cc ? (Array.isArray(mailOptions.cc) ? mailOptions.cc.join(', ') : mailOptions.cc) : null;
            const originalBcc = mailOptions.bcc ? (Array.isArray(mailOptions.bcc) ? mailOptions.bcc.join(', ') : mailOptions.bcc) : null;

            console.log(`[EMAIL TEST MODE] Interceptando correo [Canal: ${channel.toUpperCase()}].`);
            console.log(` -> Destinatario original: "${originalTo}"`);
            console.log(` -> Redirigiendo a casilla de pruebas: "${testRecipient}"`);
            console.log(` -> Asunto: "${mailOptions.subject}"`);

            const bannerHtml = `
            <div style="background:#fef3c7; border:2px dashed #f59e0b; color:#92400e; padding:14px; margin-bottom:18px; border-radius:8px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size:0.86rem; line-height:1.5;">
                <div style="font-weight:bold; font-size:0.95rem; margin-bottom:6px; color:#b45309;">
                    ⚠️ MODO DE PRUEBAS / TESTING ACTIVADO (EMAIL_TEST_MODE)
                </div>
                <div>Este mensaje fue interceptado en entorno de pruebas y <strong>NO</strong> fue enviado al destinatario real.</div>
                <div style="margin-top:8px; padding-top:8px; border-top:1px solid #fde68a;">
                    <strong>Canal de salida:</strong> ${isConsumer ? 'Consumidores (SMTP Saliente)' : 'Interno / Alertas a la Empresa (Outlook)'}<br/>
                    <strong>Destinatario(s) original(es):</strong> ${originalTo}<br/>
                    ${originalCc ? `<strong>CC original:</strong> ${originalCc}<br/>` : ''}
                    ${originalBcc ? `<strong>BCC original:</strong> ${originalBcc}<br/>` : ''}
                </div>
            </div>
            `;

            finalOptions.to = testRecipient;
            delete finalOptions.cc;
            delete finalOptions.bcc;
            finalOptions.subject = `[TESTING - Para: ${originalTo}] ${mailOptions.subject}`;
            if (finalOptions.html) {
                finalOptions.html = `${bannerHtml}${finalOptions.html}`;
            }
        }

        let sendResult = null;
        let sendError = null;

        try {
            sendResult = await transporter.sendMail(finalOptions);
        } catch (err) {
            sendError = err;
            console.error(`[EMAIL WORKFLOW ERROR] Error al despachar email vía transporter (${useInternal ? 'interno' : 'consumidor'}):`, err.message);

            // Respaldo de contingencia: si el transporter interno falla por timeout/red y el de consumidor está disponible, intentar por allí
            if (useInternal && this.consumerTransporter && transporter !== this.consumerTransporter) {
                console.warn('[EMAIL WORKFLOW WARNING] Intentando reenvío de respaldo a través del servidor SMTP saliente (Dattaweb)...');
                try {
                    const fallbackOptions = {
                        ...finalOptions,
                        from: this.consumerFrom
                    };
                    sendResult = await this.consumerTransporter.sendMail(fallbackOptions);
                    sendError = null;
                    console.log('[EMAIL WORKFLOW SUCCESS] Correo entregado exitosamente mediante transporter de respaldo.');
                } catch (fallbackErr) {
                    console.error('[EMAIL WORKFLOW ERROR] Error también en transporter de respaldo:', fallbackErr.message);
                }
            }
        }

        // Registro automático de auditoría en logs_emails
        try {
            const systemLogService = require('./systemLogService');
            await systemLogService.logEmail({
                reclamoId: logMeta.reclamoId || null,
                destinatarioTipo: logMeta.destinatarioTipo || (channel === 'consumer' ? 'consumidor' : 'interno'),
                destinatarioEmail: finalOptions.to,
                tipoDisparo: logMeta.tipoDisparo || 'automatico',
                asunto: finalOptions.subject || mailOptions.subject,
                motivo: logMeta.motivo || 'Emisión de correo del sistema',
                mensajeResumen: logMeta.mensajeResumen || null,
                cuerpoHtml: finalOptions.html || mailOptions.html,
                actor: logMeta.actor || (logMeta.tipoDisparo === 'manual' ? 'administrador' : 'sistema'),
                actorEmail: logMeta.actorEmail || null,
                reintentoNro: logMeta.reintentoNro || 1,
                estadoEnvio: sendError ? 'fallido' : (testMode ? 'simulado_test' : 'enviado'),
                errorMensaje: sendError ? sendError.message : null,
                metadata: logMeta.metadata || null
            });
        } catch (logErr) {
            console.error('[EMAIL LOG ERROR] No se pudo persistir el log del email:', logErr.message);
        }

        if (sendError) {
            throw sendError;
        }

        return sendResult;
    }

    /**
     * Genera un token HMAC anti-tampering seguro para links en correos
     */
    generateToken(claimId, actor, action, extra = {}) {
        return jwt.sign(
            { claimId: String(claimId), actor, action, ...extra },
            APP_SECRET,
            { expiresIn: '30d' }
        );
    }

    /**
     * Genera token y enlace directo único para poner reclamo en 'En curso' desde el email
     */
    generateAdminActionToken(claimId) {
        return this.generateToken(claimId, 'admin', 'en_curso');
    }

    generateAdminActionUrl(claimId) {
        const token = this.generateAdminActionToken(claimId);
        return `${API_BASE_URL}/api/public/actions/admin-quick?token=${encodeURIComponent(token)}`;
    }

    /**
     * Verifica la autenticidad de un token de acción
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, APP_SECRET);
        } catch (e) {
            return null;
        }
    }

    /**
     * Envía email de acción al Supervisor asignado cuando el Administrador pone el reclamo "En curso"
     */
    async sendSupervisorActionEmail(claim, opts = {}) {
        if (!claim.supervisor_email) {
            console.warn(`[EMAIL] Reclamo #${claim.id}: Supervisor sin email definido.`);
            return false;
        }

        const tokenResuelto = this.generateToken(claim.id, 'supervisor', 'resuelto');
        const tokenImposibilidad = this.generateToken(claim.id, 'supervisor', 'imposibilidad');

        const urlResuelto = `${API_BASE_URL}/api/public/actions/supervisor-quick?token=${encodeURIComponent(tokenResuelto)}`;
        const urlImposibilidad = `${APP_BASE_URL}/imposibilidad?token=${encodeURIComponent(tokenImposibilidad)}`;

        // Textos configurables dinámicos
        const asuntoTpl = await configuracionService.get('email_supervisor_asunto', '[Acción Requerida] Reclamo #{claim_id} - {consumidor_nombre} ({localidad})');
        const titulo = formatTemplate(await configuracionService.get('email_supervisor_titulo', 'Acción Comercial Requerida - Reclamo #{claim_id}'), claim);
        const intro = await configuracionService.get('email_supervisor_intro', 'Se ha puesto en curso un reclamo en tu zona de cobertura que requiere de tu intervención para reposición o entrega de cortesía.');
        const leyendaBotones = await configuracionService.get('email_supervisor_leyenda_botones', 'Por favor, una vez gestionado este caso, informá el estado haciendo clic en el botón correspondiente:');
        const btnResuelto = await configuracionService.get('email_supervisor_btn_resuelto', '✓ Pude Resolver la Acción');
        const btnImposibilidad = await configuracionService.get('email_supervisor_btn_imposibilidad', '✕ Existe una Imposibilidad');
        const footer = await configuracionService.get('email_pie_institucional', 'Sistema de Gestión de Reclamos Automatizado - Don Yeyo S.A.');
        const headerLogoHtml = await this.getLogoHeaderHtml(titulo, 'Portal de Supervisión Comercial');

        // Obtener la prioridad y las reglas de cortesía configuradas (que ahora manejan ítems)
        const prioridadesService = require('./prioridadesService');
        const cortesiaInfo = await prioridadesService.getReglasCortesiaForClaim(claim);
        const prioridadNombre = cortesiaInfo.prioridad?.nombre || claim.prioridad_nombre || (claim.prioridad === 10 ? 'Alta' : claim.prioridad === 20 ? 'Media' : (claim.prioridad === 30 ? 'Baja' : ''));
        const slaDias = cortesiaInfo.prioridad?.sla || claim.sla_dias || (claim.prioridad === 10 ? 3 : claim.prioridad === 20 ? 7 : 14);
        const cortesiaItems = cortesiaInfo.items && cortesiaInfo.items.length > 0 ? cortesiaInfo.items : ['1 reemplazo'];
        const cortesiaTextoCompleto = cortesiaInfo.texto || cortesiaItems.join(' + ');

        const badgeColor = prioridadNombre.toLowerCase().includes('alta') ? '#b91c1c' : prioridadNombre.toLowerCase().includes('media') ? '#b45309' : '#1d4ed8';
        const badgeBg = prioridadNombre.toLowerCase().includes('alta') ? '#fee2e2' : prioridadNombre.toLowerCase().includes('media') ? '#fef3c7' : '#dbeafe';

        const cortesiaItemsHtml = cortesiaItems.map(itemDesc => `
            <li style="margin-bottom:6px; color:#065f46; font-size:0.92rem; list-style-type:none; display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:#10b981; color:#ffffff; font-size:0.95rem; font-weight:bold; text-align:center; line-height:18px; vertical-align:middle; flex-shrink:0;">&bull;</span>
                <span style="font-weight:600; vertical-align:middle;">${itemDesc}</span>
            </li>
        `).join('');

        const bloqueCortesiaHtml = `
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:16px; margin:18px 0; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #d1fae5; padding-bottom:8px; flex-wrap:wrap; gap:6px;">
                    <div style="font-size:0.85rem; font-weight:bold; color:#047857; text-transform:uppercase; letter-spacing:0.5px;">
                        🎁 Regalo / Compensación de Cortesía a Entregar:
                    </div>
                    ${prioridadNombre ? `
                    <span style="background:${badgeBg}; color:${badgeColor}; font-weight:700; font-size:0.75rem; padding:3px 10px; border-radius:12px; text-transform:uppercase; letter-spacing:0.4px;">
                        Prioridad ${prioridadNombre} &bull; SLA: ${slaDias} días
                    </span>` : ''}
                </div>
                <div style="color:#065f46; font-size:0.85rem; margin-bottom:10px;">
                    Por favor, gestioná la entrega al consumidor de los siguientes ítems de compensación acordados:
                </div>
                <ul style="margin:0; padding:0;">
                    ${cortesiaItemsHtml}
                </ul>
            </div>
        `;

        const productosHtml = (claim.items || []).map(item => `
            <div style="background:#f8fafc; border-left:4px solid #151C5B; padding:14px; margin-bottom:12px; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:1.05rem; font-weight:bold; color:#151C5B; margin-bottom:4px;">
                    ${item.marca || 'Don Yeyo'} - ${item.producto || 'Producto'}
                </div>
                <div style="color:#475569; font-size:0.9rem; margin-bottom:6px;">
                    <span>Categoría: <strong>${item.categoria || 'General'}</strong></span> &bull; 
                    <span>Cantidad reclamada: <strong>${item.cantidad}</strong></span>
                </div>
                <div style="color:#334155; font-size:0.9rem; margin-bottom:8px;">
                    Defecto reportado: <strong style="color:#b91c1c;">${item.defecto || 'No especificado'}</strong>
                </div>
                <div style="font-size:0.8rem; color:#94a3b8; margin-top:6px;">
                    Lote: ${item.lote || 'N/A'} | Vencimiento: ${item.vto || 'N/A'}
                </div>
            </div>
        `).join('');

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            ${headerLogoHtml}
            <div style="padding:24px; color:#1e293b; line-height:1.5;">
                <p>Estimado/a <strong>${claim.supervisor}</strong>,</p>
                <p>${intro}</p>

                ${bloqueCortesiaHtml}

                <div style="background:#f1f5f9; padding:14px; border-radius:8px; margin:16px 0;">
                    <h4 style="margin:0 0 8px 0; color:#151C5B;">Datos del Consumidor</h4>
                    <strong>Nombre:</strong> ${claim.nombre} ${claim.apellido}<br/>
                    <strong>Domicilio:</strong> ${claim.domicilio} (${claim.localidad}, ${claim.provincia})<br/>
                    <strong>Teléfono:</strong> <a href="tel:${claim.telefono}">${claim.telefono}</a><br/>
                    <strong>Email:</strong> ${claim.email}
                </div>

                <h4 style="color:#151C5B; margin-bottom:8px;">Detalle de Productos Reclamados:</h4>
                ${productosHtml}

                <div style="margin-top:28px; text-align:center;">
                    <p style="font-weight:600; margin-bottom:14px;">${leyendaBotones}</p>
                    <a href="${urlResuelto}" style="display:inline-block; background:#10b981; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:50px; font-weight:bold; margin:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        ${btnResuelto}
                    </a>
                    <a href="${urlImposibilidad}" style="display:inline-block; background:#E5353B; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:50px; font-weight:bold; margin:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        ${btnImposibilidad}
                    </a>
                </div>
            </div>
            <div style="background:#f8fafc; padding:14px; text-align:center; font-size:0.8rem; color:#94a3b8; border-top:1px solid #e2e8f0;">
                ${footer}
            </div>
        </div>
        `;

        const isManual = Boolean(opts.manual);
        return this.sendMail({
            to: claim.supervisor_email,
            subject: formatTemplate(asuntoTpl, claim),
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'supervisor',
            tipoDisparo: isManual ? 'manual' : 'automatico',
            motivo: opts.motivo || (isManual 
                ? `Reenvío manual de instrucciones de reposición y cortesía por administrador (${opts.actorEmail || 'admin'})`
                : 'Aprobación de reclamo: Asignación e instrucciones de reposición con regla de cortesía al supervisor'),
            actor: opts.actor || (isManual ? 'administrador' : 'sistema'),
            actorEmail: opts.actorEmail || null,
            metadata: {
                supervisor: claim.supervisor,
                prioridad: claim.prioridad_nombre || claim.prioridad,
                regla_cortesia: claim.regla_cortesia_aplicada
            }
        });
    }

    /**
     * Notifica a los Administradores cuando un supervisor reporta imposibilidad
     */
    async sendSupervisorImpossibilityAlertToAdmins(claim, motivo) {
        const defaultAdmin = process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar';
        const adminEmails = await configuracionService.get('emails_admin_notificaciones', defaultAdmin);

        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
            <h3 style="color:#E5353B;">Alerta: Imposibilidad Reportada por Supervisor</h3>
            <p>El supervisor <strong>${claim.supervisor}</strong> ha informado una imposibilidad para cumplir la acción del Reclamo <strong>#${claim.id}</strong>.</p>
            <div style="background:#fef2f2; border:1px solid #fecaca; padding:14px; border-radius:6px; margin:14px 0;">
                <strong>Motivo informado:</strong><br/>
                ${motivo}
            </div>
            <p><strong>Consumidor:</strong> ${claim.nombre} ${claim.apellido} (${claim.telefono})<br/>
            <strong>Domicilio:</strong> ${claim.domicilio}, ${claim.localidad}</p>
            <p><a href="${APP_BASE_URL}/reclamos/${claim.id}">Ver Reclamo en el Gestor Web</a></p>
        </div>
        `;

        return this.sendMail({
            to: adminEmails,
            subject: `[ALERTA] Supervisor reportó Imposibilidad - Reclamo #${claim.id}`,
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'admin',
            tipoDisparo: 'automatico',
            motivo: `Alerta a administradores: Supervisor ${claim.supervisor} reportó imposibilidad operativa (${motivo})`,
            actor: 'supervisor_link',
            actorEmail: claim.supervisor_email || null,
            metadata: { supervisor: claim.supervisor, motivo_imposibilidad: motivo }
        });
    }

    /**
     * Envía consulta al consumidor transcurridos F días de la resolución del supervisor
     */
    async sendConsumerFollowupEmail(claim, opts = {}) {
        if (!claim.email) return false;

        const tokenResuelto = this.generateToken(claim.id, 'consumidor', 'resuelto');
        const tokenNoResuelto = this.generateToken(claim.id, 'consumidor', 'no_resuelto');

        const urlResuelto = `${APP_BASE_URL}/encuesta-consumidor?token=${encodeURIComponent(tokenResuelto)}`;
        const urlNoResuelto = `${APP_BASE_URL}/encuesta-consumidor?token=${encodeURIComponent(tokenNoResuelto)}`;

        // Textos configurables (con soporte retrocompatible de claves)
        const asuntoTpl = await configuracionService.get(
            'email_consumidor_satisfaccion_asunto',
            await configuracionService.get('email_consumidor_asunto', 'Seguimiento de tu Reclamo en Don Yeyo #{claim_id}')
        );
        const titulo = formatTemplate(
            await configuracionService.get(
                'email_consumidor_satisfaccion_titulo',
                await configuracionService.get('email_consumidor_titulo', 'Don Yeyo - Seguimiento de tu Reclamo #{claim_id}')
            ),
            claim
        );
        const intro = await configuracionService.get(
            'email_consumidor_satisfaccion_texto',
            await configuracionService.get('email_consumidor_intro', 'Nos contactamos para saber cómo te fue con la resolución de tu reclamo y si recibiste la reposición de tus productos de parte de nuestro equipo comercial.')
        );
        const btnResuelto = await configuracionService.get('email_consumidor_btn_conforme', '✓ Resuelto');
        const btnNoResuelto = await configuracionService.get('email_consumidor_btn_no_resuelto', '✕ No Resuelto');
        const footer = await configuracionService.get('email_pie_institucional', 'Sistema de Gestión de Reclamos Automatizado - Don Yeyo S.A.');
        const headerLogoHtml = await this.getLogoHeaderHtml(titulo, 'Atención al Consumidor');

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            ${headerLogoHtml}
            <div style="padding:24px; color:#1e293b; line-height:1.6;">
                <p>Hola <strong>${claim.nombre}</strong>,</p>
                <p>${intro}</p>
                <p style="text-align:center; font-weight:600; margin-top:20px;">Por favor, indicanos el estado de tu reclamo haciendo clic en una opción:</p>
                <div style="text-align:center; margin-top:16px;">
                    <a href="${urlResuelto}" style="display:inline-block; background:#10b981; color:#fff; text-decoration:none; padding:12px 24px; border-radius:20px; font-weight:bold; margin:6px;">
                        ${btnResuelto}
                    </a>
                    <a href="${urlNoResuelto}" style="display:inline-block; background:#ef4444; color:#fff; text-decoration:none; padding:12px 24px; border-radius:20px; font-weight:bold; margin:6px;">
                        ${btnNoResuelto}
                    </a>
                </div>
                <p style="text-align:center; font-size:0.82rem; color:#64748b; margin-top:14px;">
                    Al hacer clic podrás calificar nuestra atención o detallar cualquier inconveniente.
                </p>
            </div>
            <div style="background:#f8fafc; padding:12px; text-align:center; font-size:0.8rem; color:#94a3b8; border-top:1px solid #e2e8f0;">
                ${footer}
            </div>
        </div>
        `;

        return this.sendMail({
            to: claim.email,
            subject: formatTemplate(asuntoTpl, claim),
            html
        }, 'consumer', {
            reclamoId: claim.id,
            destinatarioTipo: 'consumidor',
            tipoDisparo: 'automatico',
            motivo: 'Seguimiento de conformidad: Envío de encuesta periódica de recepción y satisfacción tras resolución informada por supervisor',
            actor: 'cron_sistema',
            reintentoNro: opts.reintentoNro || 1
        });
    }

    /**
     * Alerta a los Administradores de la respuesta del consumidor (con puntuación, tipo de problema y comentario)
     */
    async sendConsumerFeedbackAlertToAdmins(claim, feedback, extra = {}) {
        const defaultAdmin = process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar';
        const adminEmails = await configuracionService.get('emails_admin_notificaciones', defaultAdmin);
        const isUrgent = feedback === 'No resuelto' || feedback === 'Resuelto disconforme';
        const { puntuacion, tipo_problema, comentario } = extra;

        const starsHtml = puntuacion
            ? `<div style="margin-top:8px; font-size:1.05rem; color:#d97706;"><strong>Puntuación otorgada:</strong> ${'★'.repeat(Number(puntuacion))}${'☆'.repeat(5 - Number(puntuacion))} (${puntuacion}/5)</div>`
            : '';

        const problemaHtml = tipo_problema
            ? `<div style="margin-top:8px; font-size:0.95rem; color:#b91c1c;"><strong>Motivo / Tipo de problema:</strong> ${tipo_problema}</div>`
            : '';

        const comentarioHtml = comentario
            ? `<div style="margin-top:10px; padding:10px 12px; background:#ffffff; border-left:3px solid #64748b; border-radius:4px; font-size:0.92rem; font-style:italic; color:#334155;">"${comentario}"</div>`
            : '';

        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
            <h3 style="color:${isUrgent ? '#ef4444' : '#151C5B'};">
                ${isUrgent ? 'URGENTE: ' : ''}Respuesta de Consumidor - Reclamo #${claim.id}
            </h3>
            <p>El consumidor <strong>${claim.nombre} ${claim.apellido}</strong> respondió la encuesta de seguimiento:</p>
            <div style="padding:14px; background:${isUrgent ? '#fef2f2' : '#f1f5f9'}; border-radius:6px;">
                <div style="font-size:1.1rem; font-weight:bold;">Resultado: ${feedback}</div>
                ${starsHtml}
                ${problemaHtml}
                ${comentarioHtml}
            </div>
            <p><strong>Teléfono:</strong> ${claim.telefono} | <strong>Email:</strong> ${claim.email}</p>
            <p><a href="${APP_BASE_URL}/reclamos/${claim.id}">Ver Reclamo en el Gestor Web</a></p>
        </div>
        `;

        return this.sendMail({
            to: adminEmails,
            subject: `${isUrgent ? '[URGENTE] ' : ''}Consumidor respondió "${feedback}" - Reclamo #${claim.id}`,
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'admin',
            tipoDisparo: 'automatico',
            motivo: `Respuesta de consumidor a encuesta de seguimiento: "${feedback}"${puntuacion ? ` (${puntuacion}/5 estrellas)` : ''}${tipo_problema ? ` - ${tipo_problema}` : ''}`,
            actor: 'consumidor_link',
            actorEmail: claim.email || null,
            metadata: { feedback, puntuacion: puntuacion || null, tipo_problema: tipo_problema || null, comentario: comentario || null }
        });
    }

    /**
     * Envía expediente completo a Calidad e Inocuidad según las categorías de productos reclamados
     */
    async sendInocuidadActionEmail(claim, opts = {}) {
        const items = Array.isArray(claim.items) ? claim.items : [];
        
        // Detección dinámica de casillas de Inocuidad según las categorías de los productos
        const categoriasItems = items.map(i => i.categoria).filter(Boolean);
        const emailsPorCategorias = await productosService.getInocuidadEmailsPorCategorias(categoriasItems);

        let inocuidadEmails = '';
        if (emailsPorCategorias.length > 0) {
            inocuidadEmails = emailsPorCategorias.join(', ');
        } else {
            // Fallback a la casilla de Inocuidad por defecto
            inocuidadEmails = await configuracionService.get('emails_inocuidad_default', process.env.EMAILS_INOCUIDAD || 'inocuidad@donyeyo.com.ar');
        }

        // Textos configurables
        const asuntoTpl = await configuracionService.get('email_inocuidad_asunto', '[Calidad / Inocuidad] Nuevo Reclamo Aprobado #{claim_id} - {consumidor_nombre}');
        const titulo = formatTemplate(await configuracionService.get('email_inocuidad_titulo', 'Expediente Técnico - Reclamo Aprobado #{claim_id}'), claim);
        const intro = formatTemplate(await configuracionService.get('email_inocuidad_intro', 'El reclamo #{claim_id} ha sido Aprobado por la administración. Se envía copia completa del expediente para iniciar la investigación técnica, análisis de lote y trazabilidad correspondiente.'), claim);
        const btnGestor = await configuracionService.get('email_inocuidad_btn_gestor', 'Abrir en el Gestor Web');
        const btnEvidencias = await configuracionService.get('email_inocuidad_btn_evidencias', 'Descargar Evidencias ZIP');
        const footer = await configuracionService.get('email_pie_institucional', 'Don Yeyo S.A. | Sistema de Gestión Automatizado de Reclamos');
        const headerLogoHtml = await this.getLogoHeaderHtml(titulo, 'Departamento de Calidad & Inocuidad');

        const itemsHtml = items.map(item => `
            <div style="background:#f8fafc; border-left:4px solid #8b5cf6; padding:12px; margin-bottom:10px; border-radius:4px; font-size:0.9rem; line-height:1.5;">
                <strong>${item.marca || 'Don Yeyo'} - ${item.producto || 'Producto'}</strong> (${item.categoria || 'Sin categoría'})<br/>
                <span><strong>Defecto:</strong> ${item.defecto || 'No especificado'}</span><br/>
                <span><strong>Cantidad:</strong> ${item.cantidad || 1}</span><br/>
                <span><strong>Lote:</strong> ${item.lote || 'N/A'} | <strong>Hora:</strong> ${item.hora || 'N/A'} | <strong>Vencimiento:</strong> ${item.vto || item.vto_reclamo || 'N/A'}</span><br/>
                <span><strong>Conserva envase:</strong> ${item.conserva_envase || 'No especificado'}</span>
                ${item.descripcion ? `<br/><span style="color:#475569; font-style:italic;">"${item.descripcion}"</span>` : ''}
            </div>
        `).join('') || `<p><em>${claim.defecto || 'Sin detalle de productos cargados.'}</em></p>`;

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:640px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            ${headerLogoHtml}
            <div style="padding:24px; color:#1e293b; line-height:1.55;">
                <p>Estimado equipo de <strong>Calidad e Inocuidad</strong>,</p>
                <p>${intro}</p>

                <div style="background:#f1f5f9; padding:14px; border-radius:8px; margin:16px 0; font-size:0.92rem;">
                    <h4 style="margin:0 0 8px 0; color:#151C5B;">Datos del Consumidor</h4>
                    <strong>Nombre:</strong> ${claim.nombre} ${claim.apellido}<br/>
                    <strong>Domicilio:</strong> ${claim.domicilio || 'No especificado'} (${claim.localidad}, ${claim.provincia})<br/>
                    <strong>Teléfono:</strong> <a href="tel:${claim.telefono}">${claim.telefono || 'Sin teléfono'}</a><br/>
                    <strong>Email:</strong> ${claim.email || 'Sin correo'}<br/>
                    <strong>Comercio de compra:</strong> ${claim.comercio_compra || 'No especificado'}<br/>
                    <strong>Supervisor asignado:</strong> ${claim.supervisor || 'Sin asignar'} (${claim.supervisor_email || 'Sin correo'})
                </div>

                <h4 style="color:#151C5B; margin:16px 0 8px 0;">Detalle de Productos Reclamados:</h4>
                ${itemsHtml}

                <div style="margin-top:20px; text-align:center; display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                    ${claim.evidencia_zip ? `<a href="${claim.evidencia_zip}" style="display:inline-block; background:#8b5cf6; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:6px; font-weight:600; font-size:0.9rem;">${btnEvidencias}</a>` : ''}
                    <a href="${APP_BASE_URL}/reclamos/${claim.id}" style="display:inline-block; background:#151C5B; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:6px; font-weight:600; font-size:0.9rem;">${btnGestor}</a>
                </div>
            </div>
            <div style="background:#f8fafc; padding:14px; text-align:center; font-size:0.8rem; color:#94a3b8; border-top:1px solid #e2e8f0;">
                ${footer}
            </div>
        </div>
        `;

        const isManual = Boolean(opts.manual);
        return this.sendMail({
            to: inocuidadEmails,
            subject: formatTemplate(asuntoTpl, claim),
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'inocuidad',
            tipoDisparo: isManual ? 'manual' : 'automatico',
            motivo: opts.motivo || (isManual 
                ? `Reenvío manual de expediente técnico por administrador (${opts.actorEmail || 'admin'})`
                : 'Aprobación de reclamo: Remisión de expediente técnico con lote, productos y evidencia para dictamen de laboratorio'),
            actor: opts.actor || (isManual ? 'administrador' : 'sistema'),
            actorEmail: opts.actorEmail || null,
            metadata: {
                prioridad: claim.prioridad_nombre || claim.prioridad,
                items_cant: items.length,
                categorias_detectadas: categoriasItems
            }
        });
    }

    /**
     * Envía alerta de elevación a casillas directivas cuando se agotan los reintentos
     */
    async sendElevationAlert(claim, reason) {
        const defaultElevation = process.env.EMAILS_ELEVACION || 'calidad@donyeyo.com.ar,gerencia@donyeyo.com.ar';
        const elevationEmails = await configuracionService.get('emails_elevacion_default', defaultElevation);

        // Textos configurables
        const asuntoTpl = await configuracionService.get('email_elevacion_asunto', '[ELEVACIÓN] Sin respuesta de acción - Reclamo #{claim_id} ({supervisor})');
        const titulo = formatTemplate(await configuracionService.get('email_elevacion_titulo', 'ALERTA DE ELEVACIÓN AUTOMÁTICA - Reclamo #{claim_id}'), claim);
        const intro = await configuracionService.get('email_elevacion_intro', 'Se ha activado la regla de elevación ejecutiva por haberse agotado el número máximo de recordatorios sin respuesta oportuna.');
        const btnRevisar = await configuracionService.get('email_elevacion_btn_revisar', 'Revisar caso en el Gestor Web');
        const headerLogoHtml = await this.getLogoHeaderHtml(titulo, 'Dirección y Gerencia');

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:2px solid #ef4444; border-radius:10px; overflow:hidden;">
            ${headerLogoHtml}
            <div style="padding:22px; color:#1e293b; line-height:1.6;">
                <p>${intro}</p>
                <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:12px; margin:14px 0; border-radius:4px;">
                    <strong>Motivo:</strong> ${reason}
                </div>
                <p><strong>Supervisor Asignado:</strong> ${claim.supervisor} (${claim.supervisor_email})<br/>
                <strong>Consumidor:</strong> ${claim.nombre} ${claim.apellido} (${claim.domicilio}, ${claim.localidad})</p>
                <div style="margin-top:20px; text-align:center;">
                    <a href="${APP_BASE_URL}/reclamos/${claim.id}" style="display:inline-block; background:#0d2c5c; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:6px; font-weight:600; font-size:0.9rem;">
                        ${btnRevisar}
                    </a>
                </div>
            </div>
        </div>
        `;

        return this.sendMail({
            to: elevationEmails,
            subject: formatTemplate(asuntoTpl, claim),
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'elevacion',
            tipoDisparo: 'automatico',
            motivo: `Alerta de elevación por agotamiento de repeticiones sin respuesta: ${reason}`,
            actor: 'cron_sistema',
            metadata: { supervisor: claim.supervisor, reason }
        });
    }

    /**
     * Envía alerta CRÍTICA a los Administradores ante discrepancia de resolución:
     * El supervisor declaró "Resuelto" pero el consumidor informó "No resuelto" (posible engaño o fraude).
     */
    async sendFraudAlertToAdmins(claim, motivoConflicto) {
        const defaultAdmin = process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar';
        const defaultElevation = process.env.EMAILS_ELEVACION || '';
        const adminEmails = await configuracionService.get('emails_admin_notificaciones', defaultAdmin);
        const elevationEmails = await configuracionService.get('emails_elevacion_default', defaultElevation);
        const recipients = [adminEmails, elevationEmails].filter(Boolean).join(',');

        // Textos configurables
        const asuntoTpl = await configuracionService.get('email_fraude_asunto', '🚨 [CONFLICTO / POSIBLE FRAUDE] Discrepancia en Reclamo #{claim_id} - {supervisor}');
        const titulo = await configuracionService.get('email_fraude_titulo', '🚨 ALERTA CRÍTICA: POSIBLE FRAUDE / CONFLICTO');
        const intro = formatTemplate(await configuracionService.get('email_fraude_intro', 'Se ha detectado una inconsistencia grave en el seguimiento del Reclamo #{claim_id}: El supervisor declaró haber entregado la reposición pero el consumidor informó NO haber recibido el producto.'), claim);
        const btnAuditar = await configuracionService.get('email_fraude_btn_auditar', 'Auditar Reclamo en Gestor Web');

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:640px; margin:auto; background:#ffffff; border:2px solid #dc2626; border-radius:12px; overflow:hidden;">
            <div style="background:#dc2626; color:#ffffff; padding:20px; text-align:center;">
                <h2 style="margin:0; font-size:1.4rem;">${titulo}</h2>
                <p style="margin:6px 0 0 0; opacity:0.9; font-size:0.95rem;">Discrepancia de entrega en Reclamo #${claim.id}</p>
            </div>
            <div style="padding:24px; color:#1e293b; line-height:1.6;">
                <p style="font-size:1.05rem; color:#991b1b; font-weight:700;">
                    Atención Administración y Gerencia Comercial:
                </p>
                <p>${intro}</p>

                <div style="background:#fef2f2; border-left:4px solid #dc2626; padding:14px; border-radius:6px; margin:16px 0;">
                    <div style="margin-bottom:8px;">
                        <strong>• Estado informado por Supervisor (${claim.supervisor}):</strong> <span style="color:#16a34a; font-weight:bold;">Resuelto (Declaró haber entregado la reposición)</span>
                    </div>
                    <div>
                        <strong>• Respuesta del Consumidor (${claim.nombre} ${claim.apellido}):</strong> <span style="color:#dc2626; font-weight:bold;">✕ NO RESUELTO (Informó no haber recibido el producto)</span>
                    </div>
                </div>

                <div style="background:#f8fafc; padding:14px; border-radius:8px; margin:16px 0; font-size:0.9rem;">
                    <strong>Supervisor Asignado:</strong> ${claim.supervisor || 'N/A'} (${claim.supervisor_email || 'Sin email'})<br/>
                    <strong>Consumidor:</strong> ${claim.nombre} ${claim.apellido}<br/>
                    <strong>Contacto Consumidor:</strong> Tel: ${claim.telefono || 'Sin teléfono'} | Email: ${claim.email || 'Sin email'}<br/>
                    <strong>Domicilio:</strong> ${claim.domicilio || 'N/A'} (${claim.localidad}, ${claim.provincia})
                </div>

                <p style="color:#64748b; font-size:0.88rem;">
                    El reclamo ha sido marcado automáticamente en el sistema como <strong>EN CONFLICTO</strong> con fondo rojo para auditoría interna inmediata.
                </p>

                <div style="margin-top:24px; text-align:center;">
                    <a href="${APP_BASE_URL}/reclamos/${claim.id}" style="display:inline-block; background:#dc2626; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:bold; font-size:0.95rem;">
                        ${btnAuditar}
                    </a>
                </div>
            </div>
            <div style="background:#fef2f2; padding:12px; text-align:center; font-size:0.8rem; color:#991b1b; border-top:1px solid #fecaca;">
                Don Yeyo S.A. | Detección Automática de Fraude y Auditoría Comercial
            </div>
        </div>
        `;

        return this.sendMail({
            to: recipients,
            subject: formatTemplate(asuntoTpl, claim),
            html
        }, 'internal', {
            reclamoId: claim.id,
            destinatarioTipo: 'admin',
            tipoDisparo: 'automatico',
            motivo: `Alerta crítica de conflicto / sospecha de fraude: ${motivoConflicto}`,
            actor: 'sistema_alerta',
            metadata: { supervisor: claim.supervisor, motivo: motivoConflicto }
        });
    }
}

module.exports = new EmailWorkflowService();
