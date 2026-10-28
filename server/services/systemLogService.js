const { pool } = require('../config/database');

class SystemLogService {
    /**
     * Registra una modificación en las configuraciones del sistema
     */
    async logConfigChange({
        modulo,
        accion,
        descripcion,
        actor = 'admin',
        actorEmail = null,
        valoresAnteriores = null,
        valoresNuevos = null,
        ipAddress = null
    }) {
        try {
            const query = `
                INSERT INTO logs_configuracion 
                (modulo, accion, descripcion, actor, actor_email, valores_anteriores, valores_nuevos, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                modulo,
                accion,
                descripcion,
                actor,
                actorEmail,
                valoresAnteriores ? JSON.stringify(valoresAnteriores) : null,
                valoresNuevos ? JSON.stringify(valoresNuevos) : null,
                ipAddress
            ];

            const [result] = await pool.query(query, params);
            console.log(`[LOG-CONFIG] Evento registrado en módulo "${modulo}" (#${result.insertId}): ${descripcion}`);
            return result.insertId;
        } catch (err) {
            console.error('[LOG-CONFIG ERROR] Error al persistir log de configuración:', err.message);
            return null;
        }
    }

    /**
     * Registra un envío de email en el historial con su contexto completo
     */
    async logEmail({
        reclamoId = null,
        destinatarioTipo,
        destinatarioEmail,
        tipoDisparo = 'automatico',
        asunto,
        motivo,
        mensajeResumen = null,
        cuerpoHtml = null,
        actor = 'sistema',
        actorEmail = null,
        reintentoNro = 1,
        estadoEnvio = 'enviado',
        errorMensaje = null,
        metadata = null
    }) {
        try {
            // Generar resumen automático si no fue provisto
            let resumenFinal = mensajeResumen;
            if (!resumenFinal && cuerpoHtml) {
                // Eliminar etiquetas HTML básicas para extraer el texto legible inicial
                resumenFinal = cuerpoHtml
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 300);
            }

            const query = `
                INSERT INTO logs_emails
                (reclamo_id, destinatario_tipo, destinatario_email, tipo_disparo, asunto, motivo, mensaje_resumen, cuerpo_html, actor, actor_email, reintento_nro, estado_envio, error_mensaje, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                reclamoId ? String(reclamoId) : null,
                destinatarioTipo,
                Array.isArray(destinatarioEmail) ? destinatarioEmail.join(', ') : destinatarioEmail,
                tipoDisparo,
                asunto,
                motivo,
                resumenFinal,
                cuerpoHtml,
                actor,
                actorEmail,
                reintentoNro,
                estadoEnvio,
                errorMensaje,
                metadata ? JSON.stringify(metadata) : null
            ];

            const [result] = await pool.query(query, params);
            console.log(`[LOG-EMAIL] Correo registrado (#${result.insertId}) [${tipoDisparo.toUpperCase()}] a ${destinatarioEmail} - Motivo: ${motivo}`);
            return result.insertId;
        } catch (err) {
            console.error('[LOG-EMAIL ERROR] Error al persistir log de email:', err.message);
            return null;
        }
    }

    /**
     * Consulta el historial unificado o filtrado de logs
     */
    async getLogs({
        categoria = 'all', // 'all', 'emails', 'configuracion'
        tipoDisparo = 'all', // 'all', 'automatico', 'manual'
        modulo = null,
        estadoEnvio = 'all',
        search = '',
        fechaDesde = null,
        fechaHasta = null,
        limit = 50,
        page = 1
    } = {}) {
        const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
        const parsedLimit = parseInt(limit, 10);

        try {
            // 1. Logs de Emails
            let emailRows = [];
            let emailCount = 0;
            if (categoria === 'all' || categoria === 'emails') {
                let whereClauses = [];
                let whereParams = [];

                if (tipoDisparo && tipoDisparo !== 'all') {
                    whereClauses.push('tipo_disparo = ?');
                    whereParams.push(tipoDisparo);
                }
                if (estadoEnvio && estadoEnvio !== 'all') {
                    whereClauses.push('estado_envio = ?');
                    whereParams.push(estadoEnvio);
                }
                if (search && search.trim()) {
                    whereClauses.push('(asunto LIKE ? OR destinatario_email LIKE ? OR motivo LIKE ? OR reclamo_id LIKE ? OR mensaje_resumen LIKE ? OR actor_email LIKE ?)');
                    const s = `%${search.trim()}%`;
                    whereParams.push(s, s, s, s, s, s);
                }
                if (fechaDesde) {
                    whereClauses.push('created_at >= ?');
                    whereParams.push(`${fechaDesde} 00:00:00`);
                }
                if (fechaHasta) {
                    whereClauses.push('created_at <= ?');
                    whereParams.push(`${fechaHasta} 23:59:59`);
                }

                const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

                const [cntRows] = await pool.query(`SELECT COUNT(*) as cant FROM logs_emails ${whereSql}`, whereParams);
                emailCount = cntRows[0]?.cant || 0;

                const [rows] = await pool.query(`
                    SELECT 
                        id,
                        'email' as categoria_log,
                        reclamo_id,
                        destinatario_tipo,
                        destinatario_email,
                        tipo_disparo,
                        asunto,
                        motivo,
                        mensaje_resumen,
                        cuerpo_html,
                        actor,
                        actor_email,
                        reintento_nro,
                        estado_envio,
                        error_mensaje,
                        metadata,
                        created_at
                    FROM logs_emails
                    ${whereSql}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                `, [...whereParams, parsedLimit, offset]);

                emailRows = rows;
            }

            // 2. Logs de Configuración
            let configRows = [];
            let configCount = 0;
            if (categoria === 'all' || categoria === 'configuracion') {
                let whereClauses = [];
                let whereParams = [];

                if (modulo && modulo !== 'all') {
                    whereClauses.push('modulo = ?');
                    whereParams.push(modulo);
                }
                if (search && search.trim()) {
                    whereClauses.push('(modulo LIKE ? OR descripcion LIKE ? OR actor_email LIKE ? OR accion LIKE ?)');
                    const s = `%${search.trim()}%`;
                    whereParams.push(s, s, s, s);
                }
                if (fechaDesde) {
                    whereClauses.push('created_at >= ?');
                    whereParams.push(`${fechaDesde} 00:00:00`);
                }
                if (fechaHasta) {
                    whereClauses.push('created_at <= ?');
                    whereParams.push(`${fechaHasta} 23:59:59`);
                }

                const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

                const [cntRows] = await pool.query(`SELECT COUNT(*) as cant FROM logs_configuracion ${whereSql}`, whereParams);
                configCount = cntRows[0]?.cant || 0;

                const [rows] = await pool.query(`
                    SELECT 
                        id,
                        'configuracion' as categoria_log,
                        modulo,
                        accion,
                        descripcion,
                        actor,
                        actor_email,
                        valores_anteriores,
                        valores_nuevos,
                        ip_address,
                        created_at
                    FROM logs_configuracion
                    ${whereSql}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                `, [...whereParams, parsedLimit, offset]);

                configRows = rows;
            }

            // Unificar y ordenar si categoría es 'all'
            let combined = [];
            let totalRecords = 0;

            if (categoria === 'emails') {
                combined = emailRows;
                totalRecords = emailCount;
            } else if (categoria === 'configuracion') {
                combined = configRows;
                totalRecords = configCount;
            } else {
                combined = [...emailRows, ...configRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, parsedLimit);
                totalRecords = emailCount + configCount;
            }

            return {
                logs: combined,
                total: totalRecords,
                emailCount,
                configCount,
                page: parseInt(page, 10),
                limit: parsedLimit,
                totalPages: Math.ceil(totalRecords / parsedLimit) || 1
            };
        } catch (err) {
            console.error('[SYSTEM-LOG-SERVICE ERROR] Error al consultar logs:', err.message);
            throw err;
        }
    }

    /**
     * Métricas rápidas para dashboards y tarjetas de KPI
     */
    async getStats() {
        try {
            const [[emailStats]] = await pool.query(`
                SELECT 
                    COUNT(*) as total_emails,
                    SUM(CASE WHEN tipo_disparo = 'automatico' THEN 1 ELSE 0 END) as automaticos,
                    SUM(CASE WHEN tipo_disparo = 'manual' THEN 1 ELSE 0 END) as manuales,
                    SUM(CASE WHEN estado_envio = 'fallido' THEN 1 ELSE 0 END) as fallidos,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as hoy_emails
                FROM logs_emails
            `);

            const [[configStats]] = await pool.query(`
                SELECT 
                    COUNT(*) as total_modificaciones,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as hoy_modificaciones
                FROM logs_configuracion
            `);

            return {
                total_emails: emailStats?.total_emails || 0,
                automaticos: emailStats?.automaticos || 0,
                manuales: emailStats?.manuales || 0,
                fallidos: emailStats?.fallidos || 0,
                hoy_emails: emailStats?.hoy_emails || 0,
                total_modificaciones: configStats?.total_modificaciones || 0,
                hoy_modificaciones: configStats?.hoy_modificaciones || 0
            };
        } catch (err) {
            console.error('[SYSTEM-LOG-SERVICE STATS ERROR]:', err.message);
            return {
                total_emails: 0,
                automaticos: 0,
                manuales: 0,
                fallidos: 0,
                hoy_emails: 0,
                total_modificaciones: 0,
                hoy_modificaciones: 0
            };
        }
    }
}

module.exports = new SystemLogService();
