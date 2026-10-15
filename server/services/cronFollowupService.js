const googleSheetsService = require('./googleSheetsService');
const reclamosDatabaseService = require('./reclamosDatabaseService');
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
        const diasFinSinRespuestaCons = parseInt(process.env.CRON_CONSUMIDOR_DIAS_FIN_SIN_RESPUESTA || '7', 10);

        const results = {
            supervisoresConsultados: 0,
            supervisoresElevados: 0,
            consumidoresConsultados: 0,
            consumidoresFSR: 0,
            errores: []
        };

        for (const claim of reclamos) {
            // Solo procesamos reclamos aprobados/en curso por administración
            if (claim.estado_admin !== 'Aprobado' && claim.estado_admin !== 'En curso') continue;

            // 1. SEGUIMIENTO DE SUPERVISOR
            if (claim.estado_supervisor === 'Pendiente') {
                const fechaCarga = claim.fecha_carga ? new Date(claim.fecha_carga) : new Date();
                const diffDias = Math.floor((now - fechaCarga) / (1000 * 60 * 60 * 24));

                if (diffDias >= diasConsultaSup) {
                    // Contar reintentos reales registrados en la base de datos MySQL
                    const reintentosActuales = await reclamosDatabaseService.getNotificationCount(claim.id, 'supervisor');

                    if (reintentosActuales >= maxReintentosSup) {
                        // Pasar a "Sin respuesta" y elevar a EMAILS_ELEVACION
                        try {
                            await googleSheetsService.updateReclamo(claim.id, {
                                'AQ': 'Sin respuesta'
                            }, {
                                actor: 'sistema_cron',
                                motivo: `Sin respuesta tras ${maxReintentosSup} recordatorios.`
                            });

                            await emailWorkflowService.sendElevationAlert(
                                claim,
                                `El supervisor ${claim.supervisor} no respondió a las ${maxReintentosSup} consultas periódicas de seguimiento de acción.`
                            );

                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'elevacion_gerencia',
                                destinatario_email: process.env.EMAILS_ELEVACION || '',
                                tipo_notificacion: 'alerta_elevacion_supervisor',
                                reintento_nro: reintentosActuales + 1,
                                estado_envio: 'enviado'
                            });

                            results.supervisoresElevados++;
                        } catch (e) {
                            results.errores.push(`Error elevando reclamo #${claim.id}: ${e.message}`);
                        }
                    } else {
                        // Reenviar consulta periódica
                        try {
                            await emailWorkflowService.sendSupervisorActionEmail(claim);
                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'supervisor',
                                destinatario_email: claim.supervisor_email || '',
                                tipo_notificacion: 'recordatorio_supervisor',
                                reintento_nro: reintentosActuales + 1,
                                estado_envio: 'enviado'
                            });
                            results.supervisoresConsultados++;
                        } catch (e) {
                            results.errores.push(`Error consultando supervisor para #${claim.id}: ${e.message}`);
                        }
                    }
                }
            }

            // 2. SEGUIMIENTO DE CONSUMIDOR
            // Si el supervisor ya resolvió la compensación y el consumidor aún no completó su respuesta
            if (claim.estado_supervisor === 'Resuelto') {
                const consumidorEstado = (claim.estado_consumidor || '').trim();
                const consumidorSinRespuestaAun = consumidorEstado === 'Pendiente' || consumidorEstado === 'En curso';

                if (consumidorSinRespuestaAun) {
                    const notifConsumidorCount = await reclamosDatabaseService.getNotificationCount(claim.id, 'consumidor');

                    if (notifConsumidorCount === 0) {
                        // Enviar primera consulta al consumidor
                        try {
                            await emailWorkflowService.sendConsumerFollowupEmail(claim);
                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'consumidor',
                                destinatario_email: claim.email || '',
                                tipo_notificacion: 'encuesta_consumidor',
                                reintento_nro: 1,
                                estado_envio: 'enviado'
                            });
                            results.consumidoresConsultados++;
                        } catch (e) {
                            results.errores.push(`Error enviando encuesta a consumidor para #${claim.id}: ${e.message}`);
                        }
                    } else {
                        // Ya fue consultado: comprobar si transcurrieron J días desde el último requerimiento
                        const fechaUltimoEnvio = await reclamosDatabaseService.getLastNotificationDate(claim.id, 'consumidor');
                        if (fechaUltimoEnvio) {
                            const diffDiasCons = Math.floor((now - fechaUltimoEnvio) / (1000 * 60 * 60 * 24));
                            if (diffDiasCons >= diasFinSinRespuestaCons) {
                                try {
                                    console.log(`[CRON] Reclamo #${claim.id}: Consumidor sin respuesta tras ${diffDiasCons} días (límite J=${diasFinSinRespuestaCons}). Pasando a FSR...`);
                                    await googleSheetsService.updateReclamo(claim.id, {
                                        'AS': 'FSR'
                                    }, {
                                        actor: 'sistema_cron',
                                        motivo: `Sin respuesta del consumidor tras ${diffDiasCons} días del último requerimiento de conformidad (FSR).`
                                    });

                                    // Evaluar si corresponde pasar estado_admin a Finalizado
                                    await reclamosDatabaseService.checkAndFinalizeAdminState(claim.id);

                                    results.consumidoresFSR++;
                                } catch (e) {
                                    results.errores.push(`Error pasando a FSR reclamo #${claim.id}: ${e.message}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log('[CRON] Fin de ciclo de seguimiento:', results);
        return results;
    }
}

module.exports = new CronFollowupService();
