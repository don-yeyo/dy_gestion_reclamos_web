const { pool } = require('../config/database');
const systemLogService = require('./systemLogService');

class ConfiguracionService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiresAt = 0;
        this.CACHE_TTL_MS = 60000; // 1 minuto de caché en memoria
    }

    /**
     * Invalida la caché local
     */
    invalidateCache() {
        this.cache.clear();
        this.cacheExpiresAt = 0;
    }

    /**
     * Carga todas las configuraciones en memoria
     */
    async ensureLoaded() {
        const now = Date.now();
        if (this.cache.size > 0 && now < this.cacheExpiresAt) {
            return;
        }

        try {
            const [rows] = await pool.query('SELECT clave, valor, categoria, etiqueta, descripcion, valor_defecto, updated_at FROM config_sistema');
            this.cache.clear();
            for (const r of rows) {
                const valorEfectivo = (r.valor !== null && r.valor !== undefined && String(r.valor).trim() !== '') 
                    ? r.valor 
                    : r.valor_defecto;

                const itemData = {
                    clave: r.clave,
                    valor: valorEfectivo,
                    categoria: r.categoria,
                    etiqueta: r.etiqueta,
                    descripcion: r.descripcion,
                    valor_defecto: r.valor_defecto,
                    updated_at: r.updated_at
                };

                // Indexar tanto original como minúsculas y mayúsculas para total flexibilidad
                this.cache.set(r.clave, itemData);
                this.cache.set(r.clave.toLowerCase(), itemData);
                this.cache.set(r.clave.toUpperCase(), itemData);
            }
            this.cacheExpiresAt = now + this.CACHE_TTL_MS;
        } catch (err) {
            console.error('[CONFIGURACION] Error cargando configuraciones de base de datos:', err.message);
        }
    }

    /**
     * Obtiene el valor de una clave específica con fallback (insensible a mayúsculas)
     */
    async get(clave, fallback = '') {
        await this.ensureLoaded();
        const normKey = String(clave).trim();
        const item = this.cache.get(normKey) || this.cache.get(normKey.toLowerCase()) || this.cache.get(normKey.toUpperCase());
        if (item && item.valor !== undefined && item.valor !== null && String(item.valor).trim() !== '') {
            return item.valor;
        }
        if (item && item.valor_defecto) {
            return item.valor_defecto;
        }
        return fallback;
    }

    async getAll() {
        await this.ensureLoaded();
        const [rows] = await pool.query('SELECT clave, valor, categoria, etiqueta, descripcion, valor_defecto, updated_at FROM config_sistema ORDER BY clave ASC');
        const items = rows.map(r => ({
            clave: r.clave,
            valor: (r.valor !== null && r.valor !== undefined && String(r.valor).trim() !== '') ? r.valor : r.valor_defecto,
            categoria: r.categoria,
            etiqueta: r.etiqueta,
            descripcion: r.descripcion,
            valor_defecto: r.valor_defecto,
            updated_at: r.updated_at
        }));

        // Agrupación por categoría
        const categorias = {};
        for (const item of items) {
            if (!categorias[item.categoria]) {
                categorias[item.categoria] = [];
            }
            categorias[item.categoria].push(item);
        }

        return items;
    }

    /**
     * Actualiza un lote de configuraciones
     * @param {Object} itemsObj Objeto { clave: nuevoValor, ... }
     * @param {string} userEmail Usuario que realiza la acción
     */
    async updateBatch(itemsObj, userEmail = 'admin') {
        if (!itemsObj || typeof itemsObj !== 'object') {
            throw new Error('Debe proporcionar un objeto con las configuraciones a actualizar.');
        }

        const entries = Object.entries(itemsObj);
        if (entries.length === 0) return { updatedCount: 0 };

        const connection = await pool.getConnection();
        const cambiosAuditados = [];

        try {
            await connection.beginTransaction();

            for (const [clave, nuevoValor] of entries) {
                // Obtener valor actual
                const [actuales] = await connection.query('SELECT valor, valor_defecto FROM config_sistema WHERE clave = ?', [clave]);
                if (actuales && actuales.length > 0) {
                    const valorAnterior = actuales[0].valor !== null ? actuales[0].valor : actuales[0].valor_defecto;
                    const valorAGuardar = nuevoValor !== undefined ? String(nuevoValor).trim() : '';

                    if (valorAnterior !== valorAGuardar) {
                        await connection.query('UPDATE config_sistema SET valor = ? WHERE clave = ?', [valorAGuardar, clave]);
                        cambiosAuditados.push({
                            clave,
                            anterior: valorAnterior,
                            nuevo: valorAGuardar
                        });
                    }
                }
            }

            await connection.commit();
            this.invalidateCache();

            // Registrar en auditoría
            if (cambiosAuditados.length > 0) {
                try {
                    await systemLogService.logConfiguracion({
                        actor: 'administrador',
                        actor_email: userEmail,
                        accion: 'modificacion_configuracion',
                        modulo: 'configuracion_sistema',
                        descripcion: `Actualización de ${cambiosAuditados.length} parámetros globales del sistema por ${userEmail}`,
                        valores_anteriores: cambiosAuditados.map(c => ({ clave: c.clave, valor: c.anterior })),
                        valores_nuevos: cambiosAuditados.map(c => ({ clave: c.clave, valor: c.nuevo }))
                    });
                } catch (logErr) {
                    console.warn('[CONFIGURACION] Error al auditar cambios:', logErr.message);
                }
            }

            console.log(`[CONFIGURACION] ${cambiosAuditados.length} parámetros actualizados por ${userEmail}`);
            return {
                success: true,
                updatedCount: cambiosAuditados.length,
                cambios: cambiosAuditados
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Restablece valores de fábrica para una categoría completa o todas
     */
    async resetToDefaults(categoria = null, userEmail = 'admin') {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            let sql = 'UPDATE config_sistema SET valor = valor_defecto WHERE valor_defecto IS NOT NULL';
            const params = [];
            if (categoria && categoria !== 'all') {
                sql += ' AND categoria = ?';
                params.push(categoria);
            }

            const [result] = await connection.query(sql, params);
            await connection.commit();
            this.invalidateCache();

            try {
                await systemLogService.logConfiguracion({
                    actor: 'administrador',
                    actor_email: userEmail,
                    accion: 'reset_fabrica_configuracion',
                    modulo: 'config_sistema',
                    descripcion: `Restablecimiento de fábrica de configuraciones (${categoria || 'todas'}) por ${userEmail}`,
                    valores_anteriores: null,
                    valores_nuevos: { categoria: categoria || 'todas' }
                });
            } catch (logErr) {
                console.warn('[CONFIGURACION] Error registrando auditoría de reset:', logErr.message);
            }

            return {
                success: true,
                affectedRows: result.affectedRows
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
}

module.exports = new ConfiguracionService();
