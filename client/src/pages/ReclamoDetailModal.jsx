import React, { useState } from 'react';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { reclamosApi } from '../services/api';
import { useAuth } from '../config/AuthContext';
import { MapPin, Phone, Mail, Store, Package, Download, Check, X, ShieldAlert, User, AlertCircle } from 'lucide-react';

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

    const [updating, setUpdating] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [motivoDesaprobado, setMotivoDesaprobado] = useState('');
    const [showDesaprobarPrompt, setShowDesaprobarPrompt] = useState(false);
    const [selectedSupervisor, setSelectedSupervisor] = useState(claim?.supervisor || '');

    if (!claim) return null;

    const handleAprobar = async () => {
        if (!window.confirm(`¿Aprobar el reclamo #${claim.id}? Esto enviará automáticamente el email de acción al supervisor ${claim.supervisor}.`)) return;

        setUpdating(true);
        setActionMsg(null);
        try {
            await reclamosApi.updateEstadoAdmin(claim.id, 'Aprobado');
            setActionMsg({ type: 'success', text: 'Reclamo aprobado y acción enviada al supervisor.' });
            onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error al aprobar: ' + (e.response?.data?.error || e.message) });
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
            await reclamosApi.updateEstadoAdmin(claim.id, 'Desaprobado', motivoDesaprobado);
            setActionMsg({ type: 'success', text: 'Reclamo desaprobado y estados derivados pasados a "Sin acciones".' });
            setShowDesaprobarPrompt(false);
            onRefresh();
        } catch (e) {
            setActionMsg({ type: 'error', text: 'Error: ' + (e.response?.data?.error || e.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleReasignarSupervisor = async (e) => {
        const supNombre = e.target.value;
        setSelectedSupervisor(supNombre);
        const supObj = SUPERVISORES_LISTA.find(s => s.nombre === supNombre);
        if (!supObj) return;

        if (!window.confirm(`¿Reasignar este reclamo al supervisor ${supNombre}?`)) return;

        setUpdating(true);
        try {
            await reclamosApi.updateSupervisor(claim.id, supObj.nombre, supObj.email);
            setActionMsg({ type: 'success', text: `Supervisor cambiado a ${supNombre}.` });
            onRefresh();
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Error reasignando: ' + (err.response?.data?.error || err.message) });
        } finally {
            setUpdating(false);
        }
    };

    const handleChangeInocuidad = async (e) => {
        const nuevoEstado = e.target.value;
        setUpdating(true);
        try {
            await reclamosApi.updateEstadoInocuidad(claim.id, nuevoEstado);
            setActionMsg({ type: 'success', text: `Estado de inocuidad actualizado a ${nuevoEstado}.` });
            onRefresh();
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Detalle de Reclamo #${claim.id}`}
            maxWidth="850px"
        >
            {actionMsg && (
                <div style={{
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 16,
                    background: actionMsg.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                    color: actionMsg.type === 'success' ? '#065f46' : '#b91c1c',
                    fontWeight: 500,
                    fontSize: '0.9rem'
                }}>
                    {actionMsg.text}
                </div>
            )}

            {/* Estados actuales */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, padding: 14, background: 'var(--surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div><strong>Admin:</strong> <StatusBadge status={claim.estado_admin} /></div>
                <div><strong>Supervisor:</strong> <StatusBadge status={claim.estado_supervisor} /></div>
                <div><strong>Consumidor:</strong> <StatusBadge status={claim.estado_consumidor} /></div>
                <div><strong>Inocuidad:</strong> <StatusBadge status={claim.estado_inocuidad} /></div>
            </div>

            {/* Motivos si aplican */}
            {claim.admin_motivo_desaprobado && (
                <div style={{ background: 'var(--error-bg)', padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: '0.88rem' }}>
                    <strong>Motivo de Desaprobación (Admin):</strong> {claim.admin_motivo_desaprobado}
                </div>
            )}
            {claim.supervisor_motivo_imposibilidad && (
                <div style={{ background: '#fef3c7', padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: '0.88rem', border: '1px solid #fde68a' }}>
                    <strong>Motivo de Imposibilidad (Supervisor):</strong> {claim.supervisor_motivo_imposibilidad}
                </div>
            )}

            {/* Panel de Decisiones de Administración */}
            {isAdmin && (
                <div style={{ background: 'var(--surface)', border: '2px solid var(--dy-blue)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 24 }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--dy-blue)' }}>Acciones de Administración</h4>

                    {!showDesaprobarPrompt ? (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-success"
                                onClick={handleAprobar}
                                disabled={updating || claim.estado_admin === 'Aprobado'}
                            >
                                <Check size={16} />
                                <span>Aprobar Reclamo e Indicar Acción a Supervisor</span>
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => setShowDesaprobarPrompt(true)}
                                disabled={updating || claim.estado_admin === 'Desaprobado'}
                            >
                                <X size={16} />
                                <span>Desaprobar Reclamo</span>
                            </button>
                        </div>
                    ) : (
                        <div style={{ marginTop: 10 }}>
                            <label className="form-label">Indicar motivo de desaprobación:</label>
                            <textarea
                                className="form-textarea"
                                rows={3}
                                value={motivoDesaprobado}
                                onChange={(e) => setMotivoDesaprobado(e.target.value)}
                                placeholder="Ej: Información del producto ilegible o fuera de política de garantía..."
                            />
                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button className="btn btn-danger" onClick={handleDesaprobar} disabled={updating}>
                                    Confirmar Desaprobación
                                </button>
                                <button className="btn btn-secondary" onClick={() => setShowDesaprobarPrompt(false)}>
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Datos del Consumidor */}
            <div style={{ marginBottom: 24 }}>
                <h4 style={{ color: 'var(--dy-blue)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>
                    Datos del Consumidor
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: '0.9rem' }}>
                    <div><strong>Nombre:</strong> {claim.nombre} {claim.apellido}</div>
                    <div><Phone size={14} style={{ display: 'inline', marginRight: 4 }} /> <strong>Teléfono:</strong> <a href={`tel:${claim.telefono}`}>{claim.telefono}</a></div>
                    <div><Mail size={14} style={{ display: 'inline', marginRight: 4 }} /> <strong>Email:</strong> {claim.email}</div>
                    <div><MapPin size={14} style={{ display: 'inline', marginRight: 4 }} /> <strong>Domicilio:</strong> {claim.domicilio} ({claim.localidad}, {claim.provincia})</div>
                    {claim.comercio_compra && (
                        <div><Store size={14} style={{ display: 'inline', marginRight: 4 }} /> <strong>Comercio de compra:</strong> {claim.comercio_compra}</div>
                    )}
                    <div><strong>Fecha de carga:</strong> {claim.fecha_carga || claim.fecha_alta}</div>
                </div>
            </div>

            {/* Gestión del Supervisor */}
            <div style={{ marginBottom: 24, padding: 14, background: 'var(--surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                        <h4 style={{ margin: 0, color: 'var(--dy-blue)' }}>Supervisor Comercial Asignado</h4>
                        <span style={{ fontSize: '0.9rem' }}>{claim.supervisor} ({claim.supervisor_email})</span>
                    </div>
                    {isAdmin && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Reasignar:</label>
                            <select
                                className="form-select"
                                value={selectedSupervisor}
                                onChange={handleReasignarSupervisor}
                                disabled={updating}
                                style={{ width: 'auto' }}
                            >
                                {SUPERVISORES_LISTA.map(s => (
                                    <option key={s.nombre} value={s.nombre}>{s.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Gestión de Inocuidad */}
            {(isInocuidad || isAdmin) && (
                <div style={{ marginBottom: 24, padding: 14, background: 'rgba(139, 92, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                            <h4 style={{ margin: 0, color: '#6d28d9' }}>Control de Inocuidad y Calidad</h4>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Al pasar a "Pendiente", se notifica a Inocuidad con los materiales del caso.
                            </span>
                        </div>
                        <select
                            className="form-select"
                            value={claim.estado_inocuidad}
                            onChange={handleChangeInocuidad}
                            disabled={updating}
                            style={{ width: 'auto' }}
                        >
                            <option value="Sin acciones">Sin acciones</option>
                            <option value="Pendiente">Pendiente (Notificar equipo)</option>
                            <option value="Resuelto">Resuelto</option>
                            <option value="Imposibilidad">Imposibilidad</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Productos reclamados */}
            <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: 'var(--dy-blue)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>
                    Productos Reclamados ({claim.items.length})
                </h4>
                {claim.items.map((item, idx) => (
                    <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong style={{ fontSize: '1rem', color: 'var(--dy-blue)' }}>
                                #{idx + 1} [{item.marca}] {item.producto}
                            </strong>
                            <span className="badge badge-sin-acciones">Cantidad: {item.cantidad}</span>
                        </div>
                        <p style={{ margin: '4px 0', fontSize: '0.88rem' }}><strong>Defecto encontrado:</strong> {item.defecto}</p>
                        <p style={{ margin: '4px 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}><strong>Descripción:</strong> {item.descripcion}</p>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            <span>Lote: {item.lote || 'N/A'}</span>
                            <span>Hora: {item.hora || 'N/A'}</span>
                            <span>Vencimiento: {item.vto || 'N/A'}</span>
                            <span>Conserva envase: {item.conserva_envase}</span>
                            {item.producto_cortesia && (
                                <span style={{ color: '#047857', fontWeight: 600 }}>Cortesía: {item.producto_cortesia}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Evidencias multimedia */}
            {claim.evidencia_zip && (
                <div style={{ marginTop: 16, padding: 14, background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><strong>Evidencias Multimedia:</strong> Archivos fotográficos y videos adjuntados por el cliente.</span>
                    <a
                        href={claim.evidencia_zip}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                    >
                        <Download size={16} />
                        <span>Descargar ZIP</span>
                    </a>
                </div>
            )}
        </Modal>
    );
};
