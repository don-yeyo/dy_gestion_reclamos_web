import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import {
    AlertTriangle, CheckCircle2, Clock, MapPin, Package,
    ShieldAlert, ArrowRight, Loader2
} from 'lucide-react';

export const ImposibilidadPublic = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tokenData, setTokenData] = useState(null);

    const [motivoOpcion, setMotivoOpcion] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submittedSuccess, setSubmittedSuccess] = useState(false);

    // Modal de alertas estéticas
    const [alertDialog, setAlertDialog] = useState({ isOpen: false, title: '', message: '', variant: 'warning' });

    useEffect(() => {
        const verify = async () => {
            if (!token) {
                setError('No se proporcionó ningún token de acción en el enlace.');
                setLoading(false);
                return;
            }

            try {
                const res = await publicApi.verifyToken(token);
                if (res.data.success) {
                    setTokenData(res.data.payload);
                } else {
                    setError('El enlace es inválido o ha expirado.');
                }
            } catch (err) {
                setError(err.response?.data?.error || 'Enlace inválido o expirado. Por favor comunicate con la administración.');
            } finally {
                setLoading(false);
            }
        };

        verify();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!motivoOpcion) {
            setAlertDialog({
                isOpen: true,
                title: 'Motivo Requerido',
                message: 'Por favor seleccioná el motivo de la imposibilidad antes de confirmar.',
                variant: 'warning'
            });
            return;
        }

        const motivoFinal = observaciones.trim()
            ? `${motivoOpcion} - ${observaciones.trim()}`
            : motivoOpcion;

        setSubmitting(true);
        try {
            const res = await publicApi.submitImposibilidad(token, motivoFinal);
            if (res.data.success) {
                setSubmittedSuccess(true);
            }
        } catch (err) {
            setAlertDialog({
                isOpen: true,
                title: 'Error al Registrar',
                message: err.response?.data?.error || 'Ocurrió un error al registrar el motivo de la imposibilidad.',
                variant: 'danger'
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-dy-bg flex flex-col items-center justify-center p-4">
                <div className="p-8 rounded-2xl bg-dy-card border border-dy-border max-w-md w-full text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-dy-gold mx-auto" />
                    <h2 className="text-lg font-bold text-white">Verificando enlace de acción...</h2>
                    <p className="text-xs text-dy-muted">Comprobando token criptográfico con los servidores de Don Yeyo.</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-dy-bg flex flex-col items-center justify-center p-4">
                <div className="p-8 rounded-2xl bg-dy-card border border-red-500/40 max-w-md w-full text-center space-y-4">
                    <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
                    <h2 className="text-lg font-bold text-white">Enlace no disponible</h2>
                    <p className="text-sm text-red-200">{error}</p>
                    <div className="pt-4 border-t border-dy-border text-xs text-dy-muted">
                        Don Yeyo S.A. &bull; Sistema de Gestión de Reclamos
                    </div>
                </div>
            </div>
        );
    }

    if (submittedSuccess) {
        return (
            <div className="min-h-screen bg-dy-bg flex flex-col items-center justify-center p-4">
                <div className="p-8 rounded-2xl bg-dy-card border border-emerald-500/40 max-w-md w-full text-center space-y-4">
                    <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
                    <h2 className="text-xl font-bold text-white">Imposibilidad Registrada</h2>
                    <p className="text-sm text-dy-text">
                        Hemos registrado correctamente la imposibilidad de entrega para el reclamo <strong>#{tokenData?.reclamoId}</strong>.
                    </p>
                    <p className="text-xs text-dy-muted">
                        La administración de Don Yeyo ha sido notificada para revisar el caso y coordinar una solución alternativa.
                    </p>
                    <div className="pt-4 border-t border-dy-border text-xs text-dy-muted">
                        Podés cerrar esta ventana de forma segura.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dy-bg flex flex-col items-center justify-center p-4 py-8">
            <div className="max-w-xl w-full rounded-2xl bg-dy-card border border-dy-border p-6 md:p-8 space-y-6 shadow-2xl">
                {/* Cabecera */}
                <div className="border-b border-dy-border pb-4">
                    <div className="text-xs uppercase tracking-wider text-dy-gold font-bold mb-1">
                        Don Yeyo S.A. &bull; Portal de Supervisión
                    </div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-7 h-7 text-amber-400 flex-shrink-0" />
                        Informar Imposibilidad de Entrega
                    </h1>
                    <p className="text-xs text-dy-muted mt-1">
                        Reclamo número <span className="font-bold text-dy-gold">#{tokenData?.reclamoId}</span>
                    </p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                            Seleccioná el motivo principal de la imposibilidad: <span className="text-amber-400">*</span>
                        </label>
                        <select
                            value={motivoOpcion}
                            onChange={(e) => setMotivoOpcion(e.target.value)}
                            required
                            className="w-full px-3 py-2.5 rounded-lg bg-dy-surface border border-dy-border text-white text-sm focus:border-dy-gold focus:outline-none"
                        >
                            <option value="">-- Seleccionar motivo --</option>
                            <option value="Falta de stock del producto cortesía">Falta de stock del producto de cortesía</option>
                            <option value="Zona inaccesible / fuera de recorrido habitual">Zona inaccesible / fuera de recorrido habitual</option>
                            <option value="Domicilio incorrecto / no localizado">Domicilio incorrecto o no localizado</option>
                            <option value="Consumidor ausente en reiteradas visitas">Consumidor ausente en reiteradas visitas</option>
                            <option value="Consumidor rechazó la visita / cortesía">Consumidor rechazó la visita / cortesía</option>
                            <option value="Otro motivo">Otro motivo (especificar en observaciones)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                            Observaciones adicionales o detalle:
                        </label>
                        <textarea
                            rows={4}
                            value={observaciones}
                            onChange={(e) => setObservaciones(e.target.value)}
                            placeholder="Describí brevemente lo sucedido para que administración pueda contactar al consumidor..."
                            className="w-full px-3 py-2 rounded-lg bg-dy-surface border border-dy-border text-white text-sm placeholder-dy-muted focus:border-dy-gold focus:outline-none"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={submitting || !motivoOpcion}
                            className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Registrando...
                                </>
                            ) : (
                                <>
                                    Confirmar Imposibilidad
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <div className="text-[11px] text-center text-dy-muted border-t border-dy-border pt-3">
                    Acción validada criptográficamente para el supervisor asignado.
                </div>
            </div>

            {/* Modal de alerta para validaciones o errores */}
            <ConfirmModal
                isOpen={alertDialog.isOpen}
                onClose={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))}
                title={alertDialog.title}
                message={alertDialog.message}
                type="alert"
                variant={alertDialog.variant}
            />
        </div>
    );
};
