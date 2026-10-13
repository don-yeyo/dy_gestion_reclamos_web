import React, { useState, useEffect } from 'react';
import logo from '../assets/logo-don-yeyo-png-sin-fondo.png';
import microsoftLogo from '../assets/microsoft-logo.png';
import { useAuth } from '../config/AuthContext';
import { AlertTriangle, Sun, Moon } from 'lucide-react';

export default function LoginScreen() {
    const { loginMicrosoft, authError, loading } = useAuth();
    const [theme, setTheme] = useState(() => localStorage.getItem('dy_theme') || 'light');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.documentElement.classList.remove('dark-theme');
            document.body.classList.remove('dark-theme');
        }
        localStorage.setItem('dy_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <div className="login-container" style={{
            height: '100vh',
            display: 'flex',
            gap: '8px',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
        }}>
            {/* Botón de cambio de tema en el login */}
            <button
                onClick={toggleTheme}
                className="mode-toggle"
                style={{
                    position: 'absolute',
                    top: '24px',
                    right: '24px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                }}
                title="Cambiar modo"
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <img
                src={logo}
                alt="Don Yeyo"
                style={{ height: '140px', marginBottom: '16px', objectFit: 'contain' }}
            />

            <h1 style={{ fontWeight: '800', color: 'var(--header-text, var(--text))', margin: 0, fontSize: '2rem' }}>
                Gestión de Reclamos Web
            </h1>

            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '16px 0 32px 0', fontSize: '1.05rem', textAlign: 'center', lineHeight: 1.5 }}>
                Bienvenido. Inicie sesión con su cuenta corporativa o personal registrada en la empresa.
            </p>

            {authError && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid var(--dy-red, #e40521)',
                    color: 'var(--dy-red, #e40521)',
                    padding: '12px 16px',
                    borderRadius: 12,
                    fontSize: '0.88rem',
                    textAlign: 'center',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    maxWidth: 360
                }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, color: 'var(--dy-red, #e40521)' }} />
                    <div style={{ textAlign: 'left' }}>
                        <strong>Acceso denegado:</strong> {authError}
                    </div>
                </div>
            )}

            <div className="login-options">
                <button
                    className="btn-microsoft"
                    onClick={loginMicrosoft}
                    disabled={loading}
                >
                    <img
                        src={microsoftLogo}
                        alt="Microsoft"
                        style={{ height: '24px', width: '24px', objectFit: 'contain' }}
                    />
                    <span>Inicia sesión con Microsoft</span>
                </button>
            </div>
        </div>
    );
}
