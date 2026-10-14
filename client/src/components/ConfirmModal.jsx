import React from 'react';
import { X, AlertTriangle, CheckCircle2, AlertCircle, Info, HelpCircle } from 'lucide-react';

/**
 * Modal corporativo reutilizable para Confirmaciones y Alertas
 * Diseñado conforme al estándar visual Don Yeyo S.A. (glassmorphism, dark/light theme adaptable)
 */
export const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirmación',
    message,
    children,
    type = 'confirm', // 'confirm' o 'alert'
    variant = 'primary', // 'primary' | 'danger' | 'warning' | 'info' | 'success'
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    loading = false,
    maxWidth = '460px'
}) => {
    if (!isOpen) return null;

    const iconMap = {
        primary: <HelpCircle size={24} style={{ color: 'var(--primary, #E5353B)' }} />,
        danger: <AlertCircle size={24} style={{ color: 'var(--error, #ef4444)' }} />,
        warning: <AlertTriangle size={24} style={{ color: 'var(--warning, #f59e0b)' }} />,
        success: <CheckCircle2 size={24} style={{ color: 'var(--success, #10b981)' }} />,
        info: <Info size={24} style={{ color: '#3b82f6' }} />
    };

    const iconBgMap = {
        primary: 'rgba(229, 53, 59, 0.12)',
        danger: 'rgba(239, 68, 68, 0.12)',
        warning: 'rgba(245, 158, 11, 0.12)',
        success: 'rgba(16, 185, 129, 0.12)',
        info: 'rgba(59, 130, 246, 0.12)'
    };

    const confirmBtnClass = variant === 'danger'
        ? 'btn btn-danger'
        : (variant === 'warning' ? 'btn btn-primary' : 'btn btn-primary');

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        } else if (onClose) {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={loading ? undefined : onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content-card glass"
                style={{
                    maxWidth,
                    width: '90%',
                    padding: '24px',
                    borderRadius: 'var(--radius-lg, 16px)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
                    border: '1px solid var(--border)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: iconBgMap[variant] || iconBgMap.primary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        {iconMap[variant] || iconMap.primary}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                            margin: '0 0 6px 0',
                            color: 'var(--text, #f8fafc)',
                            fontSize: '1.1rem',
                            fontWeight: 700
                        }}>
                            {title}
                        </h3>

                        {message && (
                            <div style={{
                                color: 'var(--text-muted, #94a3b8)',
                                fontSize: '0.88rem',
                                lineHeight: 1.55,
                                whiteSpace: 'pre-line'
                            }}>
                                {message}
                            </div>
                        )}

                        {children && (
                            <div style={{ marginTop: 10 }}>
                                {children}
                            </div>
                        )}
                    </div>

                    {!loading && (
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                padding: 4,
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="Cerrar"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                    marginTop: 22,
                    paddingTop: 14,
                    borderTop: '1px solid var(--border)'
                }}>
                    {type === 'confirm' && (
                        <button
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                            style={{ minWidth: 90 }}
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        className={confirmBtnClass}
                        onClick={handleConfirm}
                        disabled={loading}
                        style={{ minWidth: 100 }}
                    >
                        {loading ? 'Procesando...' : (type === 'confirm' ? confirmText : 'Entendido')}
                    </button>
                </div>
            </div>
        </div>
    );
};
