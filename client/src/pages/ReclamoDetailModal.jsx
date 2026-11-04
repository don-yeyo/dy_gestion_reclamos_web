import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusBadge } from '../components/StatusBadge';
import { SimuladorTemporalModal } from '../components/SimuladorTemporalModal';
import { reclamosApi, prioridadesApi } from '../services/api';
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
    Gift,
    Loader2,
    AlertTriangle
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

const TIPOS_DESAPROBACION = [
    'No se constata defecto atribuible a elaboración o envasado',
    'Producto con fecha de vencimiento expirada al momento de la compra',
    'Defecto originado por inadecuada conservación en punto de venta',
    'Falta de evidencia probatoria o datos insuficientes de lote',
    'Reclamo duplicado o previamente compensado',
    'Otro motivo administrativo fundado'
];

export const ReclamoDetailModal = ({ claim, isOpen, onClose, onRefresh }) => {
    const { isAdmin, isInocuidad } = useAuth();

    const [currentClaim, setCurrentClaim] = useState(claim);
    const [updating, setUpdating] = useState(false);
    const [loadingTitle, setLoadingTitle] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [actionMsg, setActionMsg] = useState(null);
    const [tipoDesaprobacion, setTipoDesaprobacion] = useState(TIPOS_DESAPROBACION[0]);
    const [motivoDesaprobado, setMotivoDesaprobado] = useState('');
    const [showDesaprobarModal, setShowDesaprobarModal] = useState(false);
    const [selectedSupervisor, setSelectedSupervisor] = useState(claim?.supervisor || '');

    // Prioridad obligatoria al aprobar
    const [showAprobarModal, setShowAprobarModal] = useState(false);
    const [selectedPrioridad, setSelectedPrioridad] = useState(''); // Sin valor por defecto prefijado
    const [prioridades, setPrioridades] = useState([]);
    const [simuladorOpen, setSimuladorOpen] = useState(false);

    // Helper para extraer los ítems de reglas de cortesía configuradas para una prioridad
    const getReglasItems = (p) => {
        if (!p) return [];
        let reglas = p.reglas_cortesia;
        if (typeof reglas === 'string') {
            try { reglas = JSON.parse(reglas); } catch { return [reglas]; }
        }
        if (!Array.isArray(reglas)) return [];
        return reglas
            .map(r => (typeof r === 'string' ? r.trim() : (r?.descripcion || '').trim()))
            .filter(Boolean);
    };

    useEffect(() => {
        prioridadesApi.getAll()
            .then(res => {
                if (res.data?.success && Array.isArray(res.data.prioridades)) {
                    setPrioridades(res.data.prioridades);
                }
            })
            .catch(err => {
                console.error('Error cargando prioridades:', err);
                setPrioridades([
                    { codigo: 10, nombre: 'Alta', descripcion: 'Casos críticos y graves que implican reconocer el error rápidamente', sla: 3, reglas_cortesia: [{ codigo: 'codigo1', descripcion: '1 reemplazo' }, { codigo: 'codigo10_2', descripcion: '2 productos a elección' }, { codigo: 'codigo10_3', descripcion: '2 de kg' }] },
                    { codigo: 20, nombre: 'Media', descripcion: 'Casos leves que no representan un daño importante para el consumidor', sla: 7, reglas_cortesia: [{ codigo: 'codigo2', descripcion: '1 reemplazo' }, { codigo: 'codigo20_2', descripcion: '1 de kg' }] },
                    { codigo: 30, nombre: 'Baja', descripcion: 'Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa', sla: 14, reglas_cortesia: [{ codigo: 'codigo3', descripcion: '1 reemplazo' }] }
                ]);
            });
    }, []);

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
    const isReclamoAprobado = isEnCurso || activeClaim.estado_admin === 'Finalizado';

    const handleAprobarReclamo = () => {
        if (!hasSupervisor) {
            showAlertModal(
                'Supervisor Comercial Requerido',
                'Debe asignar un supervisor comercial antes de poder aprobar el reclamo.',
                'warning'
            );
            return;
        }

        // Control mandatorio: sin valor por defecto prefijado
        setSelectedPrioridad('');
        setShowAprobarModal(true);
    };

    const handleConfirmAprobar = async () => {
        if (!selectedPrioridad) {
            showAlertModal(
                'Prioridad Requerida',
                'Debe seleccionar obligatoriamente un nivel de prioridad según la gravedad del caso para poder avanzar.',
                'warning'
            );
            return;
        }

        const prioridadNum = Number(selectedPrioridad);
        const pObj = prioridades.find(p => Number(p.codigo) === prioridadNum);
        const items = getReglasItems(pObj);
        const reglaAplicada = items.length > 0 ? items.join(' + ') : '1 reemplazo';

        setShowAprobarModal(false);
        setLoadingTitle('Aprobando Reclamo...');
        setLoadingMessage('Despachando notificaciones por correo electrónico al supervisor y Calidad & Inocuidad, y sincronizando con base de datos...');
        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(activeClaim.id, 'En curso', '', '', prioridadNum, reglaAplicada);
            const nowIso = new Date().toISOString();
            const slaDias = pObj?.sla || 7;
            const fechaLimiteSla = new Date(Date.now() + slaDias * 24 * 60 * 60 * 1000).toISOString();

            // Actualizar localmente los ítems del reclamo con la cortesía aplicada
            const updatedItems = (activeClaim.items || []).map(it => ({
                ...it,
                producto_cortesia: reglaAplicada
            }));

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
                admin_motivo_desaprobado: '',
                prioridad: prioridadNum,
                prioridad_nombre: pObj?.nombre || '',
                sla_dias: slaDias,
                fecha_limite_sla: fechaLimiteSla,
                regla_cortesia_aplicada: reglaAplicada,
                items: updatedItems
            }));
            setActionMsg({
                type: 'success',
                text: `Reclamo Aprobado con Prioridad ${pObj?.nombre || prioridadNum}. Se notificó al supervisor comercial y se derivó copia a Calidad & Inocuidad.`
            });
            if (onRefresh) onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error al aprobar reclamo: ' + (e.response?.data?.error || e.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleDesaprobar = async () => {
        if (!motivoDesaprobado.trim()) {
            showAlertModal(
                'Observación Requerida',
                'Por favor ingresá una observación interna para fundamentar la desaprobación antes de continuar.',
                'warning'
            );
            return;
        }

        setLoadingTitle('Desaprobando Reclamo...');
        setLoadingMessage('Registrando motivo formal y cancelando derivaciones en base de datos y Google Sheets...');
        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(activeClaim.id, 'Desaprobado', motivoDesaprobado, tipoDesaprobacion);
            setCurrentClaim(prev => ({
                ...(prev || activeClaim),
                estado_admin: 'Desaprobado',
                admin_motivo_desaprobado: motivoDesaprobado,
                tipo_desaprobacion: tipoDesaprobacion,
                estado_supervisor: 'Sin acciones',
                estado_inocuidad: 'Sin acciones',
                estado_consumidor: 'Cerrado'
            }));
            setActionMsg({ type: 'success', text: 'Reclamo desaprobado: Consumidor pasado a "Cerrado" con motivo tipificado y ramas operativas a "Sin acciones".' });
            setShowDesaprobarModal(false);
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
                setLoadingTitle('Reiniciando Flujo...');
                setLoadingMessage('Restableciendo estados de recepción en Bases de Datos...');
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

    const handleReenviarInocuidad = () => {
        showConfirmModal({
            title: `Reenviar a Calidad & Inocuidad`,
            message: `¿Reenviar el expediente técnico del reclamo #${activeClaim.id} al departamento de Calidad & Inocuidad por correo electrónico?\n\nSe despachará la información técnica completa del producto, lote, defectos y enlaces a evidencias.`,
            variant: 'primary',
            confirmText: 'Reenviar Correo',
            onConfirm: async () => {
                setLoadingTitle('Reenviando a Inocuidad...');
                setLoadingMessage('Despachando expediente completo a Calidad & Inocuidad...');
                setUpdating(true);
                setActionMsg(null);
                try {
                    const res = await reclamosApi.reenviarEmailInocuidad(activeClaim.id);
                    setActionMsg({ type: 'success', text: res.data?.message || 'Expediente reenviado a Calidad & Inocuidad con éxito.' });
                } catch (e) {
                    setActionMsg({ type: 'error', text: 'Error al reenviar correo: ' + (e.response?.data?.error || e.message) });
                } finally {
                    setUpdating(false);
                }
            }
        });
    };

    const handleReenviarSupervisor = () => {
        if (!hasSupervisor) {
            showAlertModal('Supervisor Requerido', 'El reclamo no tiene un supervisor comercial asignado.', 'warning');
            return;
        }
        showConfirmModal({
            title: `Reenviar al Supervisor`,
            message: `¿Reenviar las instrucciones de compensación al supervisor comercial ${activeClaim.supervisor} (${activeClaim.supervisor_email || 'sin email'})?\n\nSe incluirá el domicilio, productos a entregar y enlaces para reportar la gestión.`,
            variant: 'primary',
            confirmText: 'Reenviar Correo',
            onConfirm: async () => {
                setLoadingTitle('Reenviando al Supervisor...');
                setLoadingMessage(`Despachando correo con instrucciones de compensación a ${activeClaim.supervisor}...`);
                setUpdating(true);
                setActionMsg(null);
                try {
                    const res = await reclamosApi.reenviarEmailSupervisor(activeClaim.id);
                    setActionMsg({ type: 'success', text: res.data?.message || `Instrucciones reenviadas con éxito al supervisor ${activeClaim.supervisor}.` });
                } catch (e) {
                    setActionMsg({ type: 'error', text: 'Error al reenviar correo: ' + (e.response?.data?.error || e.message) });
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
                setLoadingTitle('Asignando Supervisor...');
                setLoadingMessage(`Registrando a ${selectedSupervisor}.`);
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
        <>
            <Modal
                isOpen={isOpen}
                onClose={updating ? undefined : onClose}
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

                {/* ALERTA CRÍTICA DE CONFLICTO / POSIBLE FRAUDE COMERCIAL */}
                {activeClaim.en_conflicto && (
                    <div style={{
                        marginBottom: 16,
                        padding: '14px 18px',
                        borderRadius: 'var(--radius-md, 10px)',
                        background: 'rgba(220, 38, 38, 0.12)',
                        border: '2px solid #dc2626',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        color: '#dc2626'
                    }}>
                        <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                🚨 RECLAMO EN CONFLICTO / POSIBLE FRAUDE COMERCIAL
                            </div>
                            <div style={{ fontSize: '0.84rem', color: 'var(--text)', marginTop: 4, lineHeight: 1.45 }}>
                                {activeClaim.conflicto_motivo || 'Discrepancia crítica: El supervisor informó haber entregado la reposición ("Resuelto"), pero el consumidor informó NO haberla recibido ("No resuelto"). Requiere auditoría interna inmediata.'}
                            </div>
                            {activeClaim.fecha_conflicto && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                    Registrado: {formatFechaHoraSutil(activeClaim.fecha_conflicto)}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DIAGRAMA DE WORKFLOW EN RAMAS */}
                {isAdmin && (
                    <div className="workflow-diagram-card">
                        {/* Barra superior con botón de reinicio y simulador temporal */}
                        <div className="workflow-top-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                data-testid="btn-abrir-simulador"
                                onClick={() => setSimuladorOpen(true)}
                                disabled={updating}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.75rem',
                                    gap: 5,
                                    color: '#0d2c5c',
                                    borderColor: '#bfdbfe',
                                    background: '#eff6ff',
                                    fontWeight: 600
                                }}
                                title="Simular el avance en el tiempo del cron y disparar recordatorios a la casilla de pruebas sin alterar Google Sheets."
                            >
                                <Clock size={12} color="#0d2c5c" />
                                <span>⏱️ Simular Avance Temporal (Cron)</span>
                            </button>
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
                                    <StatusBadge status={activeClaim.estado_admin || 'Pendiente'} actor="admin" />
                                </div>

                                {activeClaim.fecha_estado_admin && (
                                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                        {isEnRecepcion ? 'Cargado: ' : (isDesaprobado ? 'Desaprobado: ' : (activeClaim.estado_admin === 'Finalizado' ? 'Finalizado: ' : 'Aprobado: '))}
                                        {formatFechaHoraSutil(activeClaim.fecha_estado_admin)}
                                    </div>
                                )}

                                {/* Desaprobación: Motivo formal al consumidor + Observación interna */}
                                {isDesaprobado && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
                                        {activeClaim.tipo_desaprobacion && (
                                            <div style={{
                                                background: 'rgba(239, 68, 68, 0.12)',
                                                color: 'var(--error)',
                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                padding: '6px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.72rem',
                                                lineHeight: 1.35
                                            }}>
                                                <strong>Motivo Consumidor:</strong> {activeClaim.tipo_desaprobacion}
                                            </div>
                                        )}
                                        {activeClaim.admin_motivo_desaprobado && (
                                            <div style={{
                                                background: 'var(--surface-subtle)',
                                                color: 'var(--text-muted)',
                                                border: '1px solid var(--border)',
                                                padding: '6px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.71rem',
                                                lineHeight: 1.35
                                            }}>
                                                <strong>🔒 Obs. Interna:</strong> {activeClaim.admin_motivo_desaprobado}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                    {isDesaprobado && 'Reclamo desaprobado y cerrado.'}
                                    {isEnCurso && 'Reclamo aprobado y derivado a los sectores correspondientes.'}
                                    {activeClaim.estado_admin === 'Finalizado' && 'Reclamo completado y cerrado exitosamente en todos sus circuitos.'}
                                </div>

                                {/* Detalle de Prioridad y SLA si está aprobado */}
                                {isReclamoAprobado && activeClaim.prioridad_nombre && (
                                    <div style={{
                                        margin: '6px 0',
                                        padding: '6px 8px',
                                        borderRadius: 'var(--radius-sm, 6px)',
                                        background: Number(activeClaim.prioridad) === 10 ? 'rgba(239, 68, 68, 0.12)' : Number(activeClaim.prioridad) === 20 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                        border: `1px solid ${Number(activeClaim.prioridad) === 10 ? 'rgba(239, 68, 68, 0.3)' : Number(activeClaim.prioridad) === 20 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                                        fontSize: '0.72rem',
                                        lineHeight: 1.35
                                    }}>
                                        <div style={{ fontWeight: 700, color: Number(activeClaim.prioridad) === 10 ? 'var(--error)' : Number(activeClaim.prioridad) === 20 ? 'var(--warning)' : 'var(--info)' }}>
                                            Prioridad: {activeClaim.prioridad_nombre} (SLA: {activeClaim.sla_dias || 'N/A'} días)
                                        </div>
                                        {activeClaim.regla_cortesia_aplicada && (
                                            <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                🎁 Cortesía: {activeClaim.regla_cortesia_aplicada}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Botones de acción en recepción: Desaprobar primero, Aprobar por debajo */}
                                {isEnRecepcion && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
                                        <button
                                            className="wf-node-btn wf-danger"
                                            data-testid="btn-abrir-desaprobar"
                                            onClick={() => {
                                                setTipoDesaprobacion(TIPOS_DESAPROBACION[0]);
                                                setMotivoDesaprobado('');
                                                setShowDesaprobarModal(true);
                                            }}
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
                            <div className={`wf-branch-card ${isEnCurso && activeClaim.estado_inocuidad === 'Pendiente' ? 'active' : ''} ${isReclamoAprobado ? 'wf-has-resend' : ''}`}>
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

                                {/* Botón sutil en la esquina inferior derecha para reenviar email a Inocuidad */}
                                {isReclamoAprobado && (
                                    <button
                                        type="button"
                                        className="wf-card-resend-btn"
                                        onClick={handleReenviarInocuidad}
                                        disabled={updating}
                                        title="Reenviar expediente completo por correo a Calidad & Inocuidad"
                                    >
                                        <Mail size={12} />
                                        <span>Reenviar</span>
                                    </button>
                                )}
                            </div>

                            {/* RAMA 3: ACCIÓN DE COMPENSACIÓN (SUPERVISOR) */}
                            <div className={`wf-branch-card ${isEnCurso && activeClaim.estado_supervisor === 'Pendiente' ? 'active' : ''} ${isReclamoAprobado ? 'wf-has-resend' : ''}`}>
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

                                {/* Tipo de Imposibilidad formal del supervisor */}
                                {activeClaim.tipo_imposibilidad && (
                                    <div style={{
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        color: 'var(--warning)',
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                        padding: '6px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.72rem',
                                        lineHeight: 1.35
                                    }}>
                                        <strong>Tipo Imposibilidad (consumidor):</strong> {activeClaim.tipo_imposibilidad}
                                    </div>
                                )}

                                {/* Motivo interno u observacion de imposibilidad del supervisor (confidencial) */}
                                {activeClaim.supervisor_motivo_imposibilidad && (
                                    <div style={{
                                        background: 'var(--surface-subtle)',
                                        color: 'var(--text-muted)',
                                        border: '1px dashed var(--border)',
                                        padding: '6px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.70rem',
                                        lineHeight: 1.35
                                    }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>🔒 Obs. Interna:</span> {activeClaim.supervisor_motivo_imposibilidad}
                                    </div>
                                )}

                                {/* Derivación y Seguimiento del Supervisor UNA VEZ APROBADO */}
                                {isEnCurso && (
                                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                        {activeClaim.estado_supervisor === 'Pendiente' && 'Supervisor notificado por correo electrónico. Seguimiento automático en curso.'}
                                        {activeClaim.estado_supervisor === 'Resuelto' && 'Compensación entregada y confirmada por el supervisor.'}
                                        {activeClaim.estado_supervisor === 'Imposibilidad' && 'El supervisor reportó un impedimento para concretar la entrega.'}
                                        {activeClaim.estado_supervisor === 'Sin acciones' && 'Sin intervenciones pendientes requeridas.'}
                                    </div>
                                )}
                                {isEnCurso && activeClaim.estado_supervisor === 'Resuelto' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.78rem', fontWeight: 600, marginTop: 'auto' }}>
                                        <CheckCircle2 size={14} />
                                        <span>Reposición Entregada</span>
                                    </div>
                                )}

                                {/* Botón sutil en la esquina inferior derecha para reenviar email al Supervisor */}
                                {isReclamoAprobado && (
                                    <button
                                        type="button"
                                        className="wf-card-resend-btn"
                                        onClick={handleReenviarSupervisor}
                                        disabled={updating || !hasSupervisor}
                                        title={!hasSupervisor ? 'Sin supervisor asignado' : `Reenviar correo de instrucciones a ${activeClaim.supervisor}`}
                                    >
                                        <Mail size={12} />
                                        <span>Reenviar</span>
                                    </button>
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
                                    <StatusBadge status={activeClaim.estado_consumidor || (isDesaprobado ? 'Cerrado' : 'Pendiente')} />
                                </div>

                                {activeClaim.fecha_estado_consumidor && !isEnRecepcion && (
                                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                        Actualizado: {formatFechaHoraSutil(activeClaim.fecha_estado_consumidor)}
                                    </div>
                                )}

                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                    {isEnRecepcion && 'En espera de resolución administrativa.'}
                                    {activeClaim.estado_consumidor === 'Cerrado' && (
                                        <span>
                                            Caso cerrado para el consumidor.
                                            {activeClaim.tipo_desaprobacion && ` Motivo: ${activeClaim.tipo_desaprobacion}.`}
                                            {activeClaim.tipo_imposibilidad && ` Imposibilidad informada: ${activeClaim.tipo_imposibilidad}.`}
                                        </span>
                                    )}
                                    {isDesaprobado && activeClaim.estado_consumidor !== 'Cerrado' && 'Caso finalizado sin compensación.'}
                                    {isEnCurso && (activeClaim.estado_consumidor === 'Pendiente' || activeClaim.estado_consumidor === 'En curso') && (
                                        'Reclamo en curso de atención y reposición de producto.'
                                    )}
                                    {isEnCurso && activeClaim.estado_consumidor === 'Resuelto sin confirmar' && (
                                        'El supervisor comercial declaró haber resuelto el caso y entregado la compensación. A la espera de confirmación de recepción y conformidad por parte del consumidor.'
                                    )}
                                    {isEnCurso && activeClaim.estado_consumidor === 'Resuelto' && (
                                        'Reposición y cortesía recibidas por el consumidor.'
                                    )}
                                    {isEnCurso && activeClaim.estado_consumidor === 'Imposibilidad' && (
                                        'No fue posible concretar la entrega al consumidor.'
                                    )}
                                    {(activeClaim.estado_consumidor === 'FSR' || activeClaim.estado_consumidor?.toLowerCase().includes('sin respuesta')) && (
                                        'El consumidor no respondió las solicitudes de seguimiento tras el plazo estipulado (FSR).'
                                    )}
                                    {activeClaim.estado_consumidor?.toLowerCase().includes('conforme') && (
                                        'El consumidor respondió la encuesta de conformidad.'
                                    )}
                                    {activeClaim.estado_consumidor === 'No resuelto' && (
                                        'El consumidor reportó que el reclamo no fue resuelto.'
                                    )}
                                </div>

                                {activeClaim.consumidor_puntuacion > 0 && (
                                    <div style={{
                                        marginTop: 6,
                                        padding: '6px 8px',
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        borderRadius: 6,
                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                        fontSize: '0.75rem',
                                        color: '#f59e0b',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span>Calificación:</span>
                                        <span title={`${activeClaim.consumidor_puntuacion} de 5 estrellas`}>
                                            {'★'.repeat(Number(activeClaim.consumidor_puntuacion))}
                                            {'☆'.repeat(5 - Number(activeClaim.consumidor_puntuacion))} ({activeClaim.consumidor_puntuacion}/5)
                                        </span>
                                    </div>
                                )}

                                {activeClaim.consumidor_tipo_problema && (
                                    <div style={{
                                        marginTop: 6,
                                        padding: '6px 8px',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        borderRadius: 6,
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        fontSize: '0.73rem',
                                        color: '#f87171',
                                        lineHeight: 1.35
                                    }}>
                                        <strong>Problema informado:</strong> {activeClaim.consumidor_tipo_problema}
                                    </div>
                                )}

                                {activeClaim.consumidor_comentario && (
                                    <div style={{
                                        marginTop: 6,
                                        padding: '6px 8px',
                                        background: 'var(--surface-hover)',
                                        borderRadius: 6,
                                        borderLeft: '3px solid #3b82f6',
                                        fontSize: '0.72rem',
                                        color: 'var(--text-secondary)',
                                        fontStyle: 'italic',
                                        lineHeight: 1.35
                                    }}>
                                        "{activeClaim.consumidor_comentario}"
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
                                Productos Reclamados ({activeClaim.items?.length || 0})
                            </span>
                            <span className="mobile-only-hint" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Deslizá horizontalmente para ver más ↔
                            </span>
                        </div>
                        <div className="claim-products-table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: 6, border: '1px solid var(--border)' }}>
                            <table className="claim-products-table" style={{ minWidth: 520, margin: 0 }}>
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
                </div>

                {/* Modal Mandatorio de Selección de Prioridad al Aprobar (Portal a document.body) */}
                {showAprobarModal && typeof document !== 'undefined' && createPortal(
                    <div
                        className="modal-overlay"
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(10, 15, 29, 0.85)',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1350,
                            padding: '12px',
                            overflowY: 'auto'
                        }}
                        onClick={() => setShowAprobarModal(false)}
                    >
                        <div
                            className="modal-content-card glass"
                            style={{
                                maxWidth: 520,
                                width: '100%',
                                maxHeight: 'min(92vh, 680px)',
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: 'var(--radius-lg, 16px)',
                                border: '1px solid var(--border)',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                                overflow: 'hidden'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Cabecera Fija */}
                            <div style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexShrink: 0,
                                background: 'rgba(255, 255, 255, 0.02)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: 'rgba(229, 53, 59, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--primary)',
                                        flexShrink: 0
                                    }}>
                                        <CheckCircle2 size={18} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: 700 }}>
                                            Aprobar Reclamo #{activeClaim.id}
                                        </h3>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            Asignación obligatoria de gravedad y SLA
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAprobarModal(false)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: 6,
                                        borderRadius: 6,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Cerrar"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Cuerpo Scrollable */}
                            <div style={{
                                padding: '16px 20px',
                                overflowY: 'auto',
                                flex: '1 1 auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 14
                            }}>
                                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    Para poner el reclamo en estado <strong>En curso</strong> y derivar las notificaciones al supervisor comercial
                                    y al sector de Calidad & Inocuidad, <strong>es mandatorio seleccionar el nivel de prioridad</strong> según la gravedad del caso.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label htmlFor="select-prioridad-modal" style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        Nivel de Prioridad <span style={{ color: 'var(--error)' }}>*</span>
                                    </label>
                                    <select
                                        id="select-prioridad-modal"
                                        data-testid="select-prioridad"
                                        value={selectedPrioridad}
                                        onChange={e => setSelectedPrioridad(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 'var(--radius-md, 8px)',
                                            background: 'var(--surface-input, #0e1428)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-main)',
                                            fontSize: '0.88rem',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                        required
                                    >
                                        <option value="" disabled>-- Seleccionar nivel de prioridad (obligatorio) --</option>
                                        {prioridades.map(p => (
                                            <option key={p.codigo} value={p.codigo}>
                                                {p.nombre} (SLA: {p.sla} días) — {p.descripcion}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedPrioridad && (() => {
                                    const sel = prioridades.find(p => Number(p.codigo) === Number(selectedPrioridad));
                                    if (!sel) return null;
                                    const items = getReglasItems(sel);
                                    const isAlta = Number(sel.codigo) === 10;
                                    const isMedia = Number(sel.codigo) === 20;
                                    const accentColor = isAlta ? '#ef4444' : isMedia ? '#f59e0b' : '#3b82f6';
                                    const bgBox = isAlta ? 'rgba(239, 68, 68, 0.1)' : isMedia ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)';
                                    const borderBox = isAlta ? 'rgba(239, 68, 68, 0.3)' : isMedia ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)';

                                    return (
                                        <div style={{
                                            padding: '12px 14px',
                                            borderRadius: 'var(--radius-md, 8px)',
                                            background: bgBox,
                                            border: `1px solid ${borderBox}`,
                                            fontSize: '0.82rem',
                                            lineHeight: 1.45,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 6
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                                <div style={{ fontWeight: 700, color: accentColor, textTransform: 'uppercase', fontSize: '0.84rem' }}>
                                                    Prioridad {sel.nombre}
                                                </div>
                                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 4 }}>
                                                    SLA: {sel.sla} días corridos
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                {sel.descripcion}
                                            </div>
                                            <div style={{ marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                                                <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                                                    <span>🎁</span>
                                                    <span>Regalo / Ítems de Cortesía ({items.length}):</span>
                                                </div>
                                                {items.length === 0 ? (
                                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.78rem' }}>
                                                        1 reemplazo (estándar)
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        {items.map((itemTexto, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    background: 'rgba(255,255,255,0.04)',
                                                                    padding: '4px 8px',
                                                                    borderRadius: 6,
                                                                    border: '1px solid rgba(255,255,255,0.06)'
                                                                }}
                                                            >
                                                                <span style={{
                                                                    width: 17,
                                                                    height: 17,
                                                                    borderRadius: '50%',
                                                                    background: accentColor,
                                                                    color: '#ffffff',
                                                                    fontSize: '0.85rem',
                                                                    fontWeight: 700,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                    lineHeight: '17px'
                                                                }}>
                                                                    &bull;
                                                                </span>
                                                                <span style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.8rem' }}>
                                                                    {itemTexto}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Pie con Botones Fijos */}
                            <div style={{
                                padding: '14px 20px',
                                borderTop: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 10,
                                flexShrink: 0,
                                background: 'rgba(255, 255, 255, 0.02)'
                            }}>
                                <button
                                    type="button"
                                    className="wf-node-btn"
                                    onClick={() => setShowAprobarModal(false)}
                                    disabled={updating}
                                    style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className="wf-node-btn wf-primary"
                                    data-testid="btn-confirmar-aprobacion"
                                    onClick={handleConfirmAprobar}
                                    disabled={!selectedPrioridad || updating}
                                    title={!selectedPrioridad ? "Seleccione un nivel de prioridad para avanzar" : "Confirmar y Aprobar Reclamo"}
                                    style={{
                                        opacity: !selectedPrioridad ? 0.5 : 1,
                                        cursor: !selectedPrioridad ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Confirmar y Aprobar</span>
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {/* Submodal Mandatorio de Desaprobación (Portal a document.body) */}
            {showDesaprobarModal && typeof document !== 'undefined' && createPortal(
                <div
                    className="modal-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10, 15, 29, 0.85)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1350,
                        padding: '12px',
                        overflowY: 'auto'
                    }}
                    onClick={() => setShowDesaprobarModal(false)}
                >
                    <div
                        className="modal-content-card glass"
                        style={{
                            maxWidth: 520,
                            width: '100%',
                            maxHeight: 'min(92vh, 680px)',
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 'var(--radius-lg, 16px)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
                            overflow: 'hidden'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Cabecera Fija */}
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexShrink: 0,
                            background: 'rgba(239, 68, 68, 0.06)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--error)',
                                    flexShrink: 0
                                }}>
                                    <X size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: 700 }}>
                                        Desaprobar Reclamo #{activeClaim.id}
                                    </h3>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Resolución administrativa de no procedencia
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDesaprobarModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 6,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Cuerpo Scrollable */}
                        <div style={{
                            padding: '16px 20px',
                            overflowY: 'auto',
                            flex: '1 1 auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14
                        }}>
                            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Al desaprobar el reclamo, el estado del consumidor pasará automáticamente a <strong>Cerrado</strong> con el motivo formal tipificado y se cancelarán las derivaciones de compensación y calidad.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label htmlFor="select-tipo-desaprobacion-modal" style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Tipo de Desaprobación (visible para el consumidor) <span style={{ color: 'var(--error)' }}>*</span>
                                </label>
                                <select
                                    id="select-tipo-desaprobacion-modal"
                                    data-testid="select-tipo-desaprobacion"
                                    value={tipoDesaprobacion}
                                    onChange={(e) => setTipoDesaprobacion(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md, 8px)',
                                        background: 'var(--surface-input, #0e1428)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-main)',
                                        fontSize: '0.88rem',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                    required
                                >
                                    {TIPOS_DESAPROBACION.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label htmlFor="textarea-motivo-desaprobado-modal" style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Observación Interna (🔒 solo visible internamente por el personal) <span style={{ color: 'var(--error)' }}>*</span>
                                </label>
                                <textarea
                                    id="textarea-motivo-desaprobado-modal"
                                    data-testid="textarea-motivo-desaprobado"
                                    rows={3}
                                    value={motivoDesaprobado}
                                    onChange={(e) => setMotivoDesaprobado(e.target.value)}
                                    placeholder="Detalle administrativo interno que fundamenta la decisión técnica o comercial..."
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md, 8px)',
                                        background: 'var(--surface-input, #0e1428)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-main)',
                                        fontSize: '0.88rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        resize: 'vertical'
                                    }}
                                    required
                                />
                            </div>
                        </div>

                        {/* Pie con Botones Fijos */}
                        <div style={{
                            padding: '14px 20px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 10,
                            flexShrink: 0,
                            background: 'rgba(255, 255, 255, 0.02)'
                        }}>
                            <button
                                type="button"
                                className="wf-node-btn"
                                onClick={() => setShowDesaprobarModal(false)}
                                disabled={updating}
                                style={{ background: 'var(--surface-subtle)', color: 'var(--text-muted)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="wf-node-btn wf-danger"
                                data-testid="btn-confirmar-desaprobacion"
                                onClick={handleDesaprobar}
                                disabled={!motivoDesaprobado.trim() || updating}
                                title={!motivoDesaprobado.trim() ? "Ingrese una observación interna para fundamentar" : "Confirmar Desaprobación del Reclamo"}
                                style={{
                                    opacity: !motivoDesaprobado.trim() ? 0.5 : 1,
                                    cursor: !motivoDesaprobado.trim() ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <X size={14} />
                                <span>Confirmar Desaprobación</span>
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

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

                {/* Overlay Bloqueante con Spinner Don Yeyo durante operaciones asíncronas */}
                {updating && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(10, 15, 29, 0.78)',
                            backdropFilter: 'blur(5px)',
                            WebkitBackdropFilter: 'blur(5px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1400,
                            cursor: 'wait'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="modal-content-card glass"
                            style={{
                                padding: '30px 40px',
                                borderRadius: 'var(--radius-lg, 16px)',
                                textAlign: 'center',
                                maxWidth: '440px',
                                width: '90%',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 14
                            }}
                        >
                            <div
                                style={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: '50%',
                                    background: 'rgba(229, 53, 59, 0.12)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <Loader2
                                    size={32}
                                    className="animate-spin"
                                    style={{ color: 'var(--primary, #E5353B)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.15rem', fontWeight: 700 }}>
                                    {loadingTitle || 'Procesando solicitud...'}
                                </h3>

                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                                    {loadingMessage || 'Sincronizando. Por favor no cierre la ventana...'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL SIMULADOR TEMPORAL (Montado como hermano independiente) */}
            {simuladorOpen && (
                <SimuladorTemporalModal
                    isOpen={simuladorOpen}
                    onClose={() => setSimuladorOpen(false)}
                    claimId={activeClaim.id}
                    onClaimUpdated={(nuevosEstados) => {
                        if (nuevosEstados) {
                            setCurrentClaim(prev => ({
                                ...prev,
                                estado_admin: nuevosEstados.admin || prev.estado_admin,
                                estado_supervisor: nuevosEstados.supervisor || prev.estado_supervisor,
                                estado_consumidor: nuevosEstados.consumidor || prev.estado_consumidor
                            }));
                        }
                        if (onUpdate) {
                            onUpdate();
                        }
                    }}
                />
            )}
        </>
    );
};
