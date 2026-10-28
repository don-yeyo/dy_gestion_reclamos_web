import React, { useState, useEffect, useMemo } from 'react';
import { logsApi } from '../services/api';
import {
    History,
    Mail,
    Sliders,
    RefreshCw,
    Search,
    AlertCircle,
    CheckCircle,
    XCircle,
    Clock,
    User,
    Eye,
    FileText,
    ExternalLink,
    Filter,
    ArrowUpRight,
    HelpCircle,
    X,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { formatFechaHoraSutil } from '../utils/dateUtils';

export const LogsList = () => {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filtros
    const [categoriaTab, setCategoriaTab] = useState('all'); // 'all', 'emails', 'configuracion'
    const [searchQuery, setSearchQuery] = useState('');
    const [tipoDisparoFilter, setTipoDisparoFilter] = useState('all'); // 'all', 'automatico', 'manual'
    const [estadoFilter, setEstadoFilter] = useState('all'); // 'all', 'enviado', 'fallido'

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Modal de Detalle
    const [selectedLog, setSelectedLog] = useState(null);
    const [previewMode, setPreviewMode] = useState('resumen'); // 'resumen', 'html'

    const fetchLogsAndStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const [logsRes, statsRes] = await Promise.all([
                logsApi.getLogs({
                    categoria: categoriaTab,
                    tipo_disparo: tipoDisparoFilter,
                    estado_envio: estadoFilter,
                    search: searchQuery,
                    limit: 200
                }),
                logsApi.getStats()
            ]);

            if (logsRes.data && logsRes.data.success) {
                setLogs(logsRes.data.logs || []);
            }
            if (statsRes.data && statsRes.data.success) {
                setStats(statsRes.data.stats || null);
            }
        } catch (err) {
            console.error('Error al cargar logs del sistema:', err);
            setError(err.response?.data?.error || 'No se pudieron recuperar los logs del sistema.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogsAndStats();
        // Reset a primera página al cambiar tabs
        setCurrentPage(1);
    }, [categoriaTab, tipoDisparoFilter, estadoFilter]);

    // Filtrado local reactivo si se escribe en búsqueda
    const filteredLogs = useMemo(() => {
        if (!searchQuery.trim()) return logs;
        const q = searchQuery.toLowerCase().trim();
        return logs.filter(item => {
            const matchAsunto = (item.asunto || '').toLowerCase().includes(q);
            const matchDest = (item.destinatario_email || '').toLowerCase().includes(q);
            const matchMotivo = (item.motivo || '').toLowerCase().includes(q);
            const matchDesc = (item.descripcion || '').toLowerCase().includes(q);
            const matchReclamo = (item.reclamo_id || '').toLowerCase().includes(q);
            const matchActor = (item.actor_email || item.actor || '').toLowerCase().includes(q);
            const matchModulo = (item.modulo || '').toLowerCase().includes(q);
            return matchAsunto || matchDest || matchMotivo || matchDesc || matchReclamo || matchActor || matchModulo;
        });
    }, [logs, searchQuery]);

    // Paginación
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedLogs = useMemo(() => {
        return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredLogs, startIndex, itemsPerPage]);

    return (
        <div className="claims-page-container">
            {/* ENCABEZADO PRINCIPAL */}
            <div className="claims-page-header">
                <div className="claims-page-title-group">
                    <h1>
                        <History size={26} color="#06b6d4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 10 }} />
                        Logs y Auditoría del Sistema
                    </h1>
                    <p>
                        Historial y trazabilidad exhaustiva de emisiones de correo electrónico y modificaciones en la configuración del sistema.
                    </p>
                </div>
                <div className="claims-page-actions" style={{ display: 'flex', gap: 10 }}>
                    {searchQuery && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                        >
                            <X size={15} />
                            <span>Limpiar Búsqueda</span>
                        </button>
                    )}
                    <button
                        onClick={fetchLogsAndStats}
                        className="btn btn-primary"
                        title="Actualizar Registros"
                        disabled={loading}
                    >
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
                    </button>
                </div>
            </div>

            {/* TARJETAS DE MÉTRICAS KPI */}
            {stats && (
                <div className="claims-summary-chips" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
                    <div style={{ background: 'var(--surface-card)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4', padding: 12, borderRadius: 10 }}>
                            <Mail size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Emails Emitidos</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--heading-color)' }}>{stats.total_emails || 0}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Hoy: <strong>{stats.hoy_emails || 0}</strong> envíos</div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface-card)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', padding: 12, borderRadius: 10 }}>
                            <Clock size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Disparos Automáticos</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{stats.automaticos || 0}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cron y Workflow continuo</div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface-card)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', padding: 12, borderRadius: 10 }}>
                            <User size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Disparos Manuales</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#8b5cf6' }}>{stats.manuales || 0}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Reenvíos por Administrador</div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface-card)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', padding: 12, borderRadius: 10 }}>
                            <Sliders size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Cambios de Configuración</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>{stats.total_modificaciones || 0}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Reglas, Estados y SLA</div>
                        </div>
                    </div>
                </div>
            )}

            {/* PANEL DE FILTROS Y BÚSQUEDA */}
            <div className="filter-panel-card">
                {/* TABS DE CATEGORÍA Y CONTADOR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setCategoriaTab('all')}
                            className={`btn ${categoriaTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{
                                padding: '6px 16px',
                                borderRadius: 'var(--radius-pill)',
                                fontSize: '0.82rem',
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={15} />
                            <span>Todos los Registros</span>
                        </button>
                        <button
                            onClick={() => setCategoriaTab('emails')}
                            className={`btn ${categoriaTab === 'emails' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{
                                padding: '6px 16px',
                                borderRadius: 'var(--radius-pill)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                background: categoriaTab === 'emails' ? '#06b6d4' : undefined,
                                borderColor: categoriaTab === 'emails' ? '#06b6d4' : undefined,
                                color: categoriaTab === 'emails' ? '#ffffff' : undefined
                            }}
                        >
                            <Mail size={15} />
                            <span>Envíos de Email</span>
                        </button>
                        <button
                            onClick={() => setCategoriaTab('configuracion')}
                            className={`btn ${categoriaTab === 'configuracion' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{
                                padding: '6px 16px',
                                borderRadius: 'var(--radius-pill)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                background: categoriaTab === 'configuracion' ? '#f59e0b' : undefined,
                                borderColor: categoriaTab === 'configuracion' ? '#f59e0b' : undefined,
                                color: categoriaTab === 'configuracion' ? '#ffffff' : undefined
                            }}
                        >
                            <Sliders size={15} />
                            <span>Configuraciones del Sistema</span>
                        </button>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Mostrando <strong>{filteredLogs.length}</strong> eventos registrados
                    </div>
                </div>

                {/* FILA DE BÚSQUEDA EN HISTORIAL */}
                <div className="search-bar-row">
                    <div className="search-input-field">
                        <Search size={18} className="search-icon-svg" />
                        <input
                            type="text"
                            placeholder="Buscar en historial por destinatario, asunto, motivo, reclamo #, actor, módulo..."
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
                                title="Borrar búsqueda"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* FILTROS SECUNDARIOS */}
                <div className="filter-selectors-grid">
                    <div className="filter-box">
                        <label>
                            <Sliders size={14} style={{ color: 'var(--dy-gold)' }} />
                            Tipo de Disparo
                        </label>
                        <select
                            value={tipoDisparoFilter}
                            onChange={(e) => { setTipoDisparoFilter(e.target.value); setCurrentPage(1); }}
                            disabled={categoriaTab === 'configuracion'}
                        >
                            <option value="all">Todos los disparos</option>
                            <option value="automatico">Automático (Cron / Workflow)</option>
                            <option value="manual">Manual (Administrador / Reenvío)</option>
                        </select>
                    </div>

                    <div className="filter-box">
                        <label>
                            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                            Estado de Emisión
                        </label>
                        <select
                            value={estadoFilter}
                            onChange={(e) => { setEstadoFilter(e.target.value); setCurrentPage(1); }}
                            disabled={categoriaTab === 'configuracion'}
                        >
                            <option value="all">Todos los estados</option>
                            <option value="enviado">Exitoso / Enviado</option>
                            <option value="fallido">Fallido / Error</option>
                            <option value="simulado_test">Simulado (Modo Test)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* MENSAJE DE ERROR */}
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

            {/* TABLA PRINCIPAL DE LOGS */}
            <div className="claims-table-card">
                <div className="claims-table-wrapper data-table-container">
                    <table className="claims-table data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '135px' }}>Fecha y Hora</th>
                                <th style={{ width: '105px' }}>Categoría</th>
                                <th style={{ minWidth: '240px' }}>Evento / Asunto / Motivo</th>
                                <th style={{ width: '110px', textAlign: 'center' }}>Disparo</th>
                                <th style={{ width: '190px' }}>Destinatario / Actor</th>
                                <th style={{ width: '105px', textAlign: 'center' }}>Estado</th>
                                <th style={{ width: '65px', textAlign: 'center' }}>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px 0' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
                                            <RefreshCw size={20} className="spin" />
                                            <span>Cargando registros de auditoría y logs...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                        <p style={{ margin: 0, fontWeight: 600 }}>No se encontraron registros de logs con los filtros aplicados.</p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedLogs.map((log) => {
                                    const isEmail = log.categoria_log === 'email';
                                    return (
                                        <tr
                                            key={`${log.categoria_log}-${log.id}`}
                                            onClick={() => setSelectedLog(log)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {/* FECHA */}
                                            <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                {formatFechaHoraSutil(log.created_at)}
                                            </td>

                                            {/* CATEGORÍA */}
                                            <td>
                                                {isEmail ? (
                                                    <span style={{
                                                        fontSize: '0.70rem',
                                                        padding: '3px 8px',
                                                        borderRadius: 'var(--radius-pill)',
                                                        background: 'rgba(6, 182, 212, 0.12)',
                                                        color: '#06b6d4',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4
                                                    }}>
                                                        <Mail size={12} /> Email
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.70rem',
                                                        padding: '3px 8px',
                                                        borderRadius: 'var(--radius-pill)',
                                                        background: 'rgba(245, 158, 11, 0.12)',
                                                        color: '#f59e0b',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4
                                                    }}>
                                                        <Sliders size={12} /> Config
                                                    </span>
                                                )}
                                            </td>

                                            {/* EVENTO / ASUNTO / MOTIVO */}
                                            <td>
                                                {isEmail ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--heading-color)', fontSize: '0.86rem' }}>
                                                            {log.reclamo_id && (
                                                                <span className="claim-id-tag" style={{ marginRight: 6 }}>
                                                                    #{log.reclamo_id}
                                                                </span>
                                                            )}
                                                            {log.asunto}
                                                        </div>
                                                        <div className="claim-sub-text" style={{ whiteSpace: 'normal', marginTop: 2 }}>
                                                            {log.motivo}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--heading-color)', fontSize: '0.86rem' }}>
                                                            <span style={{
                                                                background: 'rgba(245, 158, 11, 0.15)',
                                                                color: '#d97706',
                                                                padding: '2px 6px',
                                                                borderRadius: 4,
                                                                marginRight: 6,
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                textTransform: 'uppercase'
                                                            }}>
                                                                {log.modulo}
                                                            </span>
                                                            {log.descripcion}
                                                        </div>
                                                        <div className="claim-sub-text" style={{ whiteSpace: 'normal', marginTop: 2 }}>
                                                            Acción: <strong>{log.accion}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* DISPARO */}
                                            <td style={{ textAlign: 'center' }}>
                                                {isEmail ? (
                                                    log.tipo_disparo === 'manual' ? (
                                                        <span style={{
                                                            fontSize: '0.70rem',
                                                            padding: '3px 8px',
                                                            borderRadius: 'var(--radius-pill)',
                                                            background: 'rgba(139, 92, 246, 0.15)',
                                                            color: '#8b5cf6',
                                                            fontWeight: 700,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4
                                                        }}>
                                                            <User size={12} /> Manual
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            fontSize: '0.70rem',
                                                            padding: '3px 8px',
                                                            borderRadius: 'var(--radius-pill)',
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: '#10b981',
                                                            fontWeight: 700,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4
                                                        }}>
                                                            <Clock size={12} /> Auto
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Admin Web</span>
                                                )}
                                            </td>

                                            {/* DESTINATARIO / ACTOR */}
                                            <td style={{ fontSize: '0.80rem' }}>
                                                {isEmail ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--heading-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 180 }} title={log.destinatario_email}>
                                                            {log.destinatario_email}
                                                        </div>
                                                        <div className="claim-sub-text" style={{ textTransform: 'capitalize' }}>
                                                            Rol: <strong>{log.destinatario_tipo}</strong>
                                                            {log.actor_email && ` • por ${log.actor_email.split('@')[0]}`}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--heading-color)' }}>
                                                            {log.actor_email || log.actor}
                                                        </div>
                                                        <div className="claim-sub-text">
                                                            Rol: <strong>{log.actor}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* ESTADO */}
                                            <td style={{ textAlign: 'center' }}>
                                                {isEmail ? (
                                                    log.estado_envio === 'fallido' ? (
                                                        <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                                                            <XCircle size={14} /> Fallido
                                                        </span>
                                                    ) : log.estado_envio === 'simulado_test' ? (
                                                        <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                                                            <HelpCircle size={14} /> Test
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                                                            <CheckCircle size={14} /> Enviado
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                                                        <CheckCircle size={14} /> Guardado
                                                    </span>
                                                )}
                                            </td>

                                            {/* ACCIÓN DETALLE */}
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                                                    className="btn-icon"
                                                    title="Ver Detalle Completo"
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* BARRA DE PAGINACIÓN INTEGRADA */}
                {!loading && filteredLogs.length > 0 && (
                    <div className="claims-pagination-bar">
                        <div className="pagination-counter">
                            Mostrando <strong>{startIndex + 1}</strong> a <strong>{Math.min(startIndex + itemsPerPage, filteredLogs.length)}</strong> de <strong>{filteredLogs.length}</strong> eventos
                            {searchQuery && ` (filtrados de un total de ${logs.length})`}
                        </div>

                        <div className="pagination-buttons-group">
                            <button
                                className="page-btn"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
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
                                <ChevronRight size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL FLOTANTE DE DETALLE DE LOG */}
            {selectedLog && (
                <div
                    className="modal-overlay"
                    onClick={() => setSelectedLog(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1100,
                        padding: 16
                    }}
                >
                    <div
                        className="modal-content modal-content-card"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: 720,
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--surface-card)',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid var(--border-color)'
                        }}
                    >
                        {/* HEADER DEL MODAL */}
                        <div
                            className="modal-header"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '18px 24px',
                                borderBottom: '1px solid var(--border-color)',
                                flexShrink: 0
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {selectedLog.categoria_log === 'email' ? (
                                    <div style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', padding: 8, borderRadius: 8 }}>
                                        <Mail size={20} />
                                    </div>
                                ) : (
                                    <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: 8, borderRadius: 8 }}>
                                        <Sliders size={20} />
                                    </div>
                                )}
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--heading-color)' }}>
                                        {selectedLog.categoria_log === 'email' ? 'Detalle de Emisión de Correo' : 'Detalle de Modificación de Configuración'}
                                    </h3>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Registrado el {formatFechaHoraSutil(selectedLog.created_at)}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="btn-icon"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* CUERPO DEL MODAL (SCROLLEABLE) */}
                        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto' }}>
                            {selectedLog.categoria_log === 'email' ? (
                                <>
                                    {/* METADATOS DEL EMAIL */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
                                        <div style={{ background: 'var(--surface-subtle)', padding: 12, borderRadius: 8 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Destinatario</div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--heading-color)', wordBreak: 'break-all' }}>{selectedLog.destinatario_email}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rol: <strong>{selectedLog.destinatario_tipo}</strong></div>
                                        </div>

                                        <div style={{ background: 'var(--surface-subtle)', padding: 12, borderRadius: 8 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tipo de Disparo</div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: selectedLog.tipo_disparo === 'manual' ? '#8b5cf6' : '#10b981' }}>
                                                {selectedLog.tipo_disparo === 'manual' ? 'Disparo Manual' : 'Disparo Automático (Workflow/Cron)'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Actor: <strong>{selectedLog.actor_email || selectedLog.actor}</strong>
                                            </div>
                                        </div>

                                        <div style={{ background: 'var(--surface-subtle)', padding: 12, borderRadius: 8 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Reclamo Vinculado</div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#151C5B' }}>
                                                {selectedLog.reclamo_id ? `#${selectedLog.reclamo_id}` : 'General / Sin Reclamo Específico'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: selectedLog.estado_envio === 'fallido' ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                                Estado: {selectedLog.estado_envio}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ASUNTO Y MOTIVO */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                                            Asunto del Correo:
                                        </div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--heading-color)', background: 'var(--surface-subtle)', padding: '10px 14px', borderRadius: 8 }}>
                                            {selectedLog.asunto}
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 18 }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                                            Motivo / Causa del Envío:
                                        </div>
                                        <div style={{ fontSize: '0.86rem', color: 'var(--text-main)', background: 'rgba(6, 182, 212, 0.08)', padding: '10px 14px', borderRadius: 8, borderLeft: '4px solid #06b6d4', lineHeight: 1.5 }}>
                                            {selectedLog.motivo}
                                        </div>
                                    </div>

                                    {/* MENSAJE ENVIADO */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                                Contenido del Mensaje Emitido:
                                            </span>
                                            {selectedLog.cuerpo_html && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button
                                                        onClick={() => setPreviewMode('resumen')}
                                                        className={`btn-subtle ${previewMode === 'resumen' ? 'active' : ''}`}
                                                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: 'none', background: previewMode === 'resumen' ? 'var(--primary-color)' : 'var(--surface-subtle)', color: previewMode === 'resumen' ? '#fff' : 'inherit' }}
                                                    >
                                                        Resumen
                                                    </button>
                                                    <button
                                                        onClick={() => setPreviewMode('html')}
                                                        className={`btn-subtle ${previewMode === 'html' ? 'active' : ''}`}
                                                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: 'none', background: previewMode === 'html' ? 'var(--primary-color)' : 'var(--surface-subtle)', color: previewMode === 'html' ? '#fff' : 'inherit' }}
                                                    >
                                                        HTML Completo
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {previewMode === 'resumen' || !selectedLog.cuerpo_html ? (
                                            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.84rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                {selectedLog.mensaje_resumen || 'Sin resumen registrado.'}
                                            </div>
                                        ) : (
                                            <div
                                                style={{ background: '#ffffff', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)', maxHeight: 260, overflowY: 'auto' }}
                                                dangerouslySetInnerHTML={{ __html: selectedLog.cuerpo_html }}
                                            />
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* DETALLES DE MODIFICACIÓN DE CONFIGURACIÓN */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
                                        <div style={{ background: 'var(--surface-subtle)', padding: 12, borderRadius: 8 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Módulo Modificado</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--heading-color)', textTransform: 'uppercase' }}>{selectedLog.modulo}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Acción: <strong>{selectedLog.accion}</strong></div>
                                        </div>

                                        <div style={{ background: 'var(--surface-subtle)', padding: 12, borderRadius: 8 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Usuario Responsable</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--heading-color)' }}>{selectedLog.actor_email || selectedLog.actor}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rol: <strong>{selectedLog.actor}</strong></div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 18 }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                                            Descripción del Cambio:
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', background: 'rgba(245, 158, 11, 0.08)', padding: '12px 14px', borderRadius: 8, borderLeft: '4px solid #f59e0b', lineHeight: 1.5 }}>
                                            {selectedLog.descripcion}
                                        </div>
                                    </div>

                                    {/* VALORES NUEVOS */}
                                    {selectedLog.valores_nuevos && (
                                        <div style={{ marginBottom: 14 }}>
                                            <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                                                Configuración Actualizada (Valores Guardados):
                                            </div>
                                            <pre style={{ background: '#0f172a', color: '#38bdf8', padding: 12, borderRadius: 8, fontSize: '0.78rem', overflowX: 'auto', maxHeight: 200 }}>
                                                {typeof selectedLog.valores_nuevos === 'string'
                                                    ? selectedLog.valores_nuevos
                                                    : JSON.stringify(selectedLog.valores_nuevos, null, 2)}
                                            </pre>
                                        </div>
                                    )}

                                    {/* VALORES ANTERIORES */}
                                    {selectedLog.valores_anteriores && (
                                        <div>
                                            <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                                                Valores Anteriores:
                                            </div>
                                            <pre style={{ background: '#f8fafc', color: '#64748b', padding: 12, borderRadius: 8, fontSize: '0.78rem', overflowX: 'auto', maxHeight: 150, border: '1px solid var(--border-color)' }}>
                                                {typeof selectedLog.valores_anteriores === 'string'
                                                    ? selectedLog.valores_anteriores
                                                    : JSON.stringify(selectedLog.valores_anteriores, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* FOOTER DEL MODAL */}
                        <div
                            className="modal-footer"
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                padding: '14px 24px',
                                borderTop: '1px solid var(--border-color)',
                                background: 'var(--surface-subtle)',
                                flexShrink: 0
                            }}
                        >
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="btn-secondary"
                                style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogsList;
