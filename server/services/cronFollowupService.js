const googleSheetsService = require('./googleSheetsService');
const reclamosDatabaseService = require('./reclamosDatabaseService');
const emailWorkflowService = require('./emailWorkflowService');
const seguimientosService = require('./seguimientosService');

class CronFollowupService {
    /**
     * Ejecuta el análisis de plazos y seguimiento para reclamos activos
     * Los plazos de disparo, intervalo y repeticiones se obtienen dinámicamente
     * desde la tabla de reglas de seguimiento (workflow_seguimientos).
     */
    async runFollowups() {
        console.log('[CRON] Iniciando ciclo de seguimiento de reclamos...');
        const reclamos = await googleSheetsService.getReclamos();
        const now = new Date();

        // Cargar todas las reglas de seguimiento activas del sistema
        let reglasSeguimiento = [];
        try {
            reglasSeguimiento = await seguimientosService.getAll({ activo: true });
        } catch (err) {
            console.warn('[CRON] Advertencia al cargar reglas de seguimiento desde BD:', err.message);
        }

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

            const prioridadCodigo = Number(claim.prioridad) || 20;

            // ==============================================================
            // 1. SEGUIMIENTO DE SUPERVISOR
            // ==============================================================
            if (claim.estado_supervisor === 'Pendiente') {
                const fechaCarga = claim.fecha_carga ? new Date(claim.fecha_carga) : new Date();
                const diffDias = Math.floor((now - fechaCarga) / (1000 * 60 * 60 * 24));

                // Buscar regla activa para Supervisor en estado Pendiente para la prioridad del caso
                const reglaSupervisor = reglasSeguimiento.find(r => 
                    r.rol === 'supervisor' && 
                    r.estado_codigo === 'Pendiente' && 
                    Number(r.prioridad_codigo) === prioridadCodigo
                ) || {
                    disparo_dias: 2,
                    intervalo_n_dias: 1,
                    repeticiones: 3,
                    emails_elevacion: ''
                };

                const disparoDias = Number(reglaSupervisor.disparo_dias) || 1;
                const maxRepeticiones = Number(reglaSupervisor.repeticiones) || 3;
                const intervaloNDias = Number(reglaSupervisor.intervalo_n_dias) || 1;

                if (diffDias >= disparoDias) {
                    // Contar recordatorios reales registrados en la base de datos MySQL
                    const reintentosActuales = await reclamosDatabaseService.getNotificationCount(claim.id, 'supervisor');

                    if (reintentosActuales >= maxRepeticiones) {
                        // Pasar a "Sin respuesta" y elevar a casillas directivas
                        try {
                            await googleSheetsService.updateReclamo(claim.id, {
                                'AQ': 'Sin respuesta'
                            }, {
                                actor: 'sistema_cron',
                                motivo: `Sin respuesta tras ${maxRepeticiones} recordatorios de seguimiento.`
                            });

                            await emailWorkflowService.sendElevationAlert(
                                claim,
                                `El supervisor ${claim.supervisor} no respondió a las ${maxRepeticiones} consultas periódicas de seguimiento de acción.`
                            );

                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'elevacion_gerencia',
                                destinatario_email: reglaSupervisor.emails_elevacion || process.env.EMAILS_ELEVACION || '',
                                tipo_notificacion: 'alerta_elevacion_supervisor',
                                reintento_nro: reintentosActuales + 1,
                                estado_envio: 'enviado'
                            });

                            results.supervisoresElevados++;
                        } catch (e) {
                            results.errores.push(`Error elevando reclamo #${claim.id}: ${e.message}`);
                        }
                    } else {
                        // Comprobar si corresponde reenvío periódico (si ya tuvo al menos un envío, evaluar intervalo N)
                        let correspondeEnvio = false;
                        if (reintentosActuales === 0) {
                            correspondeEnvio = true;
                        } else {
                            const fechaUltimaNotif = await reclamosDatabaseService.getLastNotificationDate(claim.id, 'supervisor');
                            if (fechaUltimaNotif) {
                                const diffDiasUltimo = (now - fechaUltimaNotif) / (1000 * 60 * 60 * 24);
                                if (diffDiasUltimo >= intervaloNDias) {
                                    correspondeEnvio = true;
                                }
                            } else {
                                correspondeEnvio = true;
                            }
                        }

                        if (correspondeEnvio) {
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
            }

            // ==============================================================
            // 2. SEGUIMIENTO DE CONSUMIDOR
            // ==============================================================
            if (claim.estado_supervisor === 'Resuelto') {
                const consumidorEstado = (claim.estado_consumidor || '').trim();
                const consumidorSinRespuestaAun = consumidorEstado === 'Pendiente' || consumidorEstado === 'En curso' || consumidorEstado === 'Resuelto sin confirmar';

                if (consumidorSinRespuestaAun) {
                    // Buscar regla activa para Consumidor en estado En curso / Pendiente
                    const reglaConsumidor = reglasSeguimiento.find(r => 
                        r.rol === 'consumidor' && 
                        (r.estado_codigo === 'En curso' || r.estado_codigo === 'Pendiente') && 
                        Number(r.prioridad_codigo) === prioridadCodigo
                    ) || {
                        disparo_dias: 3,
                        intervalo_n_dias: 2,
                        repeticiones: 2,
                        emails_elevacion: ''
                    };

                    const disparoCons = Number(reglaConsumidor.disparo_dias) || 3;
                    const maxPlazoSinRespuesta = Number(reglaConsumidor.disparo_dias) + (Number(reglaConsumidor.intervalo_n_dias) * Number(reglaConsumidor.repeticiones)) || 7;

                    const notifConsumidorCount = await reclamosDatabaseService.getNotificationCount(claim.id, 'consumidor');

                    if (notifConsumidorCount === 0) {
                        // Comprobar días desde la resolución del supervisor
                        const fechaResolucionSup = claim.fecha_estado_supervisor ? new Date(claim.fecha_estado_supervisor) : (claim.fecha_carga ? new Date(claim.fecha_carga) : now);
                        const diffDiasSup = Math.floor((now - fechaResolucionSup) / (1000 * 60 * 60 * 24));

                        if (diffDiasSup >= disparoCons) {
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
                        }
                    } else {
                        // Ya fue consultado: comprobar si transcurrió el plazo límite desde el último requerimiento
                        const fechaUltimoEnvio = await reclamosDatabaseService.getLastNotificationDate(claim.id, 'consumidor');
                        if (fechaUltimoEnvio) {
                            const diffDiasCons = Math.floor((now - fechaUltimoEnvio) / (1000 * 60 * 60 * 24));
                            if (diffDiasCons >= maxPlazoSinRespuesta) {
                                try {
                                    console.log(`[CRON] Reclamo #${claim.id}: Consumidor sin respuesta tras ${diffDiasCons} días (límite=${maxPlazoSinRespuesta}d). Pasando a Cerrado...`);
                                    await googleSheetsService.updateReclamo(claim.id, {
                                        'AS': 'Cerrado'
                                    }, {
                                        actor: 'sistema_cron',
                                        motivo: `Sin respuesta del consumidor tras ${diffDiasCons} días del requerimiento de conformidad. Auto-establecido en Cerrado.`
                                    });

                                    // Evaluar si corresponde pasar estado_admin a Finalizado
                                    await reclamosDatabaseService.checkAndFinalizeAdminState(claim.id);

                                    results.consumidoresFSR++;
                                } catch (e) {
                                    results.errores.push(`Error pasando a Cerrado reclamo #${claim.id}: ${e.message}`);
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

    /**
     * Simula el avance temporal del cron para un reclamo real específico
     * Permite proyectar el comportamiento futuro de las reglas y despachar los correos
     * resultantes a la casilla de pruebas sin alterar Google Sheets (a menos que se tilde expresamente).
     */
    async simularSeguimientoReclamo(claimId, options = {}) {
        const idStr = String(claimId);
        let claim = await reclamosDatabaseService.getReclamoById(idStr);
        if (!claim) {
            const allSheets = await googleSheetsService.getReclamos();
            claim = allSheets.find(c => String(c.id) === idStr);
        }
        if (!claim) {
            throw new Error(`No se encontró el Reclamo #${idStr}`);
        }

        const diasAvanzar = Math.max(0, parseInt(options.diasAvanzar || 0, 10));
        const virtualNow = new Date(Date.now() + diasAvanzar * 86400000);
        const syncGoogleSheets = Boolean(options.syncGoogleSheets);
        const enviarEmails = options.enviarEmails !== false;
        const testRecipient = (options.testRecipient || process.env.EMAIL_TEST_RECIPIENT || 'gabrielt@donyeyo.com.ar').replace(/"/g, '');
        const userEmail = options.userEmail || 'admin_simulador';

        const originalEnvMode = process.env.EMAIL_TEST_MODE;
        const originalEnvRecipient = process.env.EMAIL_TEST_RECIPIENT;
        process.env.EMAIL_TEST_MODE = 'true';
        process.env.EMAIL_TEST_RECIPIENT = testRecipient;

        const eventos = [];
        const emailsDespachados = [];
        let estadoAdminActualizado = claim.estado_admin;
        let estadoSupervisorActualizado = claim.estado_supervisor;
        let estadoConsumidorActualizado = claim.estado_consumidor;

        try {
            let reglasSeguimiento = [];
            try {
                reglasSeguimiento = await seguimientosService.getAll({ activo: true });
            } catch (err) {
                console.warn('[SIMULADOR CRON] Error al cargar reglas desde BD:', err.message);
            }

            const prioridadCodigo = Number(claim.prioridad) || 20;

            if (claim.estado_admin !== 'Aprobado' && claim.estado_admin !== 'En curso') {
                eventos.push({
                    tipo: 'info',
                    mensaje: `El reclamo #${idStr} está en estado Administración "${claim.estado_admin}". El cron de seguimiento solo procesa reclamos "En curso" o "Aprobado".`
                });
                return {
                    success: true,
                    claimId: idStr,
                    diasAvanzados: diasAvanzar,
                    fechaVirtual: virtualNow.toISOString(),
                    syncGoogleSheets,
                    eventos,
                    emailsDespachados
                };
            }

            // 1. EVALUAR SUPERVISOR
            if (claim.estado_supervisor === 'Pendiente') {
                const fechaCarga = claim.fecha_carga ? new Date(claim.fecha_carga) : new Date();
                const diffDias = Math.floor((virtualNow - fechaCarga) / (1000 * 60 * 60 * 24));

                const reglaSupervisor = reglasSeguimiento.find(r => 
                    r.rol === 'supervisor' && 
                    r.estado_codigo === 'Pendiente' && 
                    Number(r.prioridad_codigo) === prioridadCodigo
                ) || {
                    disparo_dias: 2,
                    intervalo_n_dias: 1,
                    repeticiones: 3,
                    emails_elevacion: ''
                };

                const disparoDias = Number(reglaSupervisor.disparo_dias) || 1;
                const maxRepeticiones = Number(reglaSupervisor.repeticiones) || 3;
                const intervaloNDias = Number(reglaSupervisor.intervalo_n_dias) || 1;

                eventos.push({
                    tipo: 'analisis',
                    mensaje: `Evaluando Supervisor: Días calculados a la fecha virtual = ${diffDias} días. Disparo inicial = ${disparoDias}d, Intervalo N = ${intervaloNDias}d, Máx. repeticiones = ${maxRepeticiones}.`
                });

                if (diffDias >= disparoDias) {
                    const reintentosActuales = await reclamosDatabaseService.getNotificationCount(claim.id, 'supervisor');

                    if (reintentosActuales >= maxRepeticiones) {
                        estadoSupervisorActualizado = 'Sin respuesta';
                        const motivoElevacion = `Simulación temporal (+${diasAvanzar}d): Sin respuesta tras ${maxRepeticiones} recordatorios.`;

                        if (syncGoogleSheets) {
                            await googleSheetsService.updateReclamo(claim.id, { 'AQ': 'Sin respuesta' }, {
                                actor: 'simulador_cron',
                                actorEmail: userEmail,
                                motivo: motivoElevacion
                            });
                        } else {
                            await reclamosDatabaseService.updateReclamo(claim.id, { 'AQ': 'Sin respuesta' }, {
                                actor: 'simulador_cron',
                                actorEmail: userEmail,
                                motivo: `${motivoElevacion} (Modo Simulación - Sin alterar Google Sheets)`
                            });
                        }

                        if (enviarEmails) {
                            await emailWorkflowService.sendElevationAlert(
                                claim,
                                `El supervisor ${claim.supervisor} no respondió tras agotarse las ${maxRepeticiones} repeticiones de seguimiento periódico.`
                            );
                            emailsDespachados.push({
                                tipo: 'alerta_elevacion_supervisor',
                                destinatario: testRecipient,
                                asunto: `[ELEVACIÓN] Sin respuesta de acción - Reclamo #${claim.id}`
                            });
                        }

                        await reclamosDatabaseService.logNotification({
                            reclamo_id: claim.id,
                            destinatario_tipo: 'elevacion_gerencia',
                            destinatario_email: testRecipient,
                            tipo_notificacion: 'alerta_elevacion_supervisor',
                            reintento_nro: reintentosActuales + 1,
                            estado_envio: 'enviado'
                        });

                        eventos.push({
                            tipo: 'elevacion',
                            mensaje: `Se alcanzó el límite de repeticiones (${reintentosActuales}/${maxRepeticiones}). Estado Supervisor pasó a "Sin respuesta" y se despachó Alerta de Elevación a Dirección.`
                        });
                    } else {
                        let correspondeEnvio = false;
                        if (reintentosActuales === 0) {
                            correspondeEnvio = true;
                        } else {
                            const fechaUltimaNotif = await reclamosDatabaseService.getLastNotificationDate(claim.id, 'supervisor');
                            if (fechaUltimaNotif) {
                                const diffDiasUltimo = Math.floor((virtualNow - fechaUltimaNotif) / (1000 * 60 * 60 * 24));
                                if (diffDiasUltimo >= intervaloNDias) {
                                    correspondeEnvio = true;
                                } else {
                                    eventos.push({
                                        tipo: 'espera',
                                        mensaje: `No corresponde reenvío aún: pasaron ${diffDiasUltimo} días desde la última notificación y el intervalo requerido es ${intervaloNDias} días.`
                                    });
                                }
                            } else {
                                correspondeEnvio = true;
                            }
                        }

                        if (correspondeEnvio) {
                            if (enviarEmails) {
                                await emailWorkflowService.sendSupervisorActionEmail(claim, {
                                    manual: true,
                                    motivo: `Simulación temporal (+${diasAvanzar}d): Recordatorio ${reintentosActuales + 1} de ${maxRepeticiones}`
                                });
                                emailsDespachados.push({
                                    tipo: 'recordatorio_supervisor',
                                    destinatario: testRecipient,
                                    asunto: `[Acción Requerida] Reclamo #${claim.id} - ${claim.nombre} ${claim.apellido}`,
                                    reintento: reintentosActuales + 1
                                });
                            }

                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'supervisor',
                                destinatario_email: testRecipient,
                                tipo_notificacion: 'recordatorio_supervisor',
                                reintento_nro: reintentosActuales + 1,
                                estado_envio: 'enviado'
                            });

                            eventos.push({
                                tipo: 'disparo',
                                mensaje: `Disparo ejecutado: Recordatorio al Supervisor #${reintentosActuales + 1} de ${maxRepeticiones} enviado exitosamente a ${testRecipient}.`
                            });
                        }
                    }
                } else {
                    eventos.push({
                        tipo: 'espera',
                        mensaje: `Aún no se alcanza el plazo de primer disparo para Supervisor (${diffDias}/${disparoDias} días transcurridos).`
                    });
                }
            }

            // 2. EVALUAR CONSUMIDOR
            if (claim.estado_supervisor === 'Resuelto') {
                const consumidorEstado = (claim.estado_consumidor || '').trim();
                const consumidorSinRespuestaAun = consumidorEstado === 'Pendiente' || consumidorEstado === 'En curso' || consumidorEstado === 'Resuelto sin confirmar';

                if (consumidorSinRespuestaAun) {
                    const reglaConsumidor = reglasSeguimiento.find(r => 
                        r.rol === 'consumidor' && 
                        (r.estado_codigo === 'En curso' || r.estado_codigo === 'Pendiente') && 
                        Number(r.prioridad_codigo) === prioridadCodigo
                    ) || {
                        disparo_dias: 3,
                        intervalo_n_dias: 2,
                        repeticiones: 2,
                        emails_elevacion: ''
                    };

                    const disparoCons = Number(reglaConsumidor.disparo_dias) || 3;
                    const maxPlazoSinRespuesta = Number(reglaConsumidor.disparo_dias) + (Number(reglaConsumidor.intervalo_n_dias) * Number(reglaConsumidor.repeticiones)) || 7;

                    const notifConsumidorCount = await reclamosDatabaseService.getNotificationCount(claim.id, 'consumidor');

                    eventos.push({
                        tipo: 'analisis',
                        mensaje: `Evaluando Consumidor: Supervisor resolvió. Notificaciones previas = ${notifConsumidorCount}. Plazo de encuesta = ${disparoCons}d, Plazo máximo FSR = ${maxPlazoSinRespuesta}d.`
                    });

                    if (notifConsumidorCount === 0) {
                        const fechaResolucionSup = claim.fecha_estado_supervisor ? new Date(claim.fecha_estado_supervisor) : (claim.fecha_carga ? new Date(claim.fecha_carga) : virtualNow);
                        const diffDiasSup = Math.floor((virtualNow - fechaResolucionSup) / (1000 * 60 * 60 * 24));

                        if (diffDiasSup >= disparoCons) {
                            if (enviarEmails) {
                                await emailWorkflowService.sendConsumerFollowupEmail(claim, { reintentoNro: 1 });
                                emailsDespachados.push({
                                    tipo: 'encuesta_consumidor',
                                    destinatario: testRecipient,
                                    asunto: `¿Cómo fue tu experiencia con tu reclamo en Don Yeyo? #${claim.id}`
                                });
                            }

                            await reclamosDatabaseService.logNotification({
                                reclamo_id: claim.id,
                                destinatario_tipo: 'consumidor',
                                destinatario_email: testRecipient,
                                tipo_notificacion: 'encuesta_consumidor',
                                reintento_nro: 1,
                                estado_envio: 'enviado'
                            });

                            eventos.push({
                                tipo: 'disparo',
                                mensaje: `Disparo ejecutado: Envío de Encuesta de Satisfacción a Consumidor (transcurrieron ${diffDiasSup} días de la resolución del supervisor).`
                            });
                        } else {
                            eventos.push({
                                tipo: 'espera',
                                mensaje: `Aún no transcurren los ${disparoCons} días estipulados tras la resolución del supervisor (días transcurridos: ${diffDiasSup}).`
                            });
                        }
                    } else {
                        const fechaUltimoEnvio = await reclamosDatabaseService.getLastNotificationDate(claim.id, 'consumidor');
                        if (fechaUltimoEnvio) {
                            const diffDiasCons = Math.floor((virtualNow - fechaUltimoEnvio) / (1000 * 60 * 60 * 24));
                            if (diffDiasCons >= maxPlazoSinRespuesta) {
                                estadoConsumidorActualizado = 'Cerrado';
                                const motivoFSR = `Simulación temporal (+${diasAvanzar}d): Sin respuesta del consumidor tras ${diffDiasCons} días (límite=${maxPlazoSinRespuesta}d). Auto-establecido en Cerrado (FSR).`;

                                if (syncGoogleSheets) {
                                    await googleSheetsService.updateReclamo(claim.id, { 'AS': 'Cerrado' }, {
                                        actor: 'simulador_cron',
                                        actorEmail: userEmail,
                                        motivo: motivoFSR
                                    });
                                } else {
                                    await reclamosDatabaseService.updateReclamo(claim.id, { 'AS': 'Cerrado' }, {
                                        actor: 'simulador_cron',
                                        actorEmail: userEmail,
                                        motivo: `${motivoFSR} (Modo Simulación - Sin alterar Google Sheets)`
                                    });
                                }

                                if (syncGoogleSheets) {
                                    await reclamosDatabaseService.checkAndFinalizeAdminState(claim.id);
                                }

                                eventos.push({
                                    tipo: 'fsr',
                                    mensaje: `Plazo de respuesta agotado (${diffDiasCons}/${maxPlazoSinRespuesta}d). Estado Consumidor pasó a "Cerrado" (Finalizado Sin Respuesta - FSR).`
                                });
                            } else {
                                eventos.push({
                                    tipo: 'espera',
                                    mensaje: `Consumidor en período de espera de respuesta (${diffDiasCons}/${maxPlazoSinRespuesta} días para FSR).`
                                });
                            }
                        }
                    }
                }
            }

            if (eventos.length === 0) {
                eventos.push({
                    tipo: 'info',
                    mensaje: 'No se requirieron acciones para este reclamo en la fecha virtual simulada.'
                });
            }

            const claimRefrescado = await reclamosDatabaseService.getReclamoById(idStr);

            return {
                success: true,
                claimId: idStr,
                diasAvanzados: diasAvanzar,
                fechaVirtual: virtualNow.toISOString(),
                syncGoogleSheets,
                eventos,
                emailsDespachados,
                estados: {
                    admin: claimRefrescado?.estado_admin || estadoAdminActualizado,
                    supervisor: claimRefrescado?.estado_supervisor || estadoSupervisorActualizado,
                    consumidor: claimRefrescado?.estado_consumidor || estadoConsumidorActualizado
                }
            };
        } finally {
            process.env.EMAIL_TEST_MODE = originalEnvMode;
            process.env.EMAIL_TEST_RECIPIENT = originalEnvRecipient;
        }
    }

    /**
     * Limpia el historial de notificaciones de un reclamo para reiniciar pruebas de simulación
     */
    async resetearNotificacionesReclamo(claimId) {
        const idStr = String(claimId);
        const { pool } = require('../config/database');
        await pool.execute('DELETE FROM seguimiento_notificaciones WHERE reclamo_id = ?', [idStr]);
        return { success: true, message: `Historial de notificaciones reiniciado para el Reclamo #${idStr}` };
    }
}

module.exports = new CronFollowupService();
