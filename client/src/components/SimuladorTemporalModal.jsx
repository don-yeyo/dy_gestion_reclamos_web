import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Clock, Play, RotateCcw, ShieldAlert, CheckCircle2, AlertTriangle,
    Mail, ArrowRight, Loader2, Sparkles, AlertCircle, RefreshCw, X
} from 'lucide-react';
import { simuladorApi } from '../services/api';

export const SimuladorTemporalModal = ({ isOpen, onClose, claimId, onClaimUpdated }) => {
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [estadoData, setEstadoData] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Parámetros de simulación
    const [diasAvanzar, setDiasAvanzar] = useState(1);
    const [syncGoogleSheets, setSyncGoogleSheets] = useState(false);
    const [enviarEmails, setEnviarEmails] = useState(true);
    const [resultado, setResultado] = useState(null);

    useEffect(() => {
        if (isOpen && claimId) {
            cargarEstado();
        } else {
            setResultado(null);
            setErrorMsg('');
            setSuccessMsg('');
            setDiasAvanzar(1);
            setSyncGoogleSheets(false);
        }
    }, [isOpen, claimId]);

    const cargarEstado = async () => {
        setLoading(true);
        setErrorMsg('');
        try {
            const res = await simuladorApi.getEstadoReclamo(claimId);
            if (res.data && res.data.success) {
                setEstadoData(res.data);
            }
        } catch (err) {
            console.error('Error cargando estado del simulador:', err);
            setErrorMsg(err.response?.data?.message || 'No se pudo cargar la información del reclamo.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const claim = estadoData?.claim;
    const notifs = estadoData?.notificaciones;
    const testRecipient = estadoData?.test_recipient || 'gabrielt@donyeyo.com.ar';

    // Fecha virtual calculada
    const now = new Date();
    const fechaVirtual = new Date(now.getTime() + (Number(diasAvanzar) || 0) * 86400000);
    const fechaVirtualStr = fechaVirtual.toLocaleDateString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    const handleAvanzar = async () => {
        setExecuting(true);
        setErrorMsg('');
        setSuccessMsg('');
        setResultado(null);

        try {
            const res = await simuladorApi.avanzarReclamo(claimId, {
                diasAvanzar: Number(diasAvanzar) || 0,
                syncGoogleSheets,
                enviarEmails,
                testRecipient
            });

            if (res.data && res.data.success) {
                setResultado(res.data);
                setSuccessMsg(`Simulación ejecutada (+${diasAvanzar} días proyectados).`);
                // Recargar estado de notificaciones
                cargarEstado();
                if (onClaimUpdated) {
                    onClaimUpdated(res.data.estados);
                }
            }
        } catch (err) {
            console.error('Error ejecutando simulación:', err);
            setErrorMsg(err.response?.data?.message || 'Error al ejecutar la simulación.');
        } finally {
            setExecuting(false);
        }
    };

    const handleResetNotificaciones = async () => {
        if (!window.confirm(`¿Reiniciar el contador de notificaciones del Reclamo #${claimId}? Esto permite volver a probar desde el primer recordatorio.`)) {
            return;
        }

        setResetting(true);
        try {
            const res = await simuladorApi.resetNotificaciones(claimId);
            if (res.data && res.data.success) {
                setSuccessMsg('Historial de notificaciones de prueba reiniciado.');
                cargarEstado();
                setResultado(null);
            }
        } catch (err) {
            console.error('Error al resetear notificaciones:', err);
            setErrorMsg('Error al reiniciar notificaciones.');
        } finally {
            setResetting(false);
        }
    };

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
        }} onClick={onClose}>
            <div
                style={{
                    background: 'var(--surface, #ffffff)',
                    color: 'var(--text, #1e293b)',
                    borderRadius: 14,
                    width: '100%',
                    maxWidth: 700,
                    maxHeight: 'calc(100vh - 40px)',
                    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
                    border: '1px solid var(--border, #cbd5e1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: 10001
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Fijo */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--surface-hover, #f8fafc)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: '#0d2c5c',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Clock size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--heading-color, #0d2c5c)' }}>
                                Simulador Temporal de Seguimiento (Cron)
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                                Reclamo #{claimId} {claim ? `— ${claim.nombre} ${claim.apellido}` : ''}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted, #64748b)',
                            padding: 4
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Scrolleable */}
                <div style={{ padding: '20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                            <Loader2 size={32} className="spin" style={{ margin: '0 auto 10px auto' }} />
                            <p style={{ margin: 0 }}>Cargando datos del reclamo y reglas de seguimiento...</p>
                        </div>
                    ) : errorMsg && !estadoData ? (
                        <div style={{
                            padding: 14,
                            background: '#fee2e2',
                            color: '#991b1b',
                            borderRadius: 8,
                            fontSize: '0.88rem'
                        }}>
                            {errorMsg}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Alertas informativas */}
                            {successMsg && (
                                <div style={{
                                    padding: '10px 14px',
                                    background: '#dcfce7',
                                    color: '#166534',
                                    borderRadius: 8,
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <CheckCircle2 size={16} />
                                    <span>{successMsg}</span>
                                </div>
                            )}

                            {errorMsg && (
                                <div style={{
                                    padding: '10px 14px',
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    borderRadius: 8,
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <AlertCircle size={16} />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            {/* Resumen del Reclamo y Notificaciones Actuales */}
                            <div style={{
                                background: 'var(--surface-hover, #f8fafc)',
                                border: '1px solid var(--border, #e2e8f0)',
                                borderRadius: 10,
                                padding: '14px 16px',
                                fontSize: '0.86rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--heading-color, #0d2c5c)' }}>
                                        Estado y Parámetros del Reclamo:
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Días reales transcurridos: <strong>{claim?.dias_transcurridos_reales || 0}d</strong>
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Admin</span>
                                        <strong>{claim?.estado_admin || '-'}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Supervisor</span>
                                        <strong>{claim?.estado_supervisor || '-'}</strong>{' '}
                                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                            ({notifs?.supervisor?.enviadas || 0}/{notifs?.supervisor?.max_repeticiones || 3} notifs)
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Consumidor</span>
                                        <strong>{claim?.estado_consumidor || '-'}</strong>{' '}
                                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                            ({notifs?.consumidor?.enviadas || 0}/{notifs?.consumidor?.max_repeticiones || 2} notifs)
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Prioridad / SLA</span>
                                        <strong>{claim?.prioridad_nombre || claim?.prioridad || 'Media'}</strong>
                                    </div>
                                </div>

                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        Supervisor: <strong>{claim?.supervisor || 'Sin asignar'}</strong> ({claim?.supervisor_email || 'sin email'})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleResetNotificaciones}
                                        disabled={resetting || executing}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: 6,
                                            padding: '2px 8px',
                                            fontSize: '0.74rem',
                                            cursor: 'pointer',
                                            color: '#64748b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4
                                        }}
                                        title="Reiniciar historial de notificaciones para empezar pruebas desde el recordatorio #1"
                                    >
                                        <RotateCcw size={11} />
                                        <span>Reiniciar Notifs de Prueba</span>
                                    </button>
                                </div>
                            </div>

                            {/* Control 1: Selector de Días a Avanzar */}
                            <div>
                                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>
                                    1. Cantidad de días hacia el futuro a proyectar:
                                </label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {[1, 2, 3, 5, 7, 10, 14].map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setDiasAvanzar(d)}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: 8,
                                                fontSize: '0.85rem',
                                                fontWeight: diasAvanzar === d ? 700 : 500,
                                                background: diasAvanzar === d ? '#0d2c5c' : 'var(--surface-hover, #f1f5f9)',
                                                color: diasAvanzar === d ? '#ffffff' : 'var(--text, #334155)',
                                                border: diasAvanzar === d ? '1px solid #0d2c5c' : '1px solid var(--border, #cbd5e1)',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            +{d} {d === 1 ? 'Día' : 'Días'}
                                        </button>
                                    ))}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manual:</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="60"
                                            value={diasAvanzar}
                                            onChange={(e) => setDiasAvanzar(Math.max(0, parseInt(e.target.value) || 0))}
                                            style={{
                                                width: 60,
                                                padding: '4px 8px',
                                                borderRadius: 6,
                                                border: '1px solid var(--border, #cbd5e1)',
                                                textAlign: 'center',
                                                fontWeight: 700
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    marginTop: 10,
                                    fontSize: '0.82rem',
                                    color: '#0d2c5c',
                                    fontWeight: 600,
                                    background: '#eff6ff',
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: '1px solid #bfdbfe'
                                }}>
                                    📅 Fecha Virtual Simulada: <strong>{fechaVirtualStr}</strong> (Hoy + {diasAvanzar} {diasAvanzar === 1 ? 'día' : 'días'})
                                </div>
                            </div>

                            {/* Control 2: Parámetros de Seguridad */}
                            <div style={{
                                padding: 14,
                                border: '1px solid var(--border, #e2e8f0)',
                                borderRadius: 10,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10
                            }}>
                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--heading-color, #0d2c5c)' }}>
                                    2. Parámetros de Seguridad y Canales:
                                </span>

                                {/* Casilla Forzada */}
                                <div style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Mail size={15} color="#2563eb" />
                                    <span>Casilla de pruebas para todos los emails: <strong>{testRecipient}</strong></span>
                                </div>

                                {/* Checkbox Google Sheets */}
                                <div style={{
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    background: syncGoogleSheets ? '#fffbeb' : '#f0fdf4',
                                    border: syncGoogleSheets ? '1px solid #fde68a' : '1px solid #bbf7d0',
                                    transition: 'all 0.2s'
                                }}>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={syncGoogleSheets}
                                            onChange={(e) => setSyncGoogleSheets(e.target.checked)}
                                            style={{ marginTop: 2, accentColor: '#d97706', width: 16, height: 16 }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: syncGoogleSheets ? '#b45309' : '#15803d' }}>
                                                Sincronizar cambios en Google Sheets
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: syncGoogleSheets ? '#92400e' : '#166534', marginTop: 2 }}>
                                                {syncGoogleSheets
                                                    ? '⚠️ ACTIVADO: Los cambios de estado generados por la simulación se escribirán en la planilla real de Google Sheets, lo que disparará las acciones del equipo interno.'
                                                    : '🛡️ DESACTIVADO (Recomendado): La simulación evalúa y actualiza localmente en MySQL para ver los resultados en pantalla, protegiendo la planilla de Google Sheets.'}
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {/* Checkbox Enviar Emails */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text)' }}>
                                    <input
                                        type="checkbox"
                                        checked={enviarEmails}
                                        onChange={(e) => setEnviarEmails(e.target.checked)}
                                        style={{ accentColor: '#0d2c5c' }}
                                    />
                                    <span>Despachar emails reales interceptados a la casilla de pruebas (<strong>{testRecipient}</strong>)</span>
                                </label>
                            </div>

                            {/* Botón de Ejecución */}
                            <button
                                type="button"
                                data-testid="btn-ejecutar-simulacion"
                                onClick={handleAvanzar}
                                disabled={executing}
                                style={{
                                    background: '#0d2c5c',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '12px 20px',
                                    borderRadius: 10,
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    cursor: executing ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 12px rgba(13, 44, 92, 0.25)',
                                    opacity: executing ? 0.7 : 1,
                                    transition: 'all 0.2s'
                                }}
                            >
                                {executing ? (
                                    <>
                                        <Loader2 size={18} className="spin" />
                                        <span>Simulando Cron y Evaluando Reglas...</span>
                                    </>
                                ) : (
                                    <>
                                        <Play size={18} />
                                        <span>Simular Avance de +{diasAvanzar} {diasAvanzar === 1 ? 'Día' : 'Días'} y Ejecutar Cron</span>
                                    </>
                                )}
                            </button>

                            {/* Panel de Resultados */}
                            {resultado && (
                                <div style={{
                                    border: '2px solid #0d2c5c',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                    background: '#ffffff'
                                }}>
                                    <div style={{
                                        background: '#0d2c5c',
                                        color: '#ffffff',
                                        padding: '10px 14px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span>Resultado del Disparo de Simulación</span>
                                        <span style={{ fontSize: '0.76rem', opacity: 0.9 }}>
                                            {resultado.emailsDespachados?.length || 0} emails generados
                                        </span>
                                    </div>

                                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {/* Eventos ocurridos */}
                                        <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {resultado.eventos?.map((ev, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: 6,
                                                        background: ev.tipo === 'disparo' ? '#dcfce7' : (ev.tipo === 'elevacion' || ev.tipo === 'fsr' ? '#fee2e2' : '#f1f5f9'),
                                                        color: ev.tipo === 'disparo' ? '#166534' : (ev.tipo === 'elevacion' || ev.tipo === 'fsr' ? '#991b1b' : '#334155'),
                                                        borderLeft: ev.tipo === 'disparo' ? '4px solid #16a34a' : (ev.tipo === 'elevacion' || ev.tipo === 'fsr' ? '4px solid #dc2626' : '4px solid #64748b'),
                                                        lineHeight: 1.4
                                                    }}
                                                >
                                                    {ev.mensaje}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Emails generados */}
                                        {resultado.emailsDespachados?.length > 0 && (
                                            <div style={{
                                                padding: '10px 12px',
                                                background: '#fef3c7',
                                                borderRadius: 8,
                                                border: '1px solid #fde68a',
                                                fontSize: '0.82rem'
                                            }}>
                                                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                                                    📬 Correos Despachados a tu Casilla ({testRecipient}):
                                                </div>
                                                {resultado.emailsDespachados.map((em, idx) => (
                                                    <div key={idx} style={{ marginTop: 4, color: '#78350f' }}>
                                                        • <strong>Asunto:</strong> {em.asunto} {em.reintento ? `(Reintento ${em.reintento})` : ''}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Estados finales resultantes */}
                                        <div style={{
                                            background: '#f8fafc',
                                            padding: '8px 12px',
                                            borderRadius: 6,
                                            fontSize: '0.8rem',
                                            color: '#334155',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <span>
                                                Estados ahora: Admin: <strong>{resultado.estados?.admin}</strong> | Sup: <strong>{resultado.estados?.supervisor}</strong> | Cons: <strong>{resultado.estados?.consumidor}</strong>
                                            </span>
                                            <span style={{ fontSize: '0.74rem', color: resultado.syncGoogleSheets ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                                                {resultado.syncGoogleSheets ? '✓ Sheets sincronizado' : '🛡️ Sheets protegido'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Fijo */}
                <div style={{
                    padding: '14px 20px',
                    borderTop: '1px solid var(--border, #e2e8f0)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--surface-hover, #f8fafc)',
                    flexShrink: 0
                }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Modo de Pruebas activo: ningún cliente ni supervisor real recibe notificaciones.
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'var(--surface, #ffffff)',
                            border: '1px solid var(--border, #cbd5e1)',
                            borderRadius: 8,
                            padding: '8px 16px',
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            color: 'var(--text, #1e293b)',
                            fontWeight: 600
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
