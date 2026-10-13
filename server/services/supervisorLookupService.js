const fs = require('fs');
const path = require('path');

class SupervisorLookupService {
    constructor() {
        this.geojsonPath = path.resolve(__dirname, '..', 'data', 'cobertura_supervisores.geojson');
        this.featuresCache = null;
        this.lastModified = null;
    }

    /**
     * Carga las geometrías en caché
     */
    loadFeatures() {
        if (this.featuresCache) {
            return this.featuresCache;
        }

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
            console.log(`[SUPERVISOR LOOKUP] Cargadas ${this.featuresCache.length} zonas de cobertura.`);
        } catch (err) {
            console.error('[SUPERVISOR LOOKUP] Error parseando GeoJSON:', err.message);
            this.featuresCache = [];
        }

        return this.featuresCache;
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
    findSupervisor(lat, lng) {
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);

        if (isNaN(numLat) || isNaN(numLng)) {
            return {
                supervisor: 'Sin asignar',
                email: '',
                zona: 'Coordenadas inválidas'
            };
        }

        const features = this.loadFeatures();

        for (const feature of features) {
            const geometry = feature.geometry || {};
            const type = geometry.type;
            const coordinates = geometry.coordinates || [];
            const props = feature.properties || {};

            if (type === 'Polygon' && coordinates[0]) {
                if (this.isPointInPolygon(numLng, numLat, coordinates[0])) {
                    return {
                        supervisor: props.Supervisor || 'Sin asignar',
                        email: props.email || '',
                        zona: props.name || props.Zona || ''
                    };
                }
            } else if (type === 'MultiPolygon') {
                for (const poly of coordinates) {
                    if (poly[0] && this.isPointInPolygon(numLng, numLat, poly[0])) {
                        return {
                            supervisor: props.Supervisor || 'Sin asignar',
                            email: props.email || '',
                            zona: props.name || props.Zona || ''
                        };
                    }
                }
            }
        }

        return {
            supervisor: 'Sin asignar',
            email: '',
            zona: 'Fuera de zona delimitada'
        };
    }

    /**
     * Retorna resumen de las coberturas activas
     */
    getInfo() {
        const features = this.loadFeatures();
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
            totalZonas: features.length,
            totalSupervisores: supervisoresMap.size,
            supervisores: Array.from(supervisoresMap.values()),
            lastModified: this.lastModified
        };
    }

    /**
     * Valida y guarda un nuevo archivo GeoJSON reemplazando el actual
     */
    saveNewGeoJSON(rawContent) {
        let parsed;
        if (typeof rawContent === 'string') {
            parsed = JSON.parse(rawContent);
        } else {
            parsed = rawContent;
        }

        if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
            throw new Error('El archivo provisto no tiene formato válido GeoJSON FeatureCollection.');
        }

        // Crear directorio si no existe
        const dir = path.dirname(this.geojsonPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.geojsonPath, JSON.stringify(parsed, null, 2), 'utf8');

        // Invalidar caché
        this.featuresCache = null;
        this.loadFeatures();

        return this.getInfo();
    }
}

module.exports = new SupervisorLookupService();
