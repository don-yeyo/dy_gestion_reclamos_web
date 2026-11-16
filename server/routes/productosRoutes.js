const express = require('express');
const router = express.Router();
const productosService = require('../services/productosService');

// ==========================================
// RUTAS DE CATEGORÍAS
// ==========================================

router.get('/categorias', async (req, res) => {
    try {
        const filters = {
            activo: req.query.activo !== undefined ? req.query.activo : undefined
        };
        const categorias = await productosService.getCategorias(filters);
        res.json({ success: true, data: categorias });
    } catch (err) {
        console.error('[CATEGORIAS API] Error al obtener categorías:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/categorias', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const nueva = await productosService.createCategoria(req.body, userEmail);
        res.status(201).json({ success: true, data: nueva, message: 'Categoría creada exitosamente' });
    } catch (err) {
        console.error('[CATEGORIAS API] Error al crear categoría:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/categorias/:id', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const actualizada = await productosService.updateCategoria(req.params.id, req.body, userEmail);
        res.json({ success: true, data: actualizada, message: 'Categoría actualizada exitosamente' });
    } catch (err) {
        console.error('[CATEGORIAS API] Error al actualizar categoría:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/categorias/:id', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const eliminada = await productosService.deleteCategoria(req.params.id, userEmail);
        res.json({ success: true, data: eliminada, message: 'Categoría eliminada exitosamente' });
    } catch (err) {
        console.error('[CATEGORIAS API] Error al eliminar categoría:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.patch('/categorias/:id/toggle', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const cat = await productosService.toggleCategoriaActiva(req.params.id, userEmail);
        res.json({ success: true, data: cat, message: `Categoría ${cat.activo ? 'activada' : 'desactivada'} exitosamente` });
    } catch (err) {
        console.error('[CATEGORIAS API] Error al alternar estado de categoría:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

// ==========================================
// RUTAS DE CATÁLOGO DE PRODUCTOS
// ==========================================

router.get('/productos', async (req, res) => {
    try {
        const filters = {
            categoria_id: req.query.categoria_id,
            categoria: req.query.categoria,
            activo: req.query.activo,
            q: req.query.q
        };
        const productos = await productosService.getProductos(filters);
        const categorias = await productosService.getCategorias({ activo: req.query.activo });
        res.json({ success: true, total: productos.length, data: productos, categorias });
    } catch (err) {
        console.error('[PRODUCTOS API] Error al obtener productos:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/productos/sync-csv', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const result = await productosService.syncFromCsv(null, userEmail);
        res.json({
            success: true,
            data: result,
            message: `Catálogo sincronizado desde CSV (${result.inserted} nuevos, ${result.updated} actualizados).`
        });
    } catch (err) {
        console.error('[PRODUCTOS API] Error sincronizando CSV:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/productos', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const nuevo = await productosService.createProducto(req.body, userEmail);
        res.status(201).json({ success: true, data: nuevo, message: 'Producto registrado en catálogo' });
    } catch (err) {
        console.error('[PRODUCTOS API] Error al crear producto:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/productos/:id', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const actualizado = await productosService.updateProducto(req.params.id, req.body, userEmail);
        res.json({ success: true, data: actualizado, message: 'Producto actualizado exitosamente' });
    } catch (err) {
        console.error('[PRODUCTOS API] Error al actualizar producto:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/productos/:id', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const eliminado = await productosService.deleteProducto(req.params.id, userEmail);
        res.json({ success: true, data: eliminado, message: 'Producto eliminado exitosamente' });
    } catch (err) {
        console.error('[PRODUCTOS API] Error al eliminar producto:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

router.patch('/productos/:id/toggle', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'] || req.query.user || 'admin';
        const prod = await productosService.toggleProductoActivo(req.params.id, userEmail);
        res.json({ success: true, data: prod, message: `Producto ${prod.activo ? 'activado' : 'desactivado'} exitosamente` });
    } catch (err) {
        console.error('[PRODUCTOS API] Error al alternar estado de producto:', err.message);
        res.status(400).json({ success: false, message: err.message });
    }
});

module.exports = router;
