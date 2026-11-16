const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { pool } = require('../config/database');
const reclamosDatabaseService = require('./reclamosDatabaseService');

class GoogleSheetsService {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;
        this.tabName = process.env.GOOGLE_SHEETS_TAB_NAME || process.env.GOOGLE_SHEET_TAB || 'Reclamos 2023';

        // Opciones de autenticación con Google
        const credentials = this._resolveCredentials();
        const authOptions = {
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        };

        if (credentials) {
            authOptions.credentials = credentials;
            this.hasCredentials = true;
        } else {
            this.hasCredentials = false;
        }

        this.auth = new google.auth.GoogleAuth(authOptions);
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }

    /**
     * Asegura que el cliente de Google Sheets esté autenticado,
     * cargando credenciales de MySQL (config_sistema) si no vinieron por variable de entorno
     */
    async ensureAuth() {
        if (this.hasCredentials && this.sheets) return true;

        // 1. Intentar desde variables de entorno o archivo local
        let creds = this._resolveCredentials();

        // 2. Intentar desde la base de datos MySQL (tabla config_sistema)
        if (!creds) {
            creds = await this._resolveCredentialsFromDb();
        }

        if (creds) {
            this.auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.hasCredentials = true;
            return true;
        }

        return false;
    }

    /**
     * Lee las credenciales de Google Service Account almacenadas en MySQL
     */
    async _resolveCredentialsFromDb() {
        try {
            const [rows] = await pool.query(
                'SELECT valor FROM config_sistema WHERE clave = ? LIMIT 1',
                ['google_service_account']
            );
            if (rows.length > 0 && rows[0].valor) {
                const parsed = JSON.parse(rows[0].valor);
                if (parsed.private_key) {
                    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
                }
                console.log('[SHEETS AUTH] Credenciales cargadas exitosamente desde MySQL (config_sistema).');
                return parsed;
            }
        } catch (e) {
            console.warn('[SHEETS AUTH DB] No se pudo leer credenciales desde MySQL:', e.message);
        }
        return null;
    }

    /**
     * Resuelve las credenciales de la cuenta de servicio Google Sheets tanto para entornos
     * serverless (Netlify) como para desarrollo local mediante archivos.
     */
    _resolveCredentials() {
        // Prevenir que GoogleAuth intente abrir rutas relativas que no existen en el entorno serverless (/var/task)
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            const absAdcPath = path.isAbsolute(adcPath) ? adcPath : path.resolve(__dirname, '..', adcPath);
            if (!fs.existsSync(absAdcPath)) {
                delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
            }
        }

        // 1. Prioridad: Variable de entorno con el JSON o Base64 (ideal para Netlify)
        const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (envJson) {
            try {
                let text = envJson.trim();
                // Quitar comillas envolventes si fueron agregadas en el dashboard de Netlify
                if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
                    text = text.slice(1, -1).trim();
                }

                // Si no comienza con '{', evaluar si viene codificado en Base64
                if (!text.startsWith('{')) {
                    try {
                        const decoded = Buffer.from(text, 'base64').toString('utf8');
                        if (decoded.trim().startsWith('{')) {
                            text = decoded.trim();
                        }
                    } catch (e) {
                        // Continuar si no era base64
                    }
                }

                const parsed = JSON.parse(text);
                if (parsed.private_key) {
                    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
                }
                return parsed;
            } catch (err) {
                console.error('[SHEETS AUTH] Error parseando GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
            }
        }

        // 2. Fallback: Archivo físico local en el filesystem (ideal para desarrollo local)
        const possiblePaths = [
            process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
            'credentials/reclamos-501813-311b1979c9e5.json',
            'credentials/reclamos-service-account.json'
        ].filter(Boolean);

        for (const p of possiblePaths) {
            const absPath = path.isAbsolute(p) ? p : path.resolve(__dirname, '..', p);
            if (fs.existsSync(absPath)) {
                try {
                    const content = fs.readFileSync(absPath, 'utf8');
                    const parsed = JSON.parse(content);
                    if (parsed.private_key) {
                        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
                    }
                    return parsed;
                } catch (e) {
                    console.error(`[SHEETS AUTH] Error leyendo archivo de credenciales en ${absPath}:`, e.message);
                }
            }
        }

        return null;
    }

    /**
     * Mapea un índice numérico de columna (0 = A) a letra de Excel (0 -> A, 26 -> AA)
     */
    static colIdxToLetter(idx) {
        let res = '';
        let num = idx;
        while (num >= 0) {
            res = String.fromCharCode((num % 26) + 65) + res;
            num = Math.floor(num / 26) - 1;
        }
        return res;
    }

    /**
     * Convierte un número de serie de fecha de Google Sheets / Excel (días desde 1899-12-30)
     * o una cadena de fecha a formato DD/MM/YYYY.
     */
    static parseSheetsDateToDdMmYyyy(val) {
        if (val === null || val === undefined || val === '') return '';
        const num = Number(val);
        if (!isNaN(num) && num >= 20000 && num <= 90000 && (typeof val === 'number' || /^\d+(\.\d+)?$/.test(String(val).trim()))) {
            const utcMs = Math.round((Math.floor(num) - 25569) * 86400 * 1000);
            const d = new Date(utcMs);
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = d.getUTCFullYear();
            return `${dd}/${mm}/${yyyy}`;
        }
        return String(val).trim();
    }

    /**
     * Convierte un número de serie de fecha/hora de Google Sheets (en hora local Argentina UTC-3)
     * o cadena de fecha/hora a ISO string válido (evitando que new Date(46342) genere 1970-01-01T00:00:46Z).
     */
    static parseSheetsDateTime(val, fallbackFechaAlta = '') {
        if (val !== null && val !== undefined && val !== '') {
            const num = Number(val);
            if (!isNaN(num) && num >= 20000 && num <= 90000 && (typeof val === 'number' || /^\d+(\.\d+)?$/.test(String(val).trim()))) {
                // El serial de Sheets representa la fecha/hora local de la hoja (Argentina UTC-3)
                const wallClockUtcMs = Math.round((num - 25569) * 86400 * 1000);
                const realUtcMs = wallClockUtcMs + (3 * 3600 * 1000);
                return new Date(realUtcMs).toISOString();
            }
            const str = String(val).trim();
            // Formato DD/MM/YYYY [HH:mm[:ss]]
            const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (dmyMatch) {
                const [, d, m, y, hh = '00', mm = '00', ss = '00'] = dmyMatch;
                const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}-03:00`);
                if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
                    return parsed.toISOString();
                }
            }
            // Formato YYYY-MM-DD HH:mm:ss o ISO
            const isoCandidate = new Date(str.includes('T') ? str : `${str.replace(' ', 'T')}-03:00`);
            if (!isNaN(isoCandidate.getTime()) && isoCandidate.getFullYear() >= 2000) {
                return isoCandidate.toISOString();
            }
            const fallbackParsed = new Date(str);
            if (!isNaN(fallbackParsed.getTime()) && fallbackParsed.getFullYear() >= 2000) {
                return fallbackParsed.toISOString();
            }
        }
        if (fallbackFechaAlta) {
            return GoogleSheetsService.parseSheetsDateTime(fallbackFechaAlta, '');
        }
        return '';
    }

    /**
     * Convierte una fracción de día de Google Sheets (0 <= n < 1) a formato HH:mm
     */
    static parseSheetsTime(val) {
        if (val === null || val === undefined || val === '') return '';
        const num = Number(val);
        if (!isNaN(num) && num >= 0 && num < 1 && (typeof val === 'number' || /^0\.\d+$/.test(String(val).trim()))) {
            const totalMinutes = Math.round(num * 24 * 60);
            const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
            const mm = String(totalMinutes % 60).padStart(2, '0');
            return `${hh}:${mm}`;
        }
        return String(val).trim();
    }

    /**
     * Obtiene todos los reclamos desde la hoja de cálculo filtrados por corte numérico
    /**
     * Obtiene los reclamos consultando en primer término MySQL para máxima velocidad (<10ms).
     * Si la base de datos está vacía, consulta Google Sheets y sincroniza automáticamente.
     */
    async getReclamos(cutoffId = null) {
        try {
            const dbClaims = await reclamosDatabaseService.getReclamos(cutoffId);
            if (dbClaims && dbClaims.length > 0) {
                return dbClaims;
            }
        } catch (dbErr) {
            console.warn('[SHEETS/DB] Error consultando MySQL, recurriendo a Google Sheets:', dbErr.message);
        }

        // Fallback o primer inicio: obtener desde Google Sheets y persistir en MySQL
        const sheetsClaims = await this.fetchFromSheets(cutoffId);
        if (sheetsClaims.length > 0) {
            reclamosDatabaseService.syncAllFromSheets(sheetsClaims).catch(err => {
                console.error('[SYNC AUTO ERROR] Error sincronizando reclamos a MySQL:', err.message);
            });
        }

        return sheetsClaims;
    }

    /**
     * Consulta directa a Google Sheets (usada para sincronización o fallbacks)
     */
    async fetchFromSheets(cutoffId = null) {
        await this.ensureAuth();
        if (!this.hasCredentials) {
            throw new Error('No se encontraron credenciales de Google Sheets configuradas en el entorno ni en la base de datos (config_sistema).');
        }

        if (!this.spreadsheetId) {
            throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID no está configurado.');
        }

        const range = `${this.tabName}!A:AT`;
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range,
            valueRenderOption: 'UNFORMATTED_VALUE'
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) return [];

        const cutoff = cutoffId !== null ? parseInt(cutoffId, 10) : parseInt(process.env.RECLAMOS_NUMERO_CORTE || '0', 10);

        // Agrupamos filas por ID de reclamo (un reclamo puede tener N productos/filas)
        const reclamosMap = new Map();

        // Iterar desde fila 2 (índice 1, rowNumber = 2 en Sheets)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            const rawId = row[0];

            if (!rawId || String(rawId).trim() === '') continue;

            const idNum = parseInt(rawId, 10);
            if (!isNaN(cutoff) && cutoff > 0 && !isNaN(idNum) && idNum < cutoff) {
                continue; // Filtro de corte numérico
            }

            const idStr = String(rawId).trim();

            const item = {
                rowNumber: rowNum,
                categoria: row[13] || '',
                producto: row[14] || '',
                defecto: row[15] || '',
                cantidad: row[16] || 1,
                vto_reclamo: GoogleSheetsService.parseSheetsDateToDdMmYyyy(row[17]),
                producto_cortesia: row[18] || '',
                lote: row[22] || '',
                hora: GoogleSheetsService.parseSheetsTime(row[23]),
                vto: GoogleSheetsService.parseSheetsDateToDdMmYyyy(row[24]),
                descripcion: row[26] || '',
                marca: row[36] || 'Don Yeyo',
                conserva_envase: row[37] || 'Sí'
            };

            if (!reclamosMap.has(idStr)) {
                const fechaAltaNormalizada = GoogleSheetsService.parseSheetsDateToDdMmYyyy(row[2]);
                const fechaCargaNormalizada = GoogleSheetsService.parseSheetsDateTime(row[39], fechaAltaNormalizada);

                reclamosMap.set(idStr, {
                    id: idStr,
                    idNum: !isNaN(idNum) ? idNum : 0,
                    rowNumbers: [rowNum],
                    cliente: row[1] || 'Consumidor',
                    fecha_alta: fechaAltaNormalizada,
                    mes: row[3] || '',
                    nombre: row[4] || '',
                    apellido: row[5] || '',
                    domicilio: row[6] || '',
                    telefono: row[7] || '',
                    email: row[8] || '',
                    localidad: row[9] || '',
                    provincia: row[10] || '',
                    supervisor: row[11] || 'Sin asignar',
                    via_contacto: row[12] || 'Web',
                    no_resuelto: row[21] !== undefined ? row[21] : 1,
                    comercio_compra: row[31] || '',
                    supervisor_email: row[32] || '',
                    latitud: row[33] || '',
                    longitud: row[34] || '',
                    codigo_postal: row[35] || '',
                    evidencia_zip: row[38] || '',
                    fecha_carga: fechaCargaNormalizada,
                    estado_admin: row[40] || 'Pendiente',
                    admin_motivo_desaprobado: row[41] || '',
                    estado_supervisor: row[42] || 'Pendiente',
                    supervisor_motivo_imposibilidad: row[43] || '',
                    estado_consumidor: row[44] || 'Pendiente',
                    estado_inocuidad: row[45] || 'Sin acciones',
                    items: [item]
                });
            } else {
                const existing = reclamosMap.get(idStr);
                existing.rowNumbers.push(rowNum);
                existing.items.push(item);
            }
        }

        // Retornar ordenados por ID de forma descendente (más recientes primero)
        return Array.from(reclamosMap.values()).sort((a, b) => b.idNum - a.idNum);
    }

    /**
     * Obtiene un reclamo específico por ID
     */
    async getReclamoById(claimId) {
        try {
            const dbClaim = await reclamosDatabaseService.getReclamoById(claimId);
            if (dbClaim) return dbClaim;
        } catch (dbErr) {
            console.warn(`[SHEETS/DB] Error consultando #${claimId} en MySQL:`, dbErr.message);
        }

        const reclamos = await this.fetchFromSheets(0);
        const claim = reclamos.find(r => String(r.id) === String(claimId)) || null;
        if (claim) {
            reclamosDatabaseService.upsertReclamo(claim).catch(e => {
                console.error(`[SYNC ON-DEMAND ERROR] Fallo al guardar #${claimId} en DB:`, e.message);
            });
        }
        return claim;
    }

    /**
     * Sincronización completa manual desde Google Sheets hacia MySQL
     */
    async syncSheetsToDatabase(cutoffId = null) {
        console.log('[MANUAL SYNC] Iniciando sincronización Sheets -> MySQL...');
        const claims = await this.fetchFromSheets(cutoffId);
        const syncedCount = await reclamosDatabaseService.syncAllFromSheets(claims);
        return { totalSheets: claims.length, synced: syncedCount };
    }

    /**
     * Actualiza celdas en PARALELO tanto en Google Sheets como en MySQL
     * Mantiene los tableros de Power BI sincronizados y registra auditoría
     * @param {string|number} claimId ID del reclamo
     * @param {Object} updates Mapeo columna Sheets -> nuevo valor (ej: { 'AO': 'Aprobado', 'L': 'Hugo Basile' })
     * @param {Object} auditInfo Metadatos de auditoría { actor, actorEmail, motivo, metadata }
     */
    async updateReclamo(claimId, updates, auditInfo = {}) {
        const claim = await this.getReclamoById(claimId);
        if (!claim) {
            throw new Error(`Reclamo con ID ${claimId} no encontrado.`);
        }

        // 1. Actualización en MySQL con auditoría completa
        let dbSuccess = false;
        try {
            await reclamosDatabaseService.updateReclamo(claimId, updates, auditInfo);
            dbSuccess = true;
        } catch (dbErr) {
            console.error(`[UPDATE DB ERROR] Fallo al actualizar #${claimId} en MySQL:`, dbErr.message);
        }

        // 2. Actualización en paralelo en Google Sheets (para Power BI y usuarios de planilla)
        await this.ensureAuth();
        if (this.hasCredentials && this.spreadsheetId && claim.rowNumbers && claim.rowNumbers.length > 0) {
            try {
                const dataUpdates = [];
                for (const rowNum of claim.rowNumbers) {
                    for (const [col, val] of Object.entries(updates)) {
                        // Solo enviar a Google Sheets si es una columna válida de hoja (A-Z o AA-ZZ)
                        if (/^[A-Z]{1,2}$/.test(col)) {
                            dataUpdates.push({
                                range: `${this.tabName}!${col}${rowNum}`,
                                values: [[val]]
                            });
                        }
                    }
                }

                if (dataUpdates.length > 0) {
                    await this.sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        requestBody: {
                            valueInputOption: 'USER_ENTERED',
                            data: dataUpdates
                        }
                    });
                }
            } catch (sheetErr) {
                console.error(`[UPDATE SHEETS ERROR] Error al reflejar cambio en Google Sheets para #${claimId}:`, sheetErr.message);
                if (!dbSuccess) throw sheetErr;
            }
        }

        return true;
    }

    /**
     * Calcula y actualiza el Producto Cortesía (columna S en Sheets y reclamo_items en DB)
     * al aprobar el reclamo según la prioridad asignada y severidad del defecto
     * @param {string|number} claimId ID del reclamo
     * @param {string} [cortesiaOverride] Texto forzado de la regla de cortesía de la prioridad seleccionada
     */
    async aplicarProductoCortesia(claimId, cortesiaOverride = null) {
        const claim = await this.getReclamoById(claimId);
        if (!claim || !claim.items || claim.items.length === 0) return [];

        const cortesiaService = require('./cortesiaService');
        const cortesiaConfig = await cortesiaService.getConfig();
        const itemsActualizados = [];
        const dataUpdates = [];

        const reglaDefinida = cortesiaOverride || claim.regla_cortesia_aplicada || null;

        for (let idx = 0; idx < claim.items.length; idx++) {
            const item = claim.items[idx];
            const cortesiaCalculada = reglaDefinida || await cortesiaService.calcularProductoCortesia(item.defecto, cortesiaConfig);
            item.producto_cortesia = cortesiaCalculada;
            itemsActualizados.push(item);

            const rowNum = item.rowNumber || (claim.rowNumbers && claim.rowNumbers[idx]) || (claim.rowNumbers && claim.rowNumbers[0]);
            if (rowNum) {
                dataUpdates.push({
                    range: `${this.tabName}!S${rowNum}`,
                    values: [[cortesiaCalculada]]
                });
            }
        }

        // 1. Actualizar celda(s) de la columna S en Google Sheets
        await this.ensureAuth();
        if (this.hasCredentials && this.spreadsheetId && dataUpdates.length > 0) {
            try {
                await this.sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: dataUpdates
                    }
                });
                console.log(`[CORTESIA] Columna S actualizada en Google Sheets para #${claimId}:`, itemsActualizados.map(i => i.producto_cortesia).join(', '));
            } catch (sheetErr) {
                console.error(`[CORTESIA SHEETS ERROR] Error al actualizar columna S para #${claimId}:`, sheetErr.message);
            }
        }

        // 2. Persistir en MySQL en la tabla reclamo_items
        try {
            await reclamosDatabaseService.updateItemsProductoCortesia(claimId, itemsActualizados);
            console.log(`[CORTESIA] reclamo_items actualizados en MySQL para Reclamo #${claimId}.`);
        } catch (dbErr) {
            console.error(`[CORTESIA DB ERROR] Error al actualizar reclamo_items en MySQL para #${claimId}:`, dbErr.message);
        }

        return itemsActualizados;
    }
}

module.exports = new GoogleSheetsService();
