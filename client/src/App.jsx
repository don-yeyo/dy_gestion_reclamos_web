import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ReclamosList } from './pages/ReclamosList';
import { EstadosList } from './pages/EstadosList';
import { SeguimientosList } from './pages/SeguimientosList';
import { LogsList } from './pages/LogsList';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { ImposibilidadPublic } from './pages/ImposibilidadPublic';
import { EncuestaConsumidorPublic } from './pages/EncuestaConsumidorPublic';

export const App = () => {
    return (
        <Routes>
            {/* Rutas Públicas (No requieren login corporativo MSAL, validan token JWT criptográfico) */}
            <Route path="/imposibilidad" element={<ImposibilidadPublic />} />
            <Route path="/encuesta-consumidor" element={<EncuestaConsumidorPublic />} />
            <Route path="/respuesta-consumidor" element={<EncuestaConsumidorPublic />} />

            {/* Rutas Protegidas bajo Layout corporativo */}
            <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/reclamos" element={<ReclamosList />} />
                <Route path="/reclamos/:id" element={<ReclamosList />} />
                <Route path="/reglas-cortesia" element={<Dashboard />} />
                <Route path="/cobertura-supervisores" element={<Dashboard />} />
                <Route path="/estados" element={<EstadosList />} />
                <Route path="/estados/:id" element={<EstadosList />} />
                <Route path="/seguimientos" element={<SeguimientosList />} />
                <Route path="/seguimientos/nuevo" element={<SeguimientosList />} />
                <Route path="/seguimientos/:id" element={<SeguimientosList />} />
                <Route path="/logs" element={<LogsList />} />
                <Route path="/logs/:id" element={<LogsList />} />
                <Route path="/logs/:categoria/:id" element={<LogsList />} />
                <Route path="/configuracion" element={<ConfiguracionPage />} />
                <Route path="/configuracion/:tab" element={<ConfiguracionPage />} />
                <Route path="/configuracion/:tab/:item" element={<ConfiguracionPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
};

export default App;
