import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { estadosApi } from '../services/api';

const EstadosContext = createContext(null);

export const EstadosProvider = ({ children }) => {
    const [estados, setEstados] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchEstados = useCallback(async () => {
        try {
            const res = await estadosApi.getAll();
            if (res.data?.success && Array.isArray(res.data.estados)) {
                setEstados(res.data.estados);
            }
        } catch (err) {
            console.error('Error cargando estados de workflow:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEstados();
    }, [fetchEstados]);

    /**
     * Retorna el objeto de estado completo para un status y actor dado
     */
    const getEstadoInfo = useCallback((status, actor = null) => {
        if (!status) return null;
        const norm = String(status).trim().toLowerCase();

        // Buscar primero coincidencia exacta por actor y nombre/código
        if (actor) {
            const normActor = String(actor).trim().toLowerCase();
            const foundExact = estados.find(e =>
                e.actor.toLowerCase() === normActor &&
                (e.codigo.toLowerCase() === norm || e.nombre.toLowerCase() === norm)
            );
            if (foundExact) return foundExact;
        }

        // Buscar coincidencia general por nombre o código
        return estados.find(e =>
            e.codigo.toLowerCase() === norm ||
            e.nombre.toLowerCase() === norm
        ) || null;
    }, [estados]);

    /**
     * Retorna la descripción cargada para un estado y actor dado (para usar de tooltip)
     */
    const getDescripcion = useCallback((status, actor = null) => {
        const info = getEstadoInfo(status, actor);
        return info?.descripcion || '';
    }, [getEstadoInfo]);

    /**
     * Retorna el color configurado para un estado y actor dado (para aplicar al badge)
     */
    const getColor = useCallback((status, actor = null) => {
        const info = getEstadoInfo(status, actor);
        return info?.color || null;
    }, [getEstadoInfo]);

    /**
     * Actualiza la configuración editable de un estado (descripción y color) en la BD y en memoria
     */
    const updateConfig = async (id, { descripcion, color }) => {
        const res = await estadosApi.updateConfig(id, { descripcion, color });
        if (res.data?.success && res.data?.estado) {
            const updated = res.data.estado;
            setEstados(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
            return { success: true, estado: updated };
        }
        return { success: false, error: res.data?.error || 'Error al actualizar configuración del estado' };
    };

    /**
     * Helper de actualización de descripción retrocompatible
     */
    const updateDescripcion = async (id, descripcion, color) => {
        return updateConfig(id, { descripcion, color });
    };

    return (
        <EstadosContext.Provider value={{
            estados,
            loading,
            refreshEstados: fetchEstados,
            getEstadoInfo,
            getDescripcion,
            getColor,
            updateConfig,
            updateDescripcion
        }}>
            {children}
        </EstadosContext.Provider>
    );
};

export const useEstados = () => {
    const context = useContext(EstadosContext);
    if (!context) {
        return {
            estados: [],
            loading: false,
            refreshEstados: () => {},
            getDescripcion: () => '',
            updateDescripcion: async () => ({ success: false })
        };
    }
    return context;
};
