import React, { useState, useEffect } from 'react';
import {
    Search, Filter, RefreshCw, Eye, AlertCircle,
    CheckCircle2, Clock, MapPin, Package, UserCheck, ShieldAlert
} from 'lucide-react';
import { reclamosApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { ReclamoDetailModal } from './ReclamoDetailModal';

export const ReclamosList = () => {
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

    const fetchReclamos = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await reclamosApi.getAll();
            if (res.data.success) {
                setReclamos(res.data.reclamos || []);
            }
        } catch (err) {
            console.error('Error al obtener reclamos:', err);
            setError(err.response?.data?.error || 'No se pudieron cargar los reclamos desde la hoja de cálculo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReclamos();
    }, []);

    // Filtrado
    const filteredReclamos = reclamos.filter(r => {
        // Búsqueda en texto
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const idMatch = String(r.id || '').toLowerCase().includes(query);
            const clienteMatch = String(r.cliente || '').toLowerCase().includes(query);
            const supervisorMatch = String(r.supervisor || '').toLowerCase().includes(query);
            const productoMatch = (r.items || []).some(item =>
                String(item.producto || '').toLowerCase().includes(query) ||
                String(item.defecto || '').toLowerCase().includes(query)
            );
            const localidadMatch = String(r.localidad || '').toLowerCase().includes(query);
            const provinciaMatch = String(r.provincia || '').toLowerCase().includes(query);

            if (!idMatch && !clienteMatch && !supervisorMatch && !productoMatch && !localidadMatch && !provinciaMatch) {
                return false;
            }
        }

        // Filtro Admin
        if (filterAdmin !== 'ALL') {
            const estado = (r.workflow?.estado_admin || 'Pendiente').toLowerCase();
            if (filterAdmin === 'Pendiente' && estado !== 'pendiente') return false;
            if (filterAdmin === 'En curso' && estado !== 'en curso') return false;
            if (filterAdmin === 'Aprobado' && estado !== 'aprobado') return false;
            if (filterAdmin === 'Desaprobado' && estado !== 'desaprobado') return false;
        }

        // Filtro Supervisor
        if (filterSupervisor !== 'ALL') {
            const estado = (r.workflow?.estado_supervisor || 'Pendiente').toLowerCase();
            if (filterSupervisor === 'Pendiente' && estado !== 'pendiente') return false;
            if (filterSupervisor === 'Resuelto' && estado !== 'resuelto') return false;
            if (filterSupervisor === 'Imposibilidad' && estado !== 'imposibilidad') return false;
            if (filterSupervisor === 'Sin respuesta' && estado !== 'sin respuesta') return false;
        }

        // Filtro Inocuidad
        if (filterInocuidad !== 'ALL') {
            const estado = (r.workflow?.estado_inocuidad || 'Pendiente').toLowerCase();
            if (filterInocuidad === 'Pendiente' && estado !== 'pendiente') return false;
            if (filterInocuidad === 'Conforme' && estado !== 'conforme') return false;
            if (filterInocuidad === 'No Conforme' && estado !== 'no conforme') return false;
        }

        return true;
    });

    // Paginación
    const totalPages = Math.ceil(filteredReclamos.length / itemsPerPage) || 1;
    const paginatedReclamos = filteredReclamos.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleReclamoUpdated = (updatedReclamo) => {
        setReclamos(prev => prev.map(r => r.id === updatedReclamo.id ? updatedReclamo : r));
        setSelectedReclamo(updatedReclamo);
    };

    return (
        <div className="space-y-6">
            {/* Encabezado y Acciones */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Package className="w-7 h-7 text-dy-gold" />
                        Listado de Reclamos
                    </h1>
                    <p className="text-sm text-dy-muted">
                        Visualización y gestión integral sincronizada con Google Sheets
                    </p>
                </div>
                <button
                    onClick={fetchReclamos}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-dy-surface text-dy-gold border border-dy-gold/30 rounded-lg hover:bg-dy-surface-hover transition-colors font-medium self-start md:self-auto"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="p-4 rounded-xl bg-dy-card border border-dy-border space-y-4">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="w-5 h-5 text-dy-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar por ID, consumidor, producto, localidad, supervisor..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-dy-surface border border-dy-border text-white placeholder-dy-muted focus:border-dy-gold focus:outline-none"
                        />
                    </div>
                </div>

                {/* Filtros por Estado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-dy-border/60">
                    <div>
                        <label className="text-xs text-dy-muted block mb-1 flex items-center gap-1 font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-dy-gold" /> Estado Administración:
                        </label>
                        <select
                            value={filterAdmin}
                            onChange={(e) => { setFilterAdmin(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-1.5 rounded-lg bg-dy-surface border border-dy-border text-white text-sm focus:border-dy-gold focus:outline-none"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="En curso">En curso</option>
                            <option value="Aprobado">Aprobado</option>
                            <option value="Desaprobado">Desaprobado</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-dy-muted block mb-1 flex items-center gap-1 font-medium">
                            <Clock className="w-3.5 h-3.5 text-blue-400" /> Estado Supervisor:
                        </label>
                        <select
                            value={filterSupervisor}
                            onChange={(e) => { setFilterSupervisor(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-1.5 rounded-lg bg-dy-surface border border-dy-border text-white text-sm focus:border-dy-gold focus:outline-none"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Resuelto">Resuelto</option>
                            <option value="Imposibilidad">Imposibilidad</option>
                            <option value="Sin respuesta">Sin respuesta</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-dy-muted block mb-1 flex items-center gap-1 font-medium">
                            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" /> Estado Inocuidad:
                        </label>
                        <select
                            value={filterInocuidad}
                            onChange={(e) => { setFilterInocuidad(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-1.5 rounded-lg bg-dy-surface border border-dy-border text-white text-sm focus:border-dy-gold focus:outline-none"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Conforme">Conforme</option>
                            <option value="No Conforme">No Conforme</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-center gap-3 text-red-200">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Tabla de Reclamos */}
            <div className="rounded-xl bg-dy-card border border-dy-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-dy-surface/80 text-xs uppercase tracking-wider text-dy-muted border-b border-dy-border">
                            <tr>
                                <th className="px-4 py-3 font-semibold">ID / Fecha</th>
                                <th className="px-4 py-3 font-semibold">Consumidor</th>
                                <th className="px-4 py-3 font-semibold">Ubicación</th>
                                <th className="px-4 py-3 font-semibold">Productos & Defectos</th>
                                <th className="px-4 py-3 font-semibold">Supervisor</th>
                                <th className="px-4 py-3 font-semibold text-center">Admin</th>
                                <th className="px-4 py-3 font-semibold text-center">Supervisor</th>
                                <th className="px-4 py-3 font-semibold text-center">Inocuidad</th>
                                <th className="px-4 py-3 font-semibold text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dy-border">
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="px-4 py-12 text-center text-dy-muted">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="w-6 h-6 animate-spin text-dy-gold" />
                                            <span>Cargando reclamos desde Google Sheets...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedReclamos.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="px-4 py-12 text-center text-dy-muted">
                                        No se encontraron reclamos con los filtros aplicados.
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
                                            className="hover:bg-dy-surface/60 cursor-pointer transition-colors"
                                        >
                                            {/* ID y Fecha */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="font-bold text-dy-gold">#{r.id}</div>
                                                <div className="text-xs text-dy-muted">{r.fecha_alta || 'Sin fecha'}</div>
                                            </td>

                                            {/* Consumidor */}
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-white">{r.cliente || 'Consumidor'}</div>
                                                <div className="text-xs text-dy-muted truncate max-w-[180px]">{r.mail || r.telefono || 'Sin contacto'}</div>
                                            </td>

                                            {/* Ubicación */}
                                            <td className="px-4 py-3">
                                                <div className="text-xs text-dy-text flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5 text-dy-gold flex-shrink-0" />
                                                    <span className="truncate max-w-[150px]">{r.localidad || 'S/D'}, {r.provincia || ''}</span>
                                                </div>
                                            </td>

                                            {/* Productos */}
                                            <td className="px-4 py-3">
                                                <div className="text-xs text-white font-medium truncate max-w-[200px]">
                                                    {firstItem.producto || 'Producto sin especificar'}
                                                </div>
                                                <div className="text-xs text-dy-muted truncate max-w-[200px]">
                                                    {firstItem.defecto || 'Sin defecto registrado'}
                                                    {itemCount > 1 && (
                                                        <span className="ml-1 text-[11px] bg-dy-surface px-1.5 py-0.5 rounded text-dy-gold">
                                                            +{itemCount - 1} más
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Supervisor */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="text-xs font-medium text-dy-text">
                                                    {r.supervisor || 'No asignado'}
                                                </div>
                                                <div className="text-[11px] text-dy-muted truncate max-w-[140px]">
                                                    {r.workflow?.email_supervisor || ''}
                                                </div>
                                            </td>

                                            {/* Estados */}
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <StatusBadge type="admin" status={r.workflow?.estado_admin} />
                                            </td>

                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <StatusBadge type="supervisor" status={r.workflow?.estado_supervisor} />
                                            </td>

                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <StatusBadge type="inocuidad" status={r.workflow?.estado_inocuidad} />
                                            </td>

                                            {/* Acción */}
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedReclamo(r);
                                                    }}
                                                    className="px-2.5 py-1.5 rounded-lg bg-dy-surface hover:bg-dy-surface-hover text-dy-gold border border-dy-gold/30 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    Ver
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div className="px-4 py-3 bg-dy-surface/50 border-t border-dy-border flex items-center justify-between text-xs text-dy-muted">
                    <div>
                        Mostrando <span className="font-semibold text-white">{paginatedReclamos.length}</span> de <span className="font-semibold text-white">{filteredReclamos.length}</span> reclamos filtrados
                        (Total en sistema: {reclamos.length})
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2.5 py-1 rounded bg-dy-surface border border-dy-border hover:bg-dy-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-white"
                        >
                            Anterior
                        </button>
                        <span className="px-2 text-dy-gold font-medium">
                            Página {currentPage} de {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-2.5 py-1 rounded bg-dy-surface border border-dy-border hover:bg-dy-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-white"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Detalle y Gestión */}
            {selectedReclamo && (
                <ReclamoDetailModal
                    reclamo={selectedReclamo}
                    onClose={() => setSelectedReclamo(null)}
                    onUpdate={handleReclamoUpdated}
                />
            )}
        </div>
    );
};
