import React from 'react';
import { Menu, Sun, Moon, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../config/AuthContext';

export const Header = ({ onToggleDrawer, darkMode, onToggleTheme }) => {
    const { user, logout } = useAuth();

    const getInitials = (name) => {
        if (!name) return 'DY';
        const parts = name.split(' ');
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <header className="app-header glass">
            <div className="app-header-left">
                <button
                    className="burger-btn"
                    onClick={onToggleDrawer}
                    title="Abrir menú de navegación"
                >
                    <Menu size={22} />
                </button>
                <div className="app-logo">
                    <span style="color: var(--dy-red); font-weight: 900;">DON YEYO</span>
                    <span style="opacity: 0.85; font-size: 0.95rem; font-weight: 500;">Reclamos Web</span>
                </div>
                <span className="app-version-tag">v1.0.0</span>
            </div>

            <div className="app-header-right">
                <button
                    className="theme-toggle-btn"
                    onClick={onToggleTheme}
                    title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                >
                    {darkMode ? <Sun size={20} color="#f59e0b" /> : <Moon size={20} color="#64748b" />}
                </button>

                {user && (
                    <div className="user-badge">
                        <div className="user-avatar-circle">
                            {getInitials(user.name)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.2 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                <Shield size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                                {user.role.toUpperCase()}
                            </span>
                        </div>
                        <button
                            onClick={logout}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 8, color: 'var(--text-muted)' }}
                            title="Cerrar sesión"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};
