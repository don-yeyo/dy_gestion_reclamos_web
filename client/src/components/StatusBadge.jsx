import React from 'react';

export const StatusBadge = ({ status, type = 'default' }) => {
    if (!status) return null;

    const normalized = String(status).trim().toLowerCase();
    let badgeClass = 'badge-sin-acciones';

    if (normalized.includes('pendiente')) {
        badgeClass = 'badge-pendiente';
    } else if (normalized.includes('aprobado') || normalized.includes('resuelto') || normalized.includes('conforme')) {
        badgeClass = 'badge-aprobado';
    } else if (normalized.includes('desaprobado') || normalized.includes('imposibilidad') || normalized.includes('no resuelto')) {
        badgeClass = 'badge-desaprobado';
    } else if (normalized.includes('sin respuesta') || normalized.includes('disconforme')) {
        badgeClass = 'badge-pendiente';
    }

    return (
        <span className={`badge ${badgeClass}`}>
            ● {status}
        </span>
    );
};
