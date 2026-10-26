const mysql = require('mysql2/promise');

// Configuración de conexión parametrizada por variables de entorno
const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10000
};

// Crear pool de conexiones reutilizable
const pool = mysql.createPool(DB_CONFIG);

/**
 * Verifica la conectividad y ejecuta las migraciones DDL iniciales
 */
async function initDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`[MYSQL] Conectado exitosamente a la base de datos '${DB_CONFIG.database}' en ${DB_CONFIG.host}.`);

        // 0. Tabla de Configuración y Credenciales del Sistema (evita límite 4KB en AWS Lambda)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS config_sistema (
                clave VARCHAR(100) PRIMARY KEY,
                valor LONGTEXT NOT NULL,
                descripcion VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 1. Tabla de Cobertura Geográfica de Supervisores (GeoJSON persistente)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS cobertura_supervisores_geo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version INT NOT NULL DEFAULT 1,
                nombre_archivo VARCHAR(255) DEFAULT 'cobertura_supervisores.geojson',
                geojson_content LONGTEXT NOT NULL,
                total_zonas INT DEFAULT 0,
                total_supervisores INT DEFAULT 0,
                activo TINYINT(1) DEFAULT 1,
                subido_por VARCHAR(150) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_activo (activo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 2. Tabla Principal de Reclamos
        await connection.query(`
            CREATE TABLE IF NOT EXISTS reclamos (
                id VARCHAR(50) NOT NULL PRIMARY KEY,
                id_num INT NOT NULL,
                cliente VARCHAR(100) DEFAULT 'Consumidor',
                fecha_alta VARCHAR(50),
                mes VARCHAR(50),
                nombre VARCHAR(150),
                apellido VARCHAR(150),
                domicilio TEXT,
                telefono VARCHAR(100),
                email VARCHAR(150),
                localidad VARCHAR(150),
                provincia VARCHAR(150),
                supervisor VARCHAR(150) DEFAULT 'Sin asignar',
                supervisor_email VARCHAR(150),
                via_contacto VARCHAR(100) DEFAULT 'Web',
                no_resuelto INT DEFAULT 1,
                comercio_compra VARCHAR(255),
                latitud VARCHAR(50),
                longitud VARCHAR(50),
                codigo_postal VARCHAR(50),
                evidencia_zip TEXT,
                fecha_carga DATETIME NULL,
                estado_admin VARCHAR(50) DEFAULT 'Pendiente',
                fecha_estado_admin DATETIME NULL,
                admin_motivo_desaprobado TEXT,
                estado_supervisor VARCHAR(50) DEFAULT 'Pendiente',
                fecha_estado_supervisor DATETIME NULL,
                supervisor_motivo_imposibilidad TEXT,
                estado_consumidor VARCHAR(50) DEFAULT 'Pendiente',
                fecha_estado_consumidor DATETIME NULL,
                estado_inocuidad VARCHAR(50) DEFAULT 'Sin acciones',
                fecha_estado_inocuidad DATETIME NULL,
                row_numbers JSON,
                sync_sheet_status VARCHAR(50) DEFAULT 'synced',
                last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_id_num (id_num),
                KEY idx_estado_admin (estado_admin),
                KEY idx_estado_supervisor (estado_supervisor),
                KEY idx_estado_consumidor (estado_consumidor),
                KEY idx_estado_inocuidad (estado_inocuidad),
                KEY idx_fecha_carga (fecha_carga)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Migración suave: asegurar columnas de timestamp, conflicto y tipos tipificados por estado
        const colsToAdd = [
            'fecha_estado_admin DATETIME NULL',
            'fecha_estado_supervisor DATETIME NULL',
            'fecha_estado_consumidor DATETIME NULL',
            'fecha_estado_inocuidad DATETIME NULL',
            'tipo_imposibilidad VARCHAR(150) NULL',
            'tipo_desaprobacion VARCHAR(150) NULL',
            'en_conflicto TINYINT(1) DEFAULT 0',
            'conflicto_motivo TEXT NULL',
            'fecha_conflicto DATETIME NULL'
        ];
        for (const colDef of colsToAdd) {
            try {
                await connection.query(`ALTER TABLE reclamos ADD COLUMN ${colDef}`);
            } catch (err) {
                // Columna ya existente
            }
        }

        // 3. Tabla de Estados Posibles del Workflow (Abstracción y descripciones para tooltips)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS workflow_estados (
                id INT AUTO_INCREMENT PRIMARY KEY,
                actor VARCHAR(30) NOT NULL, -- 'admin', 'inocuidad', 'supervisor', 'consumidor'
                codigo VARCHAR(50) NOT NULL,
                nombre VARCHAR(50) NOT NULL,
                descripcion TEXT NOT NULL,
                color VARCHAR(30) DEFAULT '#64748b',
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_actor_codigo (actor, codigo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de estados y descripciones si la tabla está vacía
        const [estadosExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM workflow_estados`);
        if (estadosExistentes && estadosExistentes[0] && estadosExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando descripciones de estados de workflow iniciales...');
            const estadosIniciales = [
                // ADMIN
                ['admin', 'Pendiente', 'Pendiente', 'Reclamo recién ingresado a la espera de evaluación inicial y aprobación por parte de la Administración.', '#f59e0b', 1],
                ['admin', 'En curso', 'En curso', 'Reclamo aprobado administrativamente. Se disparan notificaciones a Inocuidad y al Supervisor comercial asignado.', '#3b82f6', 2],
                ['admin', 'Desaprobado', 'Desaprobado', 'Reclamo desestimado o rechazado administrativamente con motivo fundado. Cancela intervenciones adicionales.', '#ef4444', 3],
                ['admin', 'Finalizado', 'Finalizado', 'Caso cerrado definitivamente tras completarse los dictámenes técnicos de Inocuidad, entrega del Supervisor y conformidad o cierre del Consumidor.', '#10b981', 4],

                // INOCUIDAD
                ['inocuidad', 'Sin acciones', 'Sin acciones', 'No se requiere intervención técnica de laboratorio o el reclamo aún no ha sido aprobado por Administración.', '#94a3b8', 1],
                ['inocuidad', 'Pendiente', 'Pendiente', 'Expediente técnico recibido por Calidad & Inocuidad. Análisis de lote, retramuestra y trazabilidad en proceso.', '#f59e0b', 2],
                ['inocuidad', 'Resuelto', 'Resuelto', 'Peritaje técnico finalizado con informe de conformidad y dictamen de laboratorio asentado.', '#10b981', 3],
                ['inocuidad', 'Imposibilidad', 'Imposibilidad', 'No es posible realizar el análisis técnico debido a falta de lote, ausencia de muestra física o datos insuficientes.', '#ef4444', 4],

                // SUPERVISOR
                ['supervisor', 'Sin acciones', 'Sin acciones', 'Sin entrega comercial asignada o reclamo cerrado/desaprobado administrativamente.', '#94a3b8', 1],
                ['supervisor', 'Pendiente', 'Pendiente', 'Supervisor comercial notificado. Instrucciones de reposición y cortesía remitidas para entrega al consumidor.', '#f59e0b', 2],
                ['supervisor', 'Resuelto', 'Resuelto', 'Reposición y producto de cortesía entregados en mano y confirmados por el supervisor comercial.', '#10b981', 3],
                ['supervisor', 'Imposibilidad', 'Imposibilidad', 'El supervisor no pudo concretar la entrega al consumidor por motivo operativo tipificado.', '#ef4444', 4],
                ['supervisor', 'Sin respuesta', 'Sin respuesta', 'El supervisor no respondió a las reiteradas solicitudes de seguimiento tras haberse agotado los plazos y reintentos máximos.', '#ea580c', 5],

                // CONSUMIDOR
                ['consumidor', 'Sin acciones', 'Sin acciones', 'Sin seguimiento directo hacia el consumidor por no corresponder compensación o reclamo desestimado.', '#94a3b8', 1],
                ['consumidor', 'Pendiente', 'Pendiente', 'Reclamo recibido, a la espera del avance de la gestión comercial y reposición.', '#f59e0b', 2],
                ['consumidor', 'En curso', 'En curso', 'Atención y coordinación de reposición en proceso de entrega hacia el consumidor.', '#3b82f6', 3],
                ['consumidor', 'Resuelto conforme', 'Resuelto conforme', 'El consumidor confirmó haber recibido la reposición y manifestó su satisfacción con el servicio.', '#10b981', 4],
                ['consumidor', 'Resuelto disconforme', 'Resuelto disconforme', 'El consumidor recibió los productos pero expresó disconformidad con la atención o el producto recibido.', '#f59e0b', 5],
                ['consumidor', 'No resuelto', 'No resuelto', 'El consumidor informó no haber recibido la reposición comprometida o persistencia del problema (Alerta de Conflicto).', '#dc2626', 6],
                ['consumidor', 'Sin respuesta', 'Sin respuesta', 'El consumidor no respondió a las encuestas periódicas de seguimiento de conformidad tras el plazo estipulado.', '#64748b', 7],
                ['consumidor', 'Cerrado', 'Cerrado', 'Caso cerrado definitivamente para el consumidor por desaprobación administrativa, imposibilidad operativa de entrega o vencimiento de plazos de respuesta.', '#475569', 8]
            ];

            for (const est of estadosIniciales) {
                await connection.query(`
                    INSERT INTO workflow_estados (actor, codigo, nombre, descripcion, color, orden)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), color = VALUES(color), orden = VALUES(orden)
                `, est);
            }
        }

        // 4. Tabla de Productos/Items asociados a cada Reclamo
        await connection.query(`
            CREATE TABLE IF NOT EXISTS reclamo_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reclamo_id VARCHAR(50) NOT NULL,
                item_row_number INT,
                categoria VARCHAR(150),
                producto VARCHAR(255),
                defecto VARCHAR(255),
                cantidad VARCHAR(50),
                vto_reclamo VARCHAR(50),
                producto_cortesia VARCHAR(255),
                lote VARCHAR(100),
                hora VARCHAR(50),
                vto VARCHAR(50),
                descripcion TEXT,
                marca VARCHAR(100) DEFAULT 'Don Yeyo',
                conserva_envase VARCHAR(50) DEFAULT 'Sí',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_reclamo_id (reclamo_id),
                CONSTRAINT fk_reclamo_items_reclamo FOREIGN KEY (reclamo_id) 
                    REFERENCES reclamos(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 5. Tabla de Auditoría de Cambios de Estado
        await connection.query(`
            CREATE TABLE IF NOT EXISTS auditoria_reclamos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reclamo_id VARCHAR(50) NOT NULL,
                actor VARCHAR(100) NOT NULL DEFAULT 'sistema',
                actor_email VARCHAR(150),
                campo_modificado VARCHAR(100) NOT NULL,
                valor_anterior TEXT,
                valor_nuevo TEXT,
                motivo TEXT,
                metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_auditoria_reclamo (reclamo_id),
                KEY idx_auditoria_fecha (created_at),
                KEY idx_auditoria_campo (campo_modificado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 6. Tabla de Seguimiento de Notificaciones (para optimización del Cron y evitar reenvíos duplicados)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS seguimiento_notificaciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reclamo_id VARCHAR(50) NOT NULL,
                destinatario_tipo VARCHAR(50) NOT NULL,
                destinatario_email VARCHAR(150) NOT NULL,
                tipo_notificacion VARCHAR(100) NOT NULL,
                reintento_nro INT DEFAULT 1,
                estado_envio VARCHAR(50) DEFAULT 'enviado',
                error_mensaje TEXT,
                enviado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_seg_reclamo (reclamo_id),
                KEY idx_seg_destinatario (destinatario_tipo),
                KEY idx_seg_fecha (enviado_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 6. Trigger para auditoría automática ante actualizaciones directas en base de datos
        await connection.query(`DROP TRIGGER IF EXISTS trg_reclamos_audit_update;`);
        await connection.query(`
            CREATE TRIGGER trg_reclamos_audit_update
            AFTER UPDATE ON reclamos
            FOR EACH ROW
            BEGIN
                IF (OLD.estado_admin <=> NEW.estado_admin) = 0 THEN
                    INSERT INTO auditoria_reclamos (reclamo_id, actor, campo_modificado, valor_anterior, valor_nuevo, motivo)
                    VALUES (NEW.id, 'trigger_db', 'estado_admin', OLD.estado_admin, NEW.estado_admin, NEW.admin_motivo_desaprobado);
                END IF;

                IF (OLD.estado_supervisor <=> NEW.estado_supervisor) = 0 THEN
                    INSERT INTO auditoria_reclamos (reclamo_id, actor, campo_modificado, valor_anterior, valor_nuevo, motivo)
                    VALUES (NEW.id, 'trigger_db', 'estado_supervisor', OLD.estado_supervisor, NEW.estado_supervisor, NEW.supervisor_motivo_imposibilidad);
                END IF;

                IF (OLD.estado_consumidor <=> NEW.estado_consumidor) = 0 THEN
                    INSERT INTO auditoria_reclamos (reclamo_id, actor, campo_modificado, valor_anterior, valor_nuevo)
                    VALUES (NEW.id, 'trigger_db', 'estado_consumidor', OLD.estado_consumidor, NEW.estado_consumidor);
                END IF;

                IF (OLD.estado_inocuidad <=> NEW.estado_inocuidad) = 0 THEN
                    INSERT INTO auditoria_reclamos (reclamo_id, actor, campo_modificado, valor_anterior, valor_nuevo)
                    VALUES (NEW.id, 'trigger_db', 'estado_inocuidad', OLD.estado_inocuidad, NEW.estado_inocuidad);
                END IF;

                IF (OLD.supervisor <=> NEW.supervisor) = 0 THEN
                    INSERT INTO auditoria_reclamos (reclamo_id, actor, campo_modificado, valor_anterior, valor_nuevo)
                    VALUES (NEW.id, 'trigger_db', 'supervisor', OLD.supervisor, NEW.supervisor);
                END IF;
            END;
        `);

        console.log('[MYSQL] Estructura de tablas, índices y triggers inicializados correctamente.');
        return true;
    } catch (err) {
        console.error('[MYSQL ERROR] Error inicializando base de datos RDS:', err.message);
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    pool,
    initDatabase
};
