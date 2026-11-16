import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import {
    Search, Filter, RefreshCw, AlertCircle,
    CheckCircle2, Clock, MapPin, Package, UserCheck, ShieldAlert,
    RotateCcw, Inbox, ChevronLeft, ChevronRight, X, User,
    ArrowUpDown, ArrowUp, ArrowDown, Flame, Calendar
} from 'lucide-react';
import { reclamosApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { ReclamoDetailModal } from './ReclamoDetailModal';

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
        return { label: 'Alta', order: 1, bg: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.35)' };
    }
    if (code === 20 || rawName.toLowerCase() === 'media') {
        return { label: 'Media', order: 2, bg: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)' };
    }
    if (code === 30 || rawName.toLowerCase() === 'baja') {
        return { label: 'Baja', order: 3, bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.35)' };
    }
    if (rawName) {
        return { label: rawName, order: 4, bg: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-secondary)', border: 'var(--border)' };
    }
    return { label: 'Sin asignar', order: 99, bg: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-muted)', border: 'var(--border)' };
}

export const ReclamosList = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [reclamos, setReclamos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedReclamo, setSelectedReclamo] = useState(null);

    // Filtros superiores
    const [filterAdmin, setFilterAdmin] = useState('ALL');
    const [filterSupervisor, setFilterSupervisor] = useState('ALL');
    const [filterInocuidad, setFilterInocuidad] = useState('ALL');
    const [filterConsumidor, setFilterConsumidor] = useState('ALL');
    const [filterUrgencia, setFilterUrgencia] = useState('ALL');
    const [filterConflicto, setFilterConflicto] = useState(false);

    // Filtros por columna individual en la grilla
    const [colFilters, setColFilters] = useState({
        id: '',
        fecha_ingreso: '',
        urgencia: '',
        consumidor: '',
        ubicacion: '',
        producto: '',
        supervisor: '',
        estado_admin: '',
        estado_inocuidad: '',
        estado_supervisor: '',
        estado_consumidor: ''
    });

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
            setFilterAdmin('Pendiente');
            setFilterSupervisor('ALL');
            setFilterInocuidad('ALL');
        } else if (filtro === 'supervisor_pendiente') {
            setFilterSupervisor('Pendiente');
            setFilterAdmin('ALL');
            setFilterInocuidad('ALL');
        } else if (filtro === 'inocuidad_pendiente' || filtro === 'inocuidad') {
            setFilterInocuidad('Pendiente');
            setFilterAdmin('ALL');
            setFilterSupervisor('ALL');
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

    // Conteo para los chips superiores
    const summary = useMemo(() => {
        return {
            total: reclamos.length,
            pendientesAdmin: reclamos.filter(r => (r.estado_admin || 'Pendiente') === 'Pendiente').length,
            enCurso: reclamos.filter(r => (r.estado_admin || '').toLowerCase() === 'en curso').length,
            aprobados: reclamos.filter(r => (r.estado_admin || '').toLowerCase() === 'aprobado').length,
            finalizados: reclamos.filter(r => (r.estado_admin || '').toLowerCase() === 'finalizado').length,
            imposibilidad: reclamos.filter(r => (r.estado_supervisor || '').toLowerCase() === 'imposibilidad').length,
            conflictos: reclamos.filter(r => Boolean(r.en_conflicto)).length,
        };
    }, [reclamos]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir(field === 'id' || field === 'fecha_ingreso' ? 'desc' : 'asc');
        }
        setCurrentPage(1);
    };

    const handleColFilterChange = (colKey, val) => {
        setColFilters(prev => ({ ...prev, [colKey]: val }));
        setCurrentPage(1);
    };

    // Filtrado y Ordenamiento por cualquier columna
    const filteredReclamos = useMemo(() => {
        const filtered = reclamos.filter(r => {
            const fechaMeta = formatFechaIngresoCell(r);
            const urgMeta = getUrgenciaMeta(r);
            const consumidorStr = `${r.cliente || ''} ${r.nombre || ''} ${r.apellido || ''} ${r.email || ''} ${r.telefono || ''}`.trim();
            const ubicacionStr = `${r.localidad || ''} ${r.provincia || ''}`.trim();
            const productosStr = (r.items || []).map(it => `${it.producto || ''} ${it.defecto || ''} ${it.lote || ''}`).join(' ');
            const supervisorStr = `${r.supervisor || ''} ${r.supervisor_email || ''}`.trim();

            // Búsqueda general en texto
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
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

            // Filtro Admin superior
            if (filterAdmin !== 'ALL') {
                const estado = (r.estado_admin || 'Pendiente').toLowerCase();
                if (filterAdmin === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterAdmin === 'En curso' && estado !== 'en curso') return false;
                if (filterAdmin === 'Aprobado' && estado !== 'aprobado') return false;
                if (filterAdmin === 'Finalizado' && estado !== 'finalizado') return false;
                if (filterAdmin === 'Desaprobado' && estado !== 'desaprobado') return false;
            }

            // Filtro Supervisor superior
            if (filterSupervisor !== 'ALL') {
                const estado = (r.estado_supervisor || 'Pendiente').toLowerCase();
                if (filterSupervisor === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterSupervisor === 'Resuelto' && estado !== 'resuelto') return false;
                if (filterSupervisor === 'Imposibilidad' && estado !== 'imposibilidad') return false;
                if (filterSupervisor === 'Sin respuesta' && estado !== 'sin respuesta') return false;
            }

            // Filtro Inocuidad superior
            if (filterInocuidad !== 'ALL') {
                const estado = (r.estado_inocuidad || 'Sin acciones').toLowerCase();
                if (filterInocuidad === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterInocuidad === 'Resuelto' && estado !== 'resuelto') return false;
                if (filterInocuidad === 'Imposibilidad' && estado !== 'imposibilidad') return false;
                if (filterInocuidad === 'Conforme' && !estado.includes('conforme')) return false;
                if (filterInocuidad === 'No Conforme' && !estado.includes('no conforme')) return false;
                if (filterInocuidad === 'Sin acciones' && estado !== 'sin acciones') return false;
            }

            // Filtro Consumidor superior
            if (filterConsumidor !== 'ALL') {
                const estado = (r.estado_consumidor || 'Pendiente').toLowerCase();
                if (filterConsumidor === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterConsumidor === 'En curso' && estado !== 'en curso') return false;
                if (filterConsumidor === 'Resuelto sin confirmar' && !estado.includes('sin confirmar')) return false;
                if (filterConsumidor === 'Resuelto conforme' && (!estado.includes('conforme') || estado.includes('sin confirmar'))) return false;
                if (filterConsumidor === 'Resuelto disconforme' && !estado.includes('disconforme')) return false;
                if (filterConsumidor === 'No resuelto' && !estado.includes('no resuelto')) return false;
                if (filterConsumidor === 'FSR' && (!estado.includes('fsr') && !estado.includes('sin respuesta'))) return false;
                if (filterConsumidor === 'Cerrado' && estado !== 'cerrado') return false;
                if (filterConsumidor === 'Sin acciones' && estado !== 'sin acciones') return false;
            }

            // Filtro Urgencia superior
            if (filterUrgencia !== 'ALL') {
                if (urgMeta.label.toLowerCase() !== filterUrgencia.toLowerCase()) return false;
            }

            // Filtro Conflicto
            if (filterConflicto && !r.en_conflicto) {
                return false;
            }

            // Filtros por cada columna de la grilla
            if (colFilters.id.trim() && !String(r.id || '').toLowerCase().includes(colFilters.id.toLowerCase().trim())) return false;
            if (colFilters.fecha_ingreso.trim() && !fechaMeta.fullText.toLowerCase().includes(colFilters.fecha_ingreso.toLowerCase().trim())) return false;
            if (colFilters.urgencia.trim() && !urgMeta.label.toLowerCase().includes(colFilters.urgencia.toLowerCase().trim())) return false;
            if (colFilters.consumidor.trim() && !consumidorStr.toLowerCase().includes(colFilters.consumidor.toLowerCase().trim())) return false;
            if (colFilters.ubicacion.trim() && !ubicacionStr.toLowerCase().includes(colFilters.ubicacion.toLowerCase().trim())) return false;
            if (colFilters.producto.trim() && !productosStr.toLowerCase().includes(colFilters.producto.toLowerCase().trim())) return false;
            if (colFilters.supervisor.trim() && !supervisorStr.toLowerCase().includes(colFilters.supervisor.toLowerCase().trim())) return false;
            if (colFilters.estado_admin.trim() && !String(r.estado_admin || 'Pendiente').toLowerCase().includes(colFilters.estado_admin.toLowerCase().trim())) return false;
            if (colFilters.estado_inocuidad.trim() && !String(r.estado_inocuidad || 'Sin acciones').toLowerCase().includes(colFilters.estado_inocuidad.toLowerCase().trim())) return false;
            if (colFilters.estado_supervisor.trim() && !String(r.estado_supervisor || 'Pendiente').toLowerCase().includes(colFilters.estado_supervisor.toLowerCase().trim())) return false;
            if (colFilters.estado_consumidor.trim() && !String(r.estado_consumidor || 'Pendiente').toLowerCase().includes(colFilters.estado_consumidor.toLowerCase().trim())) return false;

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
                    const cA = (a.cliente || `${a.nombre || ''} ${a.apellido || ''}`.trim() || '').toLowerCase();
                    const cB = (b.cliente || `${b.nombre || ''} ${b.apellido || ''}`.trim() || '').toLowerCase();
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
    }, [
        reclamos, searchQuery, filterAdmin, filterSupervisor, filterInocuidad,
        filterConsumidor, filterUrgencia, filterConflicto, colFilters, sortField, sortDir
    ]);

    // Paginación
    const totalPages = Math.ceil(filteredReclamos.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedReclamos = filteredReclamos.slice(startIndex, startIndex + itemsPerPage);

    const hasColFilter = Object.values(colFilters).some(v => v.trim() !== '');
    const isFiltered = searchQuery.trim() !== '' ||
        filterAdmin !== 'ALL' ||
        filterSupervisor !== 'ALL' ||
        filterInocuidad !== 'ALL' ||
        filterConsumidor !== 'ALL' ||
        filterUrgencia !== 'ALL' ||
        filterConflicto ||
        hasColFilter;

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterAdmin('ALL');
        setFilterSupervisor('ALL');
        setFilterInocuidad('ALL');
        setFilterConsumidor('ALL');
        setFilterUrgencia('ALL');
        setFilterConflicto(false);
        setColFilters({
            id: '',
            fecha_ingreso: '',
            urgencia: '',
            consumidor: '',
            ubicacion: '',
            producto: '',
            supervisor: '',
            estado_admin: '',
            estado_inocuidad: '',
            estado_supervisor: '',
            estado_consumidor: ''
        });
        setCurrentPage(1);
        if (searchParams.get('filtro')) {
            setSearchParams({});
        }
    };

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

    const colFilterInputStyle = {
        width: '100%',
        padding: '4px 6px',
        fontSize: '0.72rem',
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)'
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
                    <p>
                        Control, aprobación administrativa y seguimiento con Google Sheets y MySQL
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {isFiltered && (
                        <button className="btn btn-secondary" onClick={handleClearFilters}>
                            <RotateCcw size={15} />
                            <span>Limpiar Filtros</span>
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={fetchReclamos} disabled={loading}>
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
                    </button>
                </div>
            </div>

            {/* Chips de Métricas Rápidas */}
            <div className="claims-summary-chips">
                <div
                    className="summary-chip"
                    onClick={() => { setFilterAdmin('ALL'); setFilterSupervisor('ALL'); setFilterInocuidad('ALL'); setFilterUrgencia('ALL'); setCurrentPage(1); }}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="summary-chip-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary)' }}>
                        <Inbox size={20} />
                    </div>
                    <div className="summary-chip-content">
                        <span className="summary-chip-val">{summary.total}</span>
                        <span className="summary-chip-lbl">Total Reclamos</span>
                    </div>
                </div>

                <div
                    className="summary-chip"
                    onClick={() => { setFilterAdmin('Pendiente'); setCurrentPage(1); }}
                    style={{ cursor: 'pointer', borderColor: filterAdmin === 'Pendiente' ? 'var(--warning)' : 'var(--border)' }}
                >
                    <div className="summary-chip-icon" style={{ background: 'rgba(245, 158, 11, 0.14)', color: 'var(--warning)' }}>
                        <Clock size={20} />
                    </div>
                    <div className="summary-chip-content">
                        <span className="summary-chip-val">{summary.pendientesAdmin}</span>
                        <span className="summary-chip-lbl">Pendientes Admin</span>
                    </div>
                </div>

                <div
                    className="summary-chip"
                    onClick={() => { setFilterAdmin('En curso'); setCurrentPage(1); }}
                    style={{ cursor: 'pointer', borderColor: filterAdmin === 'En curso' ? 'var(--info)' : 'var(--border)' }}
                >
                    <div className="summary-chip-icon" style={{ background: 'rgba(59, 130, 246, 0.14)', color: 'var(--info)' }}>
                        <RefreshCw size={20} />
                    </div>
                    <div className="summary-chip-content">
                        <span className="summary-chip-val">{summary.enCurso}</span>
                        <span className="summary-chip-lbl">En Curso</span>
                    </div>
                </div>

                <div
                    className="summary-chip"
                    onClick={() => { setFilterSupervisor('Imposibilidad'); setCurrentPage(1); }}
                    style={{ cursor: 'pointer', borderColor: filterSupervisor === 'Imposibilidad' ? 'var(--error)' : 'var(--border)' }}
                >
                    <div className="summary-chip-icon" style={{ background: 'rgba(239, 68, 68, 0.14)', color: 'var(--error)' }}>
                        <AlertCircle size={20} />
                    </div>
                    <div className="summary-chip-content">
                        <span className="summary-chip-val">{summary.imposibilidad}</span>
                        <span className="summary-chip-lbl">Imposibilidad</span>
                    </div>
                </div>

                {summary.conflictos > 0 && (
                    <div
                        className="summary-chip"
                        onClick={() => { setFilterConflicto(prev => !prev); setCurrentPage(1); }}
                        style={{
                            cursor: 'pointer',
                            borderColor: '#dc2626',
                            background: filterConflicto ? 'rgba(220, 38, 38, 0.15)' : 'rgba(220, 38, 38, 0.06)'
                        }}
                    >
                        <div className="summary-chip-icon" style={{ background: 'rgba(220, 38, 38, 0.2)', color: '#dc2626' }}>
                            <AlertCircle size={20} />
                        </div>
                        <div className="summary-chip-content">
                            <span className="summary-chip-val" style={{ color: '#dc2626' }}>{summary.conflictos}</span>
                            <span className="summary-chip-lbl" style={{ color: '#dc2626', fontWeight: 700 }}>En Conflicto</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Panel de Filtros y Búsqueda */}
            <div className="filter-panel-card">
                <div className="search-bar-row">
                    <div className="search-input-field">
                        <Search size={18} className="search-icon-svg" />
                        <input
                            type="text"
                            placeholder="Buscar por ID, fecha, urgencia, consumidor, producto, defecto, lote, localidad, supervisor..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                                style={{
                                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                    background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'
                                }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="filter-selectors-grid">
                    <div className="filter-box">
                        <label>
                            <Flame size={14} style={{ color: '#ef4444' }} />
                            Nivel de Urgencia
                        </label>
                        <select
                            value={filterUrgencia}
                            onChange={(e) => { setFilterUrgencia(e.target.value); setCurrentPage(1); }}
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
                            value={filterAdmin}
                            onChange={(e) => { setFilterAdmin(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="ALL">Todos los estados ({reclamos.length})</option>
                            <option value="Pendiente">Pendiente ({summary.pendientesAdmin})</option>
                            <option value="En curso">En curso ({summary.enCurso})</option>
                            <option value="Aprobado">Aprobado ({summary.aprobados})</option>
                            <option value="Finalizado">Finalizado ({summary.finalizados})</option>
                            <option value="Desaprobado">Desaprobado</option>
                        </select>
                    </div>

                    <div className="filter-box">
                        <label>
                            <Clock size={14} style={{ color: 'var(--info)' }} />
                            Estado Supervisor
                        </label>
                        <select
                            value={filterSupervisor}
                            onChange={(e) => { setFilterSupervisor(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Resuelto">Resuelto</option>
                            <option value="Imposibilidad">Imposibilidad ({summary.imposibilidad})</option>
                            <option value="Sin respuesta">Sin respuesta</option>
                        </select>
                    </div>

                    <div className="filter-box">
                        <label>
                            <ShieldAlert size={14} style={{ color: 'var(--success)' }} />
                            Estado Inocuidad
                        </label>
                        <select
                            value={filterInocuidad}
                            onChange={(e) => { setFilterInocuidad(e.target.value); setCurrentPage(1); }}
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
                            <User size={14} style={{ color: '#3b82f6' }} />
                            Estado Consumidor
                        </label>
                        <select
                            value={filterConsumidor}
                            onChange={(e) => { setFilterConsumidor(e.target.value); setCurrentPage(1); }}
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
                                <th style={{ width: '110px', ...sortableThStyle }} onClick={() => handleSort('fecha_ingreso')} title="Ordenar por Fecha de Ingreso">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Fecha de Ingreso</span>
                                        {renderSortIcon('fecha_ingreso')}
                                    </div>
                                </th>
                                <th style={{ width: '92px', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('urgencia')} title="Ordenar por Nivel de Urgencia">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Urgencia</span>
                                        {renderSortIcon('urgencia')}
                                    </div>
                                </th>
                                <th style={{ width: '14%', ...sortableThStyle }} onClick={() => handleSort('consumidor')} title="Ordenar por Consumidor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Consumidor</span>
                                        {renderSortIcon('consumidor')}
                                    </div>
                                </th>
                                <th style={{ width: '11%', ...sortableThStyle }} onClick={() => handleSort('ubicacion')} title="Ordenar por Ubicación">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Ubicación</span>
                                        {renderSortIcon('ubicacion')}
                                    </div>
                                </th>
                                <th style={{ width: '16%', ...sortableThStyle }} onClick={() => handleSort('producto')} title="Ordenar por Producto / Defecto">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Producto / Defecto</span>
                                        {renderSortIcon('producto')}
                                    </div>
                                </th>
                                <th style={{ width: '12%', ...sortableThStyle }} onClick={() => handleSort('supervisor')} title="Ordenar por Supervisor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Supervisor</span>
                                        {renderSortIcon('supervisor')}
                                    </div>
                                </th>
                                <th style={{ width: '8.5%', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_admin')} title="Ordenar por Estado Admin">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Admin</span>
                                        {renderSortIcon('estado_admin')}
                                    </div>
                                </th>
                                <th style={{ width: '8.5%', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_inocuidad')} title="Ordenar por Estado Inocuidad">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Inocuidad</span>
                                        {renderSortIcon('estado_inocuidad')}
                                    </div>
                                </th>
                                <th style={{ width: '8.5%', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_supervisor')} title="Ordenar por Estado Supervisor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Supervisor</span>
                                        {renderSortIcon('estado_supervisor')}
                                    </div>
                                </th>
                                <th style={{ width: '8.5%', textAlign: 'center', ...sortableThStyle }} onClick={() => handleSort('estado_consumidor')} title="Ordenar por Estado Consumidor">
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span>Consumidor</span>
                                        {renderSortIcon('estado_consumidor')}
                                    </div>
                                </th>
                            </tr>
                            {/* Fila de filtrado individual por columna */}
                            <tr className="claims-column-filters-row" style={{ background: 'var(--surface-subtle)' }}>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Filtrar ID..."
                                        value={colFilters.id}
                                        onChange={e => handleColFilterChange('id', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="dd/mm/aaaa..."
                                        value={colFilters.fecha_ingreso}
                                        onChange={e => handleColFilterChange('fecha_ingreso', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Urgencia..."
                                        value={colFilters.urgencia}
                                        onChange={e => handleColFilterChange('urgencia', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Consumidor..."
                                        value={colFilters.consumidor}
                                        onChange={e => handleColFilterChange('consumidor', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Localidad..."
                                        value={colFilters.ubicacion}
                                        onChange={e => handleColFilterChange('ubicacion', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Producto..."
                                        value={colFilters.producto}
                                        onChange={e => handleColFilterChange('producto', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Supervisor..."
                                        value={colFilters.supervisor}
                                        onChange={e => handleColFilterChange('supervisor', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Admin..."
                                        value={colFilters.estado_admin}
                                        onChange={e => handleColFilterChange('estado_admin', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Inocuidad..."
                                        value={colFilters.estado_inocuidad}
                                        onChange={e => handleColFilterChange('estado_inocuidad', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Sup..."
                                        value={colFilters.estado_supervisor}
                                        onChange={e => handleColFilterChange('estado_supervisor', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px 8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Cons..."
                                        value={colFilters.estado_consumidor}
                                        onChange={e => handleColFilterChange('estado_consumidor', e.target.value)}
                                        style={colFilterInputStyle}
                                    />
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
                                                    ? 'Ningún reclamo coincide con los filtros o la búsqueda ingresada.'
                                                    : 'No hay reclamos cargados con el corte actual.'}
                                            </p>
                                            {isFiltered && (
                                                <button className="btn btn-secondary" onClick={handleClearFilters} style={{ marginTop: 8 }}>
                                                    <RotateCcw size={14} />
                                                    <span>Restablecer Filtros</span>
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
                                                <div style={{ fontWeight: 600, fontSize: '0.81rem', whiteSpace: 'nowrap' }}>
                                                    {fechaCell.fecha}
                                                </div>
                                                {fechaCell.hora && (
                                                    <div className="claim-sub-text" style={{ whiteSpace: 'nowrap' }}>
                                                        {fechaCell.hora}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Urgencia */}
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 9px',
                                                    borderRadius: 999,
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    background: urgMeta.bg,
                                                    color: urgMeta.color,
                                                    border: `1px solid ${urgMeta.border}`,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {urgMeta.label}
                                                </span>
                                            </td>

                                            {/* Consumidor */}
                                            <td>
                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.cliente || `${r.nombre || ''} ${r.apellido || ''}`.trim() || 'Consumidor'}
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

                                            {/* Estados: Admin, Inocuidad, Supervisor, Consumidor */}
                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_admin} />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_inocuidad} />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_supervisor} />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_consumidor} />
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
