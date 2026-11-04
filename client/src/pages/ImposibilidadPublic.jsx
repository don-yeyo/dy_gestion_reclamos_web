import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import {
    AlertTriangle, CheckCircle2, Clock, MapPin, Package,
    ShieldAlert, ArrowRight, Loader2, XCircle, User, Info
} from 'lucide-react';

export const ImposibilidadPublic = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tokenData, setTokenData] = useState(null);

    const [motivoOpcion, setMotivoOpcion] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submittedSuccess, setSubmittedSuccess] = useState(false);

    useEffect(() => {
        const verify = async () => {
            if (!token) {
                setError('No se proporcionó ningún token de acción en el enlace.');
                setLoading(false);
                return;
            }

            try {
                const res = await publicApi.verifyToken(token);
                if (res.data.success) {
                    setTokenData(res.data);
                } else {
                    setError('El enlace es inválido o ha expirado.');
                }
            } catch (err) {
                setError(err.response?.data?.error || 'Enlace inválido o expirado. Por favor comunicate con la administración.');
            } finally {
                setLoading(false);
            }
        };

        verify();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!motivoOpcion) {
            alert('Por favor seleccioná el motivo de la imposibilidad antes de confirmar.');
            return;
        }

        const observacionInterna = observaciones.trim()
            ? `${motivoOpcion} - ${observaciones.trim()}`
            : motivoOpcion;

        setSubmitting(true);
        try {
            const res = await publicApi.submitImposibilidad(token, observacionInterna, motivoOpcion);
            if (res.data.success) {
                setSubmittedSuccess(true);
            }
        } catch (err) {
            alert(err.response?.data?.error || 'Ocurrió un error al registrar el motivo de la imposibilidad.');
        } finally {
            setSubmitting(false);
        }
    };

    // Estilos base de la página con estética institucional Don Yeyo
    const pageContainerStyle = {
        minHeight: '100vh',
        backgroundColor: '#090e1a',
        backgroundImage: 'radial-gradient(circle at 50% 10%, #152238 0%, #090e1a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#f8fafc'
    };

    const cardStyle = {
        width: '100%',
        maxWidth: '580px',
        backgroundColor: '#10192e',
        border: '1px solid #1e2e50',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
        boxSizing: 'border-box'
    };

    const inputStyle = {
        width: '100%',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid #2a3b60',
        backgroundColor: '#16233f',
        color: '#f8fafc',
        fontSize: '0.92rem',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s, box-shadow 0.2s'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.88rem',
        fontWeight: 600,
        color: '#f1f5f9',
        marginBottom: '8px'
    };

    // 1. Estado de Carga
    if (loading) {
        return (
            <div style={pageContainerStyle}>
                <div style={{ ...cardStyle, maxWidth: '440px', textAlign: 'center', padding: '40px 24px' }}>
                    <div style={{ display: 'inline-block', animation: 'spin 1.2s linear infinite', marginBottom: '16px', color: '#f59e0b' }}>
                        <Loader2 size={42} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
                        Verificando enlace de acción...
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                        Comprobando token criptográfico seguro con los servidores de Don Yeyo S.A.
                    </p>
                    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // 2. Estado de Error
    if (error) {
        return (
            <div style={pageContainerStyle}>
                <div style={{ ...cardStyle, maxWidth: '460px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px auto'
                    }}>
                        <ShieldAlert size={34} />
                    </div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 10px 0', color: '#ffffff' }}>
                        Enlace no disponible
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: '#fca5a5', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                        {error}
                    </p>
                    <div style={{ borderTop: '1px solid #1e2e50', paddingTop: '16px', fontSize: '0.78rem', color: '#64748b' }}>
                        Don Yeyo S.A. &bull; Sistema de Gestión de Reclamos
                    </div>
                </div>
            </div>
        );
    }

    // 3. Estado de Acción Previa ya Registrada (Supervisión)
    if (tokenData?.ya_acciono_supervisor) {
        const estadoActual = tokenData.claim?.estado_supervisor || 'Gestionado';
        const fechaReg = tokenData.claim?.fecha_estado_supervisor ? new Date(tokenData.claim.fecha_estado_supervisor).toLocaleString('es-AR') : null;
        return (
            <div style={pageContainerStyle}>
                <div style={{ ...cardStyle, maxWidth: '480px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px auto'
                    }}>
                        <Info size={36} />
                    </div>
                    <div style={{
                        display: 'inline-block',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        marginBottom: 12
                    }}>
                        Acción Ya Registrada
                    </div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 10px 0', color: '#ffffff' }}>
                        Reclamo #{tokenData?.claimId} ya gestionado
                    </h2>
                    <p style={{ fontSize: '0.92rem', color: '#cbd5e1', margin: '0 0 16px 0', lineHeight: 1.55 }}>
                        Ya se cuenta con una acción registrada previamente para este reclamo en el circuito de supervisión.
                    </p>

                    <div style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 10,
                        padding: '14px 16px',
                        marginBottom: 18,
                        textAlign: 'left',
                        fontSize: '0.86rem',
                        lineHeight: 1.6
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ color: '#94a3b8' }}>Estado registrado:</span>
                            <span style={{ color: '#f8fafc', fontWeight: 700 }}>{estadoActual}</span>
                        </div>
                        {fechaReg && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#94a3b8' }}>Fecha de registro:</span>
                                <span style={{ color: '#cbd5e1' }}>{fechaReg} hs</span>
                            </div>
                        )}
                    </div>

                    <div style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 10,
                        padding: '14px',
                        marginBottom: 20,
                        textAlign: 'left',
                        fontSize: '0.84rem',
                        color: '#fbbf24',
                        lineHeight: 1.5
                    }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>📌 ¿Necesitás modificar tu decisión o reabrir el caso?</strong>
                        {tokenData?.mensaje_reapertura || 'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.'}
                    </div>

                    <button
                        type="button"
                        onClick={() => window.close()}
                        style={{
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            padding: '10px 24px',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.88rem'
                        }}
                    >
                        Cerrar Ventana
                    </button>
                </div>
            </div>
        );
    }

    // 4. Estado de Éxito tras Enviar
    if (submittedSuccess) {
        return (
            <div style={pageContainerStyle}>
                <div style={{ ...cardStyle, maxWidth: '480px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px auto'
                    }}>
                        <CheckCircle2 size={36} />
                    </div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 10px 0', color: '#ffffff' }}>
                        Imposibilidad Registrada
                    </h2>
                    <p style={{ fontSize: '0.92rem', color: '#cbd5e1', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                        Hemos registrado correctamente la imposibilidad de entrega para el reclamo <strong>#{tokenData?.claimId}</strong>.
                    </p>
                    <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 24px 0', lineHeight: 1.5 }}>
                        La administración de Don Yeyo ha sido notificada para coordinar una vía alternativa de atención.
                    </p>
                    <div style={{ borderTop: '1px solid #1e2e50', paddingTop: '16px', fontSize: '0.8rem', color: '#64748b' }}>
                        Podés cerrar esta ventana de forma segura.
                    </div>
                </div>
            </div>
        );
    }

    const claim = tokenData?.claim || {};

    // 4. Formulario Principal de Imposibilidad
    return (
        <div style={pageContainerStyle}>
            <div style={cardStyle}>
                {/* Header Institucional */}
                <div style={{ borderBottom: '1px solid #1e2e50', paddingBottom: '16px', marginBottom: '20px' }}>
                    <div style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#f59e0b',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: '6px'
                    }}>
                        Don Yeyo S.A. &bull; Portal de Supervisión Comercial
                    </div>
                    <h1 style={{
                        fontSize: '1.45rem',
                        fontWeight: 700,
                        margin: '0 0 6px 0',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <AlertTriangle size={26} color="#f59e0b" style={{ flexShrink: 0 }} />
                        <span>Informar Imposibilidad de Entrega</span>
                    </h1>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Reclamo número <strong style={{ color: '#f59e0b' }}>#{tokenData?.claimId}</strong>
                    </p>
                </div>

                {/* Ficha Resumida del Caso */}
                {claim.consumidor && (
                    <div style={{
                        backgroundColor: '#16233f',
                        border: '1px solid #233454',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        marginBottom: '22px',
                        fontSize: '0.85rem',
                        lineHeight: 1.6
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', marginBottom: '4px' }}>
                            <User size={15} color="#60a5fa" />
                            <span><strong>Consumidor:</strong> {claim.consumidor}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', marginBottom: '4px' }}>
                            <MapPin size={15} color="#f59e0b" />
                            <span><strong>Domicilio:</strong> {claim.domicilio || 'No especificado'}, {claim.localidad || ''}</span>
                        </div>
                        {claim.supervisor && (
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '6px', borderTop: '1px dashed #233454', paddingTop: '6px' }}>
                                Supervisor a cargo: <strong>{claim.supervisor}</strong>
                            </div>
                        )}
                    </div>
                )}

                {/* Formulario */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div>
                        <label style={labelStyle}>
                            Seleccioná el motivo principal de la imposibilidad: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select
                            value={motivoOpcion}
                            onChange={(e) => setMotivoOpcion(e.target.value)}
                            required
                            style={{
                                ...inputStyle,
                                cursor: 'pointer'
                            }}
                        >
                            <option value="">-- Seleccionar motivo --</option>
                            <option value="Falta de stock del producto cortesía">Falta de stock del producto de cortesía</option>
                            <option value="Zona inaccesible / fuera de recorrido habitual">Zona inaccesible / fuera de recorrido habitual</option>
                            <option value="Domicilio incorrecto / no localizado">Domicilio incorrecto o no localizado</option>
                            <option value="Consumidor ausente en reiteradas visitas">Consumidor ausente en reiteradas visitas</option>
                            <option value="Consumidor rechazó la visita / cortesía">Consumidor rechazó la visita / cortesía</option>
                            <option value="Otro motivo">Otro motivo (especificar en observaciones)</option>
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle}>
                            Observaciones adicionales o detalle operativo:
                        </label>
                        <textarea
                            rows={4}
                            value={observaciones}
                            onChange={(e) => setObservaciones(e.target.value)}
                            placeholder="Describí brevemente lo sucedido para que administración pueda contactar al consumidor y buscar otra solución..."
                            style={{
                                ...inputStyle,
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    <div style={{ paddingTop: '8px' }}>
                        <button
                            type="submit"
                            disabled={submitting || !motivoOpcion}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: submitting || !motivoOpcion
                                    ? '#2a3b60'
                                    : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                                color: submitting || !motivoOpcion ? '#64748b' : '#ffffff',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                cursor: submitting || !motivoOpcion ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.2s',
                                boxShadow: submitting || !motivoOpcion ? 'none' : '0 4px 14px rgba(217, 119, 6, 0.4)'
                            }}
                        >
                            {submitting ? (
                                <>
                                    <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}>
                                        <Loader2 size={18} />
                                    </div>
                                    <span>Registrando imposibilidad...</span>
                                </>
                            ) : (
                                <>
                                    <span>Confirmar Imposibilidad</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <div style={{
                    marginTop: '20px',
                    paddingTop: '14px',
                    borderTop: '1px solid #1e2e50',
                    textAlign: 'center',
                    fontSize: '0.74rem',
                    color: '#64748b'
                }}>
                    Acción validada criptográficamente para el supervisor asignado &bull; Don Yeyo S.A.
                </div>
            </div>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default ImposibilidadPublic;
