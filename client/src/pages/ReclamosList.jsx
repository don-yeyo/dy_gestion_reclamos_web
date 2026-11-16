import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import {
    Search, Filter, RefreshCw, AlertCircle,
    Clock, MapPin, Package, UserCheck, ShieldAlert,
    RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
    X, User, ArrowUpDown, ArrowUp, ArrowDown, Flame, Calendar, Check
} from 'lucide-react';
import { reclamosApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { ReclamoDetailModal } from './ReclamoDetailModal';

const INITIAL_FILTERS = {
    searchQuery: '',
    id: '',
    fecha_ingreso: '',
    urgencia: 'ALL',
    consumidor: '',
    ubicacion: '',
    producto: '',
    supervisor: '',
    estado_admin: 'ALL',
    estado_inocuidad: 'ALL',
    estado_supervisor: 'ALL',
    estado_consumidor: 'ALL',
    conflicto: false
};

function getNombreConsumidor(r) {
    const fullName = `${r.nombre || ''} ${r.apellido || ''}`.trim();
    if (fullName) return fullName;
    if (r.nombre_consumidor && String(r.nombre_consumidor).trim()) {
        return String(r.nombre_consumidor).trim();
    }
    if (r.cliente && String(r.cliente).trim().toLowerCase() !== 'consumidor') {
        return String(r.cliente).trim();
    }
    return r.cliente || 'Sin nombre';
}

function parseSafeClaimDate(fechaCarga, fechaAlta, fallbackFecha) {
    const parseSingle = (val) => {
        if (!val) return null;
        const num = Number(val);
        if (!isNaN(num) && num >= 20000 && num <= 90000 && (typeof val === 'number' || /^\d+(\.\d+)?$/.test(String(val).trim()))) {
            const wallClockUtcMs = Math.round((num - 25569) * 86400 * 1000);
            const d = new Date(wallClockUtcMs + (3 * 3600 * 1000));
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d;
        }
        const str = String(val).trim();
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (dmyMatch) {
            const [, day, month, year, hh = '00', mm = '00', ss = '00'] = dmyMatch;
            const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), Number(ss));
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
                d._hasTime = dmyMatch[4] !== undefined;
                return d;
            }
        }
        const d = new Date(str);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
            d._hasTime = str.includes(':');
            return d;
        }
        return null;
    };

    return parseSingle(fechaCarga) || parseSingle(fechaAlta) || parseSingle(fallbackFecha);
}

function formatFechaIngresoCell(r) {
    const d = parseSafeClaimDate(r.fecha_carga, r.fecha_alta, r.fecha);
    if (!d) {
        return {
            fecha: r.fecha_alta || r.fecha || 'S/F',
            hora: '',
            fullText: r.fecha_alta || r.fecha || 'S/F',
            timestamp: 0
        };
    }
    const fechaStr = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const horaStr = d._hasTime
        ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '';
    return {
        fecha: fechaStr,
        hora: horaStr,
        fullText: horaStr ? `${fechaStr}, ${horaStr}` : fechaStr,
        timestamp: d.getTime()
    };
}

function getUrgenciaMeta(r) {
    const code = r.prioridad !== null && r.prioridad !== undefined ? Number(r.prioridad) : null;
    const rawName = (r.prioridad_nombre || '').trim();
    if (code === 10 || rawName.toLowerCase() === 'alta') {
        return { label: 'Alta', abbr: 'A', order: 1, bg: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.35)' };
    }
    if (code === 20 || rawName.toLowerCase() === 'media') {
        return { label: 'Media', abbr: 'M', order: 2, bg: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)' };
    }
    if (code === 30 || rawName.toLowerCase() === 'baja') {
        return { label: 'Baja', abbr: 'B', order: 3, bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.35)' };
    }
    if (rawName) {
        return { label: rawName, abbr: rawName.charAt(0).toUpperCase(), order: 4, bg: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-secondary)', border: 'var(--border)' };
    }
    return { label: 'Sin asignar', abbr: '-', order: 99, bg: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-muted)', border: 'var(--border)' };
}

export const ReclamosList = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [reclamos, setReclamos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedReclamo, setSelectedReclamo] = useState(null);

    // Acordeón del filtrador (inicialmente cerrado)
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Estado borrador del formulario de filtros y estado efectivamente aplicado
    const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);

    // Ordenamiento por cualquier columna
    const [sortField, setSortField] = useState('id');
    const [sortDir, setSortDir] = useState('desc');

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Sincronizar filtro e ID desde ruta (/reclamos/:id) o query params
    useEffect(() => {
        const filtro = searchParams.get('filtro');
        if (filtro === 'admin_pendiente') {
            const next = { ...INITIAL_FILTERS, estado_admin: 'Pendiente' };
            setDraftFilters(next);
            setAppliedFilters(next);
        } else if (filtro === 'supervisor_pendiente') {
            const next = { ...INITIAL_FILTERS, estado_supervisor: 'Pendiente' };
            setDraftFilters(next);
            setAppliedFilters(next);
        } else if (filtro === 'inocuidad_pendiente' || filtro === 'inocuidad') {
            const next = { ...INITIAL_FILTERS, estado_inocuidad: 'Pendiente' };
            setDraftFilters(next);
            setAppliedFilters(next);
        }

        const targetId = routeId || searchParams.get('id');
        if (!targetId) {
            setSelectedReclamo(null);
            return;
        }

        if (reclamos.length > 0) {
            const found = reclamos.find(
                r => String(r.id) === String(targetId) || String(r.nro_reclamo) === String(targetId)
            );
            if (found) {
                setSelectedReclamo(found);
                return;
            }
        }

        if (!loading) {
            reclamosApi.getById(targetId)
                .then(res => {
                    if (res.data?.success && res.data?.data) {
                        setSelectedReclamo(res.data.data);
                    }
                })
                .catch(() => {});
        }
    }, [routeId, searchParams, reclamos, loading]);

    const handleOpenReclamo = (reclamo) => {
        setSelectedReclamo(reclamo);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('id');
        const qs = nextParams.toString();
        navigate(`/reclamos/${encodeURIComponent(reclamo.id)}${qs ? `?${qs}` : ''}`);
    };

    const handleCloseReclamo = () => {
        setSelectedReclamo(null);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('id');
        const qs = nextParams.toString();
        navigate(`/reclamos${qs ? `?${qs}` : ''}`);
    };

    const fetchReclamos = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await reclamosApi.getAll();
            if (res.data.success) {
                const list = res.data.data || res.data.reclamos || [];
                setReclamos(list);
                setSelectedReclamo(prev => {
                    if (!prev) return null;
                    const fresh = list.find(r => r.id === prev.id);
                    return fresh || prev;
                });
            }
        } catch (err) {
            console.error('Error al obtener reclamos:', err);
            setError(err.response?.data?.error || 'No se pudieron cargar los reclamos desde el servidor.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReclamos();
    }, []);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir(field === 'id' || field === 'fecha_ingreso' ? 'desc' : 'asc');
        }
        setCurrentPage(1);
    };

    const handleDraftChange = (key, val) => {
        setDraftFilters(prev => ({ ...prev, [key]: val }));
    };

    const handleApplyFilters = (e) => {
        if (e) e.preventDefault();
        setAppliedFilters({ ...draftFilters });
        setCurrentPage(1);
    };

    const handleClearFilters = () => {
        setDraftFilters(INITIAL_FILTERS);
        setAppliedFilters(INITIAL_FILTERS);
        setCurrentPage(1);
        if (searchParams.get('filtro')) {
            setSearchParams({});
        }
    };

    // Contabilizar cuántos filtros están activos
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (appliedFilters.searchQuery.trim()) count++;
        if (appliedFilters.id.trim()) count++;
        if (appliedFilters.fecha_ingreso.trim()) count++;
        if (appliedFilters.urgencia !== 'ALL') count++;
        if (appliedFilters.consumidor.trim()) count++;
        if (appliedFilters.ubicacion.trim()) count++;
        if (appliedFilters.producto.trim()) count++;
        if (appliedFilters.supervisor.trim()) count++;
        if (appliedFilters.estado_admin !== 'ALL') count++;
        if (appliedFilters.estado_inocuidad !== 'ALL') count++;
        if (appliedFilters.estado_supervisor !== 'ALL') count++;
        if (appliedFilters.estado_consumidor !== 'ALL') count++;
        if (appliedFilters.conflicto) count++;
        return count;
    }, [appliedFilters]);

    const isFiltered = activeFiltersCount > 0;

    // Filtrado combinable y ordenamiento por cualquier columna
    const filteredReclamos = useMemo(() => {
        const f = appliedFilters;
        const filtered = reclamos.filter(r => {
            const fechaMeta = formatFechaIngresoCell(r);
            const urgMeta = getUrgenciaMeta(r);
            const nombreConsumidor = getNombreConsumidor(r);
            const consumidorStr = `${nombreConsumidor} ${r.email || ''} ${r.telefono || ''}`.trim();
            const ubicacionStr = `${r.localidad || ''} ${r.provincia || ''}`.trim();
            const productosStr = (r.items || []).map(it => `${it.producto || ''} ${it.defecto || ''} ${it.lote || ''}`).join(' ');
            const supervisorStr = `${r.supervisor || ''} ${r.supervisor_email || ''}`.trim();

            // Búsqueda general
            if (f.searchQuery.trim()) {
                const query = f.searchQuery.toLowerCase().trim();
                const idMatch = String(r.id || '').toLowerCase().includes(query);
                const fechaMatch = fechaMeta.fullText.toLowerCase().includes(query);
                const urgMatch = urgMeta.label.toLowerCase().includes(query);
                const clienteMatch = consumidorStr.toLowerCase().includes(query);
                const supervisorMatch = supervisorStr.toLowerCase().includes(query);
                const productoMatch = productosStr.toLowerCase().includes(query);
                const ubicacionMatch = ubicacionStr.toLowerCase().includes(query);

                if (!idMatch && !fechaMatch && !urgMatch && !clienteMatch && !supervisorMatch && !productoMatch && !ubicacionMatch) {
                    return false;
                }
            }

            // Filtros por cada columna combinables
            if (f.id.trim() && !String(r.id || '').toLowerCase().includes(f.id.toLowerCase().trim())) return false;
            if (f.fecha_ingreso.trim() && !fechaMeta.fullText.toLowerCase().includes(f.fecha_ingreso.toLowerCase().trim())) return false;
            if (f.consumidor.trim() && !consumidorStr.toLowerCase().includes(f.consumidor.toLowerCase().trim())) return false;
            if (f.ubicacion.trim() && !ubicacionStr.toLowerCase().includes(f.ubicacion.toLowerCase().trim())) return false;
            if (f.producto.trim() && !productosStr.toLowerCase().includes(f.producto.toLowerCase().trim())) return false;
            if (f.supervisor.trim() && !supervisorStr.toLowerCase().includes(f.supervisor.toLowerCase().trim())) return false;

            // Filtro Urgencia
            if (f.urgencia !== 'ALL') {
                if (urgMeta.label.toLowerCase() !== f.urgencia.toLowerCase()) return false;
            }

            // Filtro Admin
            if (f.estado_admin !== 'ALL') {
                const estado = (r.estado_admin || 'Pendiente').toLowerCase();
                if (f.estado_admin === 'Pendiente' && estado !== 'pendiente') return false;
                if (f.estado_admin === 'En curso' && estado !== 'en curso') return false;
                if (f.estado_admin === 'Aprobado' && estado !== 'aprobado') return false;
                if (f.estado_admin === 'Finalizado' && estado !== 'finalizado') return false;
                if (f.estado_admin === 'Desaprobado' && estado !== 'desaprobado') return false;
            }

            // Filtro Supervisor
            if (f.estado_supervisor !== 'ALL') {
                const estado = (r.estado_supervisor || 'Pendiente').toLowerCase();
                if (f.estado_supervisor === 'Pendiente' && estado !== 'pendiente') return false;
                if (f.estado_supervisor === 'Resuelto' && estado !== 'resuelto') return false;
                if (f.estado_supervisor === 'Imposibilidad' && estado !== 'imposibilidad') return false;
                if (f.estado_supervisor === 'Sin respuesta' && estado !== 'sin respuesta') return false;
            }

            // Filtro Inocuidad
            if (f.estado_inocuidad !== 'ALL') {
                const estado = (r.estado_inocuidad || 'Sin acciones').toLowerCase();
                if (f.estado_inocuidad === 'Pendiente' && estado !== 'pendiente') return false;
                if (f.estado_inocuidad === 'Resuelto' && estado !== 'resuelto') return false;
                if (f.estado_inocuidad === 'Imposibilidad' && estado !== 'imposibilidad') return false;
                if (f.estado_inocuidad === 'Conforme' && !estado.includes('conforme')) return false;
                if (f.estado_inocuidad === 'No Conforme' && !estado.includes('no conforme')) return false;
                if (f.estado_inocuidad === 'Sin acciones' && estado !== 'sin acciones') return false;
            }

            // Filtro Consumidor
            if (f.estado_consumidor !== 'ALL') {
                const estado = (r.estado_consumidor || 'Pendiente').toLowerCase();
                if (f.estado_consumidor === 'Pendiente' && estado !== 'pendiente') return false;
                if (f.estado_consumidor === 'En curso' && estado !== 'en curso') return false;
                if (f.estado_consumidor === 'Resuelto sin confirmar' && !estado.includes('sin confirmar')) return false;
                if (f.estado_consumidor === 'Resuelto conforme' && (!estado.includes('conforme') || estado.includes('sin confirmar'))) return false;
                if (f.estado_consumidor === 'Resuelto disconforme' && !estado.includes('disconforme')) return false;
                if (f.estado_consumidor === 'No resuelto' && !estado.includes('no resuelto')) return false;
                if (f.estado_consumidor === 'FSR' && (!estado.includes('fsr') && !estado.includes('sin respuesta'))) return false;
                if (f.estado_consumidor === 'Cerrado' && estado !== 'cerrado') return false;
                if (f.estado_consumidor === 'Sin acciones' && estado !== 'sin acciones') return false;
            }

            // Filtro Conflicto
            if (f.conflicto && !r.en_conflicto) {
                return false;
            }

            return true;
        });

        // Ordenar por la columna activa
        const dirMultiplier = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            switch (sortField) {
                case 'id': {
                    const numA = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
                    const numB = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
                    if (numA !== numB) return (numA - numB) * dirMultiplier;
                    return String(a.id || '').localeCompare(String(b.id || '')) * dirMultiplier;
                }
                case 'fecha_ingreso': {
                    const tA = formatFechaIngresoCell(a).timestamp;
                    const tB = formatFechaIngresoCell(b).timestamp;
                    return (tA - tB) * dirMultiplier;
                }
                case 'urgencia': {
                    const uA = getUrgenciaMeta(a).order;
                    const uB = getUrgenciaMeta(b).order;
                    return (uA - uB) * dirMultiplier;
                }
                case 'consumidor': {
                    const cA = getNombreConsumidor(a).toLowerCase();
                    const cB = getNombreConsumidor(b).toLowerCase();
                    return cA.localeCompare(cB, 'es') * dirMultiplier;
                }
                case 'ubicacion': {
                    const lA = `${a.localidad || ''} ${a.provincia || ''}`.trim().toLowerCase();
                    const lB = `${b.localidad || ''} ${b.provincia || ''}`.trim().toLowerCase();
                    return lA.localeCompare(lB, 'es') * dirMultiplier;
                }
                case 'producto': {
                    const pA = (a.items?.[0]?.producto || '').toLowerCase();
                    const pB = (b.items?.[0]?.producto || '').toLowerCase();
                    return pA.localeCompare(pB, 'es') * dirMultiplier;
                }
                case 'supervisor': {
                    const sA = (a.supervisor || '').toLowerCase();
                    const sB = (b.supervisor || '').toLowerCase();
                    return sA.localeCompare(sB, 'es') * dirMultiplier;
                }
                case 'estado_admin':
                    return String(a.estado_admin || '').localeCompare(String(b.estado_admin || ''), 'es') * dirMultiplier;
                case 'estado_inocuidad':
                    return String(a.estado_inocuidad || '').localeCompare(String(b.estado_inocuidad || ''), 'es') * dirMultiplier;
                case 'estado_supervisor':
                    return String(a.estado_supervisor || '').localeCompare(String(b.estado_supervisor || ''), 'es') * dirMultiplier;
                case 'estado_consumidor':
                    return String(a.estado_consumidor || '').localeCompare(String(b.estado_consumidor || ''), 'es') * dirMultiplier;
                default:
                    return 0;
            }
        });
    }, [reclamos, appliedFilters, sortField, sortDir]);

    // Paginación
    const totalPages = Math.ceil(filteredReclamos.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedReclamos = filteredReclamos.slice(startIndex, startIndex + itemsPerPage);

    const handleReclamoUpdated = () => {
        fetchReclamos();
    };

    const renderSortIcon = (field) => {
        if (sortField !== field) {
            return <ArrowUpDown size={12} style={{ opacity: 0.45, flexShrink: 0 }} />;
        }
        return sortDir === 'asc'
            ? <ArrowUp size={12} style={{ color: 'var(--dy-gold)', flexShrink: 0 }} />
            : <ArrowDown size={12} style={{ color: 'var(--dy-gold)', flexShrink: 0 }} />;
    };

    const sortableThStyle = {
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap'
    };

    return (
        <div>
            {/* Encabezado y Acciones */}
            <div className="claims-page-header">
                <div className="claims-page-title-group">
                    <h1>
                        <Package size={28} style={{ color: 'var(--dy-gold)' }} />
                        Listado de Reclamos
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={fetchReclamos} disabled={loading}>
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
                    </button>
                </div>
            </div>

            {/* Acordeón de Filtros Combinables por Columna (Inicialmente Cerrado) */}
            <div className="filter-panel-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
                <button
                    type="button"
                    data-testid="btn-toggle-filtros"
                    onClick={() => setIsFilterOpen(prev => !prev)}
                    style={{
                        width: '100%',
                        padding: '14px 20px',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        color: 'var(--heading-color)',
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                        fontWeight: 700
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Filter size={18} style={{ color: 'var(--dy-gold)' }} />
                        <span>Filtrar Reclamos por Columnas</span>
                        {activeFiltersCount > 0 && (
                            <span style={{
                                background: 'var(--primary)',
                                color: '#fff',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 9px',
                                borderRadius: 999
                            }}>
                                {activeFiltersCount} activo{activeFiltersCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                        <span>{isFilterOpen ? 'Ocultar filtros' : 'Desplegar filtros'}</span>
                        {isFilterOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </button>

                {isFilterOpen && (
                    <form
                        onSubmit={handleApplyFilters}
                        style={{
                            padding: '16px 20px 20px 20px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}
                    >
                        {/* Búsqueda libre general */}
                        <div className="search-bar-row">
                            <div className="search-input-field">
                                <Search size={18} className="search-icon-svg" />
                                <input
                                    type="text"
                                    placeholder="Buscar por ID, consumidor, producto, defecto, lote, localidad, supervisor..."
                                    value={draftFilters.searchQuery}
                                    onChange={(e) => handleDraftChange('searchQuery', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Filtros combinables por columna */}
                        <div className="filter-selectors-grid">
                            <div className="filter-box">
                                <label>ID del Reclamo</label>
                                <input
                                    type="text"
                                    placeholder="Ej: 20233364"
                                    value={draftFilters.id}
                                    onChange={(e) => handleDraftChange('id', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>
                                    <Calendar size={14} style={{ color: 'var(--primary)' }} />
                                    Fecha de Ingreso
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: 16/11/2026"
                                    value={draftFilters.fecha_ingreso}
                                    onChange={(e) => handleDraftChange('fecha_ingreso', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>
                                    <User size={14} style={{ color: 'var(--primary)' }} />
                                    Consumidor
                                </label>
                                <input
                                    type="text"
                                    placeholder="Nombre, apellido, email o tel..."
                                    value={draftFilters.consumidor}
                                    onChange={(e) => handleDraftChange('consumidor', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>
                                    <MapPin size={14} style={{ color: 'var(--dy-gold)' }} />
                                    Ubicación
                                </label>
                                <input
                                    type="text"
                                    placeholder="Localidad o provincia..."
                                    value={draftFilters.ubicacion}
                                    onChange={(e) => handleDraftChange('ubicacion', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>
                                    <Package size={14} style={{ color: 'var(--info)' }} />
                                    Producto / Defecto / Lote
                                </label>
                                <input
                                    type="text"
                                    placeholder="Producto, defecto o lote..."
                                    value={draftFilters.producto}
                                    onChange={(e) => handleDraftChange('producto', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>Supervisor Comercial</label>
                                <input
                                    type="text"
                                    placeholder="Nombre o email del supervisor..."
                                    value={draftFilters.supervisor}
                                    onChange={(e) => handleDraftChange('supervisor', e.target.value)}
                                />
                            </div>

                            <div className="filter-box">
                                <label>
                                    <Flame size={14} style={{ color: '#ef4444' }} />
                                    Nivel de Urgencia
                                </label>
                                <select
                                    value={draftFilters.urgencia}
                                    onChange={(e) => handleDraftChange('urgencia', e.target.value)}
                                >
                                    <option value="ALL">Todas las urgencias</option>
                                    <option value="Alta">Alta</option>
                                    <option value="Media">Media</option>
                                    <option value="Baja">Baja</option>
                                    <option value="Sin asignar">Sin asignar</option>
                                </select>
                            </div>

                            <div className="filter-box">
                                <label>
                                    <UserCheck size={14} style={{ color: 'var(--dy-gold)' }} />
                                    Estado Administración
                                </label>
                                <select
                                    value={draftFilters.estado_admin}
                                    onChange={(e) => handleDraftChange('estado_admin', e.target.value)}
                                >
                                    <option value="ALL">Todos los estados</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="En curso">En curso</option>
                                    <option value="Aprobado">Aprobado</option>
                                    <option value="Finalizado">Finalizado</option>
                                    <option value="Desaprobado">Desaprobado</option>
                                </select>
                            </div>

                            <div className="filter-box">
                                <label>
                                    <ShieldAlert size={14} style={{ color: 'var(--success)' }} />
                                    Estado Inocuidad
                                </label>
                                <select
                                    value={draftFilters.estado_inocuidad}
                                    onChange={(e) => handleDraftChange('estado_inocuidad', e.target.value)}
                                >
                                    <option value="ALL">Todos los estados</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Resuelto">Resuelto</option>
                                    <option value="Imposibilidad">Imposibilidad</option>
                                    <option value="Conforme">Conforme</option>
                                    <option value="No Conforme">No Conforme</option>
                                    <option value="Sin acciones">Sin acciones</option>
                                </select>
                            </div>

                            <div className="filter-box">
                                <label>
                                    <Clock size={14} style={{ color: 'var(--info)' }} />
                                    Estado Supervisor
                                </label>
                                <select
                                    value={draftFilters.estado_supervisor}
                                    onChange={(e) => handleDraftChange('estado_supervisor', e.target.value)}
                                >
                                    <option value="ALL">Todos los estados</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Resuelto">Resuelto</option>
                                    <option value="Imposibilidad">Imposibilidad</option>
                                    <option value="Sin respuesta">Sin respuesta</option>
                                </select>
                            </div>

                            <div className="filter-box">
                                <label>
                                    <User size={14} style={{ color: '#3b82f6' }} />
                                    Estado Consumidor
                                </label>
                                <select
                                    value={draftFilters.estado_consumidor}
                                    onChange={(e) => handleDraftChange('estado_consumidor', e.target.value)}
                                >
                                    <option value="ALL">Todos los estados</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="En curso">En curso</option>
                                    <option value="Resuelto sin confirmar">Resuelto sin confirmar</option>
                                    <option value="Resuelto conforme">Resuelto conforme</option>
                                    <option value="Resuelto disconforme">Resuelto disconforme</option>
                                    <option value="No resuelto">No resuelto</option>
                                    <option value="FSR">Finalizado Sin Respuesta (FSR)</option>
                                    <option value="Cerrado">Cerrado</option>
                                    <option value="Sin acciones">Sin acciones</option>
                                </select>
                            </div>
                        </div>

                        {/* Pie de botones del filtrador: Eliminar filtro (sutil) y Aplicar filtro */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 6 }}>
                            <button
                                type="button"
                                data-testid="btn-eliminar-filtro"
                                onClick={handleClearFilters}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-muted)',
                                    padding: '8px 14px',
                                    borderRadius: 'var(--radius-sm, 6px)',
                                    fontSize: '0.82rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6
                                }}
                            >
                                <RotateCcw size={14} />
                                <span>Eliminar filtro</span>
                            </button>

                            <button
                                type="submit"
                                data-testid="btn-aplicar-filtro"
                                className="btn btn-primary"
                                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                            >
                                <Check size={15} />
                                <span>Aplicar filtro</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Mensaje de Error si existiese */}
            {error && (
                <div style={{
                    padding: 16, background: 'var(--error-bg)', color: 'var(--error)',
                    border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)',
                    marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12
                }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* Tabla de Reclamos */}
            <div className="claims-table-card">
                <div className="claims-table-wrapper">
                    <table className="claims-table">
                        <thead>
                            <tr>
                                <th style={{ width: '80px', ...sortableThStyle }} onClick={() => handleSort('id')} title="Ordenar por ID">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>ID</span>
                                        {renderSortIcon('id')}
                                    </div>
                                </th>
                                <th style={{ width: '95px', ...sortableThStyle }} onClick={() => handleSort('fecha_ingreso')} title="Ordenar por Fecha de Ingreso">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Fecha Ingreso</span>
                                        {renderSortIcon('fecha_ingreso')}
                                    </div>
                                </th>
                                <th style={{ width: '88px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('urgencia')} title="Ordenar por Nivel de Urgencia">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Urgencia</span>
                                        {renderSortIcon('urgencia')}
                                    </div>
                                </th>
                                <th style={{ width: '18%', ...sortableThStyle }} onClick={() => handleSort('consumidor')} title="Ordenar por Consumidor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Consumidor</span>
                                        {renderSortIcon('consumidor')}
                                    </div>
                                </th>
                                <th style={{ width: '14%', ...sortableThStyle }} onClick={() => handleSort('ubicacion')} title="Ordenar por Ubicación">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Ubicación</span>
                                        {renderSortIcon('ubicacion')}
                                    </div>
                                </th>
                                <th style={{ width: '20%', ...sortableThStyle }} onClick={() => handleSort('producto')} title="Ordenar por Producto / Defecto">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Producto / Defecto</span>
                                        {renderSortIcon('producto')}
                                    </div>
                                </th>
                                <th style={{ width: '14%', ...sortableThStyle }} onClick={() => handleSort('supervisor')} title="Ordenar por Supervisor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Supervisor</span>
                                        {renderSortIcon('supervisor')}
                                    </div>
                                </th>
                                <th style={{ width: '52px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_admin')} title="Ordenar por Estado Admin">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span>Adm</span>
                                        {renderSortIcon('estado_admin')}
                                    </div>
                                </th>
                                <th style={{ width: '52px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_inocuidad')} title="Ordenar por Estado Inocuidad">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span>Inoc</span>
                                        {renderSortIcon('estado_inocuidad')}
                                    </div>
                                </th>
                                <th style={{ width: '52px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_supervisor')} title="Ordenar por Estado Supervisor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span>Sup</span>
                                        {renderSortIcon('estado_supervisor')}
                                    </div>
                                </th>
                                <th style={{ width: '52px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_consumidor')} title="Ordenar por Estado Consumidor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span>Cons</span>
                                        {renderSortIcon('estado_consumidor')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="11" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                                            <span style={{ fontWeight: 500 }}>Cargando registros sincronizados...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedReclamos.length === 0 ? (
                                <tr>
                                    <td colSpan="11" style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 400, margin: '0 auto' }}>
                                            <AlertCircle size={36} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                                            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.05rem' }}>No se encontraron reclamos</h3>
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>
                                                {isFiltered
                                                    ? 'Ningún reclamo coincide con los filtros aplicados.'
                                                    : 'No hay reclamos cargados con el corte actual.'}
                                            </p>
                                            {isFiltered && (
                                                <button className="btn btn-secondary" onClick={handleClearFilters} style={{ marginTop: 8 }}>
                                                    <RotateCcw size={14} />
                                                    <span>Eliminar filtro</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedReclamos.map((r) => {
                                    const itemCount = r.items?.length || 1;
                                    const firstItem = r.items?.[0] || {};
                                    const fechaCell = formatFechaIngresoCell(r);
                                    const urgMeta = getUrgenciaMeta(r);
                                    const nombreConsumidor = getNombreConsumidor(r);
                                    return (
                                        <tr
                                            key={r.id}
                                            className={r.en_conflicto ? 'claim-row-conflicto' : ''}
                                            onClick={() => handleOpenReclamo(r)}
                                            title={r.en_conflicto ? "⚠️ RECLAMO EN CONFLICTO (posible fraude/discrepancia): Clic para ver auditoría" : "Clic para ver detalle y gestionar acciones"}
                                        >
                                            {/* ID */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    <div className="claim-id-tag">#{r.id}</div>
                                                    {Boolean(r.en_conflicto) && (
                                                        <span className="badge badge-conflicto" style={{ fontSize: '0.64rem', padding: '2px 6px', fontWeight: 700 }}>
                                                            ⚠️ Conflicto
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Fecha de Ingreso */}
                                            <td>
                                                <div className="claim-sub-text" style={{ whiteSpace: 'nowrap' }}>
                                                    {fechaCell.fecha}
                                                </div>
                                                {fechaCell.hora && (
                                                    <div className="claim-sub-text" style={{ whiteSpace: 'nowrap' }}>
                                                        {fechaCell.hora}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Urgencia (Alta, Media, Baja; sin badge si no tiene asignada) */}
                                            <td style={{ textAlign: 'center' }}>
                                                {urgMeta.order <= 3 && (
                                                    <span
                                                        title={`Urgencia: ${urgMeta.label}`}
                                                        style={{
                                                            display: 'inline-block',
                                                            padding: '3px 9px',
                                                            borderRadius: 999,
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            background: urgMeta.bg,
                                                            color: urgMeta.color,
                                                            border: `1px solid ${urgMeta.border}`,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        {urgMeta.label}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Consumidor (Nombre y Apellido) */}
                                            <td>
                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {nombreConsumidor}
                                                </div>
                                                <div className="claim-sub-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.email || r.telefono || 'Sin contacto'}
                                                </div>
                                            </td>

                                            {/* Ubicación */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.81rem', overflow: 'hidden' }}>
                                                    <MapPin size={12} style={{ color: 'var(--dy-gold)', flexShrink: 0 }} />
                                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.localidad || 'S/D'}
                                                    </span>
                                                </div>
                                                <div className="claim-sub-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.provincia || ''}
                                                </div>
                                            </td>

                                            {/* Productos & Defectos */}
                                            <td>
                                                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {firstItem.producto || 'Sin especificar'}
                                                </div>
                                                <div className="claim-sub-text" style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {firstItem.defecto || 'Sin defecto'}
                                                    </span>
                                                    {itemCount > 1 && (
                                                        <span style={{
                                                            background: 'var(--surface-subtle)', border: '1px solid var(--border)',
                                                            padding: '1px 5px', borderRadius: 'var(--radius-pill)',
                                                            fontSize: '0.68rem', fontWeight: 600, color: 'var(--primary)', flexShrink: 0
                                                        }}>
                                                            +{itemCount - 1}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Supervisor */}
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: '0.81rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.supervisor || 'Sin asignar'}
                                                </div>
                                                <div className="claim-sub-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.supervisor_email || ''}
                                                </div>
                                            </td>

                                            {/* Estados Circulares Compactos con Tooltip: Admin, Inocuidad, Supervisor, Consumidor */}
                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_admin} actor="admin" compact />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_inocuidad} actor="inocuidad" compact />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_supervisor} actor="supervisor" compact />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_consumidor} actor="consumidor" compact />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Barra de Paginación */}
                {!loading && filteredReclamos.length > 0 && (
                    <div className="claims-pagination-bar">
                        <div className="pagination-counter">
                            Mostrando <strong>{startIndex + 1}</strong> a <strong>{Math.min(startIndex + itemsPerPage, filteredReclamos.length)}</strong> de <strong>{filteredReclamos.length}</strong> reclamos
                            {isFiltered && ` (filtrados de un total de ${reclamos.length})`}
                        </div>

                        <div className="pagination-buttons-group">
                            <button
                                className="page-btn"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                Anterior
                            </button>
                            <span className="page-indicator-text">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                className="page-btn"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Siguiente
                                <ChevronRight size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Detalle */}
            {selectedReclamo && (
                <ReclamoDetailModal
                    claim={selectedReclamo}
                    isOpen={!!selectedReclamo}
                    onClose={handleCloseReclamo}
                    onRefresh={handleReclamoUpdated}
                />
            )}
        </div>
    );
};
