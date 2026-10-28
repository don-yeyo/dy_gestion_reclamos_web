const cronFollowupService = require('../services/cronFollowupService');
const { initDatabase } = require('../config/database');

/**
 * Netlify Scheduled Function: Seguimiento de Reclamos Don Yeyo S.A.
 * 
 * Se ejecuta automáticamente según la regla cron configurada en netlify.toml.
 * Admite parametrización por variables de entorno:
 *  - CRON_FOLLOWUP_ENABLED: "false" o "0" para apagar el cron por completo sin redeploy.
 *  - CRON_HORAS_EJECUCION_ARG: Lista de horas permitidas en zona horaria Argentina (ej. "9,16").
 */
exports.handler = async (event, context) => {
    console.log('[NETLIFY CRON] Evento de tarea programada recibido.');

    // 1. Flag de activación/desactivación total por variable de entorno
    const isEnabled = process.env.CRON_FOLLOWUP_ENABLED !== 'false' && process.env.CRON_FOLLOWUP_ENABLED !== '0';
    if (!isEnabled) {
        console.log('[NETLIFY CRON] Ejecución omitida: CRON_FOLLOWUP_ENABLED está configurado en false.');
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                skipped: true,
                reason: 'CRON_FOLLOWUP_ENABLED=false (Desactivado por variable de entorno)'
            })
        };
    }

    // 2. Filtro opcional por horas de ejecución en horario de Argentina (UTC-3)
    const horasConfig = (process.env.CRON_HORAS_EJECUCION_ARG || '').trim();
    if (horasConfig) {
        try {
            // Obtenemos la hora actual en Argentina
            const horaArgStr = new Intl.DateTimeFormat('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: 'numeric',
                hour12: false
            }).format(new Date());

            const horaActualArg = parseInt(horaArgStr, 10);
            const horasPermitidas = horasConfig.split(',').map(h => parseInt(h.trim(), 10)).filter(h => !isNaN(h));

            if (horasPermitidas.length > 0 && !horasPermitidas.includes(horaActualArg)) {
                console.log(`[NETLIFY CRON] Hora actual en Argentina (${horaActualArg}:00) no coincide con CRON_HORAS_EJECUCION_ARG (${horasConfig}). Omitiendo ejecución.`);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        success: true,
                        skipped: true,
                        reason: `Hora actual ${horaActualArg}:00 no está en [${horasConfig}]`
                    })
                };
            }
        } catch (tzErr) {
            console.warn('[NETLIFY CRON] Advertencia al calcular zona horaria de Argentina:', tzErr.message);
        }
    }

    // 3. Ejecución del ciclo de seguimiento
    try {
        console.log('[NETLIFY CRON] Inicializando conexión MySQL y ejecutando ciclo de seguimiento...');
        await initDatabase();
        const report = await cronFollowupService.runFollowups();
        console.log('[NETLIFY CRON SUCCESS] Ciclo de seguimiento completado exitosamente:', JSON.stringify(report));

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                report
            })
        };
    } catch (err) {
        console.error('[NETLIFY CRON ERROR] Error durante la ejecución del cron:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: err.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
