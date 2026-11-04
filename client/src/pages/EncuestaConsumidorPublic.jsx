import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import { CheckCircle2, AlertTriangle, Send, PackageX, ThumbsDown, Info, Calendar } from 'lucide-react';

function formatFechaLegible(fechaIso) {
    if (!fechaIso) return null;
    try {
        const d = new Date(fechaIso);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) + ' hs';
    } catch {
        return null;
    }
}

// Escala de emojis de satisfacción (del 1 al 5)
const EMOJI_OPTIONS = [
    { value: 1, emoji: '😡', label: 'Muy insatisfecho', color: '#ef4444' },
    { value: 2, emoji: '🙁', label: 'Insatisfecho', color: '#f97316' },
    { value: 3, emoji: '😐', label: 'Neutral', color: '#eab308' },
    { value: 4, emoji: '🙂', label: 'Satisfecho', color: '#84cc16' },
    { value: 5, emoji: '😄', label: 'Muy satisfecho', color: '#10b981' }
];

const TIPOS_PROBLEMA = [
    {
        value: 'No recibí reposición',
        title: 'No recibí reposición',
        desc: 'Todavía no me entregaron los productos acordados.',
        icon: PackageX
    },
    {
        value: 'No estoy satisfecho con lo recibido',
        title: 'No estoy satisfecho con lo recibido',
        desc: 'Recibí la reposición, pero tuve un inconveniente con los productos o la atención.',
        icon: ThumbsDown
    }
];

export const EncuestaConsumidorPublic = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [tokenData, setTokenData] = useState(null);
    const [modo, setModo] = useState('resuelto'); // 'resuelto' | 'no_resuelto'
    const [puntuacion, setPuntuacion] = useState(5);
    const [tipoProblema, setTipoProblema] = useState('No recibí reposición');
    const [comentario, setComentario] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) {
            setError('No se proporcionó un enlace de seguimiento válido.');
            setLoading(false);
            return;
        }

        publicApi.verifyToken(token)
            .then(res => {
                if (res.data.success) {
                    setTokenData(res.data);
                    const initialAction = res.data.action;
                    if (initialAction === 'no_resuelto' || initialAction === 'disconforme') {
                        setModo('no_resuelto');
                        if (initialAction === 'disconforme') {
                            setTipoProblema('No estoy satisfecho con lo recibido');
                        } else {
                            setTipoProblema('No recibí reposición');
                        }
                    } else {
                        setModo('resuelto');
                    }
                } else {
                    setError(res.data.error || 'El enlace no es válido.');
                }
            })
            .catch(err => {
                setError(err.response?.data?.error || 'El enlace es inválido o ha expirado.');
            })
            .finally(() => setLoading(false));
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (modo === 'resuelto' && (!puntuacion || puntuacion < 1 || puntuacion > 5)) {
            setError('Por favor seleccioná cómo te sentiste con la atención.');
            return;
        }

        if (modo === 'no_resuelto' && !tipoProblema) {
            setError('Por favor seleccioná el tipo de problema.');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                token,
                resultado: modo,
                puntuacion: modo === 'resuelto' ? puntuacion : null,
                tipo_problema: modo === 'no_resuelto' ? tipoProblema : '',
                comentario: comentario.trim()
            };

            const res = await publicApi.submitEncuestaConsumidor(payload);
            if (res.data.success) {
                setSubmitted(true);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Ocurrió un error al registrar tu respuesta.');
        } finally {
            setSubmitting(false);
        }
    };

    const logoUrl = tokenData?.logo_url || '/logo.png';
    const claimId = tokenData?.claim?.id || tokenData?.claimId || '';

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
            fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            color: '#1e293b'
        }}>
            <div style={{
                background: '#ffffff',
                maxWidth: 480,
                width: '100%',
                borderRadius: 16,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e2e8f0',
                padding: '36px 28px',
                textAlign: 'center'
            }}>
                {/* Logo Institucional Don Yeyo */}
                <div style={{ marginBottom: 20 }}>
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt="Don Yeyo"
                            style={{ maxHeight: 52, maxWidth: 200, objectFit: 'contain', margin: '0 auto' }}
                            onError={(e) => {
                                e.target.style.display = 'none';
                                const fallbackEl = document.getElementById('logo-fallback-text');
                                if (fallbackEl) fallbackEl.style.display = 'block';
                            }}
                        />
                    ) : null}
                    <div
                        id="logo-fallback-text"
                        style={{
                            display: logoUrl ? 'none' : 'block',
                            fontSize: '1.4rem',
                            fontWeight: 800,
                            letterSpacing: '1px',
                            color: '#0d2c5c'
                        }}
                    >
                        DON YEYO
                    </div>
                </div>

                {/* Título simple y claro */}
                <h1 style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: '0 0 8px 0',
                    lineHeight: 1.3
                }}>
                    Seguimiento de tu Reclamo {claimId ? `#${claimId}` : ''}
                </h1>

                {loading ? (
                    <div style={{ padding: '30px 0', color: '#64748b', fontSize: '0.92rem' }}>
                        Cargando encuesta...
                    </div>
                ) : tokenData?.ya_respondio_consumidor ? (
                    /* PANTALLA DE ACCIÓN ANTERIORMENTE REGISTRADA PARA EL CONSUMIDOR */
                    <div data-testid="encuesta-ya-registrada" style={{ padding: '20px 0', textAlign: 'center' }}>
                        <div style={{
                            width: 60,
                            height: 60,
                            background: '#eff6ff',
                            color: '#2563eb',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px auto',
                            border: '1px solid #bfdbfe'
                        }}>
                            <Info size={32} />
                        </div>

                        <div style={{
                            display: 'inline-block',
                            background: '#dbeafe',
                            color: '#1e40af',
                            padding: '4px 12px',
                            borderRadius: 20,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            marginBottom: 10
                        }}>
                            Respuesta ya registrada
                        </div>

                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0' }}>
                            Tu respuesta ya fue recibida
                        </h2>

                        <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.55, margin: '0 0 20px 0' }}>
                            Ya contamos con una acción registrada previamente para el Reclamo <strong>#{claimId}</strong>.
                        </p>

                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            padding: '16px',
                            textAlign: 'left',
                            fontSize: '0.88rem',
                            lineHeight: 1.6,
                            marginBottom: 20
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                                <span style={{ color: '#64748b' }}>Estado registrado:</span>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                    {tokenData.claim?.estado_consumidor || 'Cerrado'}
                                </span>
                            </div>

                            {tokenData.claim?.fecha_estado_consumidor && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: '#64748b' }}>Fecha de registro:</span>
                                    <span style={{ fontWeight: 600, color: '#334155' }}>
                                        {formatFechaLegible(tokenData.claim.fecha_estado_consumidor)}
                                    </span>
                                </div>
                            )}

                            {tokenData.claim?.consumidor_puntuacion && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: '#64748b' }}>Calificación brindada:</span>
                                    <span style={{ fontWeight: 700, color: '#eab308' }}>
                                        {'⭐'.repeat(tokenData.claim.consumidor_puntuacion)} ({tokenData.claim.consumidor_puntuacion}/5)
                                    </span>
                                </div>
                            )}

                            {tokenData.claim?.consumidor_tipo_problema && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: '#64748b' }}>Inconveniente informado:</span>
                                    <span style={{ fontWeight: 600, color: '#dc2626' }}>
                                        {tokenData.claim.consumidor_tipo_problema}
                                    </span>
                                </div>
                            )}

                            {tokenData.claim?.consumidor_comentario && (
                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #cbd5e1', fontSize: '0.84rem', color: '#475569', fontStyle: 'italic' }}>
                                    "{tokenData.claim.consumidor_comentario}"
                                </div>
                            )}
                        </div>

                        <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
                            Por razones de seguridad y consistencia del expediente, cada enlace de encuesta solo permite un registro único.
                        </p>
                    </div>
                ) : submitted ? (
                    <div data-testid="encuesta-success" style={{ padding: '24px 0' }}>
                        <div style={{
                            width: 64,
                            height: 64,
                            background: '#dcfce7',
                            color: '#16a34a',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px auto'
                        }}>
                            <CheckCircle2 size={36} />
                        </div>
                        <h2 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0' }}>
                            ¡Muchas gracias por tu respuesta!
                        </h2>
                        <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.5, margin: 0 }}>
                            {modo === 'resuelto'
                                ? 'Tu opinión nos ayuda a mejorar día a día la calidad de nuestros productos y atención.'
                                : 'Hemos registrado tu aviso. El equipo de administración revisará lo sucedido con tu reposición.'}
                        </p>
                    </div>
                ) : error && !tokenData ? (
                    <div style={{ padding: '24px 0' }}>
                        <div style={{
                            width: 56,
                            height: 56,
                            background: '#fee2e2',
                            color: '#dc2626',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 14px auto'
                        }}>
                            <AlertTriangle size={30} />
                        </div>
                        <h2 style={{ fontSize: '1.15rem', color: '#991b1b', margin: '0 0 8px 0' }}>
                            Enlace no disponible
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>{error}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ marginTop: 22, textAlign: 'left' }}>
                        {modo === 'resuelto' ? (
                            <div data-testid="seccion-resuelto" style={{ marginBottom: 22 }}>
                                <p style={{
                                    textAlign: 'center',
                                    color: '#334155',
                                    fontSize: '0.95rem',
                                    fontWeight: 600,
                                    margin: '0 0 14px 0'
                                }}>
                                    ¿Cómo calificarías la resolución de tu reclamo?
                                </p>

                                {/* Selector con Caras de Emojis */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                    padding: '12px 8px',
                                    background: '#f8fafc',
                                    borderRadius: 14,
                                    border: '1px solid #e2e8f0'
                                }}>
                                    {EMOJI_OPTIONS.map((opt) => {
                                        const isSelected = puntuacion === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                data-testid={`star-btn-${opt.value}`}
                                                onClick={() => setPuntuacion(opt.value)}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    background: isSelected ? '#ffffff' : 'transparent',
                                                    border: isSelected ? `2px solid ${opt.color}` : '2px solid transparent',
                                                    borderRadius: 10,
                                                    padding: '8px 2px',
                                                    cursor: 'pointer',
                                                    boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                                                    transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title={opt.label}
                                            >
                                                <span style={{ fontSize: '1.85rem', lineHeight: 1 }}>{opt.emoji}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{
                                    textAlign: 'center',
                                    marginTop: 10,
                                    fontSize: '0.88rem',
                                    fontWeight: 700,
                                    color: EMOJI_OPTIONS.find(o => o.value === puntuacion)?.color || '#0d2c5c'
                                }}>
                                    {EMOJI_OPTIONS.find(o => o.value === puntuacion)?.label}
                                </div>
                            </div>
                        ) : (
                            <div data-testid="seccion-no-resuelto" style={{ marginBottom: 20 }}>
                                <p style={{
                                    color: '#334155',
                                    fontSize: '0.93rem',
                                    fontWeight: 600,
                                    margin: '0 0 12px 0'
                                }}>
                                    Por favor seleccioná el inconveniente que tuviste:
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {TIPOS_PROBLEMA.map((opt) => {
                                        const IconComp = opt.icon;
                                        const selected = tipoProblema === opt.value;
                                        return (
                                            <div
                                                key={opt.value}
                                                data-testid={`problema-opt-${opt.value}`}
                                                onClick={() => setTipoProblema(opt.value)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: 12,
                                                    padding: '14px',
                                                    borderRadius: 10,
                                                    cursor: 'pointer',
                                                    border: selected ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                                    background: selected ? '#fef2f2' : '#ffffff',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="tipo_problema"
                                                    value={opt.value}
                                                    checked={selected}
                                                    onChange={() => setTipoProblema(opt.value)}
                                                    style={{ marginTop: 3, accentColor: '#dc2626' }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: selected ? '#991b1b' : '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <IconComp size={16} color={selected ? '#dc2626' : '#64748b'} />
                                                        <span>{opt.title}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
                                                        {opt.desc}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Campo de comentario sin label adicional (placeholder intuitivo) */}
                        <div style={{ marginBottom: 20 }}>
                            <textarea
                                data-testid="encuesta-comentario"
                                rows={3}
                                placeholder="Escribe aquí cualquier comentario adicional que quieras hacernos llegar."
                                value={comentario}
                                onChange={(e) => setComentario(e.target.value)}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '12px 14px',
                                    borderRadius: 10,
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                    color: '#1e293b',
                                    background: '#f8fafc',
                                    outline: 'none',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        {error && (
                            <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 14, textAlign: 'center', fontWeight: 600 }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            data-testid="encuesta-submit-btn"
                            disabled={submitting}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '13px 20px',
                                background: modo === 'resuelto' ? '#10b981' : '#dc2626',
                                border: 'none',
                                borderRadius: 10,
                                color: '#ffffff',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                boxShadow: modo === 'resuelto' ? '0 4px 12px rgba(16,185,129,0.25)' : '0 4px 12px rgba(220,38,38,0.25)',
                                transition: 'all 0.2s ease',
                                opacity: submitting ? 0.75 : 1
                            }}
                        >
                            <Send size={16} />
                            <span>
                                {submitting
                                    ? 'Enviando...'
                                    : modo === 'resuelto'
                                        ? 'Enviar Calificación'
                                        : 'Enviar Reporte'}
                            </span>
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
