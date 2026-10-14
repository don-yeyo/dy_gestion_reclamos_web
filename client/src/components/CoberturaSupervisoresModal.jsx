import React, { useState, useEffect } from 'react';
import {
    Map, Upload, CheckCircle2, AlertCircle, RefreshCw, X, Users,
    Globe, Download, Search, Navigation, Compass, ExternalLink
} from 'lucide-react';
import { supervisoresApi } from '../services/api';

const PRESET_COORDINATES = [
    { label: 'Pergamino (Centro)', lat: -33.8942, lng: -60.5736 },
    { label: 'Rosario (Santa Fe)', lat: -32.9587, lng: -60.6930 },
    { label: 'San Nicolás', lat: -33.3335, lng: -60.2253 },
    { label: 'CABA (Capital Federal)', lat: -34.6037, lng: -58.3816 },
    { label: 'Junín (Bs. As.)', lat: -34.5838, lng: -60.9433 }
];

export const CoberturaSupervisoresModal = ({ isOpen, onClose }) => {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(null);
    const [searchSupervisor, setSearchSupervisor] = useState('');

    // Tester interactivo de coordenadas
    const [testLat, setTestLat] = useState('-33.8942');
    const [testLng, setTestLng] = useState('-60.5736');
    const [testingLookup, setTestingLookup] = useState(false);
    const [testResult, setTestResult] = useState(null);

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
            setTestResult(null);
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
                    setUploadSuccess('Archivo GeoJSON actualizado y persistido en MySQL.');
                    setInfo(res.data.info);
                }
            } catch (err) {
                setError('El archivo seleccionado no es un JSON/GeoJSON válido o hubo un error al procesarlo: ' + (err.response?.data?.error || err.message));
            } finally {
                setUploading(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleDownloadCurrentGeoJSON = async () => {
        try {
            const res = await supervisoresApi.getRawGeoJSON();
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', 'cobertura_supervisores_donyeyo.geojson');
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        } catch (err) {
            alert('Error al descargar el archivo GeoJSON: ' + err.message);
        }
    };

    const handleTestCoordinate = async (lat = testLat, lng = testLng) => {
        setTestingLookup(true);
        setTestResult(null);
        try {
            const cleanLat = String(lat).trim().replace(',', '.');
            const cleanLng = String(lng).trim().replace(',', '.');
            const res = await supervisoresApi.lookup(cleanLat, cleanLng);
            if (res.data.success) {
                setTestResult(res.data);
            }
        } catch (err) {
            setTestResult({
                found: false,
                supervisor: 'Error en la consulta',
                error: err.response?.data?.error || err.message
            });
        } finally {
            setTestingLookup(false);
        }
    };

    if (!isOpen) return null;

    const filteredSupervisores = (info?.supervisores || []).filter(s =>
        s.nombre.toLowerCase().includes(searchSupervisor.toLowerCase()) ||
        s.email.toLowerCase().includes(searchSupervisor.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content-card"
                style={{ maxWidth: 740 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 'var(--radius-sm)',
                            background: 'rgba(217, 119, 6, 0.15)', color: 'var(--dy-gold)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Compass size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--heading-color)' }}>
                                Cobertura Geográfica de Supervisores
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Triaje automático por polígonos GeoJSON (Point-in-Polygon)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 6, borderRadius: 'var(--radius-sm)'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Alertas */}
                    {error && (
                        <div style={{
                            padding: 12, borderRadius: 'var(--radius-sm)',
                            background: 'var(--error-bg)', color: 'var(--error)',
                            border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem'
                        }}>
                            <AlertCircle size={18} style={{ flexShrink: 0 }} />
                            <span>{error}</span>
                        </div>
                    )}

                    {uploadSuccess && (
                        <div style={{
                            padding: 12, borderRadius: 'var(--radius-sm)',
                            background: 'var(--success-bg)', color: 'var(--success)',
                            border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem'
                        }}>
                            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                            <span>{uploadSuccess}</span>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                            <p style={{ marginTop: 10, fontSize: '0.9rem' }}>Consultando estadísticas de cobertura...</p>
                        </div>
                    ) : info ? (
                        <>
                            {/* Estadísticas de Cobertura */}
                            <div className="geo-stats-row">
                                <div className="geo-stat-card">
                                    <div className="geo-stat-icon-wrapper">
                                        <Globe size={22} />
                                    </div>
                                    <div>
                                        <div className="geo-stat-num">{info.totalZonas}</div>
                                        <div className="geo-stat-desc">Zonas / Polígonos</div>
                                    </div>
                                </div>

                                <div className="geo-stat-card">
                                    <div className="geo-stat-icon-wrapper" style={{ background: 'rgba(217, 119, 6, 0.12)', color: 'var(--dy-gold)' }}>
                                        <Users size={22} />
                                    </div>
                                    <div>
                                        <div className="geo-stat-num">{info.totalSupervisores}</div>
                                        <div className="geo-stat-desc">Supervisores Únicos</div>
                                    </div>
                                </div>

                                <div className="geo-stat-card">
                                    <div className="geo-stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' }}>
                                        <Navigation size={22} />
                                    </div>
                                    <div>
                                        <div className="geo-stat-num" style={{ fontSize: '1.2rem' }}>Ray-Casting</div>
                                        <div className="geo-stat-desc">Algoritmo Point-in-Polygon</div>
                                    </div>
                                </div>
                            </div>

                            {/* Probador Interactivo de Coordenadas */}
                            <div className="geo-tester-box">
                                <div className="geo-tester-title">
                                    <Compass size={16} />
                                    Probar Resolución por Coordenadas (Simulación)
                                </div>
                                <div className="geo-tester-inputs">
                                    <input
                                        type="text"
                                        placeholder="Latitud (ej: -33.8942)"
                                        value={testLat}
                                        onChange={(e) => setTestLat(e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Longitud (ej: -60.5736)"
                                        value={testLng}
                                        onChange={(e) => setTestLng(e.target.value)}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleTestCoordinate()}
                                        disabled={testingLookup || !testLat || !testLng}
                                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                    >
                                        <Navigation size={14} />
                                        <span>{testingLookup ? 'Consultando...' : 'Comprobar'}</span>
                                    </button>
                                </div>

                                <div className="geo-presets-bar">
                                    <span>Prueba rápida:</span>
                                    {PRESET_COORDINATES.map((p, idx) => (
                                        <button
                                            key={idx}
                                            className="geo-preset-chip"
                                            onClick={() => {
                                                setTestLat(p.lat);
                                                setTestLng(p.lng);
                                                handleTestCoordinate(p.lat, p.lng);
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>

                                {testResult && (
                                    <div className={`geo-test-result ${testResult.found ? '' : 'not-found'}`}>
                                        {testResult.found ? (
                                            <>
                                                <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                <div>
                                                    <strong>Supervisor Asignado:</strong> {testResult.supervisor} ({testResult.email})
                                                    {testResult.zona && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            Zona de delimitación: {testResult.zona}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                                <div>
                                                    <strong>Sin Cobertura Directa:</strong> Las coordenadas ingresadas no caen dentro de ningún polígono activo. Se asignará por defecto a Administración.
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Directorio de Supervisores */}
                            <div className="geo-supervisors-container">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--heading-color)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Supervisores Activos en el Mapa ({info.supervisores?.length || 0})
                                    </h3>
                                    <div style={{ position: 'relative', width: 220 }}>
                                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar supervisor..."
                                            value={searchSupervisor}
                                            onChange={(e) => setSearchSupervisor(e.target.value)}
                                            style={{
                                                width: '100%', padding: '6px 10px 6px 30px', borderRadius: 'var(--radius-pill)',
                                                border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                                                fontSize: '0.8rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="geo-supervisors-list">
                                    {filteredSupervisores.length === 0 ? (
                                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No se encontraron supervisores coincidentes.
                                        </div>
                                    ) : (
                                        filteredSupervisores.map((s, idx) => (
                                            <div key={idx} className="geo-supervisor-item">
                                                <div>
                                                    <span style={{ fontWeight: 600 }}>{s.nombre}</span>
                                                    <a
                                                        href={`mailto:${s.email}`}
                                                        style={{ color: 'var(--text-muted)', marginLeft: 8, textDecoration: 'none', fontSize: '0.8rem' }}
                                                        title="Enviar correo"
                                                    >
                                                        {s.email}
                                                    </a>
                                                </div>
                                                <span className="geo-zones-count-badge">
                                                    {s.zonasCount} {s.zonasCount === 1 ? 'zona' : 'zonas'}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Descarga y Subida de Archivo */}
                            <div>
                                <div className="geo-download-bar">
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Exportar Cobertura Actual</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Descarga el archivo actual para editarlo o agregar polígonos en geojson.io
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleDownloadCurrentGeoJSON}
                                        style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                                    >
                                        <Download size={14} />
                                        <span>Descargar .geojson</span>
                                    </button>
                                </div>

                                <div className="geo-upload-card">
                                    <Upload className="geo-upload-icon" />
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                                        Importar Nueva Versión de Cobertura
                                    </div>
                                    <p style={{ margin: '6px auto 14px auto', maxWidth: 420, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Sube un archivo <code>.geojson</code> con propiedades <code>Supervisor</code> y <code>email</code> en cada polígono. Se persistirá en la base de datos MySQL.
                                    </p>

                                    <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                                        {uploading ? (
                                            <>
                                                <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                                <span>Cargando y Persistiendo...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={15} />
                                                <span>Seleccionar archivo GeoJSON</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept=".geojson,.json"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
