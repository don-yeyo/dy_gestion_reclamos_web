const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const systemLogService = require('./systemLogService');

const DEFAULT_INOCUIDAD_EMAILS_BY_CAT = {
    PANIFICADOS: 'inocuidad.panificados@donyeyo.com.ar, calidad@donyeyo.com.ar',
    PASTA: 'inocuidad.pastas@donyeyo.com.ar, calidad@donyeyo.com.ar',
    TAPAS: 'inocuidad.tapas@donyeyo.com.ar, calidad@donyeyo.com.ar',
    OTROS: 'calidad@donyeyo.com.ar'
};

const FALLBACK_CSV_CONTENT = `Nombre,Categoría
Pan Lacteado x360 gr,PANIFICADOS
Pan Lacteado x600 gr,PANIFICADOS
Pan de Mesa x350 gr,PANIFICADOS
Pan de Mesa x570 gr,PANIFICADOS
Pan Doble Salvado x350 gr,PANIFICADOS
Pan Doble Salvado x600 gr,PANIFICADOS
Pan Integral x500 gr,PANIFICADOS
Pan 100% Grano Entero x400 gr,PANIFICADOS
Pan P/Hamburguesas x210 gr,PANIFICADOS
Pan P/Maxi Hamburguesas x280 gr,PANIFICADOS
Pan P/Panchos x210 gr,PANIFICADOS
Pan P/Super Panchos x320 gr,PANIFICADOS
Pan Lomito x280 gr,PANIFICADOS
Capelletis Carne y Jamón x400 gr,PASTA
Capelletis Jamón y Queso x400 gr,PASTA
Fideos Cinta Ancha x500 gr,PASTA
Fideos Cinta Fina x500 gr,PASTA
Fideos Fusiles x500 gr,PASTA
Ñoquis x500 gr,PASTA
Ravioles 4 quesos x500 gr,PASTA
Ravioles Espinaca y Carne x1 kg,PASTA
Ravioles Espinaca y Carne x500 gr,PASTA
Ravioles Espinaca y Pollo x1 kg,PASTA
Ravioles Espinaca y Pollo x500 gr,PASTA
Ravioles Espinaca y Ricota x500 gr,PASTA
"Ravioles Espinaca, Ricota y Queso x1 kg",PASTA
Sorrentinos Jamón y Queso x400 gr,PASTA
Discos P/Emp. Horno x330 gr,TAPAS
Discos P/Emp. Criolla x330 gr,TAPAS
Discos P/Emp. Freír x330 gr,TAPAS
Discos P/Pasc. Hojaldre x400 gr,TAPAS
Discos P/Pasc. Criolla x400 gr,TAPAS
Discos P/Pasc. Light x400 gr,TAPAS
Discos P/Emp Regionales Criolla x615 gr,TAPAS
Discos P/Emp Regionales Horno x615 gr,TAPAS
Discos P/Emp Regionales Freír x615g,TAPAS
Discos P/Emp Rotiseras Horno x500 gr,TAPAS
Discos P/Emp Rotiseras Criolla x500 gr,TAPAS
Discos P/Emp Copetín Horno x360 gr,TAPAS
Pionono x200 gr,OTROS
Vainillas x180 gr,OTROS
Pan dulce Milanés x500 gr,OTROS
Pan dulce sin frutas x500 gr,OTROS
Pan dulce con chips de chocolate x500 gr,OTROS
Tortillas de trigo Tradicional x180 gr,OTROS
Tortillas de trigo Integral x180 gr,OTROS
Budín de vainilla x240 gr,OTROS
Budín de vainilla con chips de chocolate x240 gr,OTROS
Budín de naranja x240 gr,OTROS
Ravioles de Verdura x900g,PASTA
Ravioles de Pollo y Verdura x900g,PASTA
Ravioles 4 Quesos x900g,PASTA
Fideos Cinta Fina x450g,PASTA
Ñoquis x500g,PASTA
Pascualina Criolla x350g,TAPAS
Tapas para Empanadas x300g,TAPAS
Pionono x350g,OTROS
Pan Dulce con Frutas x400g,OTROS`;

class ProductosService {
    /**
     * Lee y parsea el archivo productos_reclamos.csv desde el proyecto web o server/data
     */
    parseCsvProductos() {
        const candidatePaths = [
            'C:\\Users\\gabrielt\\Documents\\Proyectos\\SitioWeb\\donyeyo.com.ar\\productos_reclamos.csv',
            path.resolve(__dirname, '../data/productos_reclamos.csv')
        ];

        let rawContent = FALLBACK_CSV_CONTENT;
        for (const p of candidatePaths) {
            try {
                if (fs.existsSync(p)) {
                    rawContent = fs.readFileSync(p, 'utf8');
                    break;
                }
            } catch (_) {}
        }

        const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const items = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === 0 && /^nombre\s*,\s*categor/i.test(line)) {
                continue;
            }
            let nombre = '';
            let categoria = '';
            if (line.startsWith('"')) {
                const endQuote = line.indexOf('",');
                if (endQuote !== -1) {
                    nombre = line.slice(1, endQuote).trim();
                    categoria = line.slice(endQuote + 2).trim();
                }
            }
            if (!nombre) {
                const lastComma = line.lastIndexOf(',');
                if (lastComma !== -1) {
                    nombre = line.slice(0, lastComma).replace(/^"|"$/g, '').trim();
                    categoria = line.slice(lastComma + 1).replace(/^"|"$/g, '').trim();
                }
            }
            if (nombre && categoria) {
                items.push({ nombre, categoria: categoria.toUpperCase() });
            }
        }

        return items;
    }

    /**
     * Puebla o sincroniza las tablas producto_categorias y productos a partir de productos_reclamos.csv
     */
    async syncFromCsv(customConn = null, userEmail = 'sistema') {
        const conn = customConn || pool;
        const csvItems = this.parseCsvProductos();
        if (csvItems.length === 0) return { categorias: 0, productos: 0 };

        // 1. Asegurar las categorías del CSV
        const uniqueCats = Array.from(new Set(csvItems.map(i => i.categoria)));
        const catIdByName = new Map();

        for (const catName of uniqueCats) {
            const defaultEmails = DEFAULT_INOCUIDAD_EMAILS_BY_CAT[catName] || 'calidad@donyeyo.com.ar';
            await conn.query(
                `INSERT INTO producto_categorias (nombre, inocuidad_emails, activo)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE activo = 1`,
                [catName, defaultEmails]
            );
        }

        const [catRows] = await conn.query('SELECT id, nombre FROM producto_categorias');
        for (const r of catRows) {
            catIdByName.set(String(r.nombre).trim().toUpperCase(), r.id);
        }

        // 2. Limpiar productos demo antiguos si aún existen y no están en el CSV
        const demoNames = [
            'Ravioles Ricota y Pollo Don Yeyo x 500g',
            'Ñoquis de Papa Clásicos Don Yeyo x 500g',
            'Fideos Tallarines al Huevo Don Yeyo x 500g',
            'Tapas para Empanadas Hojaldradas Don Yeyo 12 un',
            'Pascualina Criolla Don Yeyo x 2 discos',
            'Pan de Mesa Lactal Blanco Don Yeyo 400g'
        ];
        const demoCats = ['Pastas Frescas', 'Tapas y Masas', 'Panificados y Secos'];
        try {
            const placeholders = demoNames.map(() => '?').join(',');
            await conn.query(`DELETE FROM productos WHERE nombre_empaque IN (${placeholders})`, demoNames);
            const catPlaceholders = demoCats.map(() => '?').join(',');
            await conn.query(
                `DELETE FROM producto_categorias WHERE nombre IN (${catPlaceholders}) AND id NOT IN (SELECT DISTINCT categoria_id FROM productos)`,
                demoCats
            );
        } catch (_) {}

        // 3. Insertar o actualizar cada producto del CSV sin duplicar
        const [existingProds] = await conn.query('SELECT id, nombre_empaque, nombre_interno FROM productos');
        const existingByName = new Map();
        for (const p of existingProds) {
            existingByName.set(String(p.nombre_empaque).trim().toLowerCase(), p.id);
            existingByName.set(String(p.nombre_interno).trim().toLowerCase(), p.id);
        }

        let inserted = 0;
        let updated = 0;
        for (const item of csvItems) {
            const catId = catIdByName.get(item.categoria);
            if (!catId) continue;

            const existingId = existingByName.get(item.nombre.toLowerCase());
            if (existingId) {
                await conn.query(
                    'UPDATE productos SET categoria_id = ? WHERE id = ?',
                    [catId, existingId]
                );
                updated++;
            } else {
                await conn.query(
                    'INSERT INTO productos (nombre_interno, nombre_empaque, categoria_id, activo) VALUES (?, ?, ?, 1)',
                    [item.nombre, item.nombre, catId]
                );
                inserted++;
            }
        }

        if (!customConn && (inserted > 0 || updated > 0)) {
            try {
                await systemLogService.logConfiguracion({
                    actor: 'administrador',
                    actor_email: userEmail,
                    accion: 'sincronizacion_csv_productos',
                    modulo: 'productos',
                    descripcion: `Sincronización desde productos_reclamos.csv (${inserted} nuevos, ${updated} actualizados)`,
                    valores_anteriores: null,
                    valores_nuevos: { inserted, updated, totalCsv: csvItems.length }
                });
            } catch (_) {}
        }

        return {
            categorias: uniqueCats.length,
            totalCsv: csvItems.length,
            inserted,
            updated
        };
    }

    // ==========================================
    // 1. CATEGORÍAS DE PRODUCTOS
    // ==========================================

    /**
     * Obtiene todas las categorías con conteo de productos asociados
     */
    async getCategorias(filters = {}) {
        let sql = `
            SELECT 
                c.id,
                c.nombre,
                c.inocuidad_emails,
                c.activo,
                c.created_at,
                c.updated_at,
                COUNT(p.id) as cantidad_productos
            FROM producto_categorias c
            LEFT JOIN productos p ON c.id = p.categoria_id
            WHERE 1=1
        `;
        const params = [];

        if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
            sql += ` AND c.activo = ?`;
            params.push(filters.activo === true || filters.activo === 'true' || filters.activo === 1 ? 1 : 0);
        }

        sql += ` GROUP BY c.id ORDER BY c.nombre ASC`;

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            nombre: r.nombre,
            inocuidad_emails: r.inocuidad_emails || '',
            activo: Boolean(r.activo),
            cantidad_productos: Number(r.cantidad_productos) || 0,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    }

    /**
     * Obtiene una categoría por ID
     */
    async getCategoriaById(id) {
        const [rows] = await pool.query('SELECT * FROM producto_categorias WHERE id = ?', [id]);
        if (!rows || rows.length === 0) return null;
        const r = rows[0];
        return {
            id: r.id,
            nombre: r.nombre,
            inocuidad_emails: r.inocuidad_emails || '',
            activo: Boolean(r.activo),
            created_at: r.created_at,
            updated_at: r.updated_at
        };
    }

    /**
     * Crea una nueva categoría
     */
    async createCategoria(data, userEmail = 'admin') {
        const { nombre, inocuidad_emails, activo = 1 } = data;

        if (!nombre || !String(nombre).trim()) {
            throw new Error('El nombre de la categoría es obligatorio.');
        }

        const nombreLimpio = String(nombre).trim();
        const emailsLimpios = String(inocuidad_emails || 'calidad@donyeyo.com.ar').trim();

        const [duplicados] = await pool.query('SELECT id FROM producto_categorias WHERE LOWER(nombre) = LOWER(?)', [nombreLimpio]);
        if (duplicados && duplicados.length > 0) {
            throw new Error(`Ya existe una categoría denominada "${nombreLimpio}".`);
        }

        const [result] = await pool.query(
            'INSERT INTO producto_categorias (nombre, inocuidad_emails, activo) VALUES (?, ?, ?)',
            [nombreLimpio, emailsLimpios, activo ? 1 : 0]
        );

        const nueva = await this.getCategoriaById(result.insertId);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'creacion_categoria_producto',
                modulo: 'producto_categorias',
                descripcion: `Alta de categoría "${nueva.nombre}" con emails de Inocuidad: ${nueva.inocuidad_emails}`,
                valores_anteriores: null,
                valores_nuevos: nueva
            });
        } catch (logErr) {
            console.warn('[PRODUCTOS] Error registrando auditoría:', logErr.message);
        }

        return nueva;
    }

    /**
     * Actualiza una categoría existente
     */
    async updateCategoria(id, data, userEmail = 'admin') {
        const existente = await this.getCategoriaById(id);
        if (!existente) throw new Error('Categoría no encontrada.');

        const nombre = data.nombre !== undefined ? String(data.nombre).trim() : existente.nombre;
        const inocuidad_emails = data.inocuidad_emails !== undefined ? String(data.inocuidad_emails).trim() : existente.inocuidad_emails;
        const activo = data.activo !== undefined ? (data.activo ? 1 : 0) : (existente.activo ? 1 : 0);

        if (!nombre) throw new Error('El nombre de la categoría no puede quedar vacío.');

        const [dups] = await pool.query('SELECT id FROM producto_categorias WHERE LOWER(nombre) = LOWER(?) AND id != ?', [nombre, id]);
        if (dups && dups.length > 0) {
            throw new Error(`Ya existe otra categoría denominada "${nombre}".`);
        }

        await pool.query(
            'UPDATE producto_categorias SET nombre = ?, inocuidad_emails = ?, activo = ? WHERE id = ?',
            [nombre, inocuidad_emails, activo, id]
        );

        const actualizada = await this.getCategoriaById(id);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'actualizacion_categoria_producto',
                modulo: 'producto_categorias',
                descripcion: `Modificación de categoría ID ${id} ("${actualizada.nombre}")`,
                valores_anteriores: existente,
                valores_nuevos: actualizada
            });
        } catch (logErr) {
            console.warn('[PRODUCTOS] Error registrando auditoría:', logErr.message);
        }

        return actualizada;
    }

    /**
     * Elimina una categoría (si no tiene productos asociados)
     */
    async deleteCategoria(id, userEmail = 'admin') {
        const existente = await this.getCategoriaById(id);
        if (!existente) throw new Error('Categoría no encontrada.');

        const [prods] = await pool.query('SELECT COUNT(*) as cant FROM productos WHERE categoria_id = ?', [id]);
        const count = prods && prods[0] ? Number(prods[0].cant) : 0;
        if (count > 0) {
            throw new Error(`No se puede eliminar la categoría "${existente.nombre}" porque tiene ${count} producto(s) asociado(s). Reasigná o eliminá primero esos productos.`);
        }

        await pool.query('DELETE FROM producto_categorias WHERE id = ?', [id]);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'eliminacion_categoria_producto',
                modulo: 'producto_categorias',
                descripcion: `Eliminación de categoría ID ${id} ("${existente.nombre}")`,
                valores_anteriores: existente,
                valores_nuevos: null
            });
        } catch (_) {}

        return existente;
    }

    /**
     * Activa o desactiva lógicamente una categoría
     */
    async toggleCategoriaActiva(id, userEmail = 'admin') {
        const cat = await this.getCategoriaById(id);
        if (!cat) throw new Error('Categoría no encontrada.');

        const nuevoActivo = cat.activo ? 0 : 1;
        await pool.query('UPDATE producto_categorias SET activo = ? WHERE id = ?', [nuevoActivo, id]);

        return await this.getCategoriaById(id);
    }

    /**
     * Determina los emails de Inocuidad correspondientes para un conjunto de nombres de categorías
     */
    async getInocuidadEmailsPorCategorias(categoriasNombres = []) {
        if (!Array.isArray(categoriasNombres) || categoriasNombres.length === 0) {
            return [];
        }

        const limpias = categoriasNombres
            .map(c => String(c || '').trim().toLowerCase())
            .filter(c => c.length > 0);

        if (limpias.length === 0) return [];

        const placeholders = limpias.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT inocuidad_emails FROM producto_categorias WHERE LOWER(nombre) IN (${placeholders}) AND activo = 1`,
            limpias
        );

        const emailSet = new Set();
        for (const row of rows) {
            if (row.inocuidad_emails) {
                const parts = row.inocuidad_emails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
                for (const p of parts) {
                    emailSet.add(p);
                }
            }
        }

        return Array.from(emailSet);
    }

    // ==========================================
    // 2. CATÁLOGO DE PRODUCTOS
    // ==========================================

    /**
     * Obtiene productos con filtro predictivo, categoría o estado
     */
    async getProductos(filters = {}) {
        let sql = `
            SELECT 
                p.id,
                p.nombre_interno,
                p.nombre_empaque,
                p.categoria_id,
                c.nombre as categoria_nombre,
                c.activo as categoria_activa,
                p.activo,
                p.created_at,
                p.updated_at
            FROM productos p
            LEFT JOIN producto_categorias c ON p.categoria_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.categoria_id) {
            sql += ` AND p.categoria_id = ?`;
            params.push(Number(filters.categoria_id));
        }

        if (filters.categoria) {
            sql += ` AND LOWER(c.nombre) = LOWER(?)`;
            params.push(String(filters.categoria).trim());
        }

        if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
            sql += ` AND p.activo = ?`;
            params.push(filters.activo === true || filters.activo === 'true' || filters.activo === 1 ? 1 : 0);
        }

        if (filters.q) {
            const query = `%${filters.q.trim()}%`;
            sql += ` AND (p.nombre_empaque LIKE ? OR p.nombre_interno LIKE ? OR c.nombre LIKE ?)`;
            params.push(query, query, query);
        }

        sql += ` ORDER BY c.nombre ASC, p.nombre_empaque ASC`;

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            nombre: r.nombre_empaque,
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
            categoria: r.categoria_nombre || 'Sin categoría',
            categoria_nombre: r.categoria_nombre || 'Sin categoría',
            categoria_activa: Boolean(r.categoria_activa),
            activo: Boolean(r.activo),
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    }

    /**
     * Consulta pública externa para formulario web de consumidores y sistemas externos
     * Retorna todos los productos activos cuya categoría también esté activa
     */
    async searchPublic(query = '', categoria = '') {
        let sql = `
            SELECT 
                p.id,
                p.nombre_interno,
                p.nombre_empaque,
                p.categoria_id,
                c.nombre as categoria_nombre
            FROM productos p
            JOIN producto_categorias c ON p.categoria_id = c.id
            WHERE p.activo = 1 AND c.activo = 1
        `;
        const params = [];

        if (query && String(query).trim().length > 0) {
            const q = `%${String(query).trim()}%`;
            sql += ` AND (p.nombre_empaque LIKE ? OR p.nombre_interno LIKE ? OR c.nombre LIKE ?)`;
            params.push(q, q, q);
        }

        if (categoria && String(categoria).trim().length > 0) {
            sql += ` AND LOWER(c.nombre) = LOWER(?)`;
            params.push(String(categoria).trim());
        }

        sql += ` ORDER BY p.nombre_empaque ASC`;

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            nombre: r.nombre_empaque,
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
            categoria: r.categoria_nombre,
            categoria_nombre: r.categoria_nombre
        }));
    }

    /**
     * Obtiene el catálogo externo completo (productos + categorías + agrupación por categoría)
     */
    async getPublicCatalog(query = '', categoria = '') {
        const productos = await this.searchPublic(query, categoria);
        const categoriasActivas = await this.getCategorias({ activo: 1 });
        const por_categoria = {};
        for (const cat of categoriasActivas) {
            por_categoria[cat.nombre] = [];
        }
        for (const prod of productos) {
            if (!por_categoria[prod.categoria_nombre]) {
                por_categoria[prod.categoria_nombre] = [];
            }
            por_categoria[prod.categoria_nombre].push(prod);
        }
        return {
            productos,
            categorias: categoriasActivas.map(c => ({
                id: c.id,
                nombre: c.nombre,
                cantidad_productos: (por_categoria[c.nombre] || []).length
            })),
            por_categoria
        };
    }

    /**
     * Obtiene un producto por ID
     */
    async getProductoById(id) {
        const [rows] = await pool.query(`
            SELECT p.*, c.nombre as categoria_nombre 
            FROM productos p 
            LEFT JOIN producto_categorias c ON p.categoria_id = c.id 
            WHERE p.id = ?
        `, [id]);
        if (!rows || rows.length === 0) return null;
        const r = rows[0];
        return {
            id: r.id,
            nombre: r.nombre_empaque,
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
            categoria: r.categoria_nombre || 'Sin categoría',
            categoria_nombre: r.categoria_nombre || 'Sin categoría',
            activo: Boolean(r.activo),
            created_at: r.created_at,
            updated_at: r.updated_at
        };
    }

    /**
     * Crea un nuevo producto en catálogo
     */
    async createProducto(data, userEmail = 'admin') {
        const nombre_empaque = String(data.nombre_empaque || data.nombre || data.nombre_interno || '').trim();
        const nombre_interno = String(data.nombre_interno || nombre_empaque).trim();
        const { categoria_id, activo = 1 } = data;

        if (!nombre_empaque) {
            throw new Error('El nombre del producto es obligatorio.');
        }
        if (!categoria_id) {
            throw new Error('Debe vincular el producto a una categoría existente.');
        }

        const cat = await this.getCategoriaById(categoria_id);
        if (!cat) throw new Error('La categoría seleccionada no existe.');

        const [result] = await pool.query(
            'INSERT INTO productos (nombre_interno, nombre_empaque, categoria_id, activo) VALUES (?, ?, ?, ?)',
            [nombre_interno, nombre_empaque, Number(categoria_id), activo ? 1 : 0]
        );

        const nuevo = await this.getProductoById(result.insertId);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'creacion_producto_catalogo',
                modulo: 'productos',
                descripcion: `Alta de producto en catálogo: "${nuevo.nombre_empaque}" (Cat: ${nuevo.categoria_nombre})`,
                valores_anteriores: null,
                valores_nuevos: nuevo
            });
        } catch (logErr) {
            console.warn('[PRODUCTOS] Error registrando auditoría:', logErr.message);
        }

        return nuevo;
    }

    /**
     * Actualiza un producto existente
     */
    async updateProducto(id, data, userEmail = 'admin') {
        const existente = await this.getProductoById(id);
        if (!existente) throw new Error('Producto no encontrado.');

        const nombre_empaque = data.nombre_empaque !== undefined
            ? String(data.nombre_empaque).trim()
            : (data.nombre !== undefined ? String(data.nombre).trim() : existente.nombre_empaque);
        const nombre_interno = data.nombre_interno !== undefined
            ? String(data.nombre_interno).trim()
            : nombre_empaque;
        const categoria_id = data.categoria_id !== undefined ? Number(data.categoria_id) : existente.categoria_id;
        const activo = data.activo !== undefined ? (data.activo ? 1 : 0) : (existente.activo ? 1 : 0);

        if (!nombre_interno) throw new Error('El nombre interno no puede estar vacío.');
        if (!nombre_empaque) throw new Error('El nombre de empaque no puede estar vacío.');

        const cat = await this.getCategoriaById(categoria_id);
        if (!cat) throw new Error('La categoría vinculada no existe.');

        await pool.query(
            'UPDATE productos SET nombre_interno = ?, nombre_empaque = ?, categoria_id = ?, activo = ? WHERE id = ?',
            [nombre_interno, nombre_empaque, categoria_id, activo, id]
        );

        const actualizado = await this.getProductoById(id);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'actualizacion_producto_catalogo',
                modulo: 'productos',
                descripcion: `Modificación de producto ID ${id} ("${actualizado.nombre_empaque}")`,
                valores_anteriores: existente,
                valores_nuevos: actualizado
            });
        } catch (logErr) {
            console.warn('[PRODUCTOS] Error registrando auditoría:', logErr.message);
        }

        return actualizado;
    }

    /**
     * Elimina un producto del catálogo
     */
    async deleteProducto(id, userEmail = 'admin') {
        const existente = await this.getProductoById(id);
        if (!existente) throw new Error('Producto no encontrado.');

        await pool.query('DELETE FROM productos WHERE id = ?', [id]);

        try {
            await systemLogService.logConfiguracion({
                actor: 'administrador',
                actor_email: userEmail,
                accion: 'eliminacion_producto_catalogo',
                modulo: 'productos',
                descripcion: `Eliminación de producto ID ${id} ("${existente.nombre_empaque}")`,
                valores_anteriores: existente,
                valores_nuevos: null
            });
        } catch (_) {}

        return existente;
    }

    /**
     * Alterna estado activo/inactivo de un producto
     */
    async toggleProductoActivo(id, userEmail = 'admin') {
        const prod = await this.getProductoById(id);
        if (!prod) throw new Error('Producto no encontrado.');

        const nuevoActivo = prod.activo ? 0 : 1;
        await pool.query('UPDATE productos SET activo = ? WHERE id = ?', [nuevoActivo, id]);

        return await this.getProductoById(id);
    }
}

module.exports = new ProductosService();
