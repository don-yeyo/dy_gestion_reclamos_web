const googleSheetsService = require('./googleSheetsService');
const emailWorkflowService = require('./emailWorkflowService');

class CronFollowupService {
    /**
     * Ejecuta el análisis de plazos y seguimiento para reclamos activos
     */
    async runFollowups() {
        console.log('[CRON] Iniciando ciclo de seguimiento de reclamos...');
        const reclamos = await googleSheetsService.getReclamos();
        const now = new Date();

        const diasConsultaSup = parseInt(process.env.CRON_SUPERVISOR_DIAS_CONSULTA || '5', 10);
        const diasReintentoSup = parseInt(process.env.CRON_SUPERVISOR_DIAS_REINTENTO || '2', 10);
        const maxReintentosSup = parseInt(process.env.CRON_SUPERVISOR_MAX_REINTENTOS || '3', 10);
        const diasConsultaCons = parseInt(process.env.CRON_CONSUMIDOR_DIAS_CONSULTA || '3', 10);

        const results = {
            supervisoresConsultados: 0,
            supervisoresElevados: 0,
            consumidoresConsultados: 0,
            errores: []
        };

        for (const claim of reclamos) {
            // Solo procesamos reclamos aprobados por administración
            if (claim.estado_admin !== 'Aprobado') continue;

            // 1. SEGUIMIENTO DE SUPERVISOR
            if (claim.estado_supervisor === 'Pendiente') {
                const fechaCarga = claim.fecha_carga ? new Date(claim.fecha_carga) : new Date();
                const diffDias = Math.floor((now - fechaCarga) / (1000 * 60 * 60 * 24));

                if (diffDias >= diasConsultaSup) {
                    // Si ya se enviaron reintentos y se superó el límite P
                    const reintentosActuales = claim._reintentos || 0; // o tracking en metadato

                    if (reintentosActuales >= maxReintentosSup) {
                        // Pasar a "Sin respuesta" y elevar a EMAILS_ELEVACION
                        try {
                            await googleSheetsService.updateReclamo(claim.id, {
                                'AQ': 'Sin respuesta'
                            });
                            await emailWorkflowService.sendElevationAlert(
                                claim,
                                `El supervisor ${claim.supervisor} no respondió a las ${maxReintentosSup} consultas periódicas de seguimiento de acción.`
                            );
                            results.supervisoresElevados++;
                        } catch (e) {
                            results.errores.push(`Error elevando reclamo #${claim.id}: ${e.message}`);
                        }
                    } else {
                        // Reenviar consulta periódica
                        try {
                            await emailWorkflowService.sendSupervisorActionEmail(claim);
                            results.supervisoresConsultados++;
                        } catch (e) {
                            results.errores.push(`Error consultando supervisor para #${claim.id}: ${e.message}`);
                        }
                    }
                }
            }

            // 2. SEGUIMIENTO DE CONSUMIDOR
            if (claim.estado_supervisor === 'Resuelto' && claim.estado_consumidor === 'Pendiente') {
                // Verificar si pasaron F días
                // En producción se puede registrar la fecha de resolución en metadatos
                try {
                    await emailWorkflowService.sendConsumerFollowupEmail(claim);
                    results.consumidoresConsultados++;
                } catch (e) {
                    results.errores.push(`Error enviando encuesta a consumidor para #${claim.id}: ${e.message}`);
                }
            }
        }

        console.log('[CRON] Fin de ciclo de seguimiento:', results);
        return results;
    }
}

module.exports = new CronFollowupService();
