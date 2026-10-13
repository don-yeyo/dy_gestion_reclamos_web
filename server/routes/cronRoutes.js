const express = require('express');
const router = express.Router();
const cronFollowupService = require('../services/cronFollowupService');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

/**
 * POST /api/cron/run
 * Permite ejecutar manualmente o mediante crontab / Cloud Scheduler el seguimiento
 */
router.post('/run', async (req, res) => {
    // Protección opcional por header secret o token de servicio
    const cronKey = req.headers['x-cron-key'];
    if (cronKey && cronKey !== process.env.APP_SECRET) {
        return res.status(401).json({ success: false, error: 'Clave cron inválida.' });
    }

    try {
        const report = await cronFollowupService.runFollowups();
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
