const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

class SupervisorLookupService {
    constructor() {
        this.geojsonPath = path.resolve(__dirname, '..', 'data', 'cobertura_supervisores.geojson');
        this.featuresCache = null;
        this.lastModified = null;
        this.version = 1;
    }

    /**
     * Carga las geometrías en caché desde MySQL o archivo de respaldo local
     */
    async loadFeatures() {
        if (this.featuresCache && this.featuresCache.length > 0) {
            return this.featuresCache;
        }

        // 1. Intentar cargar desde MySQL (permanente e inmutable en entornos Serverless)
        try {
            const [rows] = await pool.query(
                'SELECT version, geojson_content, total_zonas, total_supervisores, created_at FROM cobertura_supervisores_geo WHERE activo = 1 ORDER BY version DESC LIMIT 1'
            );

            if (rows.length > 0 && rows[0].geojson_content) {
                const data = JSON.parse(rows[0].geojson_content);
                this.featuresCache = Array.isArray(data.features) ? data.features : [];
                this.version = rows[0].version;
                this.lastModified = rows[0].created_at;
                console.log(`[SUPERVISOR LOOKUP] Cargadas ${this.featuresCache.length} zonas desde MySQL RDS (Versión ${this.version}).`);
                return this.featuresCache;
            }
        } catch (dbErr) {
            console.warn('[SUPERVISOR LOOKUP] No se pudo leer de MySQL, usando fallback local:', dbErr.message);
        }

        // 2. Fallback: Archivo local si aún no se había sembrado en DB
        if (!fs.existsSync(this.geojsonPath)) {
            console.warn('[SUPERVISOR LOOKUP] Archivo GeoJSON no encontrado en:', this.geojsonPath);
            this.featuresCache = [];
            return this.featuresCache;
        }

        try {
            const raw = fs.readFileSync(this.geojsonPath, 'utf8');
            const data = JSON.parse(raw);
            this.featuresCache = Array.isArray(data.features) ? data.features : [];
            const stats = fs.statSync(this.geojsonPath);
            this.lastModified = stats.mtime;
            console.log(`[SUPERVISOR LOOKUP] Cargadas ${this.featuresCache.length} zonas de cobertura desde archivo local.`);

            // Sembrar en MySQL para futuras ejecuciones serverless
            this._seedToDb(raw, this.featuresCache.length).catch(e => {
                console.warn('[SUPERVISOR LOOKUP] Error al sembrar GeoJSON en DB:', e.message);
            });
        } catch (err) {
            console.error('[SUPERVISOR LOOKUP] Error parseando GeoJSON local:', err.message);
            this.featuresCache = [];
        }

        return this.featuresCache;
    }

    async _seedToDb(rawContent, totalZonas) {
        try {
            const [existing] = await pool.query('SELECT id FROM cobertura_supervisores_geo LIMIT 1');
            if (existing.length === 0) {
                await pool.execute(
                    `INSERT INTO cobertura_supervisores_geo (version, nombre_archivo, geojson_content, total_zonas, activo, subido_por)
                     VALUES (1, 'cobertura_supervisores.geojson', ?, ?, 1, 'seed_inicial')`,
                    [rawContent, totalZonas]
                );
                console.log('[SUPERVISOR LOOKUP] Cobertura inicial sembrada en MySQL.');
            }
        } catch (e) {
            // Ignorar si falla el seed
        }
    }

    /**
     * Algoritmo Ray-Casting (Point-in-Polygon)
     * @param {number} x Longitud
     * @param {number} y Latitud
     * @param {Array<Array<number>>} polygon Array de [lng, lat]
     * @returns {boolean}
     */
    isPointInPolygon(x, y, polygon) {
        let inside = false;
        const n = polygon.length;
        if (n < 3) return false;

        let j = n - 1;
        for (let i = 0; i < n; i++) {
            const xi = polygon[i][0];
            const yi = polygon[i][1];
            const xj = polygon[j][0];
            const yj = polygon[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) {
                inside = !inside;
            }
            j = i;
        }

        return inside;
    }

    /**
     * Encuentra el supervisor correspondiente a una coordenada (lat, lng)
     */
    async findSupervisor(lat, lng) {
        const cleanLat = String(lat || '').trim().replace(',', '.');
        const cleanLng = String(lng || '').trim().replace(',', '.');
        const numLat = parseFloat(cleanLat);
        const numLng = parseFloat(cleanLng);

        if (isNaN(numLat) || isNaN(numLng)) {
            return {
                found: false,
                supervisor: 'Sin asignar',
                email: '',
                zona: 'Coordenadas inválidas'
            };
        }

        const features = await this.loadFeatures();

        for (const feature of features) {
            const geometry = feature.geometry || {};
            const type = geometry.type;
            const coordinates = geometry.coordinates || [];
            const props = feature.properties || {};

            if (type === 'Polygon' && coordinates[0]) {
                if (this.isPointInPolygon(numLng, numLat, coordinates[0])) {
                    return {
                        found: true,
                        supervisor: props.Supervisor || 'Sin asignar',
                        email: props.email || '',
                        zona: props.name || props.Zona || ''
                    };
                }
            } else if (type === 'MultiPolygon') {
                for (const poly of coordinates) {
                    if (poly[0] && this.isPointInPolygon(numLng, numLat, poly[0])) {
                        return {
                            found: true,
                            supervisor: props.Supervisor || 'Sin asignar',
                            email: props.email || '',
                            zona: props.name || props.Zona || ''
                        };
                    }
                }
            }
        }

        return {
            found: false,
            supervisor: 'Sin asignar',
            email: '',
            zona: 'Fuera de zona delimitada'
        };
    }

    /**
     * Retorna resumen de las coberturas activas
     */
    async getInfo() {
        const features = await this.loadFeatures();
        const supervisoresMap = new Map();

        features.forEach(f => {
            const p = f.properties || {};
            const nombre = p.Supervisor || 'Sin nombre';
            const email = p.email || '';
            if (!supervisoresMap.has(nombre)) {
                supervisoresMap.set(nombre, { nombre, email, zonasCount: 1 });
            } else {
                supervisoresMap.get(nombre).zonasCount++;
            }
        });

        return {
            version: this.version,
            totalZonas: features.length,
            totalSupervisores: supervisoresMap.size,
            supervisores: Array.from(supervisoresMap.values()),
            lastModified: this.lastModified
        };
    }

    /**
     * Valida y guarda un nuevo archivo GeoJSON persistiendo la versión en MySQL
     */
    async saveNewGeoJSON(rawContent, actor = 'admin') {
        let parsed;
        if (typeof rawContent === 'string') {
            parsed = JSON.parse(rawContent);
        } else {
            parsed = rawContent;
        }

        if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
            throw new Error('El archivo provisto no tiene formato válido GeoJSON FeatureCollection.');
        }

        const features = parsed.features;
        const supervisoresSet = new Set();
        features.forEach(f => {
            if (f.properties && f.properties.Supervisor) {
                supervisoresSet.add(f.properties.Supervisor);
            }
        });

        const geojsonString = typeof rawContent === 'string' ? rawContent : JSON.stringify(parsed);

        // 1. Persistir en MySQL (Desactivar versiones anteriores y activar la nueva)
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [lastVerRow] = await connection.query('SELECT IFNULL(MAX(version), 0) as maxVer FROM cobertura_supervisores_geo');
            const newVersion = (lastVerRow[0] ? lastVerRow[0].maxVer : 0) + 1;

            await connection.execute('UPDATE cobertura_supervisores_geo SET activo = 0');
            await connection.execute(
                `INSERT INTO cobertura_supervisores_geo 
                (version, nombre_archivo, geojson_content, total_zonas, total_supervisores, activo, subido_por) 
                VALUES (?, 'cobertura_supervisores.geojson', ?, ?, ?, 1, ?)`,
                [newVersion, geojsonString, features.length, supervisoresSet.size, actor || 'admin']
            );

            await connection.commit();
            this.version = newVersion;
            this.lastModified = new Date();
            console.log(`[SUPERVISOR LOOKUP] Nueva cobertura v${newVersion} persistida en MySQL.`);
        } catch (dbErr) {
            await connection.rollback();
            console.error('[SUPERVISOR LOOKUP DB ERROR]', dbErr.message);
            throw new Error('Error al guardar cobertura en base de datos: ' + dbErr.message);
        } finally {
            connection.release();
        }

        // 2. Intentar actualizar archivo local como respaldo si el sistema de archivos no es de solo lectura
        try {
            const dir = path.dirname(this.geojsonPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.geojsonPath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (fsErr) {
            console.log('[SUPERVISOR LOOKUP] Nota: Filesystem de solo lectura, persistencia completada en MySQL.');
        }

        // 3. Actualizar caché en memoria
        this.featuresCache = features;

        return this.getInfo();
    }

    /**
     * Obtiene el GeoJSON completo activo para descarga / exportación
     */
    async getRawGeoJSON() {
        await this.loadFeatures();
        try {
            const [rows] = await pool.query(
                'SELECT geojson_content FROM cobertura_supervisores_geo WHERE activo = 1 ORDER BY version DESC LIMIT 1'
            );
            if (rows.length > 0 && rows[0].geojson_content) {
                return typeof rows[0].geojson_content === 'string'
                    ? JSON.parse(rows[0].geojson_content)
                    : rows[0].geojson_content;
            }
        } catch (e) {
            // fallback
        }

        if (fs.existsSync(this.geojsonPath)) {
            return JSON.parse(fs.readFileSync(this.geojsonPath, 'utf8'));
        }

        return {
            type: 'FeatureCollection',
            features: this.featuresCache || []
        };
    }
}

module.exports = new SupervisorLookupService();
