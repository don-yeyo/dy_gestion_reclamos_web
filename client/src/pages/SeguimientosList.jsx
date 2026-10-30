import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
    Clock, RefreshCw, Search, Plus, Pencil, Trash2, CheckCircle2,
    AlertCircle, X, Save, UserCheck, ShieldAlert, Gift, User,
    RotateCcw, Info, ArrowRight, Mail, AlertTriangle, Check, BellRing
} from 'lucide-react';
import { seguimientosApi, estadosApi, prioridadesApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';

const ROLES_INFO = {
    all: { label: 'Todos los Roles', color: 'var(--primary)' },
    admin: { label: 'Administrador', sublabel: 'Aprobación inicial y resoluciones', icon: UserCheck, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    supervisor: { label: 'Supervisor', sublabel: 'Entrega comercial y compensaciones', icon: Gift, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
    inocuidad: { label: 'Inocuidad', sublabel: 'Dictámenes técnicos y laboratorio', icon: ShieldAlert, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
    consumidor: { label: 'Consumidor', sublabel: 'Conformidad y percepción final', icon: User, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
};

export const SeguimientosList = () => {
    const { id: routeReglaId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [seguimientos, setSeguimientos] = useState([]);
    const [estados, setEstados] = useState([]);
    const [prioridades, setPrioridades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState(null);

    // Filtros
    const [selectedRol, setSelectedRol] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPrioridad, setSelectedPrioridad] = useState('all');
    const [selectedEstadoFiltro, setSelectedEstadoFiltro] = useState('all');

    // Modal de Creación / Edición
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRegla, setEditingRegla] = useState(null);
    const [formData, setFormData] = useState({
        rol: 'supervisor',
        estado_codigo: '',
        prioridad_codigo: 10,
        disparo_dias: 3,
        repeticiones: 3,
        emails_elevacion: '',
        activo: true
    });
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState(null);

    // Modal de Confirmación de Borrado
    const [deleteConfirmRegla, setDeleteConfirmRegla] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Carga de datos
    const fetchData = async () => {
        setLoading(true);
        try {
            const [segRes, estRes, prioRes] = await Promise.all([
                seguimientosApi.getAll(),
                estadosApi.getAll(),
                prioridadesApi.getAll()
            ]);

            if (segRes.data?.success) {
                setSeguimientos(segRes.data.seguimientos || []);
            }
            if (estRes.data?.success) {
                setEstados(estRes.data.estados || []);
            }
            if (prioRes.data?.success) {
                setPrioridades(prioRes.data.prioridades || []);
            }
        } catch (err) {
            console.error('Error cargando reglas de seguimiento:', err);
            setNotification({
                type: 'error',
                message: 'No se pudieron cargar las reglas de seguimiento: ' + (err.message || 'Error de conexión')
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Conteo de reglas por rol
    const counts = useMemo(() => {
        return {
            all: seguimientos.length,
            admin: seguimientos.filter(s => s.rol === 'admin').length,
            supervisor: seguimientos.filter(s => s.rol === 'supervisor').length,
            inocuidad: seguimientos.filter(s => s.rol === 'inocuidad').length,
            consumidor: seguimientos.filter(s => s.rol === 'consumidor').length
        };
    }, [seguimientos]);

    // Filtrado de la grilla
    const filteredSeguimientos = useMemo(() => {
        return seguimientos.filter(s => {
            if (selectedRol !== 'all' && s.rol !== selectedRol) {
                return false;
            }
            if (selectedPrioridad !== 'all' && String(s.prioridad_codigo) !== String(selectedPrioridad)) {
                return false;
            }
            if (selectedEstadoFiltro !== 'all') {
                const activoBool = selectedEstadoFiltro === 'activas';
                if (s.activo !== activoBool) return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchRol = String(s.rol || '').toLowerCase().includes(q);
                const matchRolLabel = (ROLES_INFO[s.rol]?.label || '').toLowerCase().includes(q);
                const matchEstado = String(s.estado_nombre || s.estado_codigo || '').toLowerCase().includes(q);
                const matchPrio = String(s.prioridad_nombre || '').toLowerCase().includes(q);
                const matchEmails = String(s.emails_elevacion || '').toLowerCase().includes(q);

                if (!matchRol && !matchRolLabel && !matchEstado && !matchPrio && !matchEmails) {
                    return false;
                }
            }
            return true;
        });
    }, [seguimientos, selectedRol, selectedPrioridad, selectedEstadoFiltro, searchQuery]);

    // Estados filtrados según el rol seleccionado en el formulario
    const estadosParaRol = useMemo(() => {
        if (!formData.rol) return [];
        return estados.filter(e => e.actor === formData.rol);
    }, [estados, formData.rol]);

    // SLA actual para la prioridad elegida en el formulario
    const slaActualForm = useMemo(() => {
        const found = prioridades.find(p => Number(p.codigo) === Number(formData.prioridad_codigo));
        return found ? Number(found.sla) : 3;
    }, [prioridades, formData.prioridad_codigo]);

    // Cálculo reactivo en vivo de N para el formulario
    const nCalculadoForm = useMemo(() => {
        const reps = parseInt(formData.repeticiones, 10);
        const disparo = parseFloat(formData.disparo_dias);
        if (!reps || reps <= 0) return { dias: 0, horas: 0, esValido: false, remanente: 0 };
        if (isNaN(disparo) || disparo < 0) return { dias: 0, horas: 0, esValido: false, remanente: 0 };

        const remanente = Math.max(0, slaActualForm - disparo);
        const dias = Number((remanente / reps).toFixed(2));
        const horas = Math.round((remanente * 24 / reps) * 10) / 10;
        return { dias, horas, esValido: true, remanente };
    }, [slaActualForm, formData.repeticiones, formData.disparo_dias]);

    // Sincronizar modal con URL (/seguimientos/nuevo o /seguimientos/:id)
    const isNuevoRoute = location.pathname.endsWith('/seguimientos/nuevo');

    useEffect(() => {
        if (isNuevoRoute) {
            if (!isModalOpen || editingRegla) {
                setEditingRegla(null);
                setFormError(null);
                const rolPorDefecto = selectedRol !== 'all' ? selectedRol : 'supervisor';
                const estadosDisponibles = estados.filter(e => e.actor === rolPorDefecto);
                const primerEstado = estadosDisponibles.length > 0 ? estadosDisponibles[0].codigo : 'Pendiente';
                setFormData({
                    rol: rolPorDefecto,
                    estado_codigo: primerEstado,
                    prioridad_codigo: 10,
                    disparo_dias: 3,
                    repeticiones: 3,
                    emails_elevacion: '',
                    activo: true
                });
                setIsModalOpen(true);
            }
            return;
        }

        if (routeReglaId && routeReglaId !== 'nuevo') {
            if (seguimientos.length > 0) {
                const found = seguimientos.find(s => String(s.id) === String(routeReglaId));
                if (found && (!isModalOpen || !editingRegla || String(editingRegla.id) !== String(found.id))) {
                    setEditingRegla(found);
                    setFormError(null);
                    setFormData({
                        rol: found.rol,
                        estado_codigo: found.estado_codigo,
                        prioridad_codigo: found.prioridad_codigo,
                        disparo_dias: found.disparo_dias,
                        repeticiones: found.repeticiones,
                        emails_elevacion: found.emails_elevacion || '',
                        activo: Boolean(found.activo)
                    });
                    setIsModalOpen(true);
                }
            }
            return;
        }

        if (!isNuevoRoute && !routeReglaId) {
            setIsModalOpen(false);
            setEditingRegla(null);
        }
    }, [isNuevoRoute, routeReglaId, seguimientos, estados.length]);

    const handleCloseModal = () => {
        if (formSaving) return;
        setIsModalOpen(false);
        setEditingRegla(null);
        if (isNuevoRoute || routeReglaId) {
            navigate('/seguimientos');
        }
    };

    // Abrir Modal de Creación
    const handleOpenCreate = () => {
        setEditingRegla(null);
        setFormError(null);
        const rolPorDefecto = selectedRol !== 'all' ? selectedRol : 'supervisor';
        const estadosDisponibles = estados.filter(e => e.actor === rolPorDefecto);
        const primerEstado = estadosDisponibles.length > 0 ? estadosDisponibles[0].codigo : 'Pendiente';

        setFormData({
            rol: rolPorDefecto,
            estado_codigo: primerEstado,
            prioridad_codigo: 10,
            disparo_dias: 3,
            repeticiones: 3,
            emails_elevacion: '',
            activo: true
        });
        setIsModalOpen(true);
        navigate('/seguimientos/nuevo');
    };

    // Abrir Modal de Edición
    const handleOpenEdit = (regla) => {
        setEditingRegla(regla);
        setFormError(null);
        setFormData({
            rol: regla.rol,
            estado_codigo: regla.estado_codigo,
            prioridad_codigo: regla.prioridad_codigo,
            disparo_dias: regla.disparo_dias,
            repeticiones: regla.repeticiones,
            emails_elevacion: regla.emails_elevacion || '',
            activo: Boolean(regla.activo)
        });
        setIsModalOpen(true);
        navigate(`/seguimientos/${encodeURIComponent(regla.id)}`);
    };

    // Manejo de cambio de rol en el formulario (reajusta estado por defecto)
    const handleRolChange = (nuevoRol) => {
        const ests = estados.filter(e => e.actor === nuevoRol);
        const primerEstado = ests.length > 0 ? ests[0].codigo : '';
        setFormData(prev => ({
            ...prev,
            rol: nuevoRol,
            estado_codigo: primerEstado
        }));
    };

    // Guardar Regla (Creación o Actualización)
    const handleSaveRegla = async (e) => {
        e?.preventDefault();
        setFormError(null);

        if (!formData.estado_codigo) {
            setFormError('Debe seleccionar un estado.');
            return;
        }

        const disparoNum = parseFloat(formData.disparo_dias);
        if (isNaN(disparoNum) || disparoNum <= 0) {
            setFormError('El Disparo de Seguimiento debe ser mayor a 0 días.');
            return;
        }

        if (disparoNum > slaActualForm) {
            setFormError(`El Disparo Inicial (${disparoNum} días) no puede ser superior al SLA de la prioridad seleccionada (${slaActualForm} días).`);
            return;
        }

        const repeticionesNum = parseInt(formData.repeticiones, 10);
        if (isNaN(repeticionesNum) || repeticionesNum < 1) {
            setFormError('La cantidad de Repeticiones debe ser al menos 1.');
            return;
        }

        // Validar que no exista ya otra regla para el mismo rol, estado y prioridad
        const reglaRepetida = seguimientos.find(s =>
            s.rol === formData.rol &&
            String(s.estado_codigo).trim().toLowerCase() === String(formData.estado_codigo).trim().toLowerCase() &&
            Number(s.prioridad_codigo) === Number(formData.prioridad_codigo) &&
            (!editingRegla || s.id !== editingRegla.id)
        );

        if (reglaRepetida) {
            const rolLabel = ROLES_INFO[formData.rol]?.label || formData.rol;
            const prioNombre = formData.prioridad_codigo === 10 ? 'Alta' : (formData.prioridad_codigo === 20 ? 'Media' : 'Baja');
            setFormError(`Ya existe una regla configurada para ${rolLabel}, estado "${formData.estado_codigo}" y prioridad ${prioNombre}. No se permiten reglas duplicadas.`);
            return;
        }

        setFormSaving(true);
        try {
            if (editingRegla) {
                const res = await seguimientosApi.update(editingRegla.id, {
                    ...formData,
                    disparo_dias: disparoNum,
                    repeticiones: repeticionesNum
                });
                if (res.data?.success) {
                    setNotification({
                        type: 'success',
                        message: 'Regla de seguimiento actualizada correctamente.'
                    });
                    setIsModalOpen(false);
                    if (isNuevoRoute || routeReglaId) {
                        navigate('/seguimientos');
                    }
                    await fetchData();
                } else {
                    setFormError(res.data?.error || 'Error al actualizar la regla.');
                }
            } else {
                const res = await seguimientosApi.create({
                    ...formData,
                    disparo_dias: disparoNum,
                    repeticiones: repeticionesNum
                });
                if (res.data?.success) {
                    setNotification({
                        type: 'success',
                        message: 'Nueva regla de seguimiento creada exitosamente.'
                    });
                    setIsModalOpen(false);
                    if (isNuevoRoute || routeReglaId) {
                        navigate('/seguimientos');
                    }
                    await fetchData();
                } else {
                    setFormError(res.data?.error || 'Error al crear la regla.');
                }
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Error de conexión con el servidor.';
            setFormError(msg);
        } finally {
            setFormSaving(false);
        }
    };

    // Alternar Activo/Inactivo
    const handleToggleActivo = async (regla) => {
        try {
            const res = await seguimientosApi.toggle(regla.id);
            if (res.data?.success) {
                setSeguimientos(prev => prev.map(s => s.id === regla.id ? { ...s, activo: res.data.seguimiento.activo } : s));
                setNotification({
                    type: 'success',
                    message: `Regla para ${ROLES_INFO[regla.rol]?.label || regla.rol} (${regla.estado_codigo}) ${res.data.seguimiento.activo ? 'activada' : 'desactivada'}.`
                });
                setTimeout(() => setNotification(null), 3000);
            }
        } catch (err) {
            setNotification({
                type: 'error',
                message: 'No se pudo cambiar el estado de la regla: ' + (err.message || '')
            });
        }
    };

    // Confirmar y Ejecutar Borrado
    const handleDeleteRegla = async () => {
        if (!deleteConfirmRegla) return;
        setDeleting(true);
        try {
            const res = await seguimientosApi.delete(deleteConfirmRegla.id);
            if (res.data?.success) {
                setSeguimientos(prev => prev.filter(s => s.id !== deleteConfirmRegla.id));
                setNotification({
                    type: 'success',
                    message: 'Regla de seguimiento eliminada correctamente.'
                });
                setDeleteConfirmRegla(null);
                setTimeout(() => setNotification(null), 3000);
            }
        } catch (err) {
            setNotification({
                type: 'error',
                message: 'Error al eliminar regla: ' + (err.response?.data?.error || err.message)
            });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div>
            {/* Encabezado Principal */}
            <div className="claims-page-header">
                <div className="claims-page-title-group">
                    <h1>
                        <Clock size={28} style={{ color: 'var(--dy-gold)' }} />
                        Reglas de Seguimientos
                    </h1>
                    <p>
                        Configuración de disparos automáticos, recordatorios periódicos (intervalo N) y emails de elevación por rol, estado y prioridad
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleOpenCreate}
                    >
                        <Plus size={16} />
                        <span>Nueva Regla</span>
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={fetchData}
                        disabled={loading}
                    >
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
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

            {/* Chips de Selección por Rol */}
            <div className="claims-summary-chips">
                {Object.entries(ROLES_INFO).map(([key, info]) => {
                    const isSelected = selectedRol === key;
                    const IconComponent = info.icon || Clock;
                    return (
                        <div
                            key={key}
                            className="summary-chip"
                            onClick={() => setSelectedRol(key)}
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

            {/* Panel de Filtros y Búsqueda */}
            <div className="filter-panel-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <div className="search-input-field" style={{ flex: '1 1 280px' }}>
                        <Search size={18} className="search-icon-svg" />
                        <input
                            type="text"
                            placeholder="Buscar por rol, estado, prioridad o email de elevación..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select
                            value={selectedPrioridad}
                            onChange={(e) => setSelectedPrioridad(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="all">Todas las Prioridades</option>
                            <option value="10">Alta (SLA: 3d)</option>
                            <option value="20">Media (SLA: 7d)</option>
                            <option value="30">Baja (SLA: 14d)</option>
                        </select>

                        <select
                            value={selectedEstadoFiltro}
                            onChange={(e) => setSelectedEstadoFiltro(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="all">Todas las Reglas</option>
                            <option value="activas">Solo Activas</option>
                            <option value="inactivas">Solo Inactivas</option>
                        </select>

                        {(selectedRol !== 'all' || selectedPrioridad !== 'all' || selectedEstadoFiltro !== 'all' || searchQuery.trim() !== '') && (
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setSelectedRol('all');
                                    setSelectedPrioridad('all');
                                    setSelectedEstadoFiltro('all');
                                    setSearchQuery('');
                                }}
                                title="Limpiar todos los filtros"
                            >
                                <RotateCcw size={15} />
                                <span>Limpiar</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Banner Didáctico: Lógica del Intervalo N y Flujo de Escalación */}
            <div style={{
                marginBottom: 16,
                padding: '14px 18px',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'linear-gradient(135deg, rgba(13, 44, 92, 0.04) 0%, rgba(200, 155, 60, 0.08) 100%)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14
            }}>
                <Info size={22} style={{ color: 'var(--dy-gold)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Mecánica de Seguimientos y Elevación de Casos</span>
                        <span style={{
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            background: 'rgba(21, 28, 91, 0.1)',
                            color: 'var(--primary)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontFamily: 'monospace'
                        }}>
                            N = (SLA de la Prioridad - Disparo Inicial) / Repeticiones
                        </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>
                        <strong>1. Disparo Inicial:</strong> Al ingresar el caso en el estado configurado, se aguardan los días de <em>Disparo Inicial</em> para enviar el 1° email interactivo con botones de acción.<br />
                        <strong>2. Recordatorios periódicos:</strong> Si el destinatario no responde ni cambia el estado, se reenvía el recordatorio cada <strong>N días</strong> (distribución proporcional del remanente de SLA tras el 1° envío). Si N = 0 (el disparo inicial igualó al SLA), no habrá recordatorios intermedios.<br />
                        <strong>3. Elevación:</strong> Al alcanzarse el tope de <em>Repeticiones de Seguimiento</em> sin resolución, se envía inmediatamente la advertencia a los <em>Emails de Elevación</em>.
                    </div>
                </div>
            </div>

            {/* Tabla Principal de Reglas */}
            <div className="table-card">
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '150px' }}>Rol</th>
                                <th style={{ width: '180px' }}>Estado Condición</th>
                                <th style={{ width: '160px' }}>Prioridad</th>
                                <th style={{ width: '130px', textAlign: 'center' }}>Disparo Inicial</th>
                                <th style={{ width: '120px', textAlign: 'center' }}>Repeticiones</th>
                                <th style={{ width: '180px', textAlign: 'center' }}>Intervalo N</th>
                                <th>Emails de Elevación</th>
                                <th style={{ width: '100px', textAlign: 'center' }}>Activa</th>
                                <th style={{ width: '110px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                                            <span style={{ fontWeight: 500 }}>Cargando reglas de seguimiento...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSeguimientos.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 360, margin: '0 auto' }}>
                                            <AlertCircle size={36} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                                            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.05rem' }}>No se encontraron reglas</h3>
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>
                                                No existen reglas de seguimiento que coincidan con los criterios seleccionados.
                                            </p>
                                            <button className="btn btn-primary" onClick={handleOpenCreate} style={{ marginTop: 8 }}>
                                                <Plus size={15} />
                                                <span>Crear Primera Regla</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredSeguimientos.map((regla) => {
                                    const actorMeta = ROLES_INFO[regla.rol] || { label: regla.rol, color: 'var(--text)', bg: 'var(--surface-subtle)' };
                                    const ActorIcon = actorMeta.icon || Clock;

                                    return (
                                        <tr key={regla.id} style={{ opacity: regla.activo ? 1 : 0.65 }}>
                                            {/* Rol */}
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

                                            {/* Estado Condición */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                                    <StatusBadge status={regla.estado_nombre || regla.estado_codigo} actor={regla.rol} />
                                                    {regla.estado_descripcion && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={regla.estado_descripcion}>
                                                            {regla.estado_descripcion}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Prioridad */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: '50%',
                                                        backgroundColor: regla.prioridad_color,
                                                        display: 'inline-block'
                                                    }} />
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                        {regla.prioridad_nombre}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        background: 'var(--surface-subtle)',
                                                        color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        SLA {regla.sla_dias}d
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Disparo Inicial */}
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ fontWeight: 700, color: 'var(--heading-color)', fontSize: '0.9rem' }}>
                                                    {regla.disparo_dias} {regla.disparo_dias === 1 ? 'día' : 'días'}
                                                </div>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    tras asignación
                                                </span>
                                            </td>

                                            {/* Repeticiones */}
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: 'var(--radius-pill)',
                                                    background: 'rgba(21, 28, 91, 0.08)',
                                                    color: 'var(--primary)',
                                                    fontWeight: 700,
                                                    fontSize: '0.85rem'
                                                }}>
                                                    {regla.repeticiones} {regla.repeticiones === 1 ? 'vez' : 'veces'}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                    reintentos máx.
                                                </div>
                                            </td>

                                            {/* Intervalo N */}
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{
                                                    display: 'inline-flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    background: 'rgba(200, 155, 60, 0.12)',
                                                    border: '1px solid rgba(200, 155, 60, 0.3)',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px'
                                                }}>
                                                    <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.88rem' }}>
                                                        N = {regla.intervalo_n_dias} {regla.intervalo_n_dias === 1 ? 'día' : 'días'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        ({regla.intervalo_n_horas} hs entre reenvíos)
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Emails de Elevación */}
                                            <td>
                                                {regla.emails_elevacion ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {regla.emails_elevacion.split(',').map((email, idx) => (
                                                            <div key={idx} style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                fontSize: '0.75rem',
                                                                color: 'var(--text-muted)'
                                                            }}>
                                                                <Mail size={12} style={{ color: 'var(--dy-gold)', flexShrink: 0 }} />
                                                                <span>{email.trim()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                        Sin emails configurados
                                                    </span>
                                                )}
                                            </td>

                                            {/* Switch Activa */}
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleToggleActivo(regla)}
                                                    style={{
                                                        border: 'none',
                                                        background: regla.activo ? 'var(--success)' : 'var(--border)',
                                                        width: 38,
                                                        height: 20,
                                                        borderRadius: 10,
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    title={regla.activo ? 'Desactivar regla' : 'Activar regla'}
                                                >
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: 2,
                                                        left: regla.activo ? 20 : 2,
                                                        width: 16,
                                                        height: 16,
                                                        borderRadius: '50%',
                                                        background: '#fff',
                                                        transition: 'left 0.2s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        {regla.activo && <Check size={10} color="var(--success)" />}
                                                    </span>
                                                </button>
                                            </td>

                                            {/* Acciones */}
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '6px 8px' }}
                                                        onClick={() => handleOpenEdit(regla)}
                                                        title="Editar configuración de seguimiento"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '6px 8px', color: 'var(--error)' }}
                                                        onClick={() => setDeleteConfirmRegla(regla)}
                                                        title="Eliminar regla"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Creación / Edición */}
            {isModalOpen && (
                <div
                    className="modal-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(5px)',
                        zIndex: 1100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16
                    }}
                    onClick={handleCloseModal}
                >
                    <div
                        className="modal-content-card modal-content"
                        style={{
                            maxWidth: 640,
                            width: '100%',
                            maxHeight: '90vh',
                            backgroundColor: 'var(--surface-card, var(--surface))',
                            borderRadius: 'var(--radius-lg, 16px)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header" style={{
                            padding: '16px 22px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: 'var(--surface-subtle)'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Clock size={20} style={{ color: 'var(--dy-gold)' }} />
                                    {editingRegla ? 'Editar Regla de Seguimiento' : 'Nueva Regla de Seguimiento'}
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Configurá el disparo inicial, frecuencia de recordatorios y escalación
                                </p>
                            </div>
                            <button
                                className="modal-close-btn"
                                onClick={handleCloseModal}
                                disabled={formSaving}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 6,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveRegla} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, padding: '20px 24px' }}>
                                {formError && (
                                    <div style={{
                                        padding: '10px 14px',
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'var(--error-bg)',
                                        border: '1px solid var(--error)',
                                        color: 'var(--error)',
                                        fontSize: '0.84rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}>
                                        <AlertCircle size={16} />
                                        <span>{formError}</span>
                                    </div>
                                )}

                                {/* Selector de Rol */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>
                                        Rol del Destinatario
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                                        {['admin', 'supervisor', 'inocuidad', 'consumidor'].map(rolKey => {
                                            const info = ROLES_INFO[rolKey];
                                            const isSelected = formData.rol === rolKey;
                                            const IconComp = info.icon || Clock;
                                            return (
                                                <div
                                                    key={rolKey}
                                                    onClick={() => handleRolChange(rolKey)}
                                                    style={{
                                                        padding: '10px 12px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: `1.5px solid ${isSelected ? info.color : 'var(--border)'}`,
                                                        background: isSelected ? info.bg : 'var(--surface)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10
                                                    }}
                                                >
                                                    <IconComp size={18} style={{ color: info.color }} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: isSelected ? info.color : 'var(--text)' }}>
                                                            {info.label}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {info.sublabel}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Selección de Estado y Prioridad */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>
                                            Estado
                                        </label>
                                        <select
                                            value={formData.estado_codigo}
                                            onChange={(e) => setFormData(prev => ({ ...prev, estado_codigo: e.target.value }))}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--text)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {estadosParaRol.map(e => (
                                                <option key={e.codigo} value={e.codigo}>
                                                    {e.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>
                                            Prioridad del Caso
                                        </label>
                                        <select
                                            value={formData.prioridad_codigo}
                                            onChange={(e) => setFormData(prev => ({ ...prev, prioridad_codigo: Number(e.target.value) }))}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--text)',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {prioridades.map(p => (
                                                <option key={p.codigo} value={p.codigo}>
                                                    {p.nombre} (SLA: {p.sla} días)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Inputs de Tiempo: Disparo y Repeticiones */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                                            Disparo de Seguimiento (Días)
                                        </label>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Días para realizar el primer envío de email
                                        </p>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.1"
                                            max="30"
                                            value={formData.disparo_dias}
                                            onChange={(e) => setFormData(prev => ({ ...prev, disparo_dias: e.target.value }))}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--text)',
                                                fontSize: '0.9rem',
                                                fontWeight: 600
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                                            Repeticiones de Seguimiento
                                        </label>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Reintentos máximos antes de elevar el caso
                                        </p>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            max="20"
                                            value={formData.repeticiones}
                                            onChange={(e) => setFormData(prev => ({ ...prev, repeticiones: e.target.value }))}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--text)',
                                                fontSize: '0.9rem',
                                                fontWeight: 600
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Simulador / Cálculo Reactivo en Vivo de N */}
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(200, 155, 60, 0.08)',
                                    border: '1.5px dashed rgba(200, 155, 60, 0.4)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <BellRing size={16} style={{ color: 'var(--dy-gold)' }} />
                                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--heading-color)' }}>
                                                Simulación Dinámica del Intervalo de Reenvío (N)
                                            </span>
                                        </div>
                                        <span style={{
                                            fontWeight: 700,
                                            fontSize: '0.9rem',
                                            color: '#92400e',
                                            background: '#fff',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(200, 155, 60, 0.3)'
                                        }}>
                                            N = {nCalculadoForm.dias} {nCalculadoForm.dias === 1 ? 'día' : 'días'} ({nCalculadoForm.horas} hs)
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        Fórmula: <strong>(SLA {slaActualForm}d - Disparo {formData.disparo_dias || 0}d) / Repeticiones ({formData.repeticiones})</strong>.<br />
                                        {nCalculadoForm.dias === 0 ? (
                                            <span>Al ser el disparo inicial igual al SLA ({slaActualForm} días), el remanente es 0 días y no se emitirán recordatorios intermedios antes de la elevación.</span>
                                        ) : (
                                            <span>Si el {ROLES_INFO[formData.rol]?.label.toLowerCase()} no interactúa tras el 1° email ({formData.disparo_dias} días), se enviará un recordatorio cada <strong>{nCalculadoForm.dias} días</strong> hasta agotar las <strong>{formData.repeticiones} repeticiones</strong>, momento en el cual se disparará la alerta de elevación.</span>
                                        )}
                                    </p>
                                </div>

                                {/* Emails de Elevación */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                                        Emails de Elevación / Escalamiento
                                    </label>
                                    <p style={{ margin: '0 0 6px 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Direcciones de correo notificadas al agotarse las repeticiones (separadas por coma)
                                    </p>
                                    <textarea
                                        rows={2}
                                        value={formData.emails_elevacion}
                                        onChange={(e) => setFormData(prev => ({ ...prev, emails_elevacion: e.target.value }))}
                                        placeholder="ej. gerencia@donyeyo.com.ar, calidad@donyeyo.com.ar"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            color: 'var(--text)',
                                            fontSize: '0.84rem',
                                            fontFamily: 'inherit'
                                        }}
                                    />
                                </div>

                                {/* Checkbox Regla Activa */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        id="regla-activa-check"
                                        checked={formData.activo}
                                        onChange={(e) => setFormData(prev => ({ ...prev, activo: e.target.checked }))}
                                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                                    />
                                    <label htmlFor="regla-activa-check" style={{ fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Habilitar esta regla de seguimiento en el cron de automatización
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-card, var(--surface))', flexShrink: 0 }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCloseModal}
                                    disabled={formSaving}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    data-testid="btn-guardar-regla"
                                    onClick={handleSaveRegla}
                                    disabled={formSaving}
                                >
                                    {formSaving ? (
                                        <>
                                            <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                            <span>Guardando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={15} />
                                            <span>{editingRegla ? 'Guardar Cambios' : 'Crear Regla'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Borrado */}
            {deleteConfirmRegla && (
                <div
                    className="modal-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(5px)',
                        zIndex: 1100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16
                    }}
                    onClick={() => !deleting && setDeleteConfirmRegla(null)}
                >
                    <div
                        className="modal-content-card modal-content"
                        style={{
                            maxWidth: 440,
                            width: '100%',
                            backgroundColor: 'var(--surface-card, var(--surface))',
                            borderRadius: 'var(--radius-lg, 16px)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header" style={{
                            padding: '16px 22px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: 'var(--surface-subtle)'
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={20} />
                                Eliminar Regla
                            </h3>
                            <button
                                className="modal-close-btn"
                                onClick={() => !deleting && setDeleteConfirmRegla(null)}
                                disabled={deleting}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 6,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text)' }}>
                                ¿Estás seguro de que deseás eliminar la regla de seguimiento para <strong>{ROLES_INFO[deleteConfirmRegla.rol]?.label || deleteConfirmRegla.rol}</strong> en estado <strong>"{deleteConfirmRegla.estado_codigo}"</strong> con prioridad <strong>{deleteConfirmRegla.prioridad_nombre}</strong>?
                            </p>
                            <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Esta acción detendrá los envíos automáticos de recordatorios y elevación para esta combinación.
                            </p>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setDeleteConfirmRegla(null)}
                                disabled={deleting}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                                onClick={handleDeleteRegla}
                                disabled={deleting}
                            >
                                {deleting ? 'Eliminando...' : 'Sí, Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeguimientosList;
