import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "./msal";
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const isMsAuthenticated = useIsAuthenticated();

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    const mockDone = useRef(false);

    useEffect(() => {
        const verifySession = async () => {
            // ── BYPASS PARA DESARROLLO LOCAL (MOCK AUTH) ──────────────────────
            if (import.meta.env.VITE_MOCK_AUTH === 'true') {
                if (mockDone.current) return;
                mockDone.current = true;

                const mockEmail = import.meta.env.VITE_MOCK_AUTH_EMAIL || 'administracion@donyeyo.com.ar';
                const mockName  = import.meta.env.VITE_MOCK_AUTH_NAME || 'Administrador Mock';

                try {
                    const res = await authApi.validate(mockEmail, mockName);
                    if (res.data.success) {
                        localStorage.setItem('dy_auth_token', res.data.token);
                        setUser(res.data.user);
                        setIsAuthenticated(true);
                    }
                } catch (e) {
                    setAuthError('Error validando usuario Mock en servidor: ' + (e.response?.data?.error || e.message));
                }
                setLoading(false);
                return;
            }

            // ── AUTENTICACIÓN OFICIAL MICROSOFT ENTRA ID (AZURE AD) ───────────
            if (isMsAuthenticated && accounts.length > 0) {
                const account = accounts[0];
                const email = account.username || account.idTokenClaims?.preferred_username || '';
                const name = account.name || account.idTokenClaims?.name || email;

                try {
                    // Validar con el backend para obtener token firmado y rol verificado
                    const res = await authApi.validate(email, name);
                    if (res.data.success) {
                        localStorage.setItem('dy_auth_token', res.data.token);
                        setUser(res.data.user);
                        setIsAuthenticated(true);
                        setAuthError(null);
                    }
                } catch (e) {
                    const errMsg = e.response?.data?.error || 'Tu cuenta no tiene autorización en el sistema.';
                    setAuthError(errMsg);
                    setIsAuthenticated(false);
                    setUser(null);
                }
            } else {
                // Verificar si existe token guardado previo de forma segura en el backend
                const savedToken = localStorage.getItem('dy_auth_token');
                if (savedToken) {
                    try {
                        const res = await authApi.me();
                        if (res.data.success) {
                            setUser(res.data.user);
                            setIsAuthenticated(true);
                        }
                    } catch {
                        // Token manipulado, inválido o expirado
                        localStorage.removeItem('dy_auth_token');
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                }
            }

            setLoading(false);
        };

        verifySession();
    }, [isMsAuthenticated, accounts]);

    const loginMicrosoft = () => {
        setAuthError(null);
        instance.loginPopup(loginRequest).catch(e => {
            console.error('Error en popup MSAL:', e);
            setAuthError('No se pudo completar el inicio de sesión con Microsoft.');
        });
    };

    const logout = () => {
        localStorage.removeItem('dy_auth_token');
        setIsAuthenticated(false);
        setUser(null);
        if (isMsAuthenticated) {
            instance.logoutPopup().catch(() => {});
        }
    };

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            user,
            loading,
            authError,
            loginMicrosoft,
            logout,
            isAdmin: user?.role === 'admin' || user?.role === 'sysadmin',
            isInocuidad: user?.role === 'inocuidad' || user?.role === 'sysadmin',
            isSysadmin: user?.role === 'sysadmin'
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
