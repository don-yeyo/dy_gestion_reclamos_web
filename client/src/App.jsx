import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ReclamosList } from './pages/ReclamosList';
import { ImposibilidadPublic } from './pages/ImposibilidadPublic';

export const App = () => {
    return (
        <Routes>
            {/* Ruta Pública (No requiere login corporativo MSAL, valida token HMAC criptográfico) */}
            <Route path="/imposibilidad" element={<ImposibilidadPublic />} />

            {/* Rutas Protegidas bajo Layout corporativo */}
            <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/reclamos" element={<ReclamosList />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
};

export default App;
