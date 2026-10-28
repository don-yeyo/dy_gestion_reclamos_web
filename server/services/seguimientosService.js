const { pool } = require('../config/database');

class SeguimientosService {
    /**
     * Obtiene todas las reglas de seguimiento con JOIN a estados y prioridades
     * Incluye cálculo del intervalo N = (SLA - Disparo Inicial) / Repeticiones
     */
    async getAll(filters = {}) {
        let sql = `
            SELECT 
                s.id,
                s.rol,
                s.estado_codigo,
                COALESCE(e.nombre, s.estado_codigo) AS estado_nombre,
                COALESCE(e.descripcion, '') AS estado_descripcion,
                COALESCE(e.color, '#64748b') AS estado_color,
                s.prioridad_codigo,
                COALESCE(p.nombre, CONCAT('Prioridad ', s.prioridad_codigo)) AS prioridad_nombre,
                COALESCE(p.color, '#3b82f6') AS prioridad_color,
                COALESCE(p.sla, 3) AS sla_dias,
                CAST(s.disparo_dias AS DECIMAL(6,2)) AS disparo_dias,
                s.repeticiones,
                s.emails_elevacion,
                s.activo,
                s.created_at,
                s.updated_at
            FROM workflow_seguimientos s
            LEFT JOIN workflow_estados e 
                ON s.rol = e.actor AND s.estado_codigo = e.codigo
            LEFT JOIN workflow_prioridades p 
                ON s.prioridad_codigo = p.codigo
            WHERE 1=1
        `;

        const params = [];

        if (filters.rol) {
            sql += ` AND s.rol = ?`;
            params.push(filters.rol);
        }

        if (filters.prioridad_codigo) {
            sql += ` AND s.prioridad_codigo = ?`;
            params.push(Number(filters.prioridad_codigo));
        }

        if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
            sql += ` AND s.activo = ?`;
            params.push(filters.activo === 'true' || filters.activo === true || filters.activo === 1 ? 1 : 0);
        }

        sql += ` ORDER BY FIELD(s.rol, 'supervisor', 'inocuidad', 'consumidor', 'admin'), s.prioridad_codigo ASC, s.estado_codigo ASC`;

        const [rows] = await pool.query(sql, params);

        return rows.map(r => {
            const sla = Number(r.sla_dias) || 1;
            const disparo = Number(r.disparo_dias) || 0;
            const reps = Number(r.repeticiones) || 1;
            const remanente = Math.max(0, sla - disparo);
            const nDias = Number((remanente / reps).toFixed(2));
            const nHoras = Math.round((remanente * 24 / reps) * 10) / 10;

            return {
                id: r.id,
                rol: r.rol,
                estado_codigo: r.estado_codigo,
                estado_nombre: r.estado_nombre,
                estado_descripcion: r.estado_descripcion,
                estado_color: r.estado_color,
                prioridad_codigo: Number(r.prioridad_codigo),
                prioridad_nombre: r.prioridad_nombre,
                prioridad_color: r.prioridad_color,
                sla_dias: sla,
                disparo_dias: Number(r.disparo_dias),
                repeticiones: reps,
                intervalo_n_dias: nDias,
                intervalo_n_horas: nHoras,
                emails_elevacion: r.emails_elevacion || '',
                activo: Boolean(r.activo),
                created_at: r.created_at,
                updated_at: r.updated_at
            };
        });
    }

    /**
     * Obtiene una regla por su ID
     */
    async getById(id) {
        const rows = await this.getAll();
        return rows.find(r => r.id === Number(id)) || null;
    }

    /**
     * Crea una nueva regla de seguimiento
     */
    async create(data, userEmail = 'sistema') {
        const {
            rol,
            estado_codigo,
            prioridad_codigo,
            disparo_dias = 3,
            repeticiones = 3,
            emails_elevacion = '',
            activo = 1
        } = data;

        if (!rol || !estado_codigo || !prioridad_codigo) {
            throw new Error('Debe especificar rol, estado y prioridad para la regla.');
        }

        const disparoNum = parseFloat(disparo_dias);
        if (isNaN(disparoNum) || disparoNum <= 0) {
            throw new Error('El disparo de seguimiento debe ser un número de días mayor a 0.');
        }

        const repeticionesNum = parseInt(repeticiones, 10);
        if (isNaN(repeticionesNum) || repeticionesNum < 1) {
            throw new Error('La cantidad de repeticiones debe ser un número entero mayor o igual a 1.');
        }

        // Validar que el disparo inicial no supere el SLA de la prioridad seleccionada
        const [prioRows] = await pool.query('SELECT sla FROM workflow_prioridades WHERE codigo = ?', [Number(prioridad_codigo)]);
        const slaPrioridad = prioRows && prioRows.length > 0 ? Number(prioRows[0].sla) : null;
        if (slaPrioridad !== null && disparoNum > slaPrioridad) {
            throw new Error(`El disparo inicial (${disparoNum} días) no puede ser superior al SLA de la prioridad seleccionada (${slaPrioridad} días).`);
        }

        // Validar que no exista regla repetida para el mismo rol, estado y prioridad
        const [duplicados] = await pool.query(
            'SELECT id FROM workflow_seguimientos WHERE rol = ? AND estado_codigo = ? AND prioridad_codigo = ?',
            [rol.toLowerCase().trim(), estado_codigo.trim(), Number(prioridad_codigo)]
        );
        if (duplicados && duplicados.length > 0) {
            throw new Error(`Ya existe una regla configurada para el Rol "${rol}", Estado "${estado_codigo}" y Prioridad ${prioridad_codigo}. No se permiten reglas repetidas.`);
        }

        try {
            const [result] = await pool.query(
                `INSERT INTO workflow_seguimientos 
                    (rol, estado_codigo, prioridad_codigo, disparo_dias, repeticiones, emails_elevacion, activo)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    rol.toLowerCase().trim(),
                    estado_codigo.trim(),
                    Number(prioridad_codigo),
                    disparoNum,
                    repeticionesNum,
                    (emails_elevacion || '').trim(),
                    activo ? 1 : 0
                ]
            );

            console.log(`[SEGUIMIENTOS] Regla ID ${result.insertId} creada por ${userEmail}`);
            return await this.getById(result.insertId);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error(`Ya existe una regla configurada para el Rol "${rol}", Estado "${estado_codigo}" y Prioridad ${prioridad_codigo}. No se permiten reglas repetidas.`);
            }
            throw err;
        }
    }

    /**
     * Actualiza una regla existente
     */
    async update(id, data, userEmail = 'sistema') {
        const existente = await this.getById(id);
        if (!existente) {
            throw new Error('Regla de seguimiento no encontrada.');
        }

        const rol = data.rol !== undefined ? data.rol.toLowerCase().trim() : existente.rol;
        const estado_codigo = data.estado_codigo !== undefined ? data.estado_codigo.trim() : existente.estado_codigo;
        const prioridad_codigo = data.prioridad_codigo !== undefined ? Number(data.prioridad_codigo) : existente.prioridad_codigo;
        
        let disparoNum = existente.disparo_dias;
        if (data.disparo_dias !== undefined) {
            disparoNum = parseFloat(data.disparo_dias);
            if (isNaN(disparoNum) || disparoNum <= 0) {
                throw new Error('El disparo de seguimiento debe ser un número de días mayor a 0.');
            }
        }

        let repeticionesNum = existente.repeticiones;
        if (data.repeticiones !== undefined) {
            repeticionesNum = parseInt(data.repeticiones, 10);
            if (isNaN(repeticionesNum) || repeticionesNum < 1) {
                throw new Error('La cantidad de repeticiones debe ser un número entero mayor o igual a 1.');
            }
        }

        const emails_elevacion = data.emails_elevacion !== undefined 
            ? (data.emails_elevacion || '').trim() 
            : existente.emails_elevacion;

        const activo = data.activo !== undefined ? (data.activo ? 1 : 0) : (existente.activo ? 1 : 0);

        // Validar que el disparo inicial no supere el SLA de la prioridad
        const [prioRowsUpdate] = await pool.query('SELECT sla FROM workflow_prioridades WHERE codigo = ?', [prioridad_codigo]);
        const slaPrioridadUpdate = prioRowsUpdate && prioRowsUpdate.length > 0 ? Number(prioRowsUpdate[0].sla) : null;
        if (slaPrioridadUpdate !== null && disparoNum > slaPrioridadUpdate) {
            throw new Error(`El disparo inicial (${disparoNum} días) no puede ser superior al SLA de la prioridad seleccionada (${slaPrioridadUpdate} días).`);
        }

        // Validar que no exista otra regla repetida para el mismo rol, estado y prioridad
        const [duplicados] = await pool.query(
            'SELECT id FROM workflow_seguimientos WHERE rol = ? AND estado_codigo = ? AND prioridad_codigo = ? AND id != ?',
            [rol, estado_codigo, prioridad_codigo, id]
        );
        if (duplicados && duplicados.length > 0) {
            throw new Error(`Ya existe otra regla configurada para el Rol "${rol}", Estado "${estado_codigo}" y Prioridad ${prioridad_codigo}. No se permiten reglas repetidas.`);
        }

        try {
            await pool.query(
                `UPDATE workflow_seguimientos 
                 SET rol = ?, estado_codigo = ?, prioridad_codigo = ?, disparo_dias = ?, repeticiones = ?, emails_elevacion = ?, activo = ?
                 WHERE id = ?`,
                [rol, estado_codigo, prioridad_codigo, disparoNum, repeticionesNum, emails_elevacion, activo, id]
            );

            console.log(`[SEGUIMIENTOS] Regla ID ${id} actualizada por ${userEmail}`);
            return await this.getById(id);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error(`Ya existe otra regla configurada para el Rol "${rol}", Estado "${estado_codigo}" y Prioridad ${prioridad_codigo}. No se permiten reglas repetidas.`);
            }
            throw err;
        }
    }

    /**
     * Alterna estado activo/inactivo de una regla
     */
    async toggleActivo(id, userEmail = 'sistema') {
        const existente = await this.getById(id);
        if (!existente) {
            throw new Error('Regla de seguimiento no encontrada.');
        }

        const nuevoActivo = existente.activo ? 0 : 1;
        await pool.query('UPDATE workflow_seguimientos SET activo = ? WHERE id = ?', [nuevoActivo, id]);
        console.log(`[SEGUIMIENTOS] Regla ID ${id} estado activo cambiado a ${nuevoActivo} por ${userEmail}`);
        return await this.getById(id);
    }

    /**
     * Elimina una regla
     */
    async delete(id, userEmail = 'sistema') {
        const existente = await this.getById(id);
        if (!existente) {
            throw new Error('Regla de seguimiento no encontrada.');
        }

        await pool.query('DELETE FROM workflow_seguimientos WHERE id = ?', [id]);
        console.log(`[SEGUIMIENTOS] Regla ID ${id} eliminada por ${userEmail}`);
        return true;
    }
}

module.exports = new SeguimientosService();
