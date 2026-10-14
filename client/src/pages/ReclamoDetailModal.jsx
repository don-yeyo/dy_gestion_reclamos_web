import React, { useState, useEffect } from 'react';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
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

function formatFechaHoraSutil(isoStr) {
    if (!isoStr) return null;
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return null;
    }
}

export const ReclamoDetailModal = ({ claim, isOpen, onClose, onRefresh }) => {
    const { isAdmin, isInocuidad } = useAuth();

    const [currentClaim, setCurrentClaim] = useState(claim);
    const [updating, setUpdating] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [motivoDesaprobado, setMotivoDesaprobado] = useState('');
    const [showDesaprobarPrompt, setShowDesaprobarPrompt] = useState(false);
    const [selectedSupervisor, setSelectedSupervisor] = useState(claim?.supervisor || '');

    // Modal de diálogo (reemplaza alert y confirm de JS nativo)
    const [dialogConfig, setDialogConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'confirm', // 'confirm' | 'alert'
        variant: 'primary', // 'primary' | 'danger' | 'warning' | 'info' | 'success'
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: null
    });

    const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

    const showAlertModal = (title, message, variant = 'warning') => {
        setDialogConfig({
            isOpen: true,
            title,
            message,
            type: 'alert',
            variant,
            confirmText: 'Entendido',
            onConfirm: () => closeDialog()
        });
    };

    const showConfirmModal = ({ title, message, variant = 'primary', confirmText = 'Confirmar', cancelText = 'Cancelar', onConfirm }) => {
        setDialogConfig({
            isOpen: true,
            title,
            message,
            type: 'confirm',
            variant,
            confirmText,
            cancelText,
            onConfirm: async () => {
                closeDialog();
                if (onConfirm) await onConfirm();
            }
        });
    };

    useEffect(() => {
        if (claim) {
            setCurrentClaim(claim);
            setSelectedSupervisor(claim.supervisor || '');
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
    const isEnCurso = activeClaim.estado_admin === 'En curso' || activeClaim.estado_admin === 'Aprobado';
    const isDesaprobado = activeClaim.estado_admin === 'Desaprobado';

    const handleAprobarReclamo = () => {
        if (!hasSupervisor) {
            showAlertModal(
                'Supervisor Comercial Requerido',
                'Debe asignar un supervisor comercial antes de poder aprobar el reclamo.',
                'warning'
            );
            return;
        }

        showConfirmModal({
            title: `Aprobar Reclamo #${activeClaim.id}`,
            message: `¿Aprobar el Reclamo #${activeClaim.id}?\n\n` +
                `• Se notificará por correo al supervisor ${activeClaim.supervisor} con las instrucciones de entrega de reposición y cortesía.\n` +
                `• Se enviará copia completa del expediente al departamento de Calidad & Inocuidad para su investigación técnica.\n` +
                `• Ambos estados pasarán a "Pendiente" y el reclamo quedará En curso.`,
            variant: 'primary',
            confirmText: 'Aprobar Reclamo',
            onConfirm: async () => {
                setUpdating(true);
                setActionMsg(null);
                try {
                    await reclamosApi.updateEstadoAdmin(activeClaim.id, 'En curso');
                    const nowIso = new Date().toISOString();
                    setCurrentClaim(prev => ({
                        ...(prev || activeClaim),
                        estado_admin: 'En curso',
                        fecha_estado_admin: nowIso,
                        estado_supervisor: 'Pendiente',
                        fecha_estado_supervisor: nowIso,
                        estado_inocuidad: 'Pendiente',
                        fecha_estado_inocuidad: nowIso,
                        estado_consumidor: 'En curso',
                        fecha_estado_consumidor: nowIso,
                        admin_motivo_desaprobado: ''
                    }));
                    setActionMsg({
                        type: 'success',
                        text: 'Reclamo Aprobado con éxito. Se notificó al supervisor comercial y se derivó copia a Calidad & Inocuidad.'
                    });
                    if (onRefresh) onRefresh();
                } catch (e) {
                    setActionMsg({ type: 'error', text: 'Error al aprobar reclamo: ' + (e.response?.data?.error || e.message) });
                } finally {
                    setUpdating(false);
                }
            }
        });
    };

    const handleDesaprobar = async () => {
        if (!motivoDesaprobado.trim()) {
            showAlertModal(
                'Motivo Requerido',
                'Por favor ingresá un motivo de desaprobación antes de continuar.',
                'warning'
            );
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

    const handleReiniciarFlujo = () => {
        showConfirmModal({
            title: 'Reiniciar Flujo del Reclamo',
            message: `¿Reiniciar todo el flujo del reclamo #${activeClaim.id}?\n\nEl reclamo volverá a la etapa inicial de Recepción ("Pendiente"), permitiendo reasignar el supervisor o reevaluar la procedencia.`,
            variant: 'danger',
            confirmText: 'Reiniciar Flujo',
            onConfirm: async () => {
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
            }
        });
    };

    const handleGuardarSupervisor = () => {
        if (!selectedSupervisor) {
            showAlertModal(
                'Selección Requerida',
                'Por favor seleccione un supervisor de la lista.',
                'warning'
            );
            return;
        }
        const supObj = SUPERVISORES_LISTA.find(s => s.nombre === selectedSupervisor);
        if (!supObj) return;

        showConfirmModal({
            title: 'Asignar Supervisor Comercial',
            message: `¿Desea asignar este reclamo al supervisor ${selectedSupervisor}?`,
            variant: 'primary',
            confirmText: 'Asignar',
            onConfirm: async () => {
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
            }
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Reclamo #${activeClaim.id}`}
            maxWidth="1000px"
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

            {/* DIAGRAMA DE WORKFLOW EN RAMAS */}
            {isAdmin && (
                <div className="workflow-diagram-card">
                    {/* Barra superior solo con botón discreto de reinicio */}
                    <div className="workflow-top-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
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

                    {/* Grilla de 4 Ramas */}
                    <div className="workflow-tree-grid">
                        {/* RAMA 1: INGRESO */}
                        <div className={`wf-branch-card ${isEnRecepcion ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <Clock size={14} style={{ color: 'var(--warning)' }} />
                                <span>1. Ingreso</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
                                <StatusBadge status={activeClaim.estado_admin || 'Pendiente'} />
                            </div>

                            {activeClaim.fecha_estado_admin && (
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                    {isEnRecepcion ? 'Cargado: ' : (isDesaprobado ? 'Desaprobado: ' : 'Aprobado: ')}
                                    {formatFechaHoraSutil(activeClaim.fecha_estado_admin)}
                                </div>
                            )}

                            {/* Motivo de desaprobación si existe */}
                            {activeClaim.admin_motivo_desaprobado && (
                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    color: 'var(--error)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    padding: '6px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.72rem',
                                    lineHeight: 1.35
                                }}>
                                    <strong>Motivo:</strong> {activeClaim.admin_motivo_desaprobado}
                                </div>
                            )}

                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                {isDesaprobado && 'Reclamo desaprobado y cerrado.'}
                                {isEnCurso && 'Reclamo aprobado y derivado a los sectores correspondientes.'}
                            </div>

                            {/* Botones de acción en recepción: Desaprobar primero, Aprobar por debajo */}
                            {isEnRecepcion && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
                                    <button
                                        className="wf-node-btn wf-danger"
                                        onClick={() => setShowDesaprobarPrompt(true)}
                                        disabled={updating}
                                        title="Desaprobar reclamo: Marca el reclamo como no procedente desde recepción y cancela las derivaciones de compensación e inocuidad."
                                    >
                                        <X size={14} />
                                        <span>Desaprobar</span>
                                    </button>

                                    <button
                                        className="wf-node-btn wf-primary"
                                        onClick={handleAprobarReclamo}
                                        disabled={updating || !hasSupervisor}
                                        title={!hasSupervisor
                                            ? "Debe asignar un supervisor comercial antes de poder aprobar el reclamo"
                                            : "Aprobar: Notifica por correo al supervisor comercial con instrucciones de compensación y despacha copia a Calidad & Inocuidad con el expediente técnico."}
                                    >
                                        <CheckCircle2 size={14} />
                                        <span>Aprobar</span>
                                    </button>
                                    {!hasSupervisor && (
                                        <span style={{ fontSize: '0.68rem', color: 'var(--warning)', lineHeight: 1.25 }}>
                                            * Asigná supervisor en paso 3 para aprobar
                                        </span>
                                    )}
                                </div>
                            )}

                            {isDesaprobado && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)', fontSize: '0.78rem', fontWeight: 600, marginTop: 'auto' }}>
                                    <X size={14} />
                                    <span>Desaprobado</span>
                                </div>
                            )}
                        </div>

                        {/* RAMA 2: CONTROL DE CALIDAD E INOCUIDAD */}
                        <div className={`wf-branch-card ${isEnCurso && activeClaim.estado_inocuidad === 'Pendiente' ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <ShieldAlert size={14} style={{ color: '#8b5cf6' }} />
                                <span>2. Calidad & Inocuidad</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
                                <StatusBadge status={isEnRecepcion || isDesaprobado ? 'Sin acciones' : (activeClaim.estado_inocuidad || 'Sin acciones')} />
                            </div>

                            {activeClaim.fecha_estado_inocuidad && !isEnRecepcion && (
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                    Actualizado: {formatFechaHoraSutil(activeClaim.fecha_estado_inocuidad)}
                                </div>
                            )}

                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                {isEnRecepcion && 'El expediente se remitirá a Inocuidad automáticamente cuando el reclamo sea aprobado.'}
                                {isDesaprobado && 'Sin intervención técnica requerida.'}
                                {isEnCurso && (activeClaim.estado_inocuidad === 'Pendiente' || !activeClaim.estado_inocuidad) && (
                                    'Expediente recibido por Calidad & Inocuidad. Investigación de lote y producto en proceso.'
                                )}
                                {isEnCurso && activeClaim.estado_inocuidad === 'Resuelto' && (
                                    'Análisis técnico completado y conformidad de calidad registrada.'
                                )}
                                {isEnCurso && activeClaim.estado_inocuidad === 'Imposibilidad' && (
                                    'Calidad & Inocuidad informó observaciones o imposibilidad de verificación.'
                                )}
                            </div>
                        </div>

                        {/* RAMA 3: ACCIÓN DE COMPENSACIÓN (SUPERVISOR) */}
                        <div className={`wf-branch-card ${isEnCurso && activeClaim.estado_supervisor === 'Pendiente' ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <Gift size={14} style={{ color: 'var(--primary)' }} />
                                <span>3. Acción de Compensación</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
                                <StatusBadge status={isEnRecepcion || isDesaprobado ? 'Sin acciones' : (activeClaim.estado_supervisor || 'Pendiente')} />
                            </div>

                            {activeClaim.fecha_estado_supervisor && !isEnRecepcion && (
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                    Actualizado: {formatFechaHoraSutil(activeClaim.fecha_estado_supervisor)}
                                </div>
                            )}

                            {/* Supervisor asignado */}
                            <div style={{ fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Supervisor: </span>
                                <strong>{activeClaim.supervisor || 'Sin asignar'}</strong>
                                {activeClaim.supervisor_email && (
                                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                        {activeClaim.supervisor_email}
                                    </div>
                                )}
                            </div>

                            {/* Selector de supervisor disponible SOLO si está en recepción (antes de ser aprobado) */}
                            {isEnRecepcion && (
                                <div className="wf-select-action-row" style={{ marginTop: 'auto' }}>
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
                                        title="Guardar asignación del supervisor"
                                    >
                                        Asignar
                                    </button>
                                </div>
                            )}

                            {/* Motivo de imposibilidad del supervisor si existe */}
                            {activeClaim.supervisor_motivo_imposibilidad && (
                                <div style={{
                                    background: 'rgba(245, 158, 11, 0.12)',
                                    color: 'var(--warning)',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                    padding: '6px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.72rem',
                                    lineHeight: 1.35
                                }}>
                                    <strong>Motivo Imposibilidad:</strong> {activeClaim.supervisor_motivo_imposibilidad}
                                </div>
                            )}

                            {/* Derivación y Seguimiento del Supervisor UNA VEZ APROBADO */}
                            {isEnCurso && (
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                    {activeClaim.estado_supervisor === 'Pendiente' && 'Supervisor notificado por correo electrónico. Seguimiento automático en curso.'}
                                    {activeClaim.estado_supervisor === 'Resuelto' && 'Compensación entregada y confirmada por el supervisor.'}
                                    {activeClaim.estado_supervisor === 'Imposibilidad' && 'El supervisor reportó un impedimento para concretar la entrega.'}
                                </div>
                            )}
                            {isEnCurso && activeClaim.estado_supervisor === 'Resuelto' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.78rem', fontWeight: 600, marginTop: 'auto' }}>
                                    <CheckCircle2 size={14} />
                                    <span>Reposición Entregada</span>
                                </div>
                            )}
                        </div>

                        {/* RAMA 4: CONSUMIDOR */}
                        <div className={`wf-branch-card ${isEnCurso && activeClaim.estado_consumidor === 'En curso' ? 'active' : ''}`}>
                            <div className="wf-branch-title">
                                <User size={14} style={{ color: '#3b82f6' }} />
                                <span>4. Consumidor</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
                                <StatusBadge status={isDesaprobado ? 'Sin acciones' : (activeClaim.estado_consumidor || 'Pendiente')} />
                            </div>

                            {activeClaim.fecha_estado_consumidor && !isEnRecepcion && (
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                    Actualizado: {formatFechaHoraSutil(activeClaim.fecha_estado_consumidor)}
                                </div>
                            )}

                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                {isEnRecepcion && 'En espera de resolución administrativa.'}
                                {isDesaprobado && 'Caso finalizado sin compensación.'}
                                {isEnCurso && (activeClaim.estado_consumidor === 'Pendiente' || activeClaim.estado_consumidor === 'En curso') && (
                                    'Reclamo en curso de atención y reposición de producto.'
                                )}
                                {isEnCurso && activeClaim.estado_consumidor === 'Resuelto' && (
                                    'Reposición y cortesía recibidas por el consumidor.'
                                )}
                                {isEnCurso && activeClaim.estado_consumidor === 'Imposibilidad' && (
                                    'No fue posible concretar la entrega al consumidor.'
                                )}
                            </div>
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

            {/* Modal de Alerta / Confirmación Estilo Don Yeyo */}
            <ConfirmModal
                isOpen={dialogConfig.isOpen}
                onClose={closeDialog}
                onConfirm={dialogConfig.onConfirm}
                title={dialogConfig.title}
                message={dialogConfig.message}
                type={dialogConfig.type}
                variant={dialogConfig.variant}
                confirmText={dialogConfig.confirmText}
                cancelText={dialogConfig.cancelText}
                loading={updating}
            />
        </Modal>
    );
};
