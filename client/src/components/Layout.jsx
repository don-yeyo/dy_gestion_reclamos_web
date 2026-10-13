import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Drawer } from './Drawer';
import { useAuth } from '../config/AuthContext';
import { LogIn, ShieldAlert } from 'lucide-react';

export const Layout = () => {
    const { isAuthenticated, loading, authError, loginMicrosoft } = useAuth();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('dy_theme') === 'dark';
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark-theme');
            localStorage.setItem('dy_theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark-theme');
            localStorage.setItem('dy_theme', 'light');
        }
    }, [darkMode]);

    const toggleTheme = () => setDarkMode(prev => !prev);
    const toggleDrawer = () => setIsDrawerOpen(prev => !prev);
    const closeDrawer = () => setIsDrawerOpen(false);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
                <div style={{ width: 40, height: 40, border: '4px solid var(--border)', borderTopColor: 'var(--dy-red)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Validando credenciales corporativas...</span>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)', padding: 20 }}>
                <div className="glass" style={{ maxWidth: 440, width: '100%', padding: 40, borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ color: 'var(--dy-red)', margin: 0, fontWeight: 900, fontSize: '2rem' }}>DON YEYO</h1>
                        <p style={{ color: 'var(--dy-blue)', margin: '4px 0 0 0', fontWeight: 600 }}>Gestión de Reclamos Web</p>
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.5 }}>
                        Acceso exclusivo para personal autorizado de Don Yeyo S.A. Iniciá sesión con tu cuenta corporativa de Microsoft Office 365.
                    </p>

                    {authError && (
                        <div style={{ background: 'var(--error-bg)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 20, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
                            <span>{authError}</span>
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={loginMicrosoft}
                        style={{ width: '100%', padding: '14px 20px', fontSize: '0.95rem' }}
                    >
                        <LogIn size={18} />
                        <span>Iniciar Sesión con Microsoft</span>
                    </button>

                    <div style={{ marginTop: 24, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Don Yeyo S.A. | Seguridad y Control de Calidad
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <Header
                onToggleDrawer={toggleDrawer}
                darkMode={darkMode}
                onToggleTheme={toggleTheme}
            />
            <Drawer
                isOpen={isDrawerOpen}
                onClose={closeDrawer}
            />
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};
