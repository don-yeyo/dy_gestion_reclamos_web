import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Search, Filter, RefreshCw, Eye, AlertCircle,
    CheckCircle2, Clock, MapPin, Package, UserCheck, ShieldAlert,
    RotateCcw, Inbox, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { reclamosApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { ReclamoDetailModal } from './ReclamoDetailModal';

export const ReclamosList = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [reclamos, setReclamos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedReclamo, setSelectedReclamo] = useState(null);

    // Filtros
    const [filterAdmin, setFilterAdmin] = useState('ALL');
    const [filterSupervisor, setFilterSupervisor] = useState('ALL');
    const [filterInocuidad, setFilterInocuidad] = useState('ALL');

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Sincronizar filtro desde query params (ej: Drawer: ?filtro=admin_pendiente)
    useEffect(() => {
        const filtro = searchParams.get('filtro');
        if (filtro === 'admin_pendiente') {
            setFilterAdmin('Pendiente');
        } else if (filtro === 'supervisor_pendiente') {
            setFilterSupervisor('Pendiente');
        } else if (filtro === 'inocuidad_pendiente') {
            setFilterInocuidad('Pendiente');
        }
    }, [searchParams]);

    const fetchReclamos = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await reclamosApi.getAll();
            if (res.data.success) {
                const list = res.data.data || res.data.reclamos || [];
                setReclamos(list);
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
            imposibilidad: reclamos.filter(r => (r.estado_supervisor || '').toLowerCase() === 'imposibilidad').length,
        };
    }, [reclamos]);

    // Filtrado robusto
    const filteredReclamos = useMemo(() => {
        return reclamos.filter(r => {
            // Búsqueda en texto
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                const idMatch = String(r.id || '').toLowerCase().includes(query);
                const clienteMatch = String(r.cliente || '').toLowerCase().includes(query) ||
                    String(r.nombre || '').toLowerCase().includes(query) ||
                    String(r.apellido || '').toLowerCase().includes(query);
                const supervisorMatch = String(r.supervisor || '').toLowerCase().includes(query) ||
                    String(r.supervisor_email || '').toLowerCase().includes(query);
                const productoMatch = (r.items || []).some(item =>
                    String(item.producto || '').toLowerCase().includes(query) ||
                    String(item.defecto || '').toLowerCase().includes(query) ||
                    String(item.lote || '').toLowerCase().includes(query)
                );
                const localidadMatch = String(r.localidad || '').toLowerCase().includes(query);
                const provinciaMatch = String(r.provincia || '').toLowerCase().includes(query);

                if (!idMatch && !clienteMatch && !supervisorMatch && !productoMatch && !localidadMatch && !provinciaMatch) {
                    return false;
                }
            }

            // Filtro Admin
            if (filterAdmin !== 'ALL') {
                const estado = (r.estado_admin || 'Pendiente').toLowerCase();
                if (filterAdmin === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterAdmin === 'En curso' && estado !== 'en curso') return false;
                if (filterAdmin === 'Aprobado' && estado !== 'aprobado') return false;
                if (filterAdmin === 'Desaprobado' && estado !== 'desaprobado') return false;
            }

            // Filtro Supervisor
            if (filterSupervisor !== 'ALL') {
                const estado = (r.estado_supervisor || 'Pendiente').toLowerCase();
                if (filterSupervisor === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterSupervisor === 'Resuelto' && estado !== 'resuelto') return false;
                if (filterSupervisor === 'Imposibilidad' && estado !== 'imposibilidad') return false;
                if (filterSupervisor === 'Sin respuesta' && estado !== 'sin respuesta') return false;
            }

            // Filtro Inocuidad
            if (filterInocuidad !== 'ALL') {
                const estado = (r.estado_inocuidad || 'Sin acciones').toLowerCase();
                if (filterInocuidad === 'Pendiente' && estado !== 'pendiente') return false;
                if (filterInocuidad === 'Conforme' && !estado.includes('conforme')) return false;
                if (filterInocuidad === 'No Conforme' && !estado.includes('no conforme')) return false;
                if (filterInocuidad === 'Sin acciones' && estado !== 'sin acciones') return false;
            }

            return true;
        });
    }, [reclamos, searchQuery, filterAdmin, filterSupervisor, filterInocuidad]);

    // Paginación
    const totalPages = Math.ceil(filteredReclamos.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedReclamos = filteredReclamos.slice(startIndex, startIndex + itemsPerPage);

    const isFiltered = searchQuery.trim() !== '' || filterAdmin !== 'ALL' || filterSupervisor !== 'ALL' || filterInocuidad !== 'ALL';

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterAdmin('ALL');
        setFilterSupervisor('ALL');
        setFilterInocuidad('ALL');
        setCurrentPage(1);
        if (searchParams.get('filtro')) {
            setSearchParams({});
        }
    };

    const handleReclamoUpdated = () => {
        fetchReclamos();
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
                    onClick={() => { setFilterAdmin('ALL'); setFilterSupervisor('ALL'); setFilterInocuidad('ALL'); setCurrentPage(1); }}
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
            </div>

            {/* Panel de Filtros y Búsqueda */}
            <div className="filter-panel-card">
                <div className="search-bar-row">
                    <div className="search-input-field">
                        <Search size={18} className="search-icon-svg" />
                        <input
                            type="text"
                            placeholder="Buscar por ID, consumidor, producto, defecto, lote, localidad, supervisor..."
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
                            <option value="Conforme">Conforme</option>
                            <option value="No Conforme">No Conforme</option>
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
                <div style={{ overflowX: 'auto' }}>
                    <table className="claims-table">
                        <thead>
                            <tr>
                                <th style={{ width: '120px' }}>ID / Fecha</th>
                                <th>Consumidor</th>
                                <th>Ubicación</th>
                                <th>Producto / Defecto</th>
                                <th>Supervisor</th>
                                <th style={{ textAlign: 'center' }}>Admin</th>
                                <th style={{ textAlign: 'center' }}>Supervisor</th>
                                <th style={{ textAlign: 'center' }}>Inocuidad</th>
                                <th style={{ textAlign: 'right' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                                            <span style={{ fontWeight: 500 }}>Cargando registros sincronizados...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedReclamos.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
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
                                    return (
                                        <tr
                                            key={r.id}
                                            onClick={() => setSelectedReclamo(r)}
                                            title="Clic para ver detalle y gestionar acciones"
                                        >
                                            {/* ID y Fecha */}
                                            <td>
                                                <div className="claim-id-tag">#{r.id}</div>
                                                <div className="claim-sub-text">{r.fecha_alta || 'S/F'}</div>
                                            </td>

                                            {/* Consumidor */}
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{r.cliente || `${r.nombre || ''} ${r.apellido || ''}`.trim() || 'Consumidor'}</div>
                                                <div className="claim-sub-text">
                                                    {r.email || r.telefono || 'Sin contacto'}
                                                </div>
                                            </td>

                                            {/* Ubicación */}
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                                                    <MapPin size={13} style={{ color: 'var(--dy-gold)', flexShrink: 0 }} />
                                                    <span style={{ fontWeight: 500 }}>{r.localidad || 'S/D'}</span>
                                                </div>
                                                <div className="claim-sub-text">{r.provincia || ''}</div>
                                            </td>

                                            {/* Productos & Defectos */}
                                            <td>
                                                <div style={{ fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {firstItem.producto || 'Sin especificar'}
                                                </div>
                                                <div className="claim-sub-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {firstItem.defecto || 'Sin defecto'}
                                                    </span>
                                                    {itemCount > 1 && (
                                                        <span style={{
                                                            background: 'var(--surface-subtle)', border: '1px solid var(--border)',
                                                            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                                                            fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)'
                                                        }}>
                                                            +{itemCount - 1} más
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Supervisor */}
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                    {r.supervisor || 'Sin asignar'}
                                                </div>
                                                <div className="claim-sub-text">
                                                    {r.supervisor_email || ''}
                                                </div>
                                            </td>

                                            {/* Estados */}
                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_admin} />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_supervisor} />
                                            </td>

                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={r.estado_inocuidad} />
                                            </td>

                                            {/* Acción */}
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedReclamo(r);
                                                    }}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                >
                                                    <Eye size={13} />
                                                    <span>Ver</span>
                                                </button>
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
                    onClose={() => setSelectedReclamo(null)}
                    onRefresh={handleReclamoUpdated}
                />
            )}
        </div>
    );
};
