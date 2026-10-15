const { pool } = require('../config/database');

class ReclamosDatabaseService {
    /**
     * Mapea un objeto Reclamo (formato canónico de Google Sheets) a la fila en MySQL
     */
    mapClaimToDbRow(claim) {
        return {
            id: String(claim.id).trim(),
            id_num: parseInt(claim.idNum || claim.id, 10) || 0,
            cliente: claim.cliente || 'Consumidor',
            fecha_alta: claim.fecha_alta || '',
            mes: claim.mes || '',
            nombre: claim.nombre || '',
            apellido: claim.apellido || '',
            domicilio: claim.domicilio || '',
            telefono: claim.telefono || '',
            email: claim.email || '',
            localidad: claim.localidad || '',
            provincia: claim.provincia || '',
            supervisor: claim.supervisor || 'Sin asignar',
            supervisor_email: claim.supervisor_email || '',
            via_contacto: claim.via_contacto || 'Web',
            no_resuelto: claim.no_resuelto !== undefined ? claim.no_resuelto : 1,
            comercio_compra: claim.comercio_compra || '',
            latitud: claim.latitud || '',
            longitud: claim.longitud || '',
            codigo_postal: claim.codigo_postal || '',
            evidencia_zip: claim.evidencia_zip || '',
            fecha_carga: claim.fecha_carga ? new Date(claim.fecha_carga) : null,
            estado_admin: claim.estado_admin || 'Pendiente',
            admin_motivo_desaprobado: claim.admin_motivo_desaprobado || '',
            estado_supervisor: claim.estado_supervisor || 'Pendiente',
            supervisor_motivo_imposibilidad: claim.supervisor_motivo_imposibilidad || '',
            estado_consumidor: claim.estado_consumidor || 'Pendiente',
            estado_inocuidad: claim.estado_inocuidad || 'Sin acciones',
            row_numbers: JSON.stringify(claim.rowNumbers || [])
        };
    }

    /**
     * Inserta o actualiza un Reclamo completo con sus items en MySQL
     */
    async upsertReclamo(claim) {
        const row = this.mapClaimToDbRow(claim);
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const sqlReclamo = `
                INSERT INTO reclamos (
                    id, id_num, cliente, fecha_alta, mes, nombre, apellido,
                    domicilio, telefono, email, localidad, provincia, supervisor,
                    supervisor_email, via_contacto, no_resuelto, comercio_compra,
                    latitud, longitud, codigo_postal, evidencia_zip, fecha_carga,
                    estado_admin, admin_motivo_desaprobado, estado_supervisor,
                    supervisor_motivo_imposibilidad, estado_consumidor, estado_inocuidad,
                    row_numbers, sync_sheet_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                ON DUPLICATE KEY UPDATE
                    id_num = VALUES(id_num),
                    cliente = VALUES(cliente),
                    fecha_alta = VALUES(fecha_alta),
                    mes = VALUES(mes),
                    nombre = VALUES(nombre),
                    apellido = VALUES(apellido),
                    domicilio = VALUES(domicilio),
                    telefono = VALUES(telefono),
                    email = VALUES(email),
                    localidad = VALUES(localidad),
                    provincia = VALUES(provincia),
                    supervisor = VALUES(supervisor),
                    supervisor_email = VALUES(supervisor_email),
                    via_contacto = VALUES(via_contacto),
                    no_resuelto = VALUES(no_resuelto),
                    comercio_compra = VALUES(comercio_compra),
                    latitud = VALUES(latitud),
                    longitud = VALUES(longitud),
                    codigo_postal = VALUES(codigo_postal),
                    evidencia_zip = VALUES(evidencia_zip),
                    fecha_carga = VALUES(fecha_carga),
                    estado_admin = VALUES(estado_admin),
                    admin_motivo_desaprobado = VALUES(admin_motivo_desaprobado),
                    estado_supervisor = VALUES(estado_supervisor),
                    supervisor_motivo_imposibilidad = VALUES(supervisor_motivo_imposibilidad),
                    estado_consumidor = VALUES(estado_consumidor),
                    estado_inocuidad = VALUES(estado_inocuidad),
                    row_numbers = VALUES(row_numbers),
                    sync_sheet_status = 'synced';
            `;

            await connection.execute(sqlReclamo, [
                row.id, row.id_num, row.cliente, row.fecha_alta, row.mes, row.nombre, row.apellido,
                row.domicilio, row.telefono, row.email, row.localidad, row.provincia, row.supervisor,
                row.supervisor_email, row.via_contacto, row.no_resuelto, row.comercio_compra,
                row.latitud, row.longitud, row.codigo_postal, row.evidencia_zip, row.fecha_carga,
                row.estado_admin, row.admin_motivo_desaprobado, row.estado_supervisor,
                row.supervisor_motivo_imposibilidad, row.estado_consumidor, row.estado_inocuidad,
                row.row_numbers
            ]);

            // Reemplazar items del reclamo
            await connection.execute('DELETE FROM reclamo_items WHERE reclamo_id = ?', [row.id]);

            if (Array.isArray(claim.items) && claim.items.length > 0) {
                const itemSql = `
                    INSERT INTO reclamo_items (
                        reclamo_id, item_row_number, categoria, producto, defecto, cantidad,
                        vto_reclamo, producto_cortesia, lote, hora, vto, descripcion, marca, conserva_envase
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                for (const it of claim.items) {
                    await connection.execute(itemSql, [
                        row.id,
                        it.rowNumber || null,
                        it.categoria || '',
                        it.producto || '',
                        it.defecto || '',
                        String(it.cantidad || '1'),
                        it.vto_reclamo || '',
                        it.producto_cortesia || '',
                        it.lote || '',
                        it.hora || '',
                        it.vto || '',
                        it.descripcion || '',
                        it.marca || 'Don Yeyo',
                        it.conserva_envase || 'Sí'
                    ]);
                }
            }

            await connection.commit();
            return true;
        } catch (err) {
            await connection.rollback();
            console.error(`[DB ERROR] Error en upsertReclamo para #${claim.id}:`, err.message);
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Sincronización masiva de reclamos desde Google Sheets hacia MySQL mediante batch inserts optimizados
     */
    async syncAllFromSheets(claimsList) {
        if (!Array.isArray(claimsList) || claimsList.length === 0) return 0;
        console.log(`[SYNC] Iniciando sincronización masiva de ${claimsList.length} reclamos hacia MySQL...`);
        
        const chunkSize = 150;
        let count = 0;

        for (let i = 0; i < claimsList.length; i += chunkSize) {
            const chunk = claimsList.slice(i, i + chunkSize);
            const connection = await pool.getConnection();

            try {
                await connection.beginTransaction();

                const reclamosValues = [];
                const claimIds = [];
                const itemsValues = [];

                for (const claim of chunk) {
                    const row = this.mapClaimToDbRow(claim);
                    claimIds.push(row.id);
                    reclamosValues.push([
                        row.id, row.id_num, row.cliente, row.fecha_alta, row.mes, row.nombre, row.apellido,
                        row.domicilio, row.telefono, row.email, row.localidad, row.provincia, row.supervisor,
                        row.supervisor_email, row.via_contacto, row.no_resuelto, row.comercio_compra,
                        row.latitud, row.longitud, row.codigo_postal, row.evidencia_zip, row.fecha_carga,
                        row.estado_admin, row.admin_motivo_desaprobado, row.estado_supervisor,
                        row.supervisor_motivo_imposibilidad, row.estado_consumidor, row.estado_inocuidad,
                        row.row_numbers, 'synced'
                    ]);

                    if (Array.isArray(claim.items)) {
                        for (const it of claim.items) {
                            itemsValues.push([
                                row.id,
                                it.rowNumber || null,
                                it.categoria || '',
                                it.producto || '',
                                it.defecto || '',
                                String(it.cantidad || '1'),
                                it.vto_reclamo || '',
                                it.producto_cortesia || '',
                                it.lote || '',
                                it.hora || '',
                                it.vto || '',
                                it.descripcion || '',
                                it.marca || 'Don Yeyo',
                                it.conserva_envase || 'Sí'
                            ]);
                        }
                    }
                }

                if (reclamosValues.length > 0) {
                    const sqlReclamos = `
                        INSERT INTO reclamos (
                            id, id_num, cliente, fecha_alta, mes, nombre, apellido,
                            domicilio, telefono, email, localidad, provincia, supervisor,
                            supervisor_email, via_contacto, no_resuelto, comercio_compra,
                            latitud, longitud, codigo_postal, evidencia_zip, fecha_carga,
                            estado_admin, admin_motivo_desaprobado, estado_supervisor,
                            supervisor_motivo_imposibilidad, estado_consumidor, estado_inocuidad,
                            row_numbers, sync_sheet_status
                        ) VALUES ?
                        ON DUPLICATE KEY UPDATE
                            id_num = VALUES(id_num),
                            cliente = VALUES(cliente),
                            fecha_alta = VALUES(fecha_alta),
                            mes = VALUES(mes),
                            nombre = VALUES(nombre),
                            apellido = VALUES(apellido),
                            domicilio = VALUES(domicilio),
                            telefono = VALUES(telefono),
                            email = VALUES(email),
                            localidad = VALUES(localidad),
                            provincia = VALUES(provincia),
                            supervisor = VALUES(supervisor),
                            supervisor_email = VALUES(supervisor_email),
                            via_contacto = VALUES(via_contacto),
                            no_resuelto = VALUES(no_resuelto),
                            comercio_compra = VALUES(comercio_compra),
                            latitud = VALUES(latitud),
                            longitud = VALUES(longitud),
                            codigo_postal = VALUES(codigo_postal),
                            evidencia_zip = VALUES(evidencia_zip),
                            fecha_carga = VALUES(fecha_carga),
                            estado_admin = VALUES(estado_admin),
                            admin_motivo_desaprobado = VALUES(admin_motivo_desaprobado),
                            estado_supervisor = VALUES(estado_supervisor),
                            supervisor_motivo_imposibilidad = VALUES(supervisor_motivo_imposibilidad),
                            estado_consumidor = VALUES(estado_consumidor),
                            estado_inocuidad = VALUES(estado_inocuidad),
                            row_numbers = VALUES(row_numbers),
                            sync_sheet_status = 'synced';
                    `;
                    await connection.query(sqlReclamos, [reclamosValues]);
                }

                if (claimIds.length > 0) {
                    const placeholders = claimIds.map(() => '?').join(',');
                    await connection.query(`DELETE FROM reclamo_items WHERE reclamo_id IN (${placeholders})`, claimIds);
                }

                if (itemsValues.length > 0) {
                    const sqlItems = `
                        INSERT INTO reclamo_items (
                            reclamo_id, item_row_number, categoria, producto, defecto, cantidad,
                            vto_reclamo, producto_cortesia, lote, hora, vto, descripcion, marca, conserva_envase
                        ) VALUES ?
                    `;
                    await connection.query(sqlItems, [itemsValues]);
                }

                await connection.commit();
                count += chunk.length;
            } catch (err) {
                await connection.rollback();
                console.error(`[SYNC ERROR] Fallo en chunk ${i} - ${i + chunkSize}:`, err.message);
            } finally {
                connection.release();
            }
        }

        console.log(`[SYNC] Sincronización masiva finalizada con éxito. ${count}/${claimsList.length} reclamos sincronizados.`);
        return count;
    }

    /**
     * Obtiene todos los reclamos desde MySQL con sus items asociados
     */
    async getReclamos(cutoffId = null) {
        const cutoff = cutoffId !== null ? parseInt(cutoffId, 10) : parseInt(process.env.RECLAMOS_NUMERO_CORTE || '0', 10);
        
        let query = 'SELECT * FROM reclamos';
        const params = [];

        if (!isNaN(cutoff) && cutoff > 0) {
            query += ' WHERE id_num >= ?';
            params.push(cutoff);
        }

        query += ' ORDER BY id_num DESC;';

        const [rows] = await pool.execute(query, params);
        if (rows.length === 0) return [];

        // Obtener todos los items para estos reclamos
        const claimIds = rows.map(r => r.id);
        const placeholders = claimIds.map(() => '?').join(',');
        const [itemRows] = await pool.query(
            `SELECT * FROM reclamo_items WHERE reclamo_id IN (${placeholders}) ORDER BY id ASC`,
            claimIds
        );

        const itemsByClaim = new Map();
        for (const it of itemRows) {
            if (!itemsByClaim.has(it.reclamo_id)) {
                itemsByClaim.set(it.reclamo_id, []);
            }
            itemsByClaim.get(it.reclamo_id).push({
                rowNumber: it.item_row_number,
                categoria: it.categoria,
                producto: it.producto,
                defecto: it.defecto,
                cantidad: it.cantidad,
                vto_reclamo: it.vto_reclamo,
                producto_cortesia: it.producto_cortesia,
                lote: it.lote,
                hora: it.hora,
                vto: it.vto,
                descripcion: it.descripcion,
                marca: it.marca,
                conserva_envase: it.conserva_envase
            });
        }

        return rows.map(r => ({
            id: r.id,
            idNum: r.id_num,
            rowNumbers: typeof r.row_numbers === 'string' ? JSON.parse(r.row_numbers) : (r.row_numbers || []),
            cliente: r.cliente,
            fecha_alta: r.fecha_alta,
            mes: r.mes,
            nombre: r.nombre,
            apellido: r.apellido,
            domicilio: r.domicilio,
            telefono: r.telefono,
            email: r.email,
            localidad: r.localidad,
            provincia: r.provincia,
            supervisor: r.supervisor,
            supervisor_email: r.supervisor_email,
            via_contacto: r.via_contacto,
            no_resuelto: r.no_resuelto,
            comercio_compra: r.comercio_compra,
            latitud: r.latitud,
            longitud: r.longitud,
            codigo_postal: r.codigo_postal,
            evidencia_zip: r.evidencia_zip,
            fecha_carga: r.fecha_carga ? r.fecha_carga.toISOString() : '',
            estado_admin: r.estado_admin,
            fecha_estado_admin: r.fecha_estado_admin ? r.fecha_estado_admin.toISOString() : (r.fecha_carga ? r.fecha_carga.toISOString() : (r.created_at ? new Date(r.created_at).toISOString() : null)),
            admin_motivo_desaprobado: r.admin_motivo_desaprobado,
            estado_supervisor: r.estado_supervisor,
            fecha_estado_supervisor: r.fecha_estado_supervisor ? r.fecha_estado_supervisor.toISOString() : null,
            supervisor_motivo_imposibilidad: r.supervisor_motivo_imposibilidad,
            estado_consumidor: r.estado_consumidor,
            fecha_estado_consumidor: r.fecha_estado_consumidor ? r.fecha_estado_consumidor.toISOString() : null,
            estado_inocuidad: r.estado_inocuidad,
            fecha_estado_inocuidad: r.fecha_estado_inocuidad ? r.fecha_estado_inocuidad.toISOString() : null,
            items: itemsByClaim.get(r.id) || []
        }));
    }

    /**
     * Obtiene un reclamo específico por ID desde MySQL
     */
    async getReclamoById(claimId) {
        const [rows] = await pool.execute('SELECT * FROM reclamos WHERE id = ? LIMIT 1', [String(claimId)]);
        if (rows.length === 0) return null;

        const r = rows[0];
        const [items] = await pool.execute(
            'SELECT * FROM reclamo_items WHERE reclamo_id = ? ORDER BY id ASC',
            [String(claimId)]
        );

        return {
            id: r.id,
            idNum: r.id_num,
            rowNumbers: typeof r.row_numbers === 'string' ? JSON.parse(r.row_numbers) : (r.row_numbers || []),
            cliente: r.cliente,
            fecha_alta: r.fecha_alta,
            mes: r.mes,
            nombre: r.nombre,
            apellido: r.apellido,
            domicilio: r.domicilio,
            telefono: r.telefono,
            email: r.email,
            localidad: r.localidad,
            provincia: r.provincia,
            supervisor: r.supervisor,
            supervisor_email: r.supervisor_email,
            via_contacto: r.via_contacto,
            no_resuelto: r.no_resuelto,
            comercio_compra: r.comercio_compra,
            latitud: r.latitud,
            longitud: r.longitud,
            codigo_postal: r.codigo_postal,
            evidencia_zip: r.evidencia_zip,
            fecha_carga: r.fecha_carga ? r.fecha_carga.toISOString() : '',
            estado_admin: r.estado_admin,
            fecha_estado_admin: r.fecha_estado_admin ? r.fecha_estado_admin.toISOString() : (r.fecha_carga ? r.fecha_carga.toISOString() : (r.created_at ? new Date(r.created_at).toISOString() : null)),
            admin_motivo_desaprobado: r.admin_motivo_desaprobado,
            estado_supervisor: r.estado_supervisor,
            fecha_estado_supervisor: r.fecha_estado_supervisor ? r.fecha_estado_supervisor.toISOString() : null,
            supervisor_motivo_imposibilidad: r.supervisor_motivo_imposibilidad,
            estado_consumidor: r.estado_consumidor,
            fecha_estado_consumidor: r.fecha_estado_consumidor ? r.fecha_estado_consumidor.toISOString() : null,
            estado_inocuidad: r.estado_inocuidad,
            fecha_estado_inocuidad: r.fecha_estado_inocuidad ? r.fecha_estado_inocuidad.toISOString() : null,
            items: items.map(it => ({
                rowNumber: it.item_row_number,
                categoria: it.categoria,
                producto: it.producto,
                defecto: it.defecto,
                cantidad: it.cantidad,
                vto_reclamo: it.vto_reclamo,
                producto_cortesia: it.producto_cortesia,
                lote: it.lote,
                hora: it.hora,
                vto: it.vto,
                descripcion: it.descripcion,
                marca: it.marca,
                conserva_envase: it.conserva_envase
            }))
        };
    }

    /**
     * Mapeo de columnas de Google Sheets a columnas de la base de datos MySQL
     */
    static sheetColToDbCol(col) {
        const mapping = {
            'AO': 'estado_admin',
            'AP': 'admin_motivo_desaprobado',
            'AQ': 'estado_supervisor',
            'AR': 'supervisor_motivo_imposibilidad',
            'AS': 'estado_consumidor',
            'AT': 'estado_inocuidad',
            'L': 'supervisor',
            'AG': 'supervisor_email'
        };
        return mapping[col] || null;
    }

    /**
     * Actualiza campos de un reclamo en MySQL y registra auditoría
     * @param {string|number} claimId ID del reclamo
     * @param {Object} updatesUpdates Columnas Sheets (ej: { 'AO': 'En curso', 'AP': '' }) o campos directos
     * @param {Object} auditInfo { actor, actorEmail, motivo, metadata }
     */
    async updateReclamo(claimId, updates, auditInfo = {}) {
        const idStr = String(claimId);
        const currentClaim = await this.getReclamoById(idStr);

        // Convertir actualizaciones a campos de MySQL
        const dbUpdates = {};
        for (const [key, val] of Object.entries(updates)) {
            const mapped = ReclamosDatabaseService.sheetColToDbCol(key) || key;
            dbUpdates[mapped] = val;
        }

        // Registrar timestamp exacto del cambio de estado si se actualiza alguno
        const now = new Date();
        if (dbUpdates.estado_admin !== undefined) {
            dbUpdates.fecha_estado_admin = now;
        }
        if (dbUpdates.estado_supervisor !== undefined) {
            dbUpdates.fecha_estado_supervisor = now;
        }
        if (dbUpdates.estado_consumidor !== undefined) {
            dbUpdates.fecha_estado_consumidor = now;
        }
        if (dbUpdates.estado_inocuidad !== undefined) {
            dbUpdates.fecha_estado_inocuidad = now;
        }

        const fields = Object.keys(dbUpdates);
        if (fields.length === 0) return true;

        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => dbUpdates[f]);
        values.push(idStr);

        await pool.execute(
            `UPDATE reclamos SET ${setClause}, sync_sheet_status = 'synced', last_synced_at = NOW() WHERE id = ?`,
            values
        );

        // Registrar auditoría por cada campo relevante modificado
        const actor = auditInfo.actor || 'sistema';
        const actorEmail = auditInfo.actorEmail || null;
        const motivo = auditInfo.motivo || dbUpdates.admin_motivo_desaprobado || dbUpdates.supervisor_motivo_imposibilidad || null;

        for (const [field, newVal] of Object.entries(dbUpdates)) {
            const oldVal = currentClaim ? currentClaim[field] : null;
            if (oldVal !== newVal) {
                await this.logAudit({
                    reclamo_id: idStr,
                    actor,
                    actor_email: actorEmail,
                    campo_modificado: field,
                    valor_anterior: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
                    valor_nuevo: newVal !== undefined && newVal !== null ? String(newVal) : '',
                    motivo,
                    metadata: auditInfo.metadata || null
                });
            }
        }

        return true;
    }

    /**
     * Registra un evento en la tabla de auditoría
     */
    async logAudit({ reclamo_id, actor, actor_email, campo_modificado, valor_anterior, valor_nuevo, motivo, metadata }) {
        try {
            await pool.execute(`
                INSERT INTO auditoria_reclamos (
                    reclamo_id, actor, actor_email, campo_modificado, valor_anterior, valor_nuevo, motivo, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                String(reclamo_id),
                actor || 'sistema',
                actor_email || null,
                campo_modificado,
                valor_anterior || null,
                valor_nuevo || null,
                motivo || null,
                metadata ? JSON.stringify(metadata) : null
            ]);
        } catch (err) {
            console.error('[AUDITORIA ERROR] Fallo al insertar log de auditoría:', err.message);
        }
    }

    /**
     * Consulta el historial de auditoría de un reclamo
     */
    async getAuditLog(claimId) {
        const [rows] = await pool.execute(
            'SELECT * FROM auditoria_reclamos WHERE reclamo_id = ? ORDER BY created_at DESC',
            [String(claimId)]
        );
        return rows;
    }

    /**
     * Registra una notificación en seguimiento_notificaciones
     */
    async logNotification({ reclamo_id, destinatario_tipo, destinatario_email, tipo_notificacion, reintento_nro, estado_envio, error_mensaje }) {
        try {
            await pool.execute(`
                INSERT INTO seguimiento_notificaciones (
                    reclamo_id, destinatario_tipo, destinatario_email, tipo_notificacion, reintento_nro, estado_envio, error_mensaje
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                String(reclamo_id),
                destinatario_tipo,
                destinatario_email,
                tipo_notificacion,
                reintento_nro || 1,
                estado_envio || 'enviado',
                error_mensaje || null
            ]);
        } catch (e) {
            console.error('[NOTIFICATION LOG ERROR]', e.message);
        }
    }

    /**
     * Obtiene cantidad de notificaciones enviadas a un destinatario para un reclamo
     */
    async getNotificationCount(claimId, destinatarioTipo) {
        const [rows] = await pool.execute(
            'SELECT COUNT(*) as count FROM seguimiento_notificaciones WHERE reclamo_id = ? AND destinatario_tipo = ? AND estado_envio = "enviado"',
            [String(claimId), destinatarioTipo]
        );
        return rows[0] ? rows[0].count : 0;
    }

    /**
     * Verifica si se cumplen las condiciones para pasar automáticamente estado_admin a "Finalizado":
     * 1. Reclamo aprobado previamente por admin (no 'Pendiente', no 'Desaprobado', no 'Finalizado').
     * 2. Inocuidad: cambió su estado de 'Pendiente' a otro de sus estados.
     * 3. Supervisor: cambió su estado a 'Resuelto' o 'Imposibilidad'.
     * 4. Consumidor: cambió su estado a uno distinto de 'Pendiente', 'En curso' y 'Sin acciones'.
     */
    async checkAndFinalizeAdminState(claimId) {
        try {
            const idStr = String(claimId);
            const claim = await this.getReclamoById(idStr);
            if (!claim) return false;

            const adminState = (claim.estado_admin || '').trim();
            // Debe haber sido aprobado (no en recepción 'Pendiente', ni 'Desaprobado', ni ya 'Finalizado')
            if (adminState === 'Pendiente' || adminState === 'Desaprobado' || adminState === 'Finalizado') {
                return false;
            }

            const inocuidad = (claim.estado_inocuidad || '').trim().toLowerCase();
            const supervisor = (claim.estado_supervisor || '').trim().toLowerCase();
            const consumidor = (claim.estado_consumidor || '').trim().toLowerCase();

            // 1. Inocuidad cambió estado pendiente a otro de sus estados
            const inocuidadOk = inocuidad !== '' && inocuidad !== 'pendiente';

            // 2. Supervisor cambió su estado a resuelto o imposibilidad
            const supervisorOk = supervisor === 'resuelto' || supervisor === 'imposibilidad';

            // 3. Consumidor cambió su estado a uno distinto de "pendiente", "en curso" y "sin acciones"
            const consumidorOk = consumidor !== '' &&
                consumidor !== 'pendiente' &&
                consumidor !== 'en curso' &&
                consumidor !== 'sin acciones';

            if (inocuidadOk && supervisorOk && consumidorOk) {
                console.log(`[AUTO-FINALIZADO] Reclamo #${idStr} cumple las 3 condiciones de cierre. Asumiendo estado_admin como "Finalizado"...`);
                const googleSheetsService = require('./googleSheetsService');
                await googleSheetsService.updateReclamo(idStr, { 'AO': 'Finalizado' }, {
                    actor: 'sistema_auto',
                    motivo: 'Cierre automático: Inocuidad dictaminó, Supervisor finalizó gestión y Consumidor registró respuesta/cierre.'
                });
                return true;
            }
            return false;
        } catch (err) {
            console.error(`[AUTO-FINALIZADO ERROR] Error en checkAndFinalizeAdminState para #${claimId}:`, err.message);
            return false;
        }
    }
}

module.exports = new ReclamosDatabaseService();

