import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, footer, maxWidth = '800px', className = '' }) => {
    if (!isOpen) return null;

    const modalContent = (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className={`modal-content-card glass ${className}`}
                style={{
                    maxWidth: `min(${maxWidth}, calc(100vw - 20px))`,
                    width: '100%',
                    boxSizing: 'border-box'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.15rem', fontWeight: 600 }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, display: 'flex' }}
                        aria-label="Cerrar modal"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
