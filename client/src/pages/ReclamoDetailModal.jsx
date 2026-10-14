import React, { useState, useEffect } from 'react';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { reclamosApi } from '../services/api';
import { useAuth } from '../config/AuthContext';
import {
    MapPin,
    Phone,
    Mail,
    Store,
    Download,
    Check,
    X,
    ShieldAlert,
    User,
    AlertCircle,
    Play,
    RotateCcw,
    GitBranch,
    Clock,
    CheckCircle2,
    Gift
} from 'lucide-react';

const SUPERVISORES_LISTA = [
    { nombre: 'Hugo Basile', email: 'hugob@donyeyo.com.ar' },
    { nombre: 'Gustavo Orgaz', email: 'gustavoeo@donyeyo.com.ar' },
    { nombre: 'Alexis Gonzalez', email: 'alexisg@donyeyo.com.ar' },
    { nombre: 'Edgar Barberis', email: 'edgarb@donyeyo.com.ar' },
    { nombre: 'Guadalupe Azcue', email: 'guadalupea@donyeyo.com.ar' },
    { nombre: 'Ricardo Altamirano', email: 'ricardoa@donyeyo.com.ar' },
    { nombre: 'Hector Borgogno', email: 'hectorb@donyeyo.com.ar' },
    { nombre: 'Facundo Carmody', email: 'facundoc@donyeyo.com.ar' },
    { nombre: 'Mariano Marinelli', email: 'marianom@donyeyo.com.ar' },
    { nombre: 'Pablo Gallo', email: 'juanpablog@donyeyo.com.ar' }
];

export const ReclamoDetailModal = ({ claim, isOpen, onClose, onRefresh }) => {
    const { isAdmin, isInocuidad } = useAuth();

    const [currentClaim, setCurrentClaim] = useState(claim);
    const [updating, setUpdating] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [motivoDesaprobado, setMotivoDesaprobado] = useState('');
    const [showDesaprobarPrompt, setShowDesaprobarPrompt] = useState(false);
    const [selectedSupervisor, setSelectedSupervisor] = useState(claim?.supervisor || '');
    const [selectedInocuidad, setSelectedInocuidad] = useState(claim?.estado_inocuidad || 'Sin acciones');

    useEffect(() => {
        if (claim) {
            setCurrentClaim(claim);
            setSelectedSupervisor(claim.supervisor || '');
            setSelectedInocuidad(claim.estado_inocuidad || 'Sin acciones');
        }
    }, [claim]);

    if (!claim) return null;

    const activeClaim = currentClaim || claim;

    const hasSupervisor = Boolean(
        activeClaim.supervisor &&
        activeClaim.supervisor.trim() !== '' &&
        !activeClaim.supervisor.toLowerCase().includes('sin asignar')
    );

    const isEnRecepcion = !activeClaim.estado_admin || activeClaim.estado_admin === 'Pendiente';
    const isEnCurso = activeClaim.estado_admin === 'En curso';
    const isDesaprobado = activeClaim.estado_admin === 'Desaprobado';

    const handlePonerEnCurso = async () => {
        if (!hasSupervisor) {
            alert('Debe asignar un supervisor comercial antes de iniciar la Acción de Compensación.');
            return;
        }

        if (!window.confirm(`¿Iniciar Acción de Compensación para el reclamo #${activeClaim.id}?\n\nEl reclamo pasará a "En curso" y se enviará automáticamente un correo electrónico con instrucciones al supervisor ${activeClaim.supervisor} para entregar la reposición y retribución al consumidor.`)) return;

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(activeClaim.id, 'En curso');
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                estado_admin: 'En curso',
                estado_supervisor: (prev?.estado_supervisor === 'Sin acciones') ? 'Pendiente' : (prev?.estado_supervisor || 'Pendiente')
            }));
            setActionMsg({ type: 'success', text: 'Acción de Compensación iniciada. Se notificó al supervisor con las instrucciones de reposición/retribución.' });
            if (onRefresh) onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error al iniciar Acción de Compensación: ' + (e.response?.data?.error || e.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleDesaprobar = async () => {
        if (!motivoDesaprobado.trim()) {
            alert('Por favor ingresá un motivo de desaprobación.');
            return;
        }

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(activeClaim.id, 'Desaprobado', motivoDesaprobado);
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                estado_admin: 'Desaprobado',
                admin_motivo_desaprobado: motivoDesaprobado,
                estado_supervisor: 'Sin acciones',
                estado_inocuidad: 'Sin acciones',
                estado_consumidor: 'Sin acciones'
            }));
            setActionMsg({ type: 'success', text: 'Reclamo desaprobado y estados derivados pasados a "Sin acciones".' });
            setShowDesaprobarPrompt(false);
            if (onRefresh) onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error: ' + (e.response?.data?.error || e.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleReiniciarFlujo = async () => {
        if (!window.confirm(`¿Reiniciar todo el flujo del reclamo #${activeClaim.id}?\n\nEl reclamo volverá a la etapa inicial de Recepción ("Pendiente"), permitiendo reasignar el supervisor o reevaluar la procedencia.`)) return;

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(activeClaim.id, 'Pendiente');
            await reclamosApi.updateEstadoSupervisor(activeClaim.id, 'Pendiente');
            await reclamosApi.updateEstadoInocuidad(activeClaim.id, 'Pendiente');
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                estado_admin: 'Pendiente',
                estado_supervisor: 'Pendiente',
                estado_inocuidad: 'Pendiente',
                admin_motivo_desaprobado: ''
            }));
            setActionMsg({ type: 'success', text: 'Flujo reiniciado correctamente. El reclamo se encuentra nuevamente en Recepción.' });
            if (onRefresh) onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error al reiniciar flujo: ' + (e.response?.data?.error || e.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleGuardarSupervisor = async () => {
        if (!selectedSupervisor) {
            alert('Por favor seleccione un supervisor de la lista.');
            return;
        }
        const supObj = SUPERVISORES_LISTA.find(s => s.nombre === selectedSupervisor);
        if (!supObj) return;

        if (!window.confirm(`¿Asignar este reclamo al supervisor ${selectedSupervisor}?`)) return;

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateSupervisor(activeClaim.id, supObj.nombre, supObj.email);
            // Actualización inmediata del estado local para reactividad instantánea
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                supervisor: supObj.nombre,
                supervisor_email: supObj.email
            }));
            setSelectedSupervisor(supObj.nombre);
            setActionMsg({ type: 'success', text: `Supervisor asignado a ${selectedSupervisor}.` });
            if (onRefresh) onRefresh();
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Error asignando supervisor: ' + (err.response?.data?.error || err.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleGuardarInocuidad = async () => {
        if (!selectedInocuidad) return;

        if (!window.confirm(`¿Actualizar el dictamen de inocuidad a "${selectedInocuidad}"?`)) return;

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoInocuidad(activeClaim.id, selectedInocuidad);
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                estado_inocuidad: selectedInocuidad
            }));
            setActionMsg({ type: 'success', text: `Estado de inocuidad actualizado a "${selectedInocuidad}".` });
            if (onRefresh) onRefresh();
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Error actualizando inocuidad: ' + (err.response?.data?.error || err.message) });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Reclamo #${activeClaim.id}`}
            maxWidth="850px"
        >
            {actionMsg && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 16,
                    background: actionMsg.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                    color: actionMsg.type === 'success' ? 'var(--success)' : 'var(--error)',
                    fontWeight: 600,
                    fontSize: '0.84rem'
                }}>
                    {actionMsg.text}
                </div>
            )}

            {/* Motivos activos si aplican */}
            {activeClaim.admin_motivo_desaprobado && (
                <div style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 10, borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: '0.82rem' }}>
                    <strong>Motivo de Desaprobación (Admin):</strong> {activeClaim.admin_motivo_desaprobado}
                </div>
            )}
            {activeClaim.supervisor_motivo_imposibilidad && (
                <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: 10, borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: '0.82rem' }}>
                    <strong>Motivo de Imposibilidad (Supervisor):</strong> {activeClaim.supervisor_motivo_imposibilidad}
                </div>
            )}

            {/* DIAGRAMA DE WORKFLOW EN RAMAS */}
            {isAdmin && (
                <div className="workflow-diagram-card">
                    {/* Barra superior con reinicio discreto */}
                    <div className="workflow-top-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Etapa:</span>
                            <StatusBadge status={activeClaim.estado_admin || 'Pendiente'} />
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={handleReiniciarFlujo}
                            disabled={updating}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', gap: 4 }}
                            title="Reiniciar flujo completo: Devuelve el reclamo al estado inicial de Recepción, permitiendo reasignar supervisor o reevaluar el reclamo."
                        >
                            <RotateCcw size={12} />
                            <span>Reiniciar Flujo</span>
                        </button>
                    </div>

                    {/* Formulario desplegable para desaprobar si está activo */}
                    {showDesaprobarPrompt && (
                        <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 }}>
                                Indicar motivo de la desaprobación:
                            </label>
                            <textarea
                                className="form-textarea"
                                rows={2}
                                value={motivoDesaprobado}
                                onChange={(e) => setMotivoDesaprobado(e.target.value)}
                                placeholder="Ej: Falta de evidencia concluyente o fuera del período de vencimiento..."
                                style={{ marginBottom: 8, fontSize: '0.82rem' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-danger" onClick={handleDesaprobar} disabled={updating} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                                    Confirmar Desaprobación
                                </button>
                                <button className="btn btn-secondary" onClick={() => setShowDesaprobarPrompt(false)} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Grilla de Ramas */}
                    <div className="workflow-tree-grid">
                        {/* RAMA 1: RECEPCIÓN Y DESCARTE */}
                        <div className={`wf-branch-card ${isEnRecepcion ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <Clock size={14} style={{ color: 'var(--warning)' }} />
                                <span>1. Ingreso</span>
                            </div>

                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {isEnRecepcion && 'Reclamo pendiente de evaluación administrativa.'}
                                {isDesaprobado && 'Reclamo desaprobado y cerrado.'}
                                {isEnCurso && 'Recepción superada. Reclamo en Acción de Compensación.'}
                            </div>

                            {isEnRecepcion && (
                                <button
                                    className="wf-node-btn wf-danger"
                                    onClick={() => setShowDesaprobarPrompt(true)}
                                    disabled={updating}
                                    title="Desaprobar reclamo: Marca el reclamo como no procedente desde recepción y cancela las derivaciones de compensación."
                                >
                                    <X size={14} />
                                    <span>Desaprobar</span>
                                </button>
                            )}

                            {isDesaprobado && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)', fontSize: '0.78rem', fontWeight: 600 }}>
                                    <X size={14} />
                                    <span>Desaprobado en Recepción</span>
                                </div>
                            )}
                        </div>

                        {/* RAMA 2: ACCIÓN DE COMPENSACIÓN (SUPERVISOR) */}
                        <div className={`wf-branch-card ${isEnCurso ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <Gift size={14} style={{ color: 'var(--primary)' }} />
                                <span>2. Acción de Compensación</span>
                            </div>

                            {/* Asignación de Supervisor */}
                            <div style={{ fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Supervisor: </span>
                                <strong>{activeClaim.supervisor || 'Sin asignar'}</strong>
                            </div>

                            {/* Selector de supervisor disponible si está en recepción */}
                            {isEnRecepcion && (
                                <div className="wf-select-action-row">
                                    <select
                                        value={selectedSupervisor || activeClaim.supervisor || ''}
                                        onChange={(e) => setSelectedSupervisor(e.target.value)}
                                        disabled={updating}
                                    >
                                        <option value="">Seleccionar supervisor...</option>
                                        {SUPERVISORES_LISTA.map(s => (
                                            <option key={s.nombre} value={s.nombre}>{s.nombre}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleGuardarSupervisor}
                                        disabled={updating || !selectedSupervisor || selectedSupervisor === activeClaim.supervisor}
                                        title="Guardar asignación del supervisor para la Acción de Compensación"
                                    >
                                        Asignar
                                    </button>
                                </div>
                            )}

                            {/* Botón de inicio de compensación */}
                            {isEnRecepcion && (
                                <button
                                    className="wf-node-btn wf-primary"
                                    onClick={handlePonerEnCurso}
                                    disabled={updating || !hasSupervisor}
                                    title={!hasSupervisor
                                        ? "Debe asignar un supervisor comercial antes de poder iniciar la Acción de Compensación"
                                        : "Iniciar Acción de Compensación: Dispara el correo de instrucciones al supervisor asignado para entregar la reposición y retribución al consumidor. El estado del supervisor queda en Pendiente para seguimiento automático."}
                                >
                                    <Play size={14} />
                                    <span>Iniciar Compensación</span>
                                </button>
                            )}

                            {/* Derivación y Seguimiento del Supervisor */}
                            {isEnCurso && (
                                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Estado Supervisor:</span>
                                        <StatusBadge status={activeClaim.estado_supervisor} />
                                    </div>
                                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                        {activeClaim.estado_supervisor === 'Pendiente' && 'Supervisor notificado. El sistema enviará recordatorios de seguimiento automático para que confirme la entrega o reporte algún impedimento.'}
                                        {activeClaim.estado_supervisor === 'Resuelto' && 'Compensación entregada y confirmada por el supervisor.'}
                                        {activeClaim.estado_supervisor === 'Imposibilidad' && 'El supervisor reportó un impedimento para concretar la entrega.'}
                                    </div>
                                    {activeClaim.estado_supervisor === 'Resuelto' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.78rem', fontWeight: 600 }}>
                                            <CheckCircle2 size={14} />
                                            <span>Reposición / Cortesía Resuelta</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* RAMA 3: CONTROL DE CALIDAD E INOCUIDAD */}
                        <div className="wf-branch-card">
                            <div className="wf-branch-title">
                                <ShieldAlert size={14} style={{ color: '#8b5cf6' }} />
                                <span>3. Calidad & Inocuidad</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Estado actual:</span>
                                <StatusBadge status={activeClaim.estado_inocuidad} />
                            </div>

                            {(isInocuidad || isAdmin) && (
                                <div className="wf-select-action-row">
                                    <select
                                        value={selectedInocuidad}
                                        onChange={(e) => setSelectedInocuidad(e.target.value)}
                                        disabled={updating}
                                    >
                                        <option value="Sin acciones">Sin acciones</option>
                                        <option value="Pendiente">Pendiente (Notificar)</option>
                                        <option value="Resuelto">Resuelto</option>
                                        <option value="Imposibilidad">Imposibilidad</option>
                                    </select>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleGuardarInocuidad}
                                        disabled={updating || selectedInocuidad === activeClaim.estado_inocuidad}
                                        title="Actualizar y registrar el dictamen de calidad e inocuidad"
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DATOS DEL RECLAMO COMPACTO */}
            <div className="claim-summary-card">
                <div className="claim-summary-header">
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                        Datos del Reclamo
                    </span>
                    {activeClaim.evidencia_zip && (
                        <a
                            href={activeClaim.evidencia_zip}
                            target="_blank"
                            rel="noreferrer"
                            className="claim-link"
                            style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Descargar paquete ZIP con fotos y evidencias enviadas por el consumidor"
                        >
                            <Download size={13} />
                            <span>Evidencias ZIP</span>
                        </a>
                    )}
                </div>

                <div className="claim-info-grid">
                    <div className="claim-info-item">
                        <span className="claim-info-label">Consumidor</span>
                        <span className="claim-info-val">{activeClaim.nombre} {activeClaim.apellido}</span>
                    </div>

                    <div className="claim-info-item">
                        <span className="claim-info-label">Teléfono</span>
                        <span className="claim-info-val">
                            {activeClaim.telefono ? (
                                <a href={`tel:${activeClaim.telefono}`} className="claim-link">
                                    {activeClaim.telefono}
                                </a>
                            ) : 'S/D'}
                        </span>
                    </div>

                    <div className="claim-info-item">
                        <span className="claim-info-label">Email</span>
                        <span className="claim-info-val">
                            {activeClaim.email ? (
                                <a href={`mailto:${activeClaim.email}`} className="claim-link">
                                    {activeClaim.email}
                                </a>
                            ) : 'S/D'}
                        </span>
                    </div>

                    <div className="claim-info-item">
                        <span className="claim-info-label">Ubicación</span>
                        <span className="claim-info-val">
                            {activeClaim.domicilio ? `${activeClaim.domicilio}, ` : ''}{activeClaim.localidad || 'S/D'} ({activeClaim.provincia || 'S/P'})
                        </span>
                    </div>

                    <div className="claim-info-item">
                        <span className="claim-info-label">Comercio</span>
                        <span className="claim-info-val">{activeClaim.comercio_compra || 'S/D'}</span>
                    </div>

                    <div className="claim-info-item">
                        <span className="claim-info-label">Fecha de Carga</span>
                        <span className="claim-info-val">{activeClaim.fecha_carga || activeClaim.fecha_alta || 'S/F'}</span>
                    </div>
                </div>

                {/* PRODUCTOS COMO ITEMS COMPACTOS */}
                <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
                        Productos Reclamados ({activeClaim.items?.length || 0})
                    </span>
                    <table className="claim-products-table">
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>#</th>
                                <th>Producto / Marca</th>
                                <th>Defecto & Detalle</th>
                                <th>Lote / Vto</th>
                                <th>Cortesía</th>
                                <th style={{ textAlign: 'center', width: '50px' }}>Cant.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(activeClaim.items || []).map((item, idx) => (
                                <tr key={idx}>
                                    <td><strong>#{idx + 1}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{item.producto}</div>
                                        {item.marca && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>[{item.marca}]</div>}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item.defecto || 'Sin defecto'}</div>
                                        {item.descripcion && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {item.descripcion}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div>Lote: {item.lote || 'N/A'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vto: {item.vto || 'N/A'}</div>
                                    </td>
                                    <td>
                                        {item.producto_cortesia ? (
                                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>{item.producto_cortesia}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className="badge badge-sin-acciones">{item.cantidad || 1}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};
