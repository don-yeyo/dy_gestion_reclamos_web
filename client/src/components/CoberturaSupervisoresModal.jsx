import React, { useState, useEffect } from 'react';
import { Map, Upload, CheckCircle2, AlertCircle, RefreshCw, X, Users, Globe } from 'lucide-react';
import { supervisoresApi } from '../services/api';

export const CoberturaSupervisoresModal = ({ isOpen, onClose }) => {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(null);

    const fetchInfo = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await supervisoresApi.getInfo();
            if (res.data.success) {
                setInfo(res.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error al obtener la información de cobertura.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchInfo();
            setUploadSuccess(null);
        }
    }, [isOpen]);

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                setUploading(true);
                setError(null);
                setUploadSuccess(null);

                const res = await supervisoresApi.uploadGeoJSON(json);
                if (res.data.success) {
                    setUploadSuccess('Archivo GeoJSON actualizado correctamente.');
                    setInfo(res.data.info);
                }
            } catch (err) {
                setError('El archivo seleccionado no es un JSON/GeoJSON válido o hubo un error al guardarlo.');
            } finally {
                setUploading(false);
                e.target.value = ''; // Reset input
            }
        };
        reader.readAsText(file);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content-card" style={{ maxWidth: 680 }}>
                {/* Header */}
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        <Map className="w-5 h-5 text-dy-gold" />
                        <h2 className="text-lg font-bold text-white">Cobertura Geográfica de Supervisores</h2>
                    </div>
                    <button onClick={onClose} className="text-dy-muted hover:text-white p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body space-y-5">
                    <p className="text-xs text-dy-muted">
                        Esta delimitación geográfica se utiliza para la asignación automática por coordenadas (Point-in-Polygon). 
                        El sitio web de reclamos consulta este servicio centralizado para identificar al supervisor de cada zona.
                    </p>

                    {/* Alertas */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                            <span>{error}</span>
                        </div>
                    )}

                    {uploadSuccess && (
                        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                            <span>{uploadSuccess}</span>
                        </div>
                    )}

                    {/* Resumen */}
                    {loading ? (
                        <div className="py-8 text-center text-dy-muted flex items-center justify-center gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-dy-gold" />
                            <span>Cargando datos de cobertura...</span>
                        </div>
                    ) : info ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-dy-surface border border-dy-border">
                                    <div className="text-xs text-dy-muted flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-dy-gold" /> Zonas Delimitadas
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">{info.totalZonas}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-dy-surface border border-dy-border">
                                    <div className="text-xs text-dy-muted flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-blue-400" /> Supervisores Únicos
                                    </div>
                                    <div className="text-xl font-bold text-white mt-1">{info.totalSupervisores}</div>
                                </div>
                            </div>

                            {/* Listado de Supervisores */}
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-dy-muted mb-2">
                                    Supervisores Activos en el Mapa
                                </h3>
                                <div className="max-h-48 overflow-y-auto rounded-lg border border-dy-border divide-y divide-dy-border bg-dy-surface/50 text-xs">
                                    {(info.supervisores || []).map((s, idx) => (
                                        <div key={idx} className="p-2.5 flex items-center justify-between">
                                            <div>
                                                <span className="font-semibold text-white">{s.nombre}</span>
                                                <span className="text-dy-muted ml-2">{s.email}</span>
                                            </div>
                                            <span className="bg-dy-card px-2 py-0.5 rounded text-[11px] text-dy-gold border border-dy-border">
                                                {s.zonasCount} {s.zonasCount === 1 ? 'zona' : 'zonas'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : null}

                    {/* Zona de subida de archivo */}
                    <div className="p-4 rounded-xl border border-dashed border-dy-gold/40 bg-dy-gold/5 text-center space-y-2">
                        <Upload className="w-6 h-6 text-dy-gold mx-auto" />
                        <div className="text-xs font-semibold text-white">
                            Actualizar Archivo de Cobertura (.geojson)
                        </div>
                        <p className="text-[11px] text-dy-muted max-w-sm mx-auto">
                            Seleccioná el archivo GeoJSON generado (por ejemplo desde geojson.io) con los atributos <code>Supervisor</code> y <code>email</code>.
                        </p>
                        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dy-gold text-slate-900 font-bold text-xs cursor-pointer hover:bg-yellow-400 transition-colors">
                            {uploading ? (
                                <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Cargando...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Seleccionar archivo .geojson</span>
                                </>
                            )}
                            <input
                                type="file"
                                accept=".geojson,.json"
                                onChange={handleFileUpload}
                                disabled={uploading}
                                className="hidden"
                            />
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-dy-surface hover:bg-dy-surface-hover text-white text-xs font-semibold border border-dy-border"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
