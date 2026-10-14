const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

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
            console.warn('[SHEETS AUTH WARNING] No se encontraron credenciales válidas de Google Sheets. En Netlify configure GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.');
        }

        this.auth = new google.auth.GoogleAuth(authOptions);
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
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
     * Obtiene todos los reclamos desde la hoja de cálculo filtrados por corte numérico
     * @param {string|number} cutoffId Número mínimo de reclamo a retornar
     * @returns {Promise<Array>}
     */
    async getReclamos(cutoffId = null) {
        if (!this.hasCredentials) {
            throw new Error('No se encontraron credenciales de Google Sheets configuradas. En Netlify, debes definir la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.');
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
                vto_reclamo: row[17] || '',
                producto_cortesia: row[18] || '',
                lote: row[22] || '',
                hora: row[23] || '',
                vto: row[24] || '',
                descripcion: row[26] || '',
                marca: row[36] || 'Don Yeyo',
                conserva_envase: row[37] || 'Sí'
            };

            if (!reclamosMap.has(idStr)) {
                reclamosMap.set(idStr, {
                    id: idStr,
                    idNum: !isNaN(idNum) ? idNum : 0,
                    rowNumbers: [rowNum],
                    cliente: row[1] || 'Consumidor',
                    fecha_alta: row[2] || '',
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
                    fecha_carga: row[39] || '',
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
     * Obtiene un reclamo específico por ID con todos sus productos
     */
    async getReclamoById(claimId) {
        const reclamos = await this.getReclamos(0);
        return reclamos.find(r => String(r.id) === String(claimId)) || null;
    }

    /**
     * Actualiza celdas para todas las filas pertenecientes a un Reclamo
     * @param {string|number} claimId
     * @param {Object} updates Mapeo columna -> nuevo valor (ej: { 'AO': 'Aprobado', 'L': 'Hugo Basile' })
     */
    async updateReclamo(claimId, updates) {
        if (!this.hasCredentials) {
            throw new Error('No se encontraron credenciales de Google Sheets configuradas. En Netlify, debes definir la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.');
        }

        const claim = await this.getReclamoById(claimId);
        if (!claim) {
            throw new Error(`Reclamo con ID ${claimId} no encontrado.`);
        }

        const dataUpdates = [];
        for (const rowNum of claim.rowNumbers) {
            for (const [col, val] of Object.entries(updates)) {
                dataUpdates.push({
                    range: `${this.tabName}!${col}${rowNum}`,
                    values: [[val]]
                });
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

        return true;
    }
}

module.exports = new GoogleSheetsService();
