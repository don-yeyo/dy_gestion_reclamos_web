const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const APP_SECRET = process.env.APP_SECRET || 'dy_secret_reclamos_super_seguro_2026_cambiar_en_produccion';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

class EmailWorkflowService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'mail.donyeyo.com.ar',
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        });

        this.from = `"${process.env.SMTP_FROM_NAME || 'Don Yeyo S.A. - Reclamos'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
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
     * Envía email de acción al Supervisor asignado tras aprobación del Administrador
     */
    async sendSupervisorActionEmail(claim) {
        if (!claim.supervisor_email) {
            console.warn(`[EMAIL] Reclamo #${claim.id}: Supervisor sin email definido.`);
            return false;
        }

        const tokenResuelto = this.generateToken(claim.id, 'supervisor', 'resuelto');
        const tokenImposibilidad = this.generateToken(claim.id, 'supervisor', 'imposibilidad');

        const urlResuelto = `${API_BASE_URL}/api/public/actions/supervisor-quick?token=${encodeURIComponent(tokenResuelto)}`;
        const urlImposibilidad = `${APP_BASE_URL}/imposibilidad?token=${encodeURIComponent(tokenImposibilidad)}`;

        const productosHtml = claim.items.map(item => `
            <div style="background:#f8fafc; border-left:4px solid #151C5B; padding:12px; margin-bottom:10px; border-radius:4px;">
                <strong>${item.marca} - ${item.producto}</strong> (${item.categoria})<br/>
                <span>Cantidad reclamada: ${item.cantidad}</span><br/>
                <span>Defecto: <em>${item.defecto}</em></span><br/>
                ${item.producto_cortesia ? `<span style="color:#10b981; font-weight:600;">Cortesía calculada: ${item.producto_cortesia}</span><br/>` : ''}
                <span style="font-size:0.85em; color:#64748b;">Lote: ${item.lote || 'N/A'} | Venc: ${item.vto || 'N/A'}</span>
            </div>
        `).join('');

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <div style="background:#151C5B; color:#ffffff; padding:20px; text-align:center;">
                <h2 style="margin:0; font-size:1.4rem;">Acción Comercial Requerida - Reclamo #${claim.id}</h2>
                <p style="margin:6px 0 0 0; opacity:0.85; font-size:0.9rem;">Don Yeyo S.A. | Atención al Consumidor</p>
            </div>
            <div style="padding:24px; color:#1e293b; line-height:1.5;">
                <p>Estimado/a <strong>${claim.supervisor}</strong>,</p>
                <p>Se ha aprobado un reclamo en tu zona de cobertura que requiere de tu intervención para reposición o entrega de cortesía.</p>

                <div style="background:#f1f5f9; padding:14px; border-radius:8px; margin:16px 0;">
                    <h4 style="margin:0 0 8px 0; color:#151C5B;">Datos del Consumidor</h4>
                    <strong>Nombre:</strong> ${claim.nombre} ${claim.apellido}<br/>
                    <strong>Domicilio:</strong> ${claim.domicilio} (${claim.localidad}, ${claim.provincia})<br/>
                    <strong>Teléfono:</strong> <a href="tel:${claim.telefono}">${claim.telefono}</a><br/>
                    <strong>Email:</strong> ${claim.email}
                </div>

                <h4 style="color:#151C5B; margin-bottom:8px;">Detalle de Productos:</h4>
                ${productosHtml}

                <div style="margin-top:28px; text-align:center;">
                    <p style="font-weight:600; margin-bottom:14px;">Por favor, una vez gestionado este caso, informá el estado haciendo clic en el botón correspondiente:</p>
                    <a href="${urlResuelto}" style="display:inline-block; background:#10b981; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:50px; font-weight:bold; margin:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        ✓ Pude Resolver la Acción
                    </a>
                    <a href="${urlImposibilidad}" style="display:inline-block; background:#E5353B; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:50px; font-weight:bold; margin:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        ✕ Existe una Imposibilidad
                    </a>
                </div>
            </div>
            <div style="background:#f8fafc; padding:14px; text-align:center; font-size:0.8rem; color:#94a3b8; border-top:1px solid #e2e8f0;">
                Sistema de Gestión de Reclamos Automatizado - Don Yeyo S.A.
            </div>
        </div>
        `;

        return this.transporter.sendMail({
            from: this.from,
            to: claim.supervisor_email,
            subject: `[Acción Requerida] Reclamo #${claim.id} - ${claim.nombre} ${claim.apellido} (${claim.localidad})`,
            html
        });
    }

    /**
     * Notifica a los Administradores cuando un supervisor reporta imposibilidad
     */
    async sendSupervisorImpossibilityAlertToAdmins(claim, motivo) {
        const adminEmails = process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar';
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

        return this.transporter.sendMail({
            from: this.from,
            to: adminEmails,
            subject: `[ALERTA] Supervisor reportó Imposibilidad - Reclamo #${claim.id}`,
            html
        });
    }

    /**
     * Envía consulta al consumidor transcurridos F días de la resolución del supervisor
     */
    async sendConsumerFollowupEmail(claim) {
        if (!claim.email) return false;

        const tokenConforme = this.generateToken(claim.id, 'consumidor', 'conforme');
        const tokenDisconforme = this.generateToken(claim.id, 'consumidor', 'disconforme');
        const tokenNoResuelto = this.generateToken(claim.id, 'consumidor', 'no_resuelto');

        const urlConforme = `${API_BASE_URL}/api/public/actions/consumidor-response?token=${encodeURIComponent(tokenConforme)}`;
        const urlDisconforme = `${API_BASE_URL}/api/public/actions/consumidor-response?token=${encodeURIComponent(tokenDisconforme)}`;
        const urlNoResuelto = `${API_BASE_URL}/api/public/actions/consumidor-response?token=${encodeURIComponent(tokenNoResuelto)}`;

        const html = `
        <div style="font-family:'Segoe UI', Tahoma, sans-serif; max-width:600px; margin:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <div style="background:#151C5B; color:#ffffff; padding:20px; text-align:center;">
                <h2 style="margin:0; font-size:1.3rem;">Don Yeyo - Seguimiento de tu Reclamo #${claim.id}</h2>
            </div>
            <div style="padding:24px; color:#1e293b; line-height:1.6;">
                <p>Hola <strong>${claim.nombre}</strong>,</p>
                <p>Nos contactamos para saber cómo te fue con la resolución de tu reclamo y si recibiste la reposición de tus productos de parte de nuestro equipo comercial.</p>
                <p style="text-align:center; font-weight:600; margin-top:20px;">Por favor, contanos tu experiencia haciendo clic en una opción:</p>
                <div style="text-align:center; margin-top:16px;">
                    <a href="${urlConforme}" style="display:inline-block; background:#10b981; color:#fff; text-decoration:none; padding:10px 18px; border-radius:20px; font-weight:bold; margin:6px;">
                        ✓ Resuelto Conforme
                    </a>
                    <a href="${urlDisconforme}" style="display:inline-block; background:#f59e0b; color:#fff; text-decoration:none; padding:10px 18px; border-radius:20px; font-weight:bold; margin:6px;">
                        ~ Resuelto Disconforme
                    </a>
                    <a href="${urlNoResuelto}" style="display:inline-block; background:#ef4444; color:#fff; text-decoration:none; padding:10px 18px; border-radius:20px; font-weight:bold; margin:6px;">
                        ✕ No Resuelto
                    </a>
                </div>
            </div>
        </div>
        `;

        return this.transporter.sendMail({
            from: this.from,
            to: claim.email,
            subject: `Seguimiento de tu Reclamo en Don Yeyo #${claim.id}`,
            html
        });
    }

    /**
     * Alerta a los Administradores de la respuesta del consumidor (especialmente urgente si No resuelto)
     */
    async sendConsumerFeedbackAlertToAdmins(claim, feedback) {
        const adminEmails = process.env.EMAILS_ADMINS || 'administracion@donyeyo.com.ar';
        const isUrgent = feedback === 'No resuelto';

        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
            <h3 style="color:${isUrgent ? '#ef4444' : '#151C5B'};">
                ${isUrgent ? 'URGENTE: ' : ''}Respuesta de Consumidor - Reclamo #${claim.id}
            </h3>
            <p>El consumidor <strong>${claim.nombre} ${claim.apellido}</strong> respondió la encuesta de satisfacción:</p>
            <div style="padding:14px; background:${isUrgent ? '#fef2f2' : '#f1f5f9'}; border-radius:6px; font-size:1.1rem; font-weight:bold;">
                Resultado: ${feedback}
            </div>
            <p><strong>Teléfono:</strong> ${claim.telefono} | <strong>Email:</strong> ${claim.email}</p>
            <p><a href="${APP_BASE_URL}/reclamos/${claim.id}">Ver Reclamo en el Gestor Web</a></p>
        </div>
        `;

        return this.transporter.sendMail({
            from: this.from,
            to: adminEmails,
            subject: `${isUrgent ? '[URGENTE] ' : ''}Consumidor respondió "${feedback}" - Reclamo #${claim.id}`,
            html
        });
    }

    /**
     * Envía expediente a Inocuidad cuando el administrador cambia estado_inocuidad a Pendiente
     */
    async sendInocuidadActionEmail(claim) {
        const inocuidadEmails = process.env.EMAILS_INOCUIDAD || 'inocuidad@donyeyo.com.ar';
        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
            <h3 style="color:#151C5B;">Derivación de Caso a Inocuidad y Calidad - Reclamo #${claim.id}</h3>
            <p>El área de administración ha asignado el reclamo <strong>#${claim.id}</strong> para intervención y análisis técnico de Inocuidad.</p>
            <p><strong>Consumidor:</strong> ${claim.nombre} ${claim.apellido} (${claim.localidad}, ${claim.provincia})<br/>
            <strong>Comercio de compra:</strong> ${claim.comercio_compra || 'No especificado'}</p>
            ${claim.evidencia_zip ? `<p><a href="${claim.evidencia_zip}" style="display:inline-block; background:#151C5B; color:#fff; padding:8px 16px; border-radius:4px; text-decoration:none;">Descargar Evidencias Multimedia (ZIP)</a></p>` : ''}
            <p><a href="${APP_BASE_URL}/reclamos/${claim.id}">Ver Reclamo en el Gestor Web</a></p>
        </div>
        `;

        return this.transporter.sendMail({
            from: this.from,
            to: inocuidadEmails,
            subject: `[Inocuidad] Caso Asignado - Reclamo #${claim.id}`,
            html
        });
    }

    /**
     * Envía alerta de elevación a casillas directivas cuando se agotan los reintentos
     */
    async sendElevationAlert(claim, reason) {
        const elevationEmails = process.env.EMAILS_ELEVACION || 'calidad@donyeyo.com.ar,gerencia@donyeyo.com.ar';
        const html = `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:2px solid #ef4444; border-radius:8px;">
            <h3 style="color:#ef4444;">ALERTA DE ELEVACIÓN AUTOMÁTICA - Reclamo #${claim.id}</h3>
            <p>Se ha activado la regla de elevación por falta de respuesta oportuna.</p>
            <p><strong>Motivo:</strong> ${reason}</p>
            <p><strong>Supervisor Asignado:</strong> ${claim.supervisor} (${claim.supervisor_email})<br/>
            <strong>Consumidor:</strong> ${claim.nombre} ${claim.apellido} (${claim.domicilio}, ${claim.localidad})</p>
            <p><a href="${APP_BASE_URL}/reclamos/${claim.id}">Revisar caso en el Gestor Web</a></p>
        </div>
        `;

        return this.transporter.sendMail({
            from: this.from,
            to: elevationEmails,
            subject: `[ELEVACIÓN] Sin respuesta de acción - Reclamo #${claim.id} (${claim.supervisor})`,
            html
        });
    }
}

module.exports = new EmailWorkflowService();
