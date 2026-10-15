const { pool } = require('../config/database');

// Configuración por defecto extraída directamente de la fórmula de Google Sheets:
// =+SI(P3361="";"";SI(SI.ERROR(BUSCARV(P3361;'Reclamos 2023'!$AJ$15:$AJ$19;1;0);'Reclamos 2023'!$AG$19)=P3361;'Reclamos 2023'!$AG$18;'Reclamos 2023'!$AG$19))
const DEFAULT_CORTESIA_CONFIG = {
    cortesia_estandar: '1 reemplazo + 1 de kg',
    cortesia_especial: '1 reemplazo + 2 productos a elección + 2 de kg.',
    defectos_estandar: [
        'Defectos del producto',
        'Vida util',
        'Menor cantidad de unidades',
        'Defecto en el envase'
    ],
    descripcion: 'Regla de cálculo automático de producto de cortesía según severidad del defecto'
};

const CONFIG_KEY = 'regla_producto_cortesia';

class CortesiaService {
    constructor() {
        this._cachedConfig = null;
        this._lastFetchTime = 0;
        this._ttlMs = 60 * 1000; // Cache 1 minuto en memoria
    }

    /**
     * Obtiene la configuración activa de cortesía desde MySQL (config_sistema) con fallback a defaults
     */
    async getConfig() {
        const now = Date.now();
        if (this._cachedConfig && (now - this._lastFetchTime < this._ttlMs)) {
            return this._cachedConfig;
        }

        try {
            const [rows] = await pool.query(
                'SELECT valor FROM config_sistema WHERE clave = ? LIMIT 1',
                [CONFIG_KEY]
            );

            if (rows.length > 0 && rows[0].valor) {
                const parsed = JSON.parse(rows[0].valor);
                this._cachedConfig = {
                    ...DEFAULT_CORTESIA_CONFIG,
                    ...parsed
                };
                this._lastFetchTime = now;
                return this._cachedConfig;
            }
        } catch (err) {
            console.warn('[CORTESIA SERVICE] Error al leer configuración desde MySQL, recurriendo a defaults:', err.message);
        }

        // Si no existe aún en la base de datos, guardar defaults para inicializarla
        this._cachedConfig = { ...DEFAULT_CORTESIA_CONFIG };
        this._lastFetchTime = now;
        this.saveConfig(DEFAULT_CORTESIA_CONFIG, 'sistema_init').catch(() => {});
        return this._cachedConfig;
    }

    /**
     * Guarda y actualiza la regla de cortesía en MySQL (config_sistema)
     */
    async saveConfig(newConfig, userEmail = 'admin') {
        const validConfig = {
            cortesia_estandar: String(newConfig.cortesia_estandar || DEFAULT_CORTESIA_CONFIG.cortesia_estandar).trim(),
            cortesia_especial: String(newConfig.cortesia_especial || DEFAULT_CORTESIA_CONFIG.cortesia_especial).trim(),
            defectos_estandar: Array.isArray(newConfig.defectos_estandar)
                ? newConfig.defectos_estandar.map(d => String(d).trim()).filter(Boolean)
                : DEFAULT_CORTESIA_CONFIG.defectos_estandar,
            actualizado_por: userEmail,
            updated_at: new Date().toISOString()
        };

        const jsonStr = JSON.stringify(validConfig);

        await pool.query(
            `INSERT INTO config_sistema (clave, valor, descripcion)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE valor = VALUES(valor), descripcion = VALUES(descripcion)`,
            [CONFIG_KEY, jsonStr, 'Regla de cálculo de Producto Cortesía (Defectos y Compensación)']
        );

        this._cachedConfig = validConfig;
        this._lastFetchTime = Date.now();
        console.log(`[CORTESIA SERVICE] Configuración de cortesía actualizada por ${userEmail}.`);
        return validConfig;
    }

    /**
     * Calcula el producto de cortesía a partir del defecto del reclamo
     * Réplica exacta de la fórmula Excel:
     * SI(P=""), "", SI(BUSCARV(P, AJ15:AJ19) = P, AG18, AG19)
     *
     * @param {string} defecto Texto del defecto del producto reclamado (columna P)
     * @param {Object} [configOverride] Configuración opcional
     * @returns {string} Texto de la compensación de cortesía asignada
     */
    async calcularProductoCortesia(defecto, configOverride = null) {
        if (!defecto || String(defecto).trim() === '') {
            return '';
        }

        const config = configOverride || await this.getConfig();
        const defectoNormalizado = String(defecto).trim().toLowerCase();

        // Evalúa si el defecto coincide con la lista de defectos estándar/leves
        const esEstandar = (config.defectos_estandar || []).some(
            defEstandar => String(defEstandar).trim().toLowerCase() === defectoNormalizado
        );

        if (esEstandar) {
            return config.cortesia_estandar;
        }

        // Si es un defecto grave o no catalogado en la lista estándar, aplica cortesía especial/agravada
        return config.cortesia_especial;
    }
}

module.exports = new CortesiaService();
