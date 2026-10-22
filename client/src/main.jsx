import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './config/msal';
import { AuthProvider } from './config/AuthContext';
import App from './App';
import './index.css';

const msalInstance = new PublicClientApplication(msalConfig);

// En MSAL Browser v3.x, initialize() es asíncrono y mandatorio antes de cualquier interacción
msalInstance.initialize().then(() => {
    // Si ya hay cuentas en sesión, marcar la primera como cuenta activa
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
    }

    // Escuchar eventos para sincronizar cuenta activa automáticamente
    msalInstance.addEventCallback((event) => {
        if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
            msalInstance.setActiveAccount(event.payload.account);
        }
    });

    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <MsalProvider instance={msalInstance}>
                <AuthProvider>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </AuthProvider>
            </MsalProvider>
        </React.StrictMode>
    );
});

