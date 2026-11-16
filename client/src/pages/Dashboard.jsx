import React, { useState, useEffect, useMemo } from 'react';
import { reclamosApi } from '../services/api';
import {
    Inbox, Clock, CheckCircle, AlertTriangle, ShieldAlert,
    ArrowRight, RefreshCw, BarChart3, PieChart, TrendingUp, Flame
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MESES_NOMBRES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const MESES_MAP_TEXTO = {
    ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
    JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11
};

function extractMonthKeyAndLabel(r) {
    // Intentar extraer de fecha_carga, fecha_alta o fecha
    const candidates = [r.fecha_carga, r.fecha_alta, r.fecha];
    for (const raw of candidates) {
        if (!raw) continue;
        const num = Number(raw);
        if (!isNaN(num) && num >= 20000 && num <= 90000 && (typeof raw === 'number' || /^\d+(\.\d+)?$/.test(String(raw).trim()))) {
            const d = new Date(Math.round((num - 25569) * 86400 * 1000) + 3 * 3600 * 1000);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
                const y = d.getFullYear();
                const m = d.getMonth();
                return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MESES_NOMBRES[m]} ${y}` };
            }
        }
        const str = String(raw).trim();
        const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmy) {
            const m = parseInt(dmy[2], 10) - 1;
            const y = parseInt(dmy[3], 10);
            if (m >= 0 && m < 12 && y >= 2000) {
                return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MESES_NOMBRES[m]} ${y}` };
            }
        }
        const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (ymd) {
            const y = parseInt(ymd[1], 10);
            const m = parseInt(ymd[2], 10) - 1;
            if (m >= 0 && m < 12 && y >= 2000) {
                return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MESES_NOMBRES[m]} ${y}` };
            }
        }
    }

    if (r.mes) {
        const mUpper = String(r.mes).trim().toUpperCase();
        if (MESES_MAP_TEXTO[mUpper] !== undefined) {
            const mIdx = MESES_MAP_TEXTO[mUpper];
            const yearNow = new Date().getFullYear();
            return { key: `${yearNow}-${String(mIdx + 1).padStart(2, '0')}`, label: `${MESES_NOMBRES[mIdx]} ${yearNow}` };
        }
    }

    return { key: '9999-99', label: 'Sin fecha' };
}

function isReclamoResuelto(r) {
    const admin = (r.estado_admin || '').toLowerCase();
    const sup = (r.estado_supervisor || '').toLowerCase();
    const cons = (r.estado_consumidor || '').toLowerCase();
    return admin === 'finalizado' || sup === 'resuelto' || cons.includes('conforme');
}

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
                setReclamos(res.data.data || []);
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

    const kpis = useMemo(() => {
        const total = reclamos.length;
        const pendientesAdmin = reclamos.filter(r => (r.estado_admin || 'Pendiente') === 'Pendiente').length;
        const pendientesSupervisor = reclamos.filter(r => r.estado_supervisor === 'Pendiente' && (r.estado_admin === 'Aprobado' || r.estado_admin === 'En curso')).length;
        const imposibilidad = reclamos.filter(r => r.estado_supervisor === 'Imposibilidad').length;
        const inocuidad = reclamos.filter(r => r.estado_inocuidad === 'Pendiente').length;
        const resueltos = reclamos.filter(isReclamoResuelto).length;
        return { total, pendientesAdmin, pendientesSupervisor, imposibilidad, inocuidad, resueltos };
    }, [reclamos]);

    // 1. Datos para Gráfico de Barras Mensual (Ingresados vs. Resueltos por mes)
    const monthlyStats = useMemo(() => {
        const map = new Map();
        for (const r of reclamos) {
            const { key, label } = extractMonthKeyAndLabel(r);
            if (!map.has(key)) {
                map.set(key, { key, label, ingresados: 0, resueltos: 0, enCurso: 0 });
            }
            const entry = map.get(key);
            entry.ingresados += 1;
            if (isReclamoResuelto(r)) {
                entry.resueltos += 1;
            } else if ((r.estado_admin || '').toLowerCase() === 'en curso' || (r.estado_admin || '').toLowerCase() === 'aprobado') {
                entry.enCurso += 1;
            }
        }
        const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        // Mostrar últimos 6 meses con actividad
        return sorted.slice(-6);
    }, [reclamos]);

    const maxMonthlyCount = useMemo(() => {
        return Math.max(1, ...monthlyStats.map(m => m.ingresados));
    }, [monthlyStats]);

    // 2. Datos para Gráfico de Torta / Donut (Distribución por Estado Administrativo)
    const adminDistribution = useMemo(() => {
        const counts = {
            Pendiente: 0,
            'En curso': 0,
            Finalizado: 0,
            Desaprobado: 0
        };
        for (const r of reclamos) {
            const st = (r.estado_admin || 'Pendiente').trim();
            if (st === 'Pendiente') counts.Pendiente++;
            else if (st === 'En curso' || st === 'Aprobado') counts['En curso']++;
            else if (st === 'Finalizado') counts.Finalizado++;
            else if (st === 'Desaprobado') counts.Desaprobado++;
            else counts.Pendiente++;
        }
        const total = Math.max(1, reclamos.length);
        const items = [
            { label: 'Pendientes', count: counts.Pendiente, pct: Math.round((counts.Pendiente / total) * 100), color: '#f59e0b' },
            { label: 'En Curso', count: counts['En curso'], pct: Math.round((counts['En curso'] / total) * 100), color: '#3b82f6' },
            { label: 'Finalizados', count: counts.Finalizado, pct: Math.round((counts.Finalizado / total) * 100), color: '#10b981' },
            { label: 'Desaprobados', count: counts.Desaprobado, pct: Math.round((counts.Desaprobado / total) * 100), color: '#ef4444' }
        ];
        return items;
    }, [reclamos]);

    // 3. Datos para Distribución por Urgencia y Progreso Operativo
    const urgenciaStats = useMemo(() => {
        let alta = 0, media = 0, baja = 0, sinAsignar = 0;
        for (const r of reclamos) {
            const p = Number(r.prioridad);
            const name = (r.prioridad_nombre || '').toLowerCase();
            if (p === 10 || name === 'alta') alta++;
            else if (p === 20 || name === 'media') media++;
            else if (p === 30 || name === 'baja') baja++;
            else sinAsignar++;
        }
        const total = Math.max(1, reclamos.length);
        return [
            { label: 'Urgencia Alta (Crítica)', count: alta, pct: Math.round((alta / total) * 100), color: '#ef4444' },
            { label: 'Urgencia Media', count: media, pct: Math.round((media / total) * 100), color: '#f59e0b' },
            { label: 'Urgencia Baja', count: baja, pct: Math.round((baja / total) * 100), color: '#3b82f6' },
            { label: 'Sin Urgencia Asignada', count: sinAsignar, pct: Math.round((sinAsignar / total) * 100), color: '#64748b' }
        ];
    }, [reclamos]);

    const progressMetrics = useMemo(() => {
        const total = Math.max(1, reclamos.length);
        const aprobados = reclamos.filter(r => r.estado_admin && r.estado_admin !== 'Pendiente' && r.estado_admin !== 'Desaprobado').length;
        const baseAprobados = Math.max(1, aprobados);

        const supResueltos = reclamos.filter(r => (r.estado_supervisor || '').toLowerCase() === 'resuelto').length;
        const inoResueltos = reclamos.filter(r => {
            const st = (r.estado_inocuidad || '').toLowerCase();
            return st === 'resuelto' || st.includes('conforme');
        }).length;
        const consConformes = reclamos.filter(r => (r.estado_consumidor || '').toLowerCase().includes('conforme')).length;

        return [
            {
                title: 'Tasa Global de Resolución',
                subtitle: `${kpis.resueltos} de ${reclamos.length} reclamos totales resueltos`,
                pct: reclamos.length ? Math.round((kpis.resueltos / total) * 100) : 0,
                color: '#10b981'
            },
            {
                title: 'Entregas de Supervisores Completadas',
                subtitle: `${supResueltos} de ${aprobados} casos aprobados con entrega confirmada`,
                pct: aprobados ? Math.round((supResueltos / baseAprobados) * 100) : 0,
                color: '#3b82f6'
            },
            {
                title: 'Dictámenes de Calidad & Inocuidad',
                subtitle: `${inoResueltos} de ${aprobados} casos aprobados con dictamen técnico`,
                pct: aprobados ? Math.round((inoResueltos / baseAprobados) * 100) : 0,
                color: '#8b5cf6'
            },
            {
                title: 'Conformidad Confirmada por Consumidor',
                subtitle: `${consConformes} encuestas respondidas con satisfacción`,
                pct: aprobados ? Math.round((consConformes / baseAprobados) * 100) : 0,
                color: '#f59e0b'
            }
        ];
    }, [reclamos, kpis]);

    // Construcción de segmentos SVG para el Donut Chart
    const donutSegments = useMemo(() => {
        const total = reclamos.length;
        if (total === 0) return [];
        const radius = 60;
        const circumference = 2 * Math.PI * radius;
        let accumulatedPct = 0;

        return adminDistribution.filter(d => d.count > 0).map(item => {
            const fraction = item.count / total;
            const strokeDasharray = `${fraction * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedPct * circumference;
            accumulatedPct += fraction;
            return {
                ...item,
                strokeDasharray,
                strokeDashoffset
            };
        });
    }, [adminDistribution, reclamos.length]);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.8rem' }}>Dashboard de Reclamos</h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Supervisión y control estadístico del flujo de trabajo automatizado de Don Yeyo S.A.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'fa-spin' : ''} />
                        <span>Actualizar</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/reclamos')}>
                        <span>Ver Bandeja de Reclamos</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 14, borderRadius: 'var(--radius-md)', marginBottom: 24 }}>
                    {error}
                </div>
            )}

            {/* Tarjetas de KPIs Superiores */}
            <div className="dashboard-grid">
                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--primary)', cursor: 'pointer' }} onClick={() => navigate('/reclamos')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Total en Gestor</span>
                        <Inbox size={22} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div className="kpi-value">{loading ? '...' : kpis.total}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Filtrados por corte de ID</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--warning)', cursor: 'pointer' }} onClick={() => navigate('/reclamos?filtro=admin_pendiente')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Pendientes Admin</span>
                        <Clock size={22} style={{ color: 'var(--warning)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--warning)' }}>{loading ? '...' : kpis.pendientesAdmin}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Requieren aprobación</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--success)', cursor: 'pointer' }} onClick={() => navigate('/reclamos?filtro=supervisor_pendiente')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">En Supervisión</span>
                        <CheckCircle size={22} style={{ color: 'var(--success)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--success)' }}>{loading ? '...' : kpis.pendientesSupervisor}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Acción comercial en curso</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--error)', cursor: 'pointer' }} onClick={() => navigate('/reclamos')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Imposibilidades</span>
                        <AlertTriangle size={22} style={{ color: 'var(--error)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--error)' }}>{loading ? '...' : kpis.imposibilidad}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Supervisor reportó traba</span>
                </div>

                <div className="kpi-card glass" style={{ borderLeft: '4px solid var(--info)', cursor: 'pointer' }} onClick={() => navigate('/reclamos?filtro=inocuidad')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="kpi-title">Inocuidad / Calidad</span>
                        <ShieldAlert size={22} style={{ color: 'var(--info)' }} />
                    </div>
                    <div className="kpi-value" style={{ color: 'var(--info)' }}>{loading ? '...' : kpis.inocuidad}</div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Derivados a control técnico</span>
                </div>
            </div>

            {/* Gráficos Analíticos del Dashboard */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: 20,
                marginTop: 24
            }}>
                {/* GRÁFICO 1: Barras Mensuales (Ingresados vs. Resueltos) */}
                <div className="table-card" style={{ padding: 22 }} data-testid="chart-mensual-barras">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <BarChart3 size={20} style={{ color: 'var(--dy-gold)' }} />
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.05rem' }}>
                                    Evolución Mensual: Ingresados vs. Resueltos
                                </h3>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                    Comparativa mensual de volumen de ingreso y casos solucionados
                                </span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.74rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3b82f6', display: 'inline-block' }} />
                                Ingresados
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981', display: 'inline-block' }} />
                                Resueltos
                            </span>
                        </div>
                    </div>

                    {monthlyStats.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                            {loading ? 'Calculando series mensuales...' : 'Sin datos mensuales disponibles.'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Gráfico de columnas verticales */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${monthlyStats.length}, minmax(48px, 1fr))`,
                                gap: 12,
                                alignItems: 'end',
                                height: 180,
                                padding: '16px 8px 8px 8px',
                                borderBottom: '1px solid var(--border)',
                                background: 'var(--surface-subtle)',
                                borderRadius: 'var(--radius-sm)'
                            }}>
                                {monthlyStats.map(m => {
                                    const hIngresados = Math.max(8, Math.round((m.ingresados / maxMonthlyCount) * 130));
                                    const hResueltos = m.resueltos > 0 ? Math.max(6, Math.round((m.resueltos / maxMonthlyCount) * 130)) : 0;
                                    const pct = m.ingresados > 0 ? Math.round((m.resueltos / m.ingresados) * 100) : 0;
                                    return (
                                        <div key={m.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                {m.ingresados} / <span style={{ color: '#10b981' }}>{m.resueltos}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 135 }}>
                                                <div
                                                    title={`${m.label} — Ingresados: ${m.ingresados}`}
                                                    style={{
                                                        width: 18,
                                                        height: hIngresados,
                                                        background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                                                        borderRadius: '4px 4px 0 0',
                                                        transition: 'height 0.3s ease'
                                                    }}
                                                />
                                                <div
                                                    title={`${m.label} — Resueltos: ${m.resueltos} (${pct}%)`}
                                                    style={{
                                                        width: 18,
                                                        height: hResueltos,
                                                        background: 'linear-gradient(180deg, #34d399 0%, #059669 100%)',
                                                        borderRadius: '4px 4px 0 0',
                                                        transition: 'height 0.3s ease'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>
                                                {m.label}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Resumen de progreso por mes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {monthlyStats.slice(-3).reverse().map(m => {
                                    const pct = m.ingresados > 0 ? Math.round((m.resueltos / m.ingresados) * 100) : 0;
                                    return (
                                        <div key={`prog-${m.key}`} style={{ fontSize: '0.78rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600 }}>{m.label}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    <strong>{m.resueltos}</strong> resueltos de <strong>{m.ingresados}</strong> ingresados ({pct}%)
                                                </span>
                                            </div>
                                            <div style={{ height: 7, background: 'var(--surface-subtle)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: '#10b981', borderRadius: 999, transition: 'width 0.3s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* GRÁFICO 2: Torta / Donut de Estados Administrativos */}
                <div className="table-card" style={{ padding: 22 }} data-testid="chart-torta-estados">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <PieChart size={20} style={{ color: '#3b82f6' }} />
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.05rem' }}>
                                Distribución por Estado Administrativo
                            </h3>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Proporción actual de reclamos según etapa administrativa
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: 20, padding: '10px 0' }}>
                        {/* SVG Donut */}
                        <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
                                <circle
                                    cx="80"
                                    cy="80"
                                    r="60"
                                    fill="transparent"
                                    stroke="var(--surface-subtle)"
                                    strokeWidth="22"
                                />
                                {donutSegments.map((seg, i) => (
                                    <circle
                                        key={i}
                                        cx="80"
                                        cy="80"
                                        r="60"
                                        fill="transparent"
                                        stroke={seg.color}
                                        strokeWidth="22"
                                        strokeDasharray={seg.strokeDasharray}
                                        strokeDashoffset={seg.strokeDashoffset}
                                    >
                                        <title>{`${seg.label}: ${seg.count} (${seg.pct}%)`}</title>
                                    </circle>
                                ))}
                            </svg>
                            <div style={{ position: 'absolute', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--heading-color)', lineHeight: 1 }}>
                                    {kpis.total}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    Total Casos
                                </div>
                            </div>
                        </div>

                        {/* Leyenda detallada */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 180px' }}>
                            {adminDistribution.map(item => (
                                <div
                                    key={item.label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 12px',
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'var(--surface-subtle)',
                                        borderLeft: `4px solid ${item.color}`
                                    }}
                                >
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.label}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.count}</span>
                                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                                            ({item.pct}%)
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Segunda fila de gráficos: Urgencia y Barras de Progreso por Sector */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: 20,
                marginTop: 20
            }}>
                {/* GRÁFICO 3: Clasificación por Nivel de Urgencia */}
                <div className="table-card" style={{ padding: 22 }} data-testid="chart-urgencia">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <Flame size={20} style={{ color: '#ef4444' }} />
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.05rem' }}>
                                Progreso y Distribución por Nivel de Urgencia
                            </h3>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Clasificación de severidad de los reclamos registrados
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {urgenciaStats.map(u => (
                            <div key={u.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 5 }}>
                                    <span style={{ fontWeight: 600 }}>{u.label}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        <strong>{u.count}</strong> reclamos ({u.pct}%)
                                    </span>
                                </div>
                                <div style={{ height: 10, background: 'var(--surface-subtle)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    <div
                                        style={{
                                            width: `${u.pct}%`,
                                            height: '100%',
                                            background: u.color,
                                            borderRadius: 999,
                                            transition: 'width 0.3s ease'
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* GRÁFICO 4: Indicadores de Progreso y Resolución por Rol */}
                <div className="table-card" style={{ padding: 22 }} data-testid="chart-progreso-sectores">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                        <TrendingUp size={20} style={{ color: '#10b981' }} />
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.05rem' }}>
                                Progreso de Resolución por Sector
                            </h3>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Nivel de cumplimiento operativo en Supervisión, Calidad y Consumidor
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {progressMetrics.map(m => (
                            <div key={m.title}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                    <div>
                                        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text)' }}>{m.title}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.subtitle}</div>
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: m.color }}>
                                        {m.pct}%
                                    </span>
                                </div>
                                <div style={{ height: 9, background: 'var(--surface-subtle)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    <div
                                        style={{
                                            width: `${m.pct}%`,
                                            height: '100%',
                                            background: m.color,
                                            borderRadius: 999,
                                            transition: 'width 0.3s ease'
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
