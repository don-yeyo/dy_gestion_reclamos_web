import React, { useState, useEffect } from 'react';
import { reclamosApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { Inbox, Clock, CheckCircle, AlertTriangle, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Dashboard = () => {
    const navigate = useNavigate();
    const [reclamos, setReclamos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await reclamosApi.getAll();
            if (res.data.success) {
                setReclamos(res.data.data);
            }
        } catch (err) {
            setError('Error al conectar con el servidor: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const kpis = {
        total: reclamos.length,
        pendientesAdmin: reclamos.filter(r => r.estado_admin === 'Pendiente').length,
        pendientesSupervisor: reclamos.filter(r => r.estado_supervisor === 'Pendiente' && r.estado_admin === 'Aprobado').length,
        imposibilidad: reclamos.filter(r => r.estado_supervisor === 'Imposibilidad').length,
        inocuidad: reclamos.filter(r => r.estado_inocuidad === 'Pendiente').length,
        resueltos: reclamos.filter(r => r.estado_consumidor?.includes('conforme') || r.estado_supervisor === 'Resuelto').length
    };

    const recent = reclamos.slice(0, 5);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.8rem' }}>Dashboard de Reclamos</h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Supervisión y control del flujo de trabajo automatizado de Don Yeyo S.A.
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'fa-spin' : ''} />
                    <span>Actualizar</span>
                </button>
            </div>

            {error && (
                <div style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 14, borderRadius: 'var(--radius-md)', marginBottom: 24 }}>
                    {error}
                </div>
            )}

            <div className="dashboard-grid">
                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Total en Gestor</span>
                        <Inbox size={22} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div className="kpi-value">{loading ? '...' : kpis.total}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Filtrados por corte de ID</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Pendientes Admin</span>
                        <Clock size={22} style={{ color: 'var(--warning)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--warning)' }}>{loading ? '...' : kpis.pendientesAdmin}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Requieren aprobación</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">En Supervisión</span>
                        <CheckCircle size={22} style={{ color: 'var(--success)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--success)' }}>{loading ? '...' : kpis.pendientesSupervisor}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Acción comercial en curso</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--error)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Imposibilidades</span>
                        <AlertTriangle size={22} style={{ color: 'var(--error)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--error)' }}>{loading ? '...' : kpis.imposibilidad}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Supervisor reportó traba</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--info)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Inocuidad / Calidad</span>
                        <ShieldAlert size={22} style={{ color: 'var(--info)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--info)' }}>{loading ? '...' : kpis.inocuidad}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Derivados a control técnico</span>
                </div>
            </div>

            <div className="table-card">
                <div className="table-header-controls">
                    <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.1rem' }}>Últimos Reclamos Ingresados</h3>
                    <button className="btn btn-secondary" onClick={() => navigate('/reclamos')}>
                        <span>Ver Todos los Reclamos</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '80px' }}>ID</th>
                                <th>Fecha</th>
                                <th>Consumidor</th>
                                <th>Localidad</th>
                                <th>Supervisor</th>
                                <th style={{ textAlign: 'center' }}>Admin</th>
                                <th style={{ textAlign: 'center' }}>Inocuidad</th>
                                <th style={{ textAlign: 'center' }}>Supervisor</th>
                                <th style={{ textAlign: 'center' }}>Consumidor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                                        {loading ? 'Cargando registros...' : 'No hay reclamos cargados por encima del corte.'}
                                    </td>
                                </tr>
                            ) : (
                                recent.map(r => (
                                    <tr key={r.id} onClick={() => navigate(`/reclamos?id=${r.id}`)}>
                                        <td><strong>#{r.id}</strong></td>
                                        <td>{r.fecha_alta}</td>
                                        <td>{r.nombre} {r.apellido}</td>
                                        <td>{r.localidad} ({r.provincia})</td>
                                        <td>{r.supervisor}</td>
                                        <td style={{ textAlign: 'center' }}><StatusBadge status={r.estado_admin} /></td>
                                        <td style={{ textAlign: 'center' }}><StatusBadge status={r.estado_inocuidad} /></td>
                                        <td style={{ textAlign: 'center' }}><StatusBadge status={r.estado_supervisor} /></td>
                                        <td style={{ textAlign: 'center' }}><StatusBadge status={r.estado_consumidor} /></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
