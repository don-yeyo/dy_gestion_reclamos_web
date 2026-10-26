import React from 'react';
import { useEstados } from '../config/EstadosContext';

export const StatusBadge = ({ status, actor = null, title = null, type = 'default' }) => {
    if (!status) return null;

    const { getDescripcion, getColor } = useEstados();
    const normalized = String(status).trim().toLowerCase();

    // Obtener la descripción dinámica y el color configurado en la BD
    const dbDescripcion = getDescripcion(status, actor);
    const dbColor = getColor(status, actor);
    let tooltipText = title || dbDescripcion || undefined;
    let badgeClass = 'badge-sin-acciones';

    if (normalized.includes('pendiente')) {
        badgeClass = 'badge-pendiente';
    } else if (normalized === 'cerrado' || normalized.includes('cerrado')) {
        badgeClass = 'badge-cerrado';
    } else if (normalized.includes('finalizado') || normalized === 'fsr') {
        badgeClass = normalized === 'fsr' || normalized.includes('sin respuesta') ? 'badge-fsr' : 'badge-finalizado';
        if (!title && !dbDescripcion && (normalized === 'fsr' || normalized.includes('sin respuesta'))) {
            tooltipText = 'Finalizado Sin Respuesta: El consumidor no respondió a las solicitudes de seguimiento tras el plazo estipulado';
        }
    } else if (normalized.includes('en curso')) {
        badgeClass = 'badge-en-curso';
    } else if (normalized.includes('aprobado') || normalized.includes('resuelto') || normalized.includes('conforme')) {
        badgeClass = 'badge-aprobado';
    } else if (normalized.includes('desaprobado') || normalized.includes('imposibilidad') || normalized.includes('no resuelto')) {
        badgeClass = 'badge-desaprobado';
    } else if (normalized.includes('sin respuesta') || normalized.includes('disconforme')) {
        badgeClass = 'badge-pendiente';
    }

    // Estilo dinámico de color si se definió en la base de datos
    const customStyle = dbColor ? {
        color: dbColor,
        borderColor: dbColor.startsWith('#') && (dbColor.length === 7 || dbColor.length === 4) ? `${dbColor}66` : dbColor,
        backgroundColor: dbColor.startsWith('#') && (dbColor.length === 7 || dbColor.length === 4) ? `${dbColor}1f` : 'rgba(0,0,0,0.06)'
    } : {};

    return (
        <span
            className={`badge ${badgeClass}`}
            title={tooltipText}
            style={{
                fontSize: '0.6rem',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                cursor: tooltipText ? 'help' : 'default',
                ...customStyle
            }}
        >
            <span style={{ fontSize: '0.55rem', lineHeight: 1, color: dbColor || 'inherit' }}>●</span>
            <span style={{ whiteSpace: 'nowrap' }}>{status}</span>
        </span>
    );
};
