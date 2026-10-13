import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Inbox, UserCheck, ShieldAlert, X, ChevronRight, HelpCircle, Map } from 'lucide-react';
import { useAuth } from '../config/AuthContext';

export const Drawer = ({ isOpen, onClose, onOpenCobertura }) => {
    const { user, isAdmin, isInocuidad } = useAuth();

    return (
        <>
            <div
                className={`drawer-backdrop ${isOpen ? 'open' : ''}`}
                onClick={onClose}
            />
            <aside className={`drawer-container ${isOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--dy-blue)', fontSize: '1.1rem' }}>Menú de Gestión</h3>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Rol: <strong>{user?.role?.toUpperCase()}</strong>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="drawer-body">
                    <div className="drawer-section-title">General</div>
                    <NavLink
                        to="/"
                        onClick={onClose}
                        className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <LayoutDashboard size={18} />
                        <span>Dashboard Métricas</span>
                    </NavLink>
                    <NavLink
                        to="/reclamos"
                        onClick={onClose}
                        className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <Inbox size={18} />
                        <span>Bandeja de Reclamos</span>
                    </NavLink>

                    <div className="drawer-section-title">Vistas por Actor</div>
                    {isAdmin && (
                        <>
                            <NavLink
                                to="/reclamos?filtro=admin_pendiente"
                                onClick={onClose}
                                className="drawer-nav-item"
                            >
                                <UserCheck size={18} color="#f59e0b" />
                                <span>Pendientes de Aprobación</span>
                            </NavLink>
                            <NavLink
                                to="/reclamos?filtro=supervisor_pendiente"
                                onClick={onClose}
                                className="drawer-nav-item"
                            >
                                <ChevronRight size={18} color="#151C5B" />
                                <span>En Supervisión Comercial</span>
                            </NavLink>
                        </>
                    )}

                    {(isInocuidad || isAdmin) && (
                        <NavLink
                            to="/reclamos?filtro=inocuidad"
                            onClick={onClose}
                            className="drawer-nav-item"
                        >
                            <ShieldAlert size={18} color="#e40521" />
                            <span>Inocuidad y Calidad</span>
                        </NavLink>
                    )}

                    {isAdmin && (
                        <>
                            <div className="drawer-section-title">Configuración</div>
                            <button
                                onClick={() => {
                                    onClose();
                                    if (onOpenCobertura) onOpenCobertura();
                                }}
                                className="drawer-nav-item"
                                style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                <Map size={18} color="#f59e0b" />
                                <span>Cobertura Supervisores</span>
                            </button>
                        </>
                    )}

                    <div className="drawer-section-title">Información de Sistema</div>
                    <div style={{ padding: '12px 14px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <p style={{ margin: '0 0 6px 0' }}><strong>Corte Numérico:</strong></p>
                        <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: 4 }}>ID &gt;= 20233357</code>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.74rem' }}>
                            Sincronizado en tiempo real con Google Sheets ("Reclamos 2023").
                        </p>
                    </div>
                </div>

                <div className="drawer-footer">
                    <span>Don Yeyo S.A. © 2026</span>
                </div>
            </aside>
        </>
    );
};
