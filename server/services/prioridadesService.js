const { pool } = require('../config/database');

// Prioridades canónicas estables del sistema Don Yeyo S.A.
const PRIORIDADES_CANONICAS = [
    {
        codigo: 10,
        nombre: 'Alta',
        descripcion: 'Casos críticos y graves que implican reconocer el error rápidamente',
        sla: 3,
        color: '#ef4444',
        orden: 1,
        reglas_cortesia: [
            { codigo: 'codigo1', descripcion: '1 reemplazo + 2 productos a elección + 2 de kg' }
        ]
    },
    {
        codigo: 20,
        nombre: 'Media',
        descripcion: 'Casos leves que no representan un daño importante para el consumidor',
        sla: 7,
        color: '#f59e0b',
        orden: 2,
        reglas_cortesia: [
            { codigo: 'codigo2', descripcion: '1 reemplazo' }
        ]
    },
    {
        codigo: 30,
        nombre: 'Baja',
        descripcion: 'Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa',
        sla: 14,
        color: '#3b82f6',
        orden: 3,
        reglas_cortesia: [
            { codigo: 'codigo3', descripcion: '1 reemplazo + 1 de kg' }
        ]
    }
];

class PrioridadesService {
    /**
     * Obtiene todas las prioridades con sus reglas de cortesía
     */
    async getPrioridades() {
        try {
            const [rows] = await pool.query('SELECT * FROM workflow_prioridades ORDER BY orden ASC');
            if (rows && rows.length > 0) {
                return rows.map(r => ({
                    id: r.id,
                    codigo: Number(r.codigo),
                    nombre: r.nombre,
                    descripcion: r.descripcion,
                    sla: Number(r.sla),
                    color: r.color,
                    orden: Number(r.orden),
                    reglas_cortesia: typeof r.reglas_cortesia === 'string'
                        ? JSON.parse(r.reglas_cortesia)
                        : (r.reglas_cortesia || [])
                }));
            }
        } catch (err) {
            console.warn('[PRIORIDADES SERVICE] Error leyendo workflow_prioridades de MySQL, usando canónicas:', err.message);
        }

        return PRIORIDADES_CANONICAS;
    }

    /**
     * Obtiene una prioridad específica por su código numérico (10, 20 o 30)
     */
    async getPrioridadByCodigo(codigo) {
        const codNum = Number(codigo);
        if (![10, 20, 30].includes(codNum)) {
            return null;
        }

        try {
            const [rows] = await pool.query(
                'SELECT * FROM workflow_prioridades WHERE codigo = ? LIMIT 1',
                [codNum]
            );
            if (rows && rows.length > 0) {
                const r = rows[0];
                return {
                    id: r.id,
                    codigo: Number(r.codigo),
                    nombre: r.nombre,
                    descripcion: r.descripcion,
                    sla: Number(r.sla),
                    color: r.color,
                    orden: Number(r.orden),
                    reglas_cortesia: typeof r.reglas_cortesia === 'string'
                        ? JSON.parse(r.reglas_cortesia)
                        : (r.reglas_cortesia || [])
                };
            }
        } catch (err) {
            console.warn(`[PRIORIDADES SERVICE] Error buscando prioridad ${codNum}:`, err.message);
        }

        return PRIORIDADES_CANONICAS.find(p => p.codigo === codNum) || null;
    }

    /**
     * Resuelve de forma exhaustiva la prioridad y los ítems de cortesía correspondientes a un reclamo
     * según la configuración vigente en workflow_prioridades (que ahora maneja ítems).
     */
    async getReglasCortesiaForClaim(claim) {
        let codigo = (claim && claim.prioridad !== null && claim.prioridad !== undefined) 
            ? Number(claim.prioridad) 
            : null;

        if (!codigo && claim && claim.prioridad_nombre) {
            const nom = String(claim.prioridad_nombre).toLowerCase();
            if (nom.includes('alta')) codigo = 10;
            else if (nom.includes('media')) codigo = 20;
            else if (nom.includes('baja')) codigo = 30;
        }

        if (codigo) {
            const p = await this.getPrioridadByCodigo(codigo);
            if (p) {
                let reglas = p.reglas_cortesia;
                if (typeof reglas === 'string') {
                    try { reglas = JSON.parse(reglas); } catch { reglas = []; }
                }
                if (Array.isArray(reglas) && reglas.length > 0) {
                    const items = reglas
                        .map(r => (typeof r === 'string' ? r : (r?.descripcion || '')).trim())
                        .filter(Boolean);
                    if (items.length > 0) {
                        return {
                            prioridad: p,
                            items,
                            texto: items.join(' + ')
                        };
                    }
                }
            }
        }

        if (claim && claim.regla_cortesia_aplicada && String(claim.regla_cortesia_aplicada).trim()) {
            const texto = String(claim.regla_cortesia_aplicada).trim();
            const items = texto.includes('+') ? texto.split('+').map(s => s.trim()).filter(Boolean) : [texto];
            return {
                prioridad: null,
                items,
                texto
            };
        }

        return {
            prioridad: null,
            items: ['1 reemplazo'],
            texto: '1 reemplazo'
        };
    }

    /**
     * Actualiza las reglas de cortesía y opcionalmente el SLA de una prioridad.
     * Regla de negocio: No se permite cambiar nombre ni descripción, ni agregar ni eliminar prioridades.
     * Se guardan las reglas de cortesía como JSON (al menos una obligatoria) y opcionalmente el SLA en días.
     */
    async updateReglasCortesia(codigo, reglas, sla = null, userEmail = 'admin') {
        const codNum = Number(codigo);
        if (![10, 20, 30].includes(codNum)) {
            throw new Error(`Código de prioridad inválido (${codigo}). Solo se permiten prioridades 10 (Alta), 20 (Media) o 30 (Baja).`);
        }

        if (!Array.isArray(reglas) || reglas.length === 0) {
            throw new Error('Debe haber al menos una regla de cortesía por prioridad.');
        }

        const sanitizedReglas = reglas.map((r, index) => {
            const desc = String(r.descripcion || '').trim();
            if (!desc) {
                throw new Error(`La regla #${index + 1} no puede tener una descripción vacía.`);
            }
            return {
                codigo: String(r.codigo || `codigo_${codNum}_${index + 1}`).trim(),
                descripcion: desc
            };
        });

        const jsonStr = JSON.stringify(sanitizedReglas);

        let slaNum = null;
        if (sla !== null && sla !== undefined && sla !== '') {
            slaNum = parseInt(sla, 10);
            if (isNaN(slaNum) || slaNum <= 0) {
                throw new Error('El SLA debe ser un número entero mayor a 0 días.');
            }
        }

        if (slaNum !== null) {
            await pool.query(
                `UPDATE workflow_prioridades 
                 SET reglas_cortesia = ?, sla = ?
                 WHERE codigo = ?`,
                [jsonStr, slaNum, codNum]
            );
            console.log(`[PRIORIDADES SERVICE] Reglas de cortesía y SLA (${slaNum} días) para prioridad ${codNum} actualizados por ${userEmail}.`);
        } else {
            await pool.query(
                `UPDATE workflow_prioridades 
                 SET reglas_cortesia = ?
                 WHERE codigo = ?`,
                [jsonStr, codNum]
            );
            console.log(`[PRIORIDADES SERVICE] Reglas de cortesía para prioridad ${codNum} actualizadas por ${userEmail}.`);
        }

        return this.getPrioridadByCodigo(codNum);
    }
}

module.exports = new PrioridadesService();
