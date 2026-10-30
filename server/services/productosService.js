const { pool } = require('../config/database');
const systemLogService = require('./systemLogService');

class ProductosService {
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
        const emailsLimpios = String(inocuidad_emails || '').trim();

        // Validar unicidad
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

        // Validar duplicado en otra categoría
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
     * @param {Array<string>} categoriasNombres Nombres de categoría presentes en los items del reclamo
     * @returns {Promise<Array<string>>} Lista sin duplicados de casillas de correo
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
     * Obtiene productos con filtro predictivo, paginación o búsqueda
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

        if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
            sql += ` AND p.activo = ?`;
            params.push(filters.activo === true || filters.activo === 'true' || filters.activo === 1 ? 1 : 0);
        }

        if (filters.q) {
            const query = `%${filters.q.trim()}%`;
            sql += ` AND (p.nombre_empaque LIKE ? OR p.nombre_interno LIKE ? OR c.nombre LIKE ?)`;
            params.push(query, query, query);
        }

        sql += ` ORDER BY p.nombre_empaque ASC`;

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
            categoria_nombre: r.categoria_nombre || 'Sin categoría',
            categoria_activa: Boolean(r.categoria_activa),
            activo: Boolean(r.activo),
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    }

    /**
     * Búsqueda predictiva pública para formulario web de consumidores
     * Retorna productos activos donde la categoría también esté activa
     */
    async searchPublic(query = '') {
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
            sql += ` AND p.nombre_empaque LIKE ?`;
            params.push(`%${String(query).trim()}%`);
        }

        sql += ` ORDER BY p.nombre_empaque ASC LIMIT 50`;

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
            categoria_nombre: r.categoria_nombre
        }));
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
            nombre_interno: r.nombre_interno,
            nombre_empaque: r.nombre_empaque,
            categoria_id: r.categoria_id,
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
        const { nombre_interno, nombre_empaque, categoria_id, activo = 1 } = data;

        if (!nombre_interno || !String(nombre_interno).trim()) {
            throw new Error('El nombre interno del producto es obligatorio.');
        }
        if (!nombre_empaque || !String(nombre_empaque).trim()) {
            throw new Error('El nombre de empaque (packaging) es obligatorio.');
        }
        if (!categoria_id) {
            throw new Error('Debe vincular el producto a una categoría existente.');
        }

        const cat = await this.getCategoriaById(categoria_id);
        if (!cat) throw new Error('La categoría seleccionada no existe.');

        const [result] = await pool.query(
            'INSERT INTO productos (nombre_interno, nombre_empaque, categoria_id, activo) VALUES (?, ?, ?, ?)',
            [String(nombre_interno).trim(), String(nombre_empaque).trim(), Number(categoria_id), activo ? 1 : 0]
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

        const nombre_interno = data.nombre_interno !== undefined ? String(data.nombre_interno).trim() : existente.nombre_interno;
        const nombre_empaque = data.nombre_empaque !== undefined ? String(data.nombre_empaque).trim() : existente.nombre_empaque;
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
