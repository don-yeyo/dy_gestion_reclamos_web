import React, { useState, useMemo } from 'react';
import {
    Sliders, RefreshCw, Search, Pencil, Lock, CheckCircle2,
    AlertCircle, X, Save, UserCheck, ShieldAlert, Gift, User,
    RotateCcw, Info, Palette
} from 'lucide-react';
import { useEstados } from '../config/EstadosContext';
import { StatusBadge } from '../components/StatusBadge';

const ACTORES_INFO = {
    all: { label: 'Todos los Roles', color: 'var(--primary)' },
    admin: { label: 'Administración', sublabel: 'Resolución y Aprobación', icon: UserCheck, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    inocuidad: { label: 'Calidad & Inocuidad', sublabel: 'Análisis de Lote y Muestras', icon: ShieldAlert, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
    supervisor: { label: 'Supervisión Comercial', sublabel: 'Entrega y Compensación', icon: Gift, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    consumidor: { label: 'Consumidor', sublabel: 'Confirmación y Percepción', icon: User, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
};

const PALETA_PRESETS = [
    { label: 'Ámbar / Pendiente', color: '#f59e0b' },
    { label: 'Azul / En curso', color: '#3b82f6' },
    { label: 'Verde / Resuelto', color: '#10b981' },
    { label: 'Rojo / Desaprobado', color: '#ef4444' },
    { label: 'Púrpura / Calidad', color: '#8b5cf6' },
    { label: 'Índigo / Finalizado', color: '#6366f1' },
    { label: 'Gris / Sin acciones', color: '#64748b' },
    { label: 'Naranja Intenso', color: '#ea580c' },
    { label: 'Celeste Cyan', color: '#06b6d4' },
    { label: 'Fucsia / Especial', color: '#ec4899' }
];

export const EstadosList = () => {
    const { estados, loading, refreshEstados, updateConfig } = useEstados();

    // Filtros
    const [selectedActor, setSelectedActor] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal de edición de estado (descripción + color)
    const [editingEstado, setEditingEstado] = useState(null);
    const [descripcionDraft, setDescripcionDraft] = useState('');
    const [colorDraft, setColorDraft] = useState('#64748b');
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);

    // Conteo por actor
    const counts = useMemo(() => {
        return {
            all: estados.length,
            admin: estados.filter(e => e.actor === 'admin').length,
            inocuidad: estados.filter(e => e.actor === 'inocuidad').length,
            supervisor: estados.filter(e => e.actor === 'supervisor').length,
            consumidor: estados.filter(e => e.actor === 'consumidor').length
        };
    }, [estados]);

    // Filtrado
    const filteredEstados = useMemo(() => {
        return estados.filter(e => {
            if (selectedActor !== 'all' && e.actor !== selectedActor) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchNombre = String(e.nombre || '').toLowerCase().includes(q);
                const matchCodigo = String(e.codigo || '').toLowerCase().includes(q);
                const matchActor = String(e.actor || '').toLowerCase().includes(q);
                const matchDesc = String(e.descripcion || '').toLowerCase().includes(q);
                const rolLabel = ACTORES_INFO[e.actor]?.label || '';
                const matchRol = rolLabel.toLowerCase().includes(q);

                if (!matchNombre && !matchCodigo && !matchActor && !matchDesc && !matchRol) {
                    return false;
                }
            }
            return true;
        });
    }, [estados, selectedActor, searchQuery]);

    const handleOpenEdit = (estado) => {
        setEditingEstado(estado);
        setDescripcionDraft(estado.descripcion || '');
        setColorDraft(estado.color || '#64748b');
    };

    const handleCloseEdit = () => {
        if (saving) return;
        setEditingEstado(null);
        setDescripcionDraft('');
        setColorDraft('#64748b');
    };

    const handleSaveConfig = async (e) => {
        e?.preventDefault();
        if (!editingEstado) return;

        setSaving(true);
        try {
            const res = await updateConfig(editingEstado.id, {
                descripcion: descripcionDraft.trim(),
                color: colorDraft.trim()
            });
            if (res.success) {
                setNotification({
                    type: 'success',
                    message: `Estado "${editingEstado.nombre}" actualizado correctamente (descripción y color).`
                });
                setEditingEstado(null);
                setTimeout(() => setNotification(null), 4000);
            } else {
                setNotification({
                    type: 'error',
                    message: res.error || 'No se pudo guardar la configuración del estado.'
                });
            }
        } catch (err) {
            setNotification({
                type: 'error',
                message: err.message || 'Error al comunicarse con el servidor.'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Encabezado Principal */}
            <div className="claims-page-header">
                <div className="claims-page-title-group">
                    <h1>
                        <Sliders size={28} style={{ color: 'var(--dy-gold)' }} />
                        Estados
                    </h1>
                    <p>
                        Catálogo de estados de workflow por rol y gestión de descripciones operativas (utilizadas como tooltips en grillas)
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {(selectedActor !== 'all' || searchQuery.trim() !== '') && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setSelectedActor('all'); setSearchQuery(''); }}
                        >
                            <RotateCcw size={15} />
                            <span>Limpiar Filtros</span>
                        </button>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={refreshEstados}
                        disabled={loading}
                    >
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
                    </button>
                </div>
            </div>

            {/* Banner de Notificación */}
            {notification && (
                <div style={{
                    marginBottom: 16,
                    padding: '12px 18px',
                    borderRadius: 'var(--radius-md, 10px)',
                    background: notification.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                    border: `1px solid ${notification.type === 'success' ? 'var(--success)' : 'var(--error)'}`,
                    color: notification.type === 'success' ? 'var(--success)' : 'var(--error)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: '0.86rem',
                    fontWeight: 600
                }}>
                    {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Chips de Roles */}
            <div className="claims-summary-chips">
                {Object.entries(ACTORES_INFO).map(([key, info]) => {
                    const isSelected = selectedActor === key;
                    const IconComponent = info.icon || Sliders;
                    return (
                        <div
                            key={key}
                            className="summary-chip"
                            onClick={() => setSelectedActor(key)}
                            style={{
                                cursor: 'pointer',
                                borderColor: isSelected ? info.color : 'var(--border)',
                                background: isSelected ? 'var(--surface-hover)' : 'var(--surface)',
                                boxShadow: isSelected ? `0 0 0 2px ${info.color}` : 'none'
                            }}
                        >
                            <div
                                className="summary-chip-icon"
                                style={{
                                    background: info.bg || 'rgba(13, 44, 92, 0.12)',
                                    color: info.color
                                }}
                            >
                                <IconComponent size={20} />
                            </div>
                            <div className="summary-chip-content">
                                <span className="summary-chip-val" style={{ color: isSelected ? info.color : 'inherit' }}>
                                    {counts[key] || 0}
                                </span>
                                <span className="summary-chip-lbl">
                                    {info.label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="filter-panel-card">
                <div className="search-bar-row">
                    <div className="search-input-field">
                        <Search size={18} className="search-icon-svg" />
                        <input
                            type="text"
                            placeholder="Buscar estado por nombre, rol o contenido de la descripción..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Mensaje de Seguridad / Información */}
            <div style={{
                marginBottom: 16,
                padding: '10px 16px',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: '0.8rem',
                color: 'var(--text-muted)'
            }}>
                <Lock size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <span>
                    <strong>Protección de Workflows:</strong> Los nombres y códigos de los estados son inmutables para resguardar las reglas lógicas y automatizaciones. Podés editar libremente la <strong>descripción</strong> de cada estado, la cual se refleja de inmediato como tooltip en todas las grillas de reclamo.
                </span>
            </div>

            {/* Grilla / Tabla de Estados */}
            <div className="table-card">
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '220px' }}>Nombre</th>
                                <th style={{ width: '240px' }}>Rol</th>
                                <th>Descripción</th>
                                <th style={{ width: '110px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                                            <span style={{ fontWeight: 500 }}>Cargando catálogo de estados...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredEstados.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 360, margin: '0 auto' }}>
                                            <AlertCircle size={36} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                                            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.05rem' }}>No se encontraron estados</h3>
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>
                                                Ningún estado coincide con los filtros o la búsqueda ingresada.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredEstados.map((e) => {
                                    const actorMeta = ACTORES_INFO[e.actor] || { label: e.actor, color: 'var(--text)', bg: 'var(--surface-subtle)' };
                                    const ActorIcon = actorMeta.icon || User;
                                    return (
                                        <tr key={e.id}>
                                            {/* Columna: Nombre */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                                    <StatusBadge status={e.nombre} actor={e.actor} />
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {e.color && (
                                                            <span
                                                                style={{
                                                                    width: 10,
                                                                    height: 10,
                                                                    borderRadius: '50%',
                                                                    backgroundColor: e.color,
                                                                    display: 'inline-block',
                                                                    boxShadow: '0 0 0 1px var(--border)'
                                                                }}
                                                                title={`Color asignado: ${e.color}`}
                                                            />
                                                        )}
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                            {e.codigo}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Columna: Rol */}
                                            <td>
                                                <div style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    padding: '4px 10px',
                                                    borderRadius: 'var(--radius-pill)',
                                                    background: actorMeta.bg,
                                                    color: actorMeta.color,
                                                    fontWeight: 600,
                                                    fontSize: '0.78rem'
                                                }}>
                                                    <ActorIcon size={14} />
                                                    <span>{actorMeta.label}</span>
                                                </div>
                                            </td>

                                            {/* Columna: Descripción */}
                                            <td>
                                                <div style={{
                                                    fontSize: '0.84rem',
                                                    lineHeight: 1.45,
                                                    color: e.descripcion ? 'var(--text)' : 'var(--text-muted)',
                                                    fontStyle: e.descripcion ? 'normal' : 'italic'
                                                }}>
                                                    {e.descripcion || 'Sin descripción configurada'}
                                                </div>
                                            </td>

                                            {/* Columna: Acciones */}
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(e)}
                                                    className="btn btn-secondary"
                                                    style={{
                                                        padding: '6px 12px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        fontSize: '0.78rem',
                                                        fontWeight: 600,
                                                        borderRadius: 'var(--radius-sm)'
                                                    }}
                                                    title="Editar descripción y color"
                                                >
                                                    <Pencil size={14} />
                                                    <span>Editar</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL PARA CONFIGURAR ESTADO (FONDO 100% SÓLIDO Y OPACO) */}
            {editingEstado && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 1100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16
                    }}
                    onClick={handleCloseEdit}
                >
                    <div
                        style={{
                            /* Fondo completamente sólido y opaco en ambos temas para máxima legibilidad */
                            backgroundColor: 'var(--surface-card, #ffffff)',
                            color: 'var(--text)',
                            width: '100%',
                            maxWidth: 620,
                            borderRadius: 14,
                            border: '1px solid var(--border)',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header del Modal */}
                        <div style={{
                            padding: '16px 22px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: 'var(--surface-subtle)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    background: 'rgba(217, 119, 6, 0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--dy-gold)'
                                }}>
                                    <Palette size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--heading-color)' }}>
                                        Configuración del Estado
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Personalizá el color del badge y la descripción operativa
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseEdit}
                                disabled={saving}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 6,
                                    borderRadius: 6,
                                    display: 'flex'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Cuerpo del Modal */}
                        <form onSubmit={handleSaveConfig}>
                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                                {/* Datos del Estado y Vista Previa */}
                                <div style={{
                                    padding: '14px 16px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--surface-subtle)',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ display: 'block', fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 2 }}>
                                                Estado (Nombre Inmutable):
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <strong style={{ fontSize: '0.95rem' }}>{editingEstado.nombre}</strong>
                                                <Lock size={13} style={{ color: 'var(--text-muted)' }} title="Nombre protegido" />
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ display: 'block', fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 2 }}>
                                                Rol:
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: ACTORES_INFO[editingEstado.actor]?.color || 'var(--text)' }}>
                                                {ACTORES_INFO[editingEstado.actor]?.label || editingEstado.actor}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Previsualización en Vivo del Badge */}
                                    <div style={{
                                        borderTop: '1px dashed var(--border)',
                                        paddingTop: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Vista previa del badge:
                                        </span>
                                        <span
                                            className="badge"
                                            style={{
                                                fontSize: '0.72rem',
                                                padding: '3px 10px',
                                                color: colorDraft,
                                                borderColor: `${colorDraft}66`,
                                                backgroundColor: `${colorDraft}1f`,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}
                                        >
                                            <span style={{ fontSize: '0.65rem', lineHeight: 1, color: colorDraft }}>●</span>
                                            <span>{editingEstado.nombre}</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Definición de Color del Badge */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                                        Color del Badge:
                                    </label>

                                    {/* Paleta rápida de presets sugeridos */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                        {PALETA_PRESETS.map((p) => {
                                            const isSelected = colorDraft.toLowerCase() === p.color.toLowerCase();
                                            return (
                                                <button
                                                    key={p.color}
                                                    type="button"
                                                    onClick={() => setColorDraft(p.color)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: 'var(--radius-pill)',
                                                        border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border)',
                                                        background: isSelected ? `${p.color}25` : 'var(--background)',
                                                        color: 'var(--text)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.72rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span style={{
                                                        width: 12,
                                                        height: 12,
                                                        borderRadius: '50%',
                                                        backgroundColor: p.color,
                                                        display: 'inline-block'
                                                    }} />
                                                    <span>{p.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Selector de color personalizado */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            position: 'relative',
                                            width: 40,
                                            height: 38,
                                            borderRadius: 'var(--radius-sm)',
                                            overflow: 'hidden',
                                            border: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            flexShrink: 0
                                        }}>
                                            <input
                                                type="color"
                                                value={colorDraft}
                                                onChange={(e) => setColorDraft(e.target.value)}
                                                style={{
                                                    position: 'absolute',
                                                    top: -8,
                                                    left: -8,
                                                    width: 56,
                                                    height: 56,
                                                    border: 'none',
                                                    cursor: 'pointer'
                                                }}
                                                title="Elegir color personalizado"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={colorDraft}
                                            onChange={(e) => setColorDraft(e.target.value)}
                                            placeholder="#10b981"
                                            maxLength={30}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                                backgroundColor: 'var(--background)',
                                                color: 'var(--text)',
                                                fontSize: '0.84rem',
                                                fontFamily: 'monospace',
                                                outline: 'none'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Código HEX / CSS
                                        </span>
                                    </div>
                                </div>

                                {/* Textarea de Descripción */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                                        Descripción del Estado (Tooltip): <span style={{ color: 'var(--dy-red)' }}>*</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={descripcionDraft}
                                        onChange={(e) => setDescripcionDraft(e.target.value)}
                                        placeholder="Redactá la explicación clara y concisa de este estado para el tooltip de los usuarios..."
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border)',
                                            backgroundColor: 'var(--background)',
                                            color: 'var(--text)',
                                            fontSize: '0.86rem',
                                            lineHeight: 1.45,
                                            resize: 'vertical',
                                            outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                        required
                                    />
                                    <span style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Se muestra al posar el cursor sobre el badge de este estado en cualquier grilla.
                                    </span>
                                </div>
                            </div>

                            {/* Footer del Modal */}
                            <div style={{
                                padding: '14px 22px',
                                borderTop: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 10,
                                backgroundColor: 'var(--surface-subtle)'
                            }}>
                                <button
                                    type="button"
                                    onClick={handleCloseEdit}
                                    disabled={saving}
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !descripcionDraft.trim()}
                                    className="btn btn-primary"
                                    style={{
                                        padding: '8px 18px',
                                        fontSize: '0.84rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                >
                                    <Save size={15} />
                                    <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EstadosList;
