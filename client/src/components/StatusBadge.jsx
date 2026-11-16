import React from 'react';
import { useEstados } from '../config/EstadosContext';

function getStatusAbbreviation(status) {
    const norm = String(status || '').trim().toLowerCase();
    if (!norm) return '-';
    if (norm === 'finalizado') return 'F';
    if (norm === 'pendiente') return 'P';
    if (norm === 'en curso') return 'EC';
    if (norm === 'aprobado') return 'A';
    if (norm === 'desaprobado') return 'D';
    if (norm === 'resuelto') return 'R';
    if (norm === 'imposibilidad') return 'I';
    if (norm === 'sin acciones') return 'SA';
    if (norm === 'sin respuesta' || norm === 'fsr') return 'SR';
    if (norm === 'cerrado') return 'C';
    if (norm === 'resuelto sin confirmar') return 'RS';
    if (norm === 'resuelto conforme') return 'RC';
    if (norm === 'resuelto disconforme') return 'RD';
    if (norm === 'no resuelto') return 'NR';
    if (norm === 'conforme') return 'C';
    if (norm === 'no conforme') return 'NC';

    const words = norm.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return norm.charAt(0).toUpperCase();
}

export const StatusBadge = ({ status, actor = null, title = null, compact = false }) => {
    if (!status) return null;

    const { getDescripcion, getColor } = useEstados();
    const normalized = String(status).trim().toLowerCase();

    // Obtener la descripción dinámica y el color configurado en la BD
    const dbDescripcion = getDescripcion(status, actor);
    const dbColor = getColor(status, actor);
    let tooltipDesc = title || dbDescripcion || '';
    let badgeClass = 'badge-sin-acciones';

    if (normalized.includes('pendiente')) {
        badgeClass = 'badge-pendiente';
    } else if (normalized === 'cerrado' || normalized.includes('cerrado')) {
        badgeClass = 'badge-cerrado';
    } else if (normalized.includes('finalizado') || normalized === 'fsr') {
        badgeClass = normalized === 'fsr' || normalized.includes('sin respuesta') ? 'badge-fsr' : 'badge-finalizado';
        if (!title && !dbDescripcion && (normalized === 'fsr' || normalized.includes('sin respuesta'))) {
            tooltipDesc = 'Finalizado Sin Respuesta: El consumidor no respondió a las solicitudes de seguimiento tras el plazo estipulado';
        }
    } else if (normalized.includes('aprobado') && !normalized.includes('desaprobado')) {
        badgeClass = 'badge-aprobado';
    } else if (normalized.includes('desaprobado')) {
        badgeClass = 'badge-desaprobado';
    } else if (normalized.includes('resuelto')) {
        badgeClass = 'badge-resuelto';
    } else if (normalized.includes('en curso') || normalized.includes('proceso')) {
        badgeClass = 'badge-en-curso';
    } else if (normalized.includes('imposibilidad')) {
        badgeClass = 'badge-imposibilidad';
    } else if (normalized.includes('no conforme') || normalized.includes('no resuelto')) {
        badgeClass = 'badge-no-conforme';
    } else if (normalized.includes('conforme')) {
        badgeClass = 'badge-conforme';
    }

    const fullTooltip = tooltipDesc ? `${status}: ${tooltipDesc}` : String(status);

    // Estilo dinámico de color si se definió en la base de datos
    const customStyle = dbColor ? {
        color: dbColor,
        borderColor: dbColor.startsWith('#') && (dbColor.length === 7 || dbColor.length === 4) ? `${dbColor}66` : dbColor,
        backgroundColor: dbColor.startsWith('#') && (dbColor.length === 7 || dbColor.length === 4) ? `${dbColor}1f` : 'rgba(0,0,0,0.06)'
    } : {};

    if (compact) {
        const abbr = getStatusAbbreviation(status);
        return (
            <span
                className={`badge ${badgeClass}`}
                title={fullTooltip}
                aria-label={fullTooltip}
                style={{
                    width: 28,
                    height: 28,
                    minWidth: 28,
                    padding: 0,
                    borderRadius: '50%',
                    fontSize: abbr.length > 1 ? '0.64rem' : '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '-0.3px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'help',
                    position: 'relative',
                    lineHeight: 1,
                    ...customStyle
                }}
            >
                <span aria-hidden="true">{abbr}</span>
                <span style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0
                }}>
                    {status}
                </span>
            </span>
        );
    }

    return (
        <span
            className={`badge ${badgeClass}`}
            title={fullTooltip}
            style={{
                fontSize: '0.6rem',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                cursor: fullTooltip ? 'help' : 'default',
                ...customStyle
            }}
        >
            <span style={{ fontSize: '0.55rem', lineHeight: 1, color: dbColor || 'inherit' }}>●</span>
            <span style={{ whiteSpace: 'nowrap' }}>{status}</span>
        </span>
    );
};
export default StatusBadge;
