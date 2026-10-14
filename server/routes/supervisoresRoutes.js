const express = require('express');
const router = express.Router();
const supervisorLookupService = require('../services/supervisorLookupService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

/**
 * GET /api/supervisores/lookup?lat=-34.60&lng=-58.38
 * POST /api/supervisores/lookup { lat, lng }
 * Endpoint para resolución de supervisores por coordenadas (consumido por donyeyo.com.ar)
 */
const handleLookup = async (req, res) => {
    const lat = req.query.lat || req.body.lat;
    const lng = req.query.lng || req.body.lng;

    if (lat === undefined || lng === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Parámetros lat y lng requeridos.'
        });
    }

    try {
        const result = await supervisorLookupService.findSupervisor(lat, lng);
        res.json({
            success: true,
            ...result
        });
    } catch (err) {
        console.error('[SUPERVISOR LOOKUP ERROR]', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

router.get('/lookup', handleLookup);
router.post('/lookup', handleLookup);

/**
 * GET /api/supervisores/info
 * Consulta información y estadísticas de la cobertura activa
 */
router.get('/info', async (req, res) => {
    try {
        const info = await supervisorLookupService.getInfo();
        res.json({
            success: true,
            ...info
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/supervisores/raw
 * Retorna el archivo GeoJSON crudo activo para descarga o edición en geojson.io
 */
router.get('/raw', async (req, res) => {
    try {
        const geojson = await supervisorLookupService.getRawGeoJSON();
        res.json(geojson);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/supervisores/upload
 * Permite a administradores subir un nuevo archivo GeoJSON de cobertura
 */
router.post('/upload', authMiddleware, requireRole(['admin', 'sysadmin']), async (req, res) => {
    try {
        const geojson = req.body;
        if (!geojson) {
            return res.status(400).json({
                success: false,
                error: 'Contenido GeoJSON no provisto en el cuerpo de la petición.'
            });
        }

        const uploader = req.user && req.user.email ? req.user.email : 'admin';
        const updatedInfo = await supervisorLookupService.saveNewGeoJSON(geojson, uploader);
        res.json({
            success: true,
            message: 'Archivo de cobertura geográfica de supervisores actualizado correctamente.',
            info: updatedInfo
        });
    } catch (err) {
        console.error('[GEOJSON UPLOAD ERROR]', err);
        res.status(400).json({
            success: false,
            error: 'Error al procesar el archivo GeoJSON: ' + err.message
        });
    }
});

module.exports = router;
