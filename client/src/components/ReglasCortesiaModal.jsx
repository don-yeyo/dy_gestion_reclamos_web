import React, { useState, useEffect } from 'react';
import {
    Gift, CheckCircle2, AlertCircle, RefreshCw, X, Sparkles,
    Sliders, HelpCircle, Save, Plus, Trash2, ArrowRight
} from 'lucide-react';
import { cortesiaApi } from '../services/api';
import { ConfirmModal } from './ConfirmModal';

const DEFECTOS_SUGERIDOS_COMUNES = [
    'Presencia de cuerpo extraño',
    'Falta de gas',
    'Sabor extraño / Rancio',
    'Problemas de fermentación',
    'Hongos / Moho prematuro'
];

export const ReglasCortesiaModal = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Estado del formulario de configuración
    const [cortesiaEstandar, setCortesiaEstandar] = useState('1 reemplazo + 1 de kg');
    const [cortesiaEspecial, setCortesiaEspecial] = useState('1 reemplazo + 2 productos a elección + 2 de kg.');
    const [defectosEstandar, setDefectosEstandar] = useState([
        'Defectos del producto',
        'Vida util',
        'Menor cantidad de unidades',
        'Defecto en el envase'
    ]);
    const [sensibleMayusculas, setSensibleMayusculas] = useState(false);

    // Nuevo defecto para agregar
    const [nuevoDefecto, setNuevoDefecto] = useState('');

    // Simulador interactivo
    const [simulacionDefecto, setSimulacionDefecto] = useState('Defectos del producto');
    const [simulacionResultado, setSimulacionResultado] = useState(null);

    // Modal de confirmación para restaurar valores de fórmula
    const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

    const fetchConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await cortesiaApi.getConfig();
            if (res.data?.success && res.data?.data) {
                const cfg = res.data.data;
                setCortesiaEstandar(cfg.cortesia_estandar || '1 reemplazo + 1 de kg');
                setCortesiaEspecial(cfg.cortesia_especial || '1 reemplazo + 2 productos a elección + 2 de kg.');
                setDefectosEstandar(Array.isArray(cfg.defectos_estandar) ? cfg.defectos_estandar : []);
                setSensibleMayusculas(Boolean(cfg.sensible_mayusculas));
            }
        } catch (err) {
            console.error('Error cargando configuración de cortesía:', err);
            setError(err.response?.data?.error || 'No se pudo cargar la configuración de cortesía.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchConfig();
            setSuccessMessage(null);
            setError(null);
        }
    }, [isOpen]);

    // Recalcular simulación en vivo cuando cambian los inputs
    useEffect(() => {
        if (!simulacionDefecto || !simulacionDefecto.trim()) {
            setSimulacionResultado({ tipo: 'vacio', cortesía: 'Sin compensación (campo de defecto vacío)' });
            return;
        }

        const defTrim = simulacionDefecto.trim();
        const existe = defectosEstandar.some(d => {
            if (sensibleMayusculas) {
                return d.trim() === defTrim;
            }
            return d.trim().toLowerCase() === defTrim.toLowerCase();
        });

        if (existe) {
            setSimulacionResultado({
                tipo: 'estandar',
                cortesía: cortesiaEstandar,
                regla: 'Coincide con lista de defectos estándar (ex $AJ$15:$AJ$19)'
            });
        } else {
            setSimulacionResultado({
                tipo: 'especial',
                cortesía: cortesiaEspecial,
                regla: 'Defecto especial / grave / no catalogado (ex $AG$19)'
            });
        }
    }, [simulacionDefecto, cortesiaEstandar, cortesiaEspecial, defectosEstandar, sensibleMayusculas]);

    const handleAddDefecto = (e) => {
        if (e) e.preventDefault();
        const limpio = nuevoDefecto.trim();
        if (!limpio) return;

        const yaExiste = defectosEstandar.some(d => d.toLowerCase() === limpio.toLowerCase());
        if (yaExiste) {
            setError(`El defecto "${limpio}" ya se encuentra en la lista estándar.`);
            return;
        }

        setDefectosEstandar(prev => [...prev, limpio]);
        setNuevoDefecto('');
        setError(null);
    };

    const handleRemoveDefecto = (indexToRemove) => {
        setDefectosEstandar(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = {
                cortesia_estandar: cortesiaEstandar.trim(),
                cortesia_especial: cortesiaEspecial.trim(),
                defectos_estandar: defectosEstandar.map(d => d.trim()).filter(Boolean),
                sensible_mayusculas: sensibleMayusculas
            };

            const res = await cortesiaApi.updateConfig(payload);
            if (res.data?.success) {
                setSuccessMessage('¡Configuración de compensación y cortesía guardada exitosamente!');
                setTimeout(() => setSuccessMessage(null), 4000);
            }
        } catch (err) {
            console.error('Error al guardar configuración:', err);
            setError(err.response?.data?.error || 'Error al persistir las reglas de cortesía.');
        } finally {
            setSaving(false);
        }
    };

    const handleResetDefaults = () => {
        setCortesiaEstandar('1 reemplazo + 1 de kg');
        setCortesiaEspecial('1 reemplazo + 2 productos a elección + 2 de kg.');
        setDefectosEstandar([
            'Defectos del producto',
            'Vida util',
            'Menor cantidad de unidades',
            'Defecto en el envase'
        ]);
        setSensibleMayusculas(false);
        setIsConfirmResetOpen(false);
        setSuccessMessage('Valores de la fórmula original de Google Sheets restaurados en pantalla. Recuerde hacer clic en "Guardar Cambios".');
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" style={{ zIndex: 1050 }}>
                <div
                    className="modal-content"
                    style={{
                        maxWidth: 780,
                        width: '92%',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 16,
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            background: 'var(--card-bg, #151C5B)',
                            color: '#ffffff',
                            padding: '18px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 10,
                                    background: 'rgba(16, 185, 129, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid #10b981'
                                }}
                            >
                                <Gift size={22} color="#10b981" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                                    Reglas de Compensación & Cortesía
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.85, color: '#e2e8f0' }}>
                                    Cálculo dinámico de Producto Cortesía (Columna S en Google Sheet y BD)
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#cbd5e1',
                                cursor: 'pointer',
                                padding: 6,
                                borderRadius: 8,
                                display: 'flex'
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div
                        style={{
                            padding: '20px 24px',
                            overflowY: 'auto',
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20
                        }}
                    >
                        {/* Fórmula explicada */}
                        <div
                            style={{
                                background: 'var(--surface-color, #f8fafc)',
                                border: '1px solid var(--border-color, #e2e8f0)',
                                borderRadius: 10,
                                padding: '14px 16px',
                                fontSize: '0.84rem'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-main, #1e293b)', marginBottom: 6 }}>
                                <HelpCircle size={16} color="var(--primary-color, #151C5B)" />
                                <span>Interpretación de la fórmula de Google Sheets</span>
                            </div>
                            <div
                                style={{
                                    background: 'rgba(0,0,0,0.04)',
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    fontFamily: 'Consolas, monospace',
                                    fontSize: '0.78rem',
                                    color: 'var(--text-main, #334155)',
                                    wordBreak: 'break-all',
                                    marginBottom: 8
                                }}
                            >
                                =+SI(P="";"";SI(SI.ERROR(BUSCARV(P;$AJ$15:$AJ$19;1;0);$AG$19)=P;$AG$18;$AG$19))
                            </div>
                            <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', lineHeight: 1.45 }}>
                                Cuando el administrador <strong>Aprueba el reclamo</strong>, el sistema evalúa el <em>Defecto</em> del producto. Si figura en la lista de <strong>Defectos Estándar</strong>, asigna la <strong>Compensación Estándar</strong>. Si es un defecto grave o no catalogado (ej. cuerpo extraño), asigna la <strong>Compensación Especial</strong>. Se actualiza automáticamente la columna S de la Google Sheet, la BD y el correo al supervisor.
                            </p>
                        </div>

                        {/* Mensajes de feedback */}
                        {error && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}
                        {successMessage && (
                            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
                                <CheckCircle2 size={18} />
                                <span>{successMessage}</span>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                                <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
                                <div>Cargando parámetros del sistema...</div>
                            </div>
                        ) : (
                            <>
                                {/* Inputs de Compensación */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-main)' }}>
                                            Compensación Estándar (ex celda $AG$18):
                                        </label>
                                        <input
                                            type="text"
                                            value={cortesiaEstandar}
                                            onChange={(e) => setCortesiaEstandar(e.target.value)}
                                            placeholder="Ej: 1 reemplazo + 1 de kg"
                                            className="form-control"
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border-color, #cbd5e1)',
                                                fontSize: '0.9rem',
                                                background: 'var(--input-bg, #ffffff)',
                                                color: 'var(--text-main, #0f172a)'
                                            }}
                                        />
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                                            Aplicada a defectos leves / comunes.
                                        </small>
                                    </div>

                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-main)' }}>
                                            Compensación Especial / Crítica (ex celda $AG$19):
                                        </label>
                                        <input
                                            type="text"
                                            value={cortesiaEspecial}
                                            onChange={(e) => setCortesiaEspecial(e.target.value)}
                                            placeholder="Ej: 1 reemplazo + 2 productos a elección + 2 de kg."
                                            className="form-control"
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border-color, #cbd5e1)',
                                                fontSize: '0.9rem',
                                                background: 'var(--input-bg, #ffffff)',
                                                color: 'var(--text-main, #0f172a)'
                                            }}
                                        />
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                                            Aplicada a defectos graves o no listados.
                                        </small>
                                    </div>
                                </div>

                                {/* Defectos Estándar (ex $AJ$15:$AJ$19) */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, marginBottom: 6, color: 'var(--text-main)' }}>
                                        Defectos Estándar Catalogados (ex rango $AJ$15:$AJ$19):
                                    </label>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Los reclamos con estos defectos recibirán la compensación estándar. Cualquier otro defecto recibirá la especial.
                                    </p>

                                    {/* Chips de defectos */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                        {defectosEstandar.map((def, idx) => (
                                            <span
                                                key={idx}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    background: 'rgba(21, 28, 91, 0.08)',
                                                    border: '1px solid rgba(21, 28, 91, 0.2)',
                                                    color: 'var(--text-main, #151C5B)',
                                                    padding: '5px 10px',
                                                    borderRadius: 20,
                                                    fontSize: '0.82rem',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {def}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDefecto(idx)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        display: 'flex',
                                                        color: '#ef4444'
                                                    }}
                                                    title="Eliminar defecto de estándar"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>

                                    {/* Input para agregar defecto */}
                                    <form onSubmit={handleAddDefecto} style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="text"
                                            value={nuevoDefecto}
                                            onChange={(e) => setNuevoDefecto(e.target.value)}
                                            placeholder="Escribir nuevo defecto estándar y presionar Enter..."
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border-color, #cbd5e1)',
                                                fontSize: '0.86rem',
                                                background: 'var(--input-bg, #ffffff)',
                                                color: 'var(--text-main, #0f172a)'
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!nuevoDefecto.trim()}
                                            style={{
                                                background: 'var(--primary-color, #151C5B)',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: 8,
                                                padding: '0 14px',
                                                fontSize: '0.84rem',
                                                fontWeight: 600,
                                                cursor: nuevoDefecto.trim() ? 'pointer' : 'not-allowed',
                                                opacity: nuevoDefecto.trim() ? 1 : 0.6,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}
                                        >
                                            <Plus size={16} />
                                            Agregar
                                        </button>
                                    </form>
                                </div>

                                {/* Simulador interactivo en vivo */}
                                <div
                                    style={{
                                        background: 'var(--surface-color, #f8fafc)',
                                        border: '1px dashed var(--border-color, #cbd5e1)',
                                        borderRadius: 12,
                                        padding: 16
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: 8 }}>
                                        <Sparkles size={16} color="#10b981" />
                                        <span>Simulador de Cortesía en Tiempo Real:</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                value={simulacionDefecto}
                                                onChange={(e) => setSimulacionDefecto(e.target.value)}
                                                placeholder="Probar cualquier defecto (ej: Vida util, Presencia de cuerpo extraño...)"
                                                style={{
                                                    flex: 1,
                                                    padding: '8px 12px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--border-color, #cbd5e1)',
                                                    fontSize: '0.86rem',
                                                    background: 'var(--card-bg, #ffffff)',
                                                    color: 'var(--text-main)'
                                                }}
                                            />
                                        </div>

                                        {/* Sugerencias rápidas */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Probar rápido:</span>
                                            {DEFECTOS_SUGERIDOS_COMUNES.map((sug, sIdx) => (
                                                <button
                                                    key={sIdx}
                                                    type="button"
                                                    onClick={() => setSimulacionDefecto(sug)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--border-color, #cbd5e1)',
                                                        padding: '2px 8px',
                                                        borderRadius: 12,
                                                        fontSize: '0.72rem',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {sug}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Resultado del simulador */}
                                        {simulacionResultado && (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    padding: '12px 14px',
                                                    borderRadius: 8,
                                                    background: simulacionResultado.tipo === 'estandar' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                                                    border: `1px solid ${simulacionResultado.tipo === 'estandar' ? '#10b981' : '#f87171'}`
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, color: simulacionResultado.tipo === 'estandar' ? '#047857' : '#b91c1c' }}>
                                                        {simulacionResultado.tipo === 'estandar' ? '🟢 COMPENSACIÓN ESTÁNDAR' : '🔴 COMPENSACIÓN ESPECIAL / CRÍTICA'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {simulacionResultado.regla}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: simulacionResultado.tipo === 'estandar' ? '#065f46' : '#991b1b' }}>
                                                    🎁 {simulacionResultado.cortesía}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        style={{
                            padding: '14px 24px',
                            background: 'var(--surface-color, #f8fafc)',
                            borderTop: '1px solid var(--border-color, #e2e8f0)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setIsConfirmResetOpen(true)}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color, #cbd5e1)',
                                color: 'var(--text-muted, #64748b)',
                                padding: '8px 14px',
                                borderRadius: 8,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            <RefreshCw size={14} />
                            Restaurar fórmula original
                        </button>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border-color, #cbd5e1)',
                                    color: 'var(--text-main, #334155)',
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    fontSize: '0.86rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || loading}
                                style={{
                                    background: 'var(--primary-color, #151C5B)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '8px 20px',
                                    borderRadius: 8,
                                    fontSize: '0.86rem',
                                    fontWeight: 700,
                                    cursor: saving ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                {saving ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de confirmación para restaurar valores */}
            <ConfirmModal
                isOpen={isConfirmResetOpen}
                title="Restaurar Fórmula Original"
                message="¿Desea restaurar los parámetros por defecto de la fórmula de Google Sheets ($AG$18 y $AG$19)? Los cambios no se guardarán hasta que haga clic en 'Guardar Cambios'."
                confirmText="Sí, restaurar"
                cancelText="Cancelar"
                variant="warning"
                onConfirm={handleResetDefaults}
                onCancel={() => setIsConfirmResetOpen(false)}
            />
        </>
    );
};
