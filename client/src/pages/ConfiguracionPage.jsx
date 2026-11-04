import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Settings, Mail, Tag, Package, Sliders, Save, RotateCcw, Plus,
    Edit2, Check, X, AlertCircle, Info, RefreshCw, Eye, ExternalLink,
    Search, CheckCircle2, Send, ShieldAlert, Sparkles, HelpCircle, Image
} from 'lucide-react';
import { configuracionApi, categoriasApi, productosApi } from '../services/api';

const VALID_TABS = ['emails', 'categorias', 'productos', 'parametros'];
const VALID_EMAIL_TYPES = ['supervisor', 'consumidor_satisfaccion', 'consumidor_fin', 'inocuidad', 'elevacion', 'fraude'];

export const ConfiguracionPage = () => {
    const { tab: routeTab, item: routeItem } = useParams();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState(() => VALID_TABS.includes(routeTab) ? routeTab : 'emails');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    // Estado de configuraciones clave-valor
    const [configs, setConfigs] = useState({});
    const [originalConfigs, setOriginalConfigs] = useState({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Estado para selector de emails en Tab 1
    const [selectedEmailType, setSelectedEmailType] = useState(() =>
        (routeTab === 'emails' && VALID_EMAIL_TYPES.includes(routeItem)) ? routeItem : 'supervisor'
    );

    // Estado para Categorías (Tab 2)
    const [categorias, setCategorias] = useState([]);
    const [editingCategoria, setEditingCategoria] = useState(null);
    const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
    const [categoriaForm, setCategoriaForm] = useState({ nombre: '', inocuidad_emails: '', activo: 1 });

    // Estado para Productos (Tab 3)
    const [productos, setProductos] = useState([]);
    const [productosSearch, setProductosSearch] = useState('');
    const [editingProducto, setEditingProducto] = useState(null);
    const [productoModalOpen, setProductoModalOpen] = useState(false);
    const [productoForm, setProductoForm] = useState({ nombre_interno: '', nombre_empaque: '', categoria_id: '', activo: 1 });

    // Modal de confirmación para Reset
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);

    // Modal de Envío de Email de Muestra
    const [sampleModalOpen, setSampleModalOpen] = useState(false);
    const [sampleClaimId, setSampleClaimId] = useState('20233364');
    const [sampleEmailTo, setSampleEmailTo] = useState('gabrielt@donyeyo.com.ar');
    const [sendingSample, setSendingSample] = useState(false);

    // Sincronizar pestaña y modales con URL (/configuracion/:tab/:item)
    useEffect(() => {
        if (VALID_TABS.includes(routeTab)) {
            setActiveTab(routeTab);
        } else if (!routeTab) {
            setActiveTab('emails');
        }

        if (routeTab === 'emails' && VALID_EMAIL_TYPES.includes(routeItem)) {
            setSelectedEmailType(routeItem);
        }

        if (routeTab === 'categorias') {
            setProductoModalOpen(false);
            if (routeItem === 'nueva' || routeItem === 'nuevo') {
                setEditingCategoria(null);
                setCategoriaForm({ nombre: '', inocuidad_emails: '', activo: 1 });
                setCategoriaModalOpen(true);
            } else if (routeItem && categorias.length > 0) {
                const foundCat = categorias.find(c => String(c.id) === String(routeItem));
                if (foundCat) {
                    setEditingCategoria(foundCat);
                    setCategoriaForm({
                        nombre: foundCat.nombre,
                        inocuidad_emails: foundCat.inocuidad_emails,
                        activo: foundCat.activo ? 1 : 0
                    });
                    setCategoriaModalOpen(true);
                }
            } else if (!routeItem) {
                setCategoriaModalOpen(false);
            }
        } else if (routeTab === 'productos') {
            setCategoriaModalOpen(false);
            if (routeItem === 'nuevo' || routeItem === 'nueva') {
                setEditingProducto(null);
                setProductoForm({
                    nombre_interno: '',
                    nombre_empaque: '',
                    categoria_id: categorias[0]?.id || '',
                    activo: 1
                });
                setProductoModalOpen(true);
            } else if (routeItem && productos.length > 0) {
                const foundProd = productos.find(p => String(p.id) === String(routeItem));
                if (foundProd) {
                    setEditingProducto(foundProd);
                    setProductoForm({
                        nombre_interno: foundProd.nombre_interno,
                        nombre_empaque: foundProd.nombre_empaque,
                        categoria_id: foundProd.categoria_id,
                        activo: foundProd.activo ? 1 : 0
                    });
                    setProductoModalOpen(true);
                }
            } else if (!routeItem) {
                setProductoModalOpen(false);
            }
        } else {
            setCategoriaModalOpen(false);
            setProductoModalOpen(false);
        }
    }, [routeTab, routeItem, categorias, productos]);

    const handleTabChange = (newTab) => {
        setActiveTab(newTab);
        navigate(`/configuracion/${newTab}`);
    };

    const handleEmailTypeChange = (newType) => {
        setSelectedEmailType(newType);
        navigate(`/configuracion/emails/${newType}`);
    };

    // Cargar datos iniciales
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const [confRes, catRes, prodRes] = await Promise.all([
                configuracionApi.getAll(),
                categoriasApi.getAll(),
                productosApi.getAll()
            ]);

            try {
                const trRes = await configuracionApi.getTestRecipient();
                if (trRes.data && trRes.data.test_recipient) {
                    setSampleEmailTo(trRes.data.test_recipient);
                }
            } catch (e) {
                // Ignore fallback
            }

            if (confRes.data && confRes.data.success) {
                const confMap = {};
                const items = Array.isArray(confRes.data.data) ? confRes.data.data : (confRes.data.data?.items || []);
                items.forEach(item => {
                    confMap[item.clave] = item.valor;
                    confMap[item.clave.toLowerCase()] = item.valor;
                    confMap[item.clave.toUpperCase()] = item.valor;
                });
                setConfigs(confMap);
                setOriginalConfigs(confMap);
                setHasUnsavedChanges(false);
            }

            if (catRes.data && catRes.data.success) {
                setCategorias(catRes.data.data);
            }

            if (prodRes.data && prodRes.data.success) {
                setProductos(prodRes.data.data);
            }
        } catch (err) {
            console.error('Error cargando configuración:', err);
            setErrorMessage('No se pudieron cargar todos los parámetros del sistema.');
        } finally {
            setLoading(false);
        }
    };

    const showNotification = (msg, isError = false) => {
        if (isError) {
            setErrorMessage(msg);
            setTimeout(() => setErrorMessage(''), 5000);
        } else {
            setSuccessMessage(msg);
            setTimeout(() => setSuccessMessage(''), 4000);
        }
    };

    const handleConfigChange = (clave, valor) => {
        setConfigs(prev => {
            const updated = {
                ...prev,
                [clave]: valor,
                [clave.toLowerCase()]: valor,
                [clave.toUpperCase()]: valor
            };
            setHasUnsavedChanges(true);
            return updated;
        });
    };

    const handleSaveConfigs = async () => {
        setSaving(true);
        setErrorMessage('');
        try {
            const payload = Object.keys(configs).map(k => ({
                clave: k,
                valor: configs[k]
            }));

            const res = await configuracionApi.updateBatch(payload);
            if (res.data && res.data.success) {
                setOriginalConfigs(configs);
                setHasUnsavedChanges(false);
                showNotification('¡Configuraciones guardadas y aplicadas con éxito!');
            }
        } catch (err) {
            console.error('Error al guardar configuraciones:', err);
            showNotification('Error al guardar las configuraciones en la base de datos.', true);
        } finally {
            setSaving(false);
        }
    };

    const handleSendSampleEmail = async (e) => {
        if (e) e.preventDefault();
        if (!sampleClaimId.trim()) {
            showNotification('Por favor indicá el número de reclamo a utilizar para los datos de muestra.', true);
            return;
        }
        if (!sampleEmailTo.trim() || !sampleEmailTo.includes('@')) {
            showNotification('Por favor indicá una casilla de email válida para recibir la muestra.', true);
            return;
        }

        setSendingSample(true);
        try {
            const res = await configuracionApi.enviarMuestraEmail({
                email_tipo: selectedEmailType,
                claim_id: sampleClaimId.trim(),
                destinatario: sampleEmailTo.trim()
            });
            if (res.data && res.data.success) {
                setSampleModalOpen(false);
                showNotification(res.data.message || 'Email de muestra enviado con éxito.');
            }
        } catch (err) {
            console.error('Error al enviar email de muestra:', err);
            showNotification(err.response?.data?.message || err.response?.data?.error || 'Error al despachar email de muestra.', true);
        } finally {
            setSendingSample(false);
        }
    };

    const handleResetDefaults = async () => {
        setSaving(true);
        try {
            const res = await configuracionApi.resetToDefaults();
            if (res.data && res.data.success) {
                setConfirmResetOpen(false);
                await loadData();
                showNotification('Valores de fábrica restablecidos correctamente.');
            }
        } catch (err) {
            console.error('Error al restablecer valores:', err);
            showNotification('No se pudieron restablecer los valores de fábrica.', true);
        } finally {
            setSaving(false);
        }
    };

    // Operaciones sobre Categorías
    const handleOpenCategoriaModal = (cat = null) => {
        if (cat) {
            setEditingCategoria(cat);
            setCategoriaForm({
                nombre: cat.nombre,
                inocuidad_emails: cat.inocuidad_emails,
                activo: cat.activo ? 1 : 0
            });
            setCategoriaModalOpen(true);
            navigate(`/configuracion/categorias/${encodeURIComponent(cat.id)}`);
        } else {
            setEditingCategoria(null);
            setCategoriaForm({ nombre: '', inocuidad_emails: '', activo: 1 });
            setCategoriaModalOpen(true);
            navigate('/configuracion/categorias/nueva');
        }
    };

    const handleCloseCategoriaModal = () => {
        setCategoriaModalOpen(false);
        if (routeTab === 'categorias' && routeItem) {
            navigate('/configuracion/categorias');
        }
    };

    const handleSaveCategoria = async (e) => {
        e.preventDefault();
        try {
            if (editingCategoria) {
                await categoriasApi.update(editingCategoria.id, categoriaForm);
                showNotification(`Categoría "${categoriaForm.nombre}" actualizada.`);
            } else {
                await categoriasApi.create(categoriaForm);
                showNotification(`Nueva categoría "${categoriaForm.nombre}" creada.`);
            }
            setCategoriaModalOpen(false);
            if (routeTab === 'categorias' && routeItem) {
                navigate('/configuracion/categorias');
            }
            const res = await categoriasApi.getAll();
            if (res.data?.success) setCategorias(res.data.data);
        } catch (err) {
            console.error('Error guardando categoría:', err);
            showNotification(err.response?.data?.message || err.response?.data?.error || 'Error al guardar categoría.', true);
        }
    };

    const handleToggleCategoria = async (id) => {
        try {
            await categoriasApi.toggle(id);
            const res = await categoriasApi.getAll();
            if (res.data?.success) setCategorias(res.data.data);
            showNotification('Estado de la categoría actualizado.');
        } catch (err) {
            console.error('Error al alternar estado de categoría:', err);
            showNotification('Error al cambiar estado.', true);
        }
    };

    // Operaciones sobre Productos
    const handleOpenProductoModal = (prod = null) => {
        if (prod) {
            setEditingProducto(prod);
            setProductoForm({
                nombre_interno: prod.nombre_interno,
                nombre_empaque: prod.nombre_empaque,
                categoria_id: prod.categoria_id,
                activo: prod.activo ? 1 : 0
            });
            setProductoModalOpen(true);
            navigate(`/configuracion/productos/${encodeURIComponent(prod.id)}`);
        } else {
            setEditingProducto(null);
            setProductoForm({
                nombre_interno: '',
                nombre_empaque: '',
                categoria_id: categorias[0]?.id || '',
                activo: 1
            });
            setProductoModalOpen(true);
            navigate('/configuracion/productos/nuevo');
        }
    };

    const handleCloseProductoModal = () => {
        setProductoModalOpen(false);
        if (routeTab === 'productos' && routeItem) {
            navigate('/configuracion/productos');
        }
    };

    const handleSaveProducto = async (e) => {
        e.preventDefault();
        try {
            if (editingProducto) {
                await productosApi.update(editingProducto.id, productoForm);
                showNotification(`Producto "${productoForm.nombre_interno}" actualizado.`);
            } else {
                await productosApi.create(productoForm);
                showNotification(`Nuevo producto "${productoForm.nombre_interno}" agregado.`);
            }
            setProductoModalOpen(false);
            if (routeTab === 'productos' && routeItem) {
                navigate('/configuracion/productos');
            }
            const res = await productosApi.getAll();
            if (res.data?.success) setProductos(res.data.data);
        } catch (err) {
            console.error('Error guardando producto:', err);
            showNotification(err.response?.data?.message || err.response?.data?.error || 'Error al guardar producto.', true);
        }
    };

    const handleToggleProducto = async (id) => {
        try {
            await productosApi.toggle(id);
            const res = await productosApi.getAll();
            if (res.data?.success) setProductos(res.data.data);
            showNotification('Estado del producto actualizado.');
        } catch (err) {
            console.error('Error al alternar estado de producto:', err);
            showNotification('Error al cambiar estado.', true);
        }
    };

    // Filtro de productos
    const productosFiltrados = productos.filter(p => {
        if (!productosSearch.trim()) return true;
        const q = productosSearch.toLowerCase();
        return (
            p.nombre_interno?.toLowerCase().includes(q) ||
            p.nombre_empaque?.toLowerCase().includes(q) ||
            p.categoria_nombre?.toLowerCase().includes(q)
        );
    });

    // Estilos comunes adaptados a Dark / Light Mode mediante variables CSS
    const cardStyle = {
        padding: '24px',
        background: 'var(--surface-card, var(--surface))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 12px)',
        color: 'var(--text)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm, 8px)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'var(--transition)'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.84rem',
        fontWeight: 600,
        color: 'var(--heading-color)',
        marginBottom: '6px'
    };

    const subtextStyle = {
        margin: '4px 0 0 0',
        fontSize: '0.78rem',
        color: 'var(--text-muted)'
    };

    if (loading) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={36} className="spin" style={{ marginBottom: 16 }} />
                <h3 style={{ color: 'var(--heading-color)' }}>Cargando configuración del sistema...</h3>
            </div>
        );
    }

    return (
        <div className="container" style={{ padding: '24px', maxWidth: '1320px', margin: '0 auto', color: 'var(--text)' }}>
            {/* Header de la Página */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            background: 'var(--primary)',
                            color: '#ffffff',
                            padding: '9px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                        }}>
                            <Settings size={22} />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--heading-color)', fontWeight: 700 }}>
                            Configuración del Sistema
                        </h1>
                    </div>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                        Personalización global de plantillas de correos, botones interactivos, grupos de inocuidad y catálogo de productos.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => setSampleModalOpen(true)}
                        className="btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#0d2c5c',
                            border: '1px solid #0d2c5c',
                            color: '#ffffff',
                            padding: '9px 16px',
                            borderRadius: 'var(--radius-sm, 8px)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            boxShadow: '0 2px 6px rgba(13,44,92,0.25)'
                        }}
                        title="Enviar un correo real de prueba a la casilla de testing"
                    >
                        <Send size={16} />
                        <span>Enviar Email de Muestra</span>
                    </button>

                    <button
                        onClick={() => setConfirmResetOpen(true)}
                        className="btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '9px 16px',
                            borderRadius: 'var(--radius-sm, 8px)',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                        title="Restablecer textos y botones a los predeterminados de fábrica"
                    >
                        <RotateCcw size={16} />
                        <span>Restablecer Fábrica</span>
                    </button>

                    <button
                        type="button"
                        data-testid="btn-guardar-configs"
                        onClick={handleSaveConfigs}
                        disabled={saving || !hasUnsavedChanges}
                        className="btn btn-primary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '9px 20px',
                            borderRadius: 'var(--radius-sm, 8px)',
                            fontWeight: 600,
                            background: saving
                                ? 'var(--primary)'
                                : (hasUnsavedChanges ? 'var(--primary)' : 'var(--surface-subtle)'),
                            color: (saving || hasUnsavedChanges) ? '#ffffff' : 'var(--text-muted)',
                            border: '1px solid var(--border)',
                            cursor: (saving || !hasUnsavedChanges) ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.75 : (hasUnsavedChanges ? 1 : 0.65),
                            boxShadow: hasUnsavedChanges && !saving ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                            transition: 'all 0.2s ease',
                            pointerEvents: saving ? 'none' : 'auto'
                        }}
                    >
                        {saving ? (
                            <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <Save size={16} />
                        )}
                        <span>
                            {saving
                                ? 'Guardando cambios...'
                                : (hasUnsavedChanges ? 'Guardar Cambios' : 'Configuraciones al Día')}
                        </span>
                    </button>
                </div>
            </div>

            {/* Notificaciones de Éxito / Error */}
            {successMessage && (
                <div style={{
                    padding: '12px 18px',
                    background: 'var(--success-bg)',
                    color: 'var(--success)',
                    border: '1px solid var(--success)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.92rem'
                }}>
                    <CheckCircle2 size={18} />
                    <span>{successMessage}</span>
                </div>
            )}

            {errorMessage && (
                <div style={{
                    padding: '12px 18px',
                    background: 'var(--error-bg)',
                    color: 'var(--error)',
                    border: '1px solid var(--error)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.92rem'
                }}>
                    <AlertCircle size={18} />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Pestañas de Navegación */}
            <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '2px solid var(--border)',
                marginBottom: '24px',
                overflowX: 'auto'
            }}>
                <button
                    onClick={() => handleTabChange('emails')}
                    style={{
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'emails' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'emails' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'emails' ? 700 : 500,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '-2px',
                        transition: 'var(--transition)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Mail size={18} />
                    <span>Plantillas & Botones de Email</span>
                </button>

                <button
                    onClick={() => handleTabChange('categorias')}
                    style={{
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'categorias' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'categorias' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'categorias' ? 700 : 500,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '-2px',
                        transition: 'var(--transition)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Tag size={18} />
                    <span>Categorías & Grupos Inocuidad</span>
                    <span style={{
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border)'
                    }}>
                        {categorias.length}
                    </span>
                </button>

                <button
                    onClick={() => handleTabChange('productos')}
                    style={{
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'productos' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'productos' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'productos' ? 700 : 500,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '-2px',
                        transition: 'var(--transition)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Package size={18} />
                    <span>Catálogo de Productos</span>
                    <span style={{
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border)'
                    }}>
                        {productos.length}
                    </span>
                </button>

                <button
                    onClick={() => handleTabChange('parametros')}
                    style={{
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'parametros' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'parametros' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'parametros' ? 700 : 500,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '-2px',
                        transition: 'var(--transition)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Sliders size={18} />
                    <span>Parámetros Generales</span>
                </button>
            </div>

            {/* ============================================================== */}
            {/* TAB 1: PLANTILLAS Y BOTONES DE EMAIL                           */}
            {/* ============================================================== */}
            {activeTab === 'emails' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
                    {/* Formulario de Edición */}
                    <div style={cardStyle}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>
                                SELECCIONÁ EL TIPO DE CORREO A EDITAR:
                            </label>
                            <select
                                value={selectedEmailType}
                                onChange={(e) => handleEmailTypeChange(e.target.value)}
                                style={{
                                    ...inputStyle,
                                    fontWeight: 600,
                                    color: 'var(--primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="supervisor">👤 Correo a Supervisor Comercial (Asignación y Resolución)</option>
                                <option value="consumidor_satisfaccion">⭐ Encuesta de Satisfacción a Consumidor</option>
                                <option value="consumidor_fin">✅ Notificación de Cierre y Agradecimiento a Consumidor</option>
                                <option value="inocuidad">🔬 Derivación Técnica a Inocuidad y Calidad</option>
                                <option value="elevacion">🚨 Alerta de Elevación / Escalación a Gerencia</option>
                                <option value="fraude">⚠️ Alerta de Posible Conflicto / Fraude Comercial</option>
                            </select>
                            <p style={subtextStyle}>
                                Podés usar los comodines dinámicos <code>{'{claim_id}'}</code>, <code>{'{consumidor_nombre}'}</code>, <code>{'{localidad}'}</code> y <code>{'{supervisor}'}</code>.
                            </p>
                        </div>

                        {/* Campos dinámicos según el tipo de correo */}
                        {selectedEmailType === 'supervisor' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_supervisor_asunto'] || ''}
                                        onChange={(e) => handleConfigChange('email_supervisor_asunto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_supervisor_titulo'] || ''}
                                        onChange={(e) => handleConfigChange('email_supervisor_titulo', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Bloque de Instrucción / Introducción</label>
                                    <textarea
                                        rows={3}
                                        value={configs['email_supervisor_intro'] || ''}
                                        onChange={(e) => handleConfigChange('email_supervisor_intro', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Texto Botón Principal (Resolución)</label>
                                        <input
                                            type="text"
                                            value={configs['email_supervisor_btn_resuelto'] || ''}
                                            onChange={(e) => handleConfigChange('email_supervisor_btn_resuelto', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Texto Botón Imposibilidad</label>
                                        <input
                                            type="text"
                                            value={configs['email_supervisor_btn_imposibilidad'] || ''}
                                            onChange={(e) => handleConfigChange('email_supervisor_btn_btn_imposibilidad', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedEmailType === 'consumidor_satisfaccion' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_consumidor_satisfaccion_asunto'] || configs['email_consumidor_asunto'] || ''}
                                        onChange={(e) => {
                                            handleConfigChange('email_consumidor_satisfaccion_asunto', e.target.value);
                                            handleConfigChange('email_consumidor_asunto', e.target.value);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_consumidor_satisfaccion_titulo'] || configs['email_consumidor_titulo'] || ''}
                                        onChange={(e) => {
                                            handleConfigChange('email_consumidor_satisfaccion_titulo', e.target.value);
                                            handleConfigChange('email_consumidor_titulo', e.target.value);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Bloque de Encuesta</label>
                                    <textarea
                                        rows={3}
                                        value={configs['email_consumidor_satisfaccion_texto'] || configs['email_consumidor_intro'] || ''}
                                        onChange={(e) => {
                                            handleConfigChange('email_consumidor_satisfaccion_texto', e.target.value);
                                            handleConfigChange('email_consumidor_intro', e.target.value);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Texto Botón Resuelto (abre encuesta 5 estrellas)</label>
                                        <input
                                            type="text"
                                            value={configs['email_consumidor_btn_conforme'] || '✓ Resuelto'}
                                            onChange={(e) => handleConfigChange('email_consumidor_btn_conforme', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Texto Botón No Resuelto (abre selector de problema)</label>
                                        <input
                                            type="text"
                                            value={configs['email_consumidor_btn_no_resuelto'] || '✕ No Resuelto'}
                                            onChange={(e) => handleConfigChange('email_consumidor_btn_no_resuelto', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedEmailType === 'consumidor_fin' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_consumidor_fin_asunto'] || ''}
                                        onChange={(e) => handleConfigChange('email_consumidor_fin_asunto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_consumidor_fin_titulo'] || ''}
                                        onChange={(e) => handleConfigChange('email_consumidor_fin_titulo', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Mensaje de Agradecimiento y Cierre</label>
                                    <textarea
                                        rows={4}
                                        value={configs['email_consumidor_fin_texto'] || ''}
                                        onChange={(e) => handleConfigChange('email_consumidor_fin_texto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        )}

                        {selectedEmailType === 'inocuidad' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_inocuidad_asunto'] || ''}
                                        onChange={(e) => handleConfigChange('email_inocuidad_asunto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_inocuidad_titulo'] || ''}
                                        onChange={(e) => handleConfigChange('email_inocuidad_titulo', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Bloque de Dictamen Técnico</label>
                                    <textarea
                                        rows={3}
                                        value={configs['email_inocuidad_intro'] || ''}
                                        onChange={(e) => handleConfigChange('email_inocuidad_intro', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Texto Botón de Dictamen</label>
                                        <input
                                            type="text"
                                            value={configs['email_inocuidad_btn_dictaminar'] || ''}
                                            onChange={(e) => handleConfigChange('email_inocuidad_btn_dictaminar', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Texto Botón Gestor Web</label>
                                        <input
                                            type="text"
                                            value={configs['email_inocuidad_btn_gestor'] || ''}
                                            onChange={(e) => handleConfigChange('email_inocuidad_btn_gestor', e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedEmailType === 'elevacion' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_elevacion_asunto'] || ''}
                                        onChange={(e) => handleConfigChange('email_elevacion_asunto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_elevacion_titulo'] || ''}
                                        onChange={(e) => handleConfigChange('email_elevacion_titulo', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Bloque de Advertencia / Notificación</label>
                                    <textarea
                                        rows={3}
                                        value={configs['email_elevacion_intro'] || ''}
                                        onChange={(e) => handleConfigChange('email_elevacion_intro', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Botón Acceder al Reclamo</label>
                                    <input
                                        type="text"
                                        value={configs['email_elevacion_btn_revisar'] || ''}
                                        onChange={(e) => handleConfigChange('email_elevacion_btn_revisar', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        )}

                        {selectedEmailType === 'fraude' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={configs['email_fraude_asunto'] || ''}
                                        onChange={(e) => handleConfigChange('email_fraude_asunto', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Título / Encabezado</label>
                                    <input
                                        type="text"
                                        value={configs['email_fraude_titulo'] || ''}
                                        onChange={(e) => handleConfigChange('email_fraude_titulo', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Bloque de Advertencia</label>
                                    <textarea
                                        rows={3}
                                        value={configs['email_fraude_intro'] || ''}
                                        onChange={(e) => handleConfigChange('email_fraude_intro', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Texto Botón Inspeccionar Caso</label>
                                    <input
                                        type="text"
                                        value={configs['email_fraude_btn_auditar'] || ''}
                                        onChange={(e) => handleConfigChange('email_fraude_btn_auditar', e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Live Preview del Correo */}
                    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <Eye size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                    Vista Previa de Plantilla
                                </span>
                                <span style={{
                                    fontSize: '0.74rem',
                                    background: 'var(--surface-subtle)',
                                    color: 'var(--text-secondary)',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)'
                                }}>
                                    Email HTML
                                </span>
                            </div>

                            <button
                                type="button"
                                data-testid="btn-enviar-email-muestra"
                                onClick={() => setSampleModalOpen(true)}
                                className="btn"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#0d2c5c',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '6px 14px',
                                    borderRadius: 'var(--radius-sm, 8px)',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                                    transition: 'all 0.2s'
                                }}
                                title="Enviar un correo real de prueba con la plantilla actual"
                            >
                                <Send size={14} />
                                <span>Enviar Email de Muestra</span>
                            </button>
                        </div>

                        {/* Contenedor del Correo Simulado */}
                        <div style={{
                            background: '#ffffff',
                            color: '#1e293b',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            fontFamily: 'sans-serif',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                        }}>
                            {/* Cabecera del Email */}
                            <div style={{
                                background: '#0d2c5c',
                                padding: '16px',
                                color: '#ffffff',
                                borderBottom: '4px solid #e40521',
                                textAlign: 'center'
                            }}>
                                {configs['email_logo_url'] ? (
                                    <div style={{ marginBottom: '6px' }}>
                                        <img
                                            src={configs['email_logo_url']}
                                            alt="Don Yeyo"
                                            style={{ maxHeight: '42px', maxWidth: '190px', objectFit: 'contain' }}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    </div>
                                ) : (
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '0.5px' }}>DON YEYO</h3>
                                )}
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.75rem', opacity: 0.9 }}>
                                    Gestión de Reclamos y Calidad
                                </p>
                            </div>

                            <div style={{ padding: '22px' }}>
                                <h4 style={{ margin: '0 0 12px 0', color: '#0d2c5c', fontSize: '1.08rem' }}>
                                    {selectedEmailType === 'supervisor' && (configs['email_supervisor_titulo'] || 'Acción Comercial Requerida')}
                                    {selectedEmailType === 'consumidor_satisfaccion' && (configs['email_consumidor_satisfaccion_titulo'] || configs['email_consumidor_titulo'] || 'Don Yeyo - Seguimiento de tu Reclamo')}
                                    {selectedEmailType === 'consumidor_fin' && (configs['email_consumidor_fin_titulo'] || 'Reclamo Finalizado')}
                                    {selectedEmailType === 'inocuidad' && (configs['email_inocuidad_titulo'] || 'Expediente Técnico')}
                                    {selectedEmailType === 'elevacion' && (configs['email_elevacion_titulo'] || 'Alerta de Elevación')}
                                    {selectedEmailType === 'fraude' && (configs['email_fraude_titulo'] || 'Alerta de Fraude')}
                                </h4>

                                <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                                    {selectedEmailType === 'supervisor' && (configs['email_supervisor_intro'] || '')}
                                    {selectedEmailType === 'consumidor_satisfaccion' && (configs['email_consumidor_satisfaccion_texto'] || configs['email_consumidor_intro'] || '')}
                                    {selectedEmailType === 'consumidor_fin' && (configs['email_consumidor_fin_texto'] || '')}
                                    {selectedEmailType === 'inocuidad' && (configs['email_inocuidad_intro'] || '')}
                                    {selectedEmailType === 'elevacion' && (configs['email_elevacion_intro'] || '')}
                                    {selectedEmailType === 'fraude' && (configs['email_fraude_intro'] || '')}
                                </p>

                                {/* Ficha de ejemplo */}
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    padding: '12px 14px',
                                    borderRadius: '6px',
                                    fontSize: '0.82rem',
                                    marginBottom: '20px',
                                    color: '#334155',
                                    borderLeft: '4px solid #0d2c5c'
                                }}>
                                    <div><strong>Reclamo:</strong> #20233400 (Ejemplo)</div>
                                    <div><strong>Consumidor:</strong> Juan Pérez</div>
                                    <div><strong>Localidad:</strong> Chacabuco, Bs. As.</div>
                                </div>

                                {/* Botones Interactivos según tipo */}
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {selectedEmailType === 'supervisor' && (
                                        <>
                                            <div style={{
                                                background: '#0d2c5c',
                                                color: '#ffffff',
                                                padding: '10px 18px',
                                                borderRadius: '6px',
                                                fontWeight: 600,
                                                fontSize: '0.85rem'
                                            }}>
                                                {configs['email_supervisor_btn_resuelto'] || '✓ Pude Resolver la Acción'}
                                            </div>
                                            <div style={{
                                                background: '#dc2626',
                                                color: '#ffffff',
                                                padding: '10px 18px',
                                                borderRadius: '6px',
                                                fontWeight: 600,
                                                fontSize: '0.85rem'
                                            }}>
                                                {configs['email_supervisor_btn_imposibilidad'] || '✕ Existe una Imposibilidad'}
                                            </div>
                                        </>
                                    )}

                                    {selectedEmailType === 'consumidor_satisfaccion' && (
                                        <>
                                            <div style={{
                                                background: '#10b981',
                                                color: '#ffffff',
                                                padding: '10px 18px',
                                                borderRadius: '20px',
                                                fontWeight: 700,
                                                fontSize: '0.85rem'
                                            }}>
                                                {configs['email_consumidor_btn_conforme'] || '✓ Resuelto'}
                                            </div>
                                            <div style={{
                                                background: '#ef4444',
                                                color: '#ffffff',
                                                padding: '10px 18px',
                                                borderRadius: '20px',
                                                fontWeight: 700,
                                                fontSize: '0.85rem'
                                            }}>
                                                {configs['email_consumidor_btn_no_resuelto'] || '✕ No Resuelto'}
                                            </div>
                                        </>
                                    )}

                                    {selectedEmailType === 'inocuidad' && (
                                        <div style={{
                                            background: '#0d2c5c',
                                            color: '#ffffff',
                                            padding: '10px 18px',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            fontSize: '0.85rem'
                                        }}>
                                            {configs['email_inocuidad_btn_dictaminar'] || 'Emitir Dictamen Técnico'}
                                        </div>
                                    )}

                                    {selectedEmailType === 'elevacion' && (
                                        <div style={{
                                            background: '#dc2626',
                                            color: '#ffffff',
                                            padding: '10px 18px',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            fontSize: '0.85rem'
                                        }}>
                                            {configs['email_elevacion_btn_revisar'] || 'Revisar Caso en el Gestor Web'}
                                        </div>
                                    )}

                                    {selectedEmailType === 'fraude' && (
                                        <div style={{
                                            background: '#dc2626',
                                            color: '#ffffff',
                                            padding: '10px 18px',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            fontSize: '0.85rem'
                                        }}>
                                            {configs['email_fraude_btn_auditar'] || 'Auditar Reclamo Inmediatamente'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pie del Email */}
                            <div style={{
                                background: '#f8fafc',
                                borderTop: '1px solid #e2e8f0',
                                padding: '12px',
                                textAlign: 'center',
                                fontSize: '0.74rem',
                                color: '#64748b'
                            }}>
                                {configs['email_pie_institucional'] || 'Don Yeyo S.A. - Notificación generada automáticamente.'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: CATEGORÍAS & GRUPOS INOCUIDAD                           */}
            {/* ============================================================== */}
            {activeTab === 'categorias' && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)' }}>
                                Grupos de Inocuidad por Categoría de Producto
                            </h3>
                            <p style={subtextStyle}>
                                Cuando un reclamo se deriva a Inocuidad, el sistema detecta la categoría del producto y despacha el correo a las casillas configuradas aquí.
                            </p>
                        </div>
                        <button
                            onClick={() => handleOpenCategoriaModal()}
                            className="btn btn-primary"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'var(--primary)',
                                color: '#ffffff',
                                padding: '8px 16px',
                                borderRadius: 'var(--radius-sm, 8px)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            <Plus size={16} />
                            <span>Nueva Categoría</span>
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 8px)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '12px 16px', width: '60px' }}>ID</th>
                                    <th style={{ padding: '12px 16px', width: '220px' }}>Categoría</th>
                                    <th style={{ padding: '12px 16px' }}>Casillas de Inocuidad Asignadas</th>
                                    <th style={{ padding: '12px 16px', width: '120px', textAlign: 'center' }}>Estado</th>
                                    <th style={{ padding: '12px 16px', width: '100px', textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categorias.map((cat) => (
                                    <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            {cat.id}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--heading-color)' }}>
                                            {cat.nombre}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {cat.inocuidad_emails.split(',').map((email, i) => (
                                                    <span key={i} style={{
                                                        background: 'var(--surface-subtle)',
                                                        color: 'var(--primary)',
                                                        fontSize: '0.78rem',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        fontWeight: 500
                                                    }}>
                                                        {email.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleToggleCategoria(cat.id)}
                                                style={{
                                                    background: cat.activo ? 'var(--success-bg)' : 'var(--surface-subtle)',
                                                    color: cat.activo ? 'var(--success)' : 'var(--text-muted)',
                                                    border: '1px solid var(--border)',
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {cat.activo ? 'ACTIVO' : 'INACTIVO'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleOpenCategoriaModal(cat)}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--text-secondary)',
                                                    padding: '5px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Editar Categoría"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {/* TAB 3: CATÁLOGO DE PRODUCTOS                                   */}
            {/* ============================================================== */}
            {activeTab === 'productos' && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)' }}>
                                Catálogo de Productos y Empaques Don Yeyo
                            </h3>
                            <p style={subtextStyle}>
                                Sincronizado con el sitio web oficial. Alimenta el autocompletado en el formulario web del consumidor y clasifica automáticamente por categoría.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productosSearch}
                                    onChange={(e) => setProductosSearch(e.target.value)}
                                    style={{
                                        ...inputStyle,
                                        paddingLeft: '36px'
                                    }}
                                />
                            </div>

                            <button
                                onClick={() => handleOpenProductoModal()}
                                className="btn btn-primary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--primary)',
                                    color: '#ffffff',
                                    padding: '8px 16px',
                                    borderRadius: 'var(--radius-sm, 8px)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <Plus size={16} />
                                <span>Nuevo Producto</span>
                            </button>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 8px)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '12px 16px', width: '60px' }}>ID</th>
                                    <th style={{ padding: '12px 16px' }}>Nombre en Empaque (Predictivo Web)</th>
                                    <th style={{ padding: '12px 16px' }}>Nombre Interno (Google Sheets)</th>
                                    <th style={{ padding: '12px 16px', width: '180px' }}>Categoría</th>
                                    <th style={{ padding: '12px 16px', width: '120px', textAlign: 'center' }}>Estado</th>
                                    <th style={{ padding: '12px 16px', width: '100px', textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productosFiltrados.map((prod) => (
                                    <tr key={prod.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            {prod.id}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--heading-color)' }}>
                                            {prod.nombre_empaque}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                                            {prod.nombre_interno}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                background: 'var(--surface-subtle)',
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.8rem',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontWeight: 600,
                                                border: '1px solid var(--border)'
                                            }}>
                                                {prod.categoria_nombre || 'Sin Asignar'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleToggleProducto(prod.id)}
                                                style={{
                                                    background: prod.activo ? 'var(--success-bg)' : 'var(--surface-subtle)',
                                                    color: prod.activo ? 'var(--success)' : 'var(--text-muted)',
                                                    border: '1px solid var(--border)',
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {prod.activo ? 'ACTIVO' : 'INACTIVO'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleOpenProductoModal(prod)}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--text-secondary)',
                                                    padding: '5px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Editar Producto"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {productosFiltrados.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No se encontraron productos que coincidan con la búsqueda.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {/* TAB 4: PARÁMETROS GENERALES                                    */}
            {/* ============================================================== */}
            {activeTab === 'parametros' && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: 'var(--heading-color)' }}>
                        Parámetros Globales y Casillas de Respaldo
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                        {/* URL Pública Absoluta del Logotipo Institucional */}
                        <div style={{
                            gridColumn: '1 / -1',
                            padding: '16px',
                            background: 'var(--surface-hover)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px'
                        }}>
                            <label style={{ ...labelStyle, fontSize: '0.96rem', fontWeight: 700, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Image size={18} color="var(--primary)" />
                                <span>URL Pública Absoluta del Logotipo Institucional (HTTPS)</span>
                            </label>
                            <input
                                type="url"
                                placeholder="https://www.donyeyo.com.ar/logo.png"
                                value={configs['email_logo_url'] || ''}
                                onChange={(e) => handleConfigChange('email_logo_url', e.target.value)}
                                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.9rem' }}
                            />
                            <p style={subtextStyle}>
                                URL pública y accesible desde internet (con protocolo <code>https://</code>) al archivo del logotipo de Don Yeyo. Esta URL se inserta directamente en la etiqueta <code>&lt;img src="..."&gt;</code> en la cabecera HTML de todos los correos electrónicos. Si se deja en blanco o no se define, se utilizará el nombre institucional "DON YEYO" en formato texto corporativo.
                            </p>

                            {/* Previsualización en Vivo de la Cabecera de Correo */}
                            <div style={{ marginTop: '12px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Vista Previa de la Cabecera de Email con el Logo Actual:
                                </span>
                                <div style={{
                                    marginTop: '6px',
                                    padding: '16px 20px',
                                    background: '#0d2c5c',
                                    borderBottom: '4px solid #e40521',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: '64px'
                                }}>
                                    {configs['email_logo_url'] ? (
                                        <>
                                            <img
                                                src={configs['email_logo_url']}
                                                alt="Logotipo Don Yeyo"
                                                style={{ maxHeight: '46px', maxWidth: '220px', objectFit: 'contain' }}
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    const errSpan = e.currentTarget.parentElement.querySelector('.logo-preview-error');
                                                    if (errSpan) errSpan.style.display = 'block';
                                                }}
                                                onLoad={(e) => {
                                                    e.currentTarget.style.display = 'block';
                                                    const errSpan = e.currentTarget.parentElement.querySelector('.logo-preview-error');
                                                    if (errSpan) errSpan.style.display = 'none';
                                                }}
                                            />
                                            <span className="logo-preview-error" style={{
                                                display: 'none',
                                                color: '#fca5a5',
                                                fontSize: '0.84rem',
                                                fontWeight: 600,
                                                marginTop: '6px'
                                            }}>
                                                ⚠️ No se pudo cargar la imagen desde la URL ingresada. Compruebe que la URL sea pública, válida y accesible.
                                            </span>
                                        </>
                                    ) : (
                                        <div style={{ color: '#ffffff', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '1px' }}>
                                            DON YEYO
                                            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                                                (Modo texto corporativo activo)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Casilla de Inocuidad por Defecto (Fallback)
                            </label>
                            <input
                                type="text"
                                value={configs['emails_inocuidad_default'] || ''}
                                onChange={(e) => handleConfigChange('emails_inocuidad_default', e.target.value)}
                                style={inputStyle}
                            />
                            <p style={subtextStyle}>
                                Se usa si el reclamo no tiene categoría de producto identificada.
                            </p>
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Casillas de Elevación por Defecto
                            </label>
                            <input
                                type="text"
                                value={configs['emails_elevacion_default'] || ''}
                                onChange={(e) => handleConfigChange('emails_elevacion_default', e.target.value)}
                                style={inputStyle}
                            />
                            <p style={subtextStyle}>
                                Destinatarios de gerencia para reclamos sin respuesta del supervisor.
                            </p>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>
                                Mensaje para Consumidor: Conservación de Muestra
                            </label>
                            <textarea
                                rows={2}
                                value={configs['mensaje_conservar_muestra'] || ''}
                                onChange={(e) => handleConfigChange('mensaje_conservar_muestra', e.target.value)}
                                style={inputStyle}
                            />
                            <p style={subtextStyle}>
                                Aparece destacado en las notificaciones iniciales cuando se requiere peritar la muestra.
                            </p>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>
                                Mensaje de Reabrir Caso (Personal Interno / Supervisión / Inocuidad)
                            </label>
                            <textarea
                                rows={2}
                                value={configs['mensaje_reapertura_personal'] || ''}
                                onChange={(e) => handleConfigChange('mensaje_reapertura_personal', e.target.value)}
                                style={inputStyle}
                                placeholder="Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso."
                            />
                            <p style={subtextStyle}>
                                Texto mostrado a supervisores o inspectores cuando intentan presionar un botón de email sobre un reclamo que ya fue procesado o cambió de estado.
                            </p>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>
                                Pie de Firma Institucional (Footer en todos los correos)
                            </label>
                            <input
                                type="text"
                                value={configs['email_pie_institucional'] || ''}
                                onChange={(e) => handleConfigChange('email_pie_institucional', e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CATEGORÍA */}
            {categoriaModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(3px)'
                }}>
                    <div style={{
                        ...cardStyle,
                        width: '90%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', color: 'var(--heading-color)' }}>
                            {editingCategoria ? 'Editar Categoría' : 'Nueva Categoría de Producto'}
                        </h3>
                        <form onSubmit={handleSaveCategoria}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>Nombre de la Categoría</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: PASTAS"
                                    value={categoriaForm.nombre}
                                    onChange={(e) => setCategoriaForm({ ...categoriaForm, nombre: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>Casillas de Inocuidad (separadas por coma)</label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="inocuidad.pastas@donyeyo.com.ar, calidad@donyeyo.com.ar"
                                    value={categoriaForm.inocuidad_emails}
                                    onChange={(e) => setCategoriaForm({ ...categoriaForm, inocuidad_emails: e.target.value })}
                                    style={inputStyle}
                                />
                                <p style={subtextStyle}>
                                    Los reclamos de productos pertenecientes a esta categoría se derivarán a estas direcciones.
                                </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button
                                    type="button"
                                    onClick={handleCloseCategoriaModal}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)',
                                        padding: '8px 16px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{
                                        background: 'var(--primary)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '8px 18px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL PRODUCTO */}
            {productoModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(3px)'
                }}>
                    <div style={{
                        ...cardStyle,
                        width: '90%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', color: 'var(--heading-color)' }}>
                            {editingProducto ? 'Editar Producto' : 'Nuevo Producto en Catálogo'}
                        </h3>
                        <form onSubmit={handleSaveProducto}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>Nombre en Empaque (Predictivo Web Consumidor)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Don Yeyo - Ravioles 4 quesos x500 gr"
                                    value={productoForm.nombre_empaque}
                                    onChange={(e) => setProductoForm({ ...productoForm, nombre_empaque: e.target.value })}
                                    style={inputStyle}
                                />
                                <p style={subtextStyle}>
                                    Es el texto visible que busca y autocompleta el consumidor en el formulario web.
                                </p>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>Nombre Interno (Google Sheets)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Ravioles 4 quesos x500 gr"
                                    value={productoForm.nombre_interno}
                                    onChange={(e) => setProductoForm({ ...productoForm, nombre_interno: e.target.value })}
                                    style={inputStyle}
                                />
                                <p style={subtextStyle}>
                                    Texto que se persiste en la columna "producto" de reclamo_items y Google Sheets.
                                </p>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>Categoría Asignada</label>
                                <select
                                    required
                                    value={productoForm.categoria_id}
                                    onChange={(e) => setProductoForm({ ...productoForm, categoria_id: e.target.value })}
                                    style={inputStyle}
                                >
                                    <option value="">Seleccione una categoría</option>
                                    {categorias.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button
                                    type="button"
                                    onClick={handleCloseProductoModal}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)',
                                        padding: '8px 16px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{
                                        background: 'var(--primary)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '8px 18px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CONFIRMAR RESET */}
            {confirmResetOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(3px)'
                }}>
                    <div style={{
                        ...cardStyle,
                        width: '90%',
                        maxWidth: '460px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: 'var(--error)' }}>
                            <AlertCircle size={24} />
                            <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>¿Restablecer Valores de Fábrica?</h3>
                        </div>
                        <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Esta acción reescribirá todos los textos de correos, botones interactivos y parámetros generales por los valores predeterminados de fábrica de Don Yeyo.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setConfirmResetOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-secondary)',
                                    padding: '8px 16px',
                                    borderRadius: 'var(--radius-sm, 8px)',
                                    cursor: 'pointer'
                                }}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleResetDefaults}
                                style={{
                                    background: 'var(--error)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '8px 18px',
                                    borderRadius: 'var(--radius-sm, 8px)',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                                disabled={saving}
                            >
                                {saving ? 'Restableciendo...' : 'Sí, Restablecer Todo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Enviar Email de Muestra */}
            {sampleModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--surface-card, var(--surface))',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md, 12px)',
                        padding: '24px',
                        maxWidth: '480px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        color: 'var(--text)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Mail size={20} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--heading-color)', fontWeight: 700 }}>
                                    Enviar Email de Muestra
                                </h3>
                            </div>
                            <button
                                onClick={() => setSampleModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
                            Permite enviar una emisión de prueba real del tipo de correo actualmente seleccionado (<strong>{selectedEmailType}</strong>) para validar diseño, botones e interactividad.
                        </p>

                        <form onSubmit={handleSendSampleEmail}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelStyle}>
                                    Número de Reclamo (para alimentar datos dinámicos) *
                                </label>
                                <input
                                    type="text"
                                    data-testid="input-sample-claim-id"
                                    value={sampleClaimId}
                                    onChange={(e) => setSampleClaimId(e.target.value)}
                                    placeholder="Ej: 20233364"
                                    style={inputStyle}
                                    required
                                />
                                <p style={subtextStyle}>Se utilizarán el nombre, productos y datos de este reclamo para rellenar la plantilla.</p>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={labelStyle}>
                                    Casilla de Correo Destino *
                                </label>
                                <input
                                    type="email"
                                    data-testid="input-sample-email-to"
                                    value={sampleEmailTo}
                                    onChange={(e) => setSampleEmailTo(e.target.value)}
                                    placeholder="gabrielt@donyeyo.com.ar"
                                    style={inputStyle}
                                    required
                                />
                                <p style={subtextStyle}>Por defecto toma la casilla configurada en <code>EMAIL_TEST_RECIPIENT</code>.</p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSampleModalOpen(false)}
                                    className="btn"
                                    style={{
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)',
                                        padding: '8px 16px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    data-testid="btn-confirm-send-sample"
                                    disabled={sendingSample}
                                    className="btn btn-primary"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'var(--primary)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '8px 18px',
                                        borderRadius: 'var(--radius-sm, 8px)',
                                        cursor: sendingSample ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {sendingSample ? <RefreshCw size={15} className="spin" /> : <Send size={15} />}
                                    <span>{sendingSample ? 'Despachando...' : 'Enviar Muestra Ahora'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
