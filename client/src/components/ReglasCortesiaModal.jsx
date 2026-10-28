import React, { useState, useEffect } from 'react';
import {
    Gift, CheckCircle2, AlertCircle, RefreshCw, X,
    HelpCircle, Save, Plus, Trash2, Lock
} from 'lucide-react';
import { prioridadesApi } from '../services/api';
import { ConfirmModal } from './ConfirmModal';

const REGLAS_CANONICAS = [
    {
        codigo: 10,
        nombre: 'Alta',
        descripcion: 'Casos críticos y graves que implican reconocer el error rápidamente',
        sla: 3,
        reglas_cortesia: [
            {
                codigo: 'codigo1',
                descripcion: ' 1 reemplazo + 2 productos a elección + 2 de kg'
            }
        ]
    },
    {
        codigo: 20,
        nombre: 'Media',
        descripcion: 'Casos leves que no representan un daño importante para el consumidor',
        sla: 7,
        reglas_cortesia: [
            {
                codigo: 'codigo2',
                descripcion: ' 1 reemplazo'
            }
        ]
    },
    {
        codigo: 30,
        nombre: 'Baja',
        descripcion: 'Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa',
        sla: 14,
        reglas_cortesia: [
            {
                codigo: 'codigo3',
                descripcion: ' 1 reemplazo + 1 de kg'
            }
        ]
    }
];

export const ReglasCortesiaModal = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Lista de prioridades con sus reglas de cortesía
    const [prioridades, setPrioridades] = useState([]);

    // Modal de confirmación para restaurar valores por defecto
    const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

    const fetchPrioridades = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await prioridadesApi.getAll();
            if (res.data?.success && Array.isArray(res.data.prioridades) && res.data.prioridades.length > 0) {
                setPrioridades(res.data.prioridades);
            } else {
                setPrioridades(REGLAS_CANONICAS);
            }
        } catch (err) {
            console.error('Error cargando prioridades:', err);
            setError(err.response?.data?.error || 'No se pudieron cargar las prioridades desde la base de datos.');
            setPrioridades(REGLAS_CANONICAS);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchPrioridades();
            setSuccessMessage(null);
            setError(null);
        }
    }, [isOpen]);

    // Modificar la cantidad de días de SLA de una prioridad
    const handleUpdateSla = (prioridadCodigo, nuevoSla) => {
        setPrioridades(prev => prev.map(p => {
            if (p.codigo !== prioridadCodigo) return p;
            return { ...p, sla: nuevoSla };
        }));
    };

    // Modificar el texto de una regla de cortesía existente
    const handleUpdateReglaDescripcion = (prioridadCodigo, reglaIndex, nuevaDescripcion) => {
        setPrioridades(prev => prev.map(p => {
            if (p.codigo !== prioridadCodigo) return p;
            const updatedReglas = [...(p.reglas_cortesia || [])];
            updatedReglas[reglaIndex] = {
                ...updatedReglas[reglaIndex],
                descripcion: nuevaDescripcion
            };
            return { ...p, reglas_cortesia: updatedReglas };
        }));
    };

    // Agregar una nueva regla a una prioridad
    const handleAddRegla = (prioridadCodigo) => {
        setPrioridades(prev => prev.map(p => {
            if (p.codigo !== prioridadCodigo) return p;
            const updatedReglas = [...(p.reglas_cortesia || [])];
            const nuevoIndice = updatedReglas.length + 1;
            updatedReglas.push({
                codigo: `codigo${p.codigo}_${nuevoIndice}`,
                descripcion: ''
            });
            return { ...p, reglas_cortesia: updatedReglas };
        }));
    };

    // Eliminar una regla de cortesía (mínimo 1 requerida)
    const handleRemoveRegla = (prioridadCodigo, reglaIndex) => {
        setPrioridades(prev => prev.map(p => {
            if (p.codigo !== prioridadCodigo) return p;
            const updatedReglas = [...(p.reglas_cortesia || [])];
            if (updatedReglas.length <= 1) {
                setError(`La prioridad "${p.nombre}" debe tener al menos una regla de cortesía.`);
                return p;
            }
            updatedReglas.splice(reglaIndex, 1);
            return { ...p, reglas_cortesia: updatedReglas };
        }));
    };

    const handleSave = async () => {
        setError(null);
        setSuccessMessage(null);

        // Validación mandatoria: SLA válido y al menos una regla por prioridad sin descripciones vacías
        for (const p of prioridades) {
            const slaNum = parseInt(p.sla, 10);
            if (isNaN(slaNum) || slaNum <= 0) {
                setError(`El SLA de la prioridad "${p.nombre}" debe ser un número entero mayor a 0 días.`);
                return;
            }

            const reglas = p.reglas_cortesia || [];
            if (reglas.length === 0) {
                setError(`La prioridad "${p.nombre}" debe contener al menos una regla de cortesía.`);
                return;
            }
            for (let i = 0; i < reglas.length; i++) {
                if (!reglas[i].descripcion || !reglas[i].descripcion.trim()) {
                    setError(`La regla #${i + 1} de la prioridad "${p.nombre}" no puede tener una descripción vacía.`);
                    return;
                }
            }
        }

        setSaving(true);
        try {
            // Guardar para cada prioridad (enviando reglas_cortesia y SLA)
            for (const p of prioridades) {
                await prioridadesApi.updateReglas(p.codigo, p.reglas_cortesia, p.sla);
            }
            setSuccessMessage('¡Reglas de cortesía y SLA actualizados correctamente para todas las prioridades!');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
            console.error('Error al guardar configuración de prioridades:', err);
            setError(err.response?.data?.error || 'Error al persistir las reglas de cortesía y SLA.');
        } finally {
            setSaving(false);
        }
    };

    const handleResetDefaults = () => {
        setPrioridades(REGLAS_CANONICAS);
        setIsConfirmResetOpen(false);
        setSuccessMessage('Valores de reglas canónicas restaurados en pantalla. Haga clic en "Guardar Cambios" para aplicarlos.');
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" style={{ zIndex: 1050 }}>
                <div
                    className="modal-content"
                    style={{
                        maxWidth: 820,
                        width: '94%',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 16,
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                        background: 'var(--card-bg, #0f1535)'
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            background: '#151C5B',
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
                                    background: 'rgba(229, 53, 59, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid #E5353B'
                                }}
                            >
                                <Gift size={22} color="#E5353B" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                                    Reglas de Cortesía por Nivel de Prioridad
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.85, color: '#cbd5e1' }}>
                                    Defina el texto de compensación aplicado automáticamente según la gravedad del caso
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
                            title="Cerrar"
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
                            gap: 18
                        }}
                    >
                        {/* Explicación de políticas e inmutabilidad */}
                        <div
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 10,
                                padding: '12px 16px',
                                fontSize: '0.84rem'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
                                <HelpCircle size={16} color="#60a5fa" />
                                <span>Configuración de Reglas por Prioridad</span>
                            </div>
                            <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.45, fontSize: '0.8rem' }}>
                                Por política de calidad, <strong>los nombres y descripciones de las prioridades (Alta, Media, Baja) son inmutables</strong>.
                                Puede modificar la <strong>cantidad de días de SLA</strong> y definir una o más <strong>reglas de cortesía</strong> asociadas a cada nivel. Debe existir al menos una regla por prioridad.
                            </p>
                        </div>

                        {/* Mensajes de feedback */}
                        {error && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}
                        {successMessage && (
                            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#6ee7b7', padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
                                <CheckCircle2 size={18} />
                                <span>{successMessage}</span>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                                <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
                                <div>Cargando prioridades del sistema...</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {prioridades.map((p) => {
                                    const isAlta = Number(p.codigo) === 10;
                                    const isMedia = Number(p.codigo) === 20;
                                    const badgeColor = isAlta ? '#ef4444' : isMedia ? '#f59e0b' : '#3b82f6';
                                    const badgeBg = isAlta ? 'rgba(239, 68, 68, 0.15)' : isMedia ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)';
                                    const reglas = p.reglas_cortesia || [];

                                    return (
                                        <div
                                            key={p.codigo}
                                            style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: 12,
                                                padding: '16px 18px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 12
                                            }}
                                        >
                                            {/* Cabecera de la prioridad con SLA editable */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                                                        <span
                                                            style={{
                                                                background: badgeBg,
                                                                color: badgeColor,
                                                                border: `1px solid ${badgeColor}`,
                                                                padding: '3px 10px',
                                                                borderRadius: 14,
                                                                fontSize: '0.8rem',
                                                                fontWeight: 700,
                                                                textTransform: 'uppercase'
                                                            }}
                                                        >
                                                            {p.nombre} (Código {p.codigo})
                                                        </span>

                                                        {/* Control editable de SLA */}
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            background: 'rgba(0,0,0,0.3)',
                                                            padding: '2px 8px',
                                                            borderRadius: 6,
                                                            border: '1px solid rgba(255,255,255,0.1)'
                                                        }}>
                                                            <label htmlFor={`sla-input-${p.codigo}`} style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                                                                SLA:
                                                            </label>
                                                            <input
                                                                id={`sla-input-${p.codigo}`}
                                                                data-testid={`input-sla-${p.codigo}`}
                                                                type="number"
                                                                min="1"
                                                                max="365"
                                                                value={p.sla}
                                                                onChange={(e) => handleUpdateSla(p.codigo, e.target.value)}
                                                                style={{
                                                                    width: 48,
                                                                    padding: '2px 4px',
                                                                    borderRadius: 4,
                                                                    background: '#0b0f24',
                                                                    border: '1px solid #475569',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.84rem',
                                                                    fontWeight: 700,
                                                                    textAlign: 'center',
                                                                    outline: 'none'
                                                                }}
                                                                title="Editar cantidad de días de SLA"
                                                            />
                                                            <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>días</span>
                                                        </div>

                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#64748b' }}>
                                                            <Lock size={12} /> Nombre y desc. fijos
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                                                        {p.descripcion}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleAddRegla(p.codigo)}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.06)',
                                                        border: '1px solid rgba(255,255,255,0.15)',
                                                        color: '#f8fafc',
                                                        padding: '5px 12px',
                                                        borderRadius: 6,
                                                        fontSize: '0.78rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 5
                                                    }}
                                                >
                                                    <Plus size={14} />
                                                    Agregar regla
                                                </button>
                                            </div>

                                            {/* Listado de reglas de cortesía */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                                                    Reglas de Cortesía Configurada(s):
                                                </span>
                                                {reglas.map((regla, rIdx) => (
                                                    <div
                                                        key={regla.codigo || rIdx}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 10,
                                                            background: 'rgba(0,0,0,0.2)',
                                                            padding: '8px 12px',
                                                            borderRadius: 8,
                                                            border: '1px solid rgba(255,255,255,0.05)'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '0.78rem', color: '#64748b', minWidth: 20 }}>
                                                            #{rIdx + 1}
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={regla.descripcion}
                                                            onChange={(e) => handleUpdateReglaDescripcion(p.codigo, rIdx, e.target.value)}
                                                            placeholder="Texto descriptivo de cortesía (ej: 1 reemplazo + 1 de kg)"
                                                            style={{
                                                                flex: 1,
                                                                padding: '8px 12px',
                                                                borderRadius: 6,
                                                                background: '#0b0f24',
                                                                border: '1px solid #334155',
                                                                color: '#ffffff',
                                                                fontSize: '0.88rem',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveRegla(p.codigo, rIdx)}
                                                            disabled={reglas.length <= 1}
                                                            title={reglas.length <= 1 ? "Debe haber al menos una regla por prioridad" : "Eliminar regla"}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: reglas.length <= 1 ? '#475569' : '#ef4444',
                                                                cursor: reglas.length <= 1 ? 'not-allowed' : 'pointer',
                                                                padding: 6,
                                                                borderRadius: 6,
                                                                display: 'flex'
                                                            }}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        style={{
                            padding: '14px 24px',
                            background: '#151C5B',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
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
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#cbd5e1',
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
                            Restaurar reglas por defecto
                        </button>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: '#cbd5e1',
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
                                    background: '#E5353B',
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
                                    boxShadow: '0 2px 8px rgba(229, 53, 59, 0.4)'
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
                title="Restaurar Reglas Canónicas"
                message="¿Desea restaurar las reglas canónicas de cortesía originales para Alta, Media y Baja? Los cambios no se persistirán hasta que haga clic en 'Guardar Cambios'."
                confirmText="Sí, restaurar"
                cancelText="Cancelar"
                variant="warning"
                onConfirm={handleResetDefaults}
                onCancel={() => setIsConfirmResetOpen(false)}
            />
        </>
    );
};
