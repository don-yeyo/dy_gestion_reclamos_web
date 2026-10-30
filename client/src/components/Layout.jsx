import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Drawer } from './Drawer';
import { useAuth } from '../config/AuthContext';
import LoginScreen from './LoginScreen';
import { CoberturaSupervisoresModal } from './CoberturaSupervisoresModal';
import { ReglasCortesiaModal } from './ReglasCortesiaModal';

export const Layout = () => {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const lastNonModalPathRef = useRef('/');

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('dy_theme') === 'dark';
    });

    const isCoberturaOpen = location.pathname === '/cobertura-supervisores';
    const isReglasCortesiaOpen = location.pathname === '/reglas-cortesia';

    useEffect(() => {
        if (location.pathname !== '/cobertura-supervisores' && location.pathname !== '/reglas-cortesia') {
            lastNonModalPathRef.current = `${location.pathname}${location.search}`;
        }
    }, [location.pathname, location.search]);

    const handleCloseModalRoute = () => {
        navigate(lastNonModalPathRef.current || '/');
    };

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark-theme');
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-theme');
            localStorage.setItem('dy_theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark-theme');
            document.documentElement.setAttribute('data-theme', 'light');
            document.body.classList.remove('dark-theme');
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
        return <LoginScreen />;
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
                onOpenCobertura={() => navigate('/cobertura-supervisores')}
                onOpenReglasCortesia={() => navigate('/reglas-cortesia')}
            />
            <main className="main-content">
                <Outlet />
            </main>
            <CoberturaSupervisoresModal
                isOpen={isCoberturaOpen}
                onClose={handleCloseModalRoute}
            />
            <ReglasCortesiaModal
                isOpen={isReglasCortesiaOpen}
                onClose={handleCloseModalRoute}
            />
        </div>
    );
};
