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
            'fecha_conflicto DATETIME NULL',
            'prioridad INT NULL',
            'prioridad_nombre VARCHAR(50) NULL',
            'sla_dias INT NULL',
            'fecha_limite_sla DATETIME NULL',
            'regla_cortesia_aplicada TEXT NULL',
            'consumidor_puntuacion INT NULL',
            'consumidor_tipo_problema VARCHAR(150) NULL',
            'consumidor_comentario TEXT NULL'
        ];
        for (const colDef of colsToAdd) {
            try {
                await connection.query(`ALTER TABLE reclamos ADD COLUMN ${colDef}`);
            } catch (err) {
                // Columna ya existente
            }
        }

        // 3. Tabla de Prioridades del Workflow (Nivel de gravedad y reglas de cortesía)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS workflow_prioridades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo INT NOT NULL UNIQUE,
                nombre VARCHAR(50) NOT NULL,
                descripcion TEXT NOT NULL,
                sla INT NOT NULL DEFAULT 7,
                reglas_cortesia JSON NOT NULL,
                color VARCHAR(30) DEFAULT '#ef4444',
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de prioridades si la tabla está vacía
        const [prioridadesExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM workflow_prioridades`);
        if (prioridadesExistentes && prioridadesExistentes[0] && prioridadesExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando prioridades de workflow iniciales...');
            const prioridadesIniciales = [
                [
                    10,
                    'Alta',
                    'Casos críticos y graves que implican reconocer el error rápidamente',
                    3,
                    JSON.stringify([
                        { codigo: 'codigo1', descripcion: '1 reemplazo + 2 productos a elección + 2 de kg' }
                    ]),
                    '#ef4444',
                    1
                ],
                [
                    20,
                    'Media',
                    'Casos leves que no representan un daño importante para el consumidor',
                    7,
                    JSON.stringify([
                        { codigo: 'codigo2', descripcion: '1 reemplazo' }
                    ]),
                    '#f59e0b',
                    2
                ],
                [
                    30,
                    'Baja',
                    'Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa',
                    14,
                    JSON.stringify([
                        { codigo: 'codigo3', descripcion: '1 reemplazo + 1 de kg' }
                    ]),
                    '#3b82f6',
                    3
                ]
            ];

            for (const prio of prioridadesIniciales) {
                await connection.query(`
                    INSERT INTO workflow_prioridades (codigo, nombre, descripcion, sla, reglas_cortesia, color, orden)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), sla = VALUES(sla), color = VALUES(color), orden = VALUES(orden)
                `, prio);
            }
        }

        // 4. Tabla de Estados Posibles del Workflow (Abstracción y descripciones para tooltips)
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
                ['consumidor', 'Resuelto sin confirmar', 'Resuelto sin confirmar', 'El supervisor comercial declaró haber resuelto el caso y entregado la compensación. A la espera de confirmación de recepción y conformidad por parte del consumidor.', '#06b6d4', 4],
                ['consumidor', 'Resuelto conforme', 'Resuelto conforme', 'El consumidor confirmó haber recibido la reposición y manifestó su satisfacción con el servicio.', '#10b981', 5],
                ['consumidor', 'Resuelto disconforme', 'Resuelto disconforme', 'El consumidor recibió los productos pero expresó disconformidad con la atención o el producto recibido.', '#f59e0b', 6],
                ['consumidor', 'No resuelto', 'No resuelto', 'El consumidor informó no haber recibido la reposición comprometida o persistencia del problema (Alerta de Conflicto).', '#dc2626', 7],
                ['consumidor', 'Sin respuesta', 'Sin respuesta', 'El consumidor no respondió a las encuestas periódicas de seguimiento de conformidad tras el plazo estipulado.', '#64748b', 8],
                ['consumidor', 'Cerrado', 'Cerrado', 'Caso cerrado definitivamente para el consumidor por desaprobación administrativa, imposibilidad operativa de entrega o vencimiento de plazos de respuesta.', '#475569', 9]
            ];

            for (const est of estadosIniciales) {
                await connection.query(`
                    INSERT INTO workflow_estados (actor, codigo, nombre, descripcion, color, orden)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), color = VALUES(color), orden = VALUES(orden)
                `, est);
            }
        } else {
            // Asegurar que 'Resuelto sin confirmar' esté presente en bases de datos ya sembradas
            await connection.query(`
                INSERT INTO workflow_estados (actor, codigo, nombre, descripcion, color, orden)
                VALUES ('consumidor', 'Resuelto sin confirmar', 'Resuelto sin confirmar', 'El supervisor comercial declaró haber resuelto el caso y entregado la compensación. A la espera de confirmación de recepción y conformidad por parte del consumidor.', '#06b6d4', 4)
                ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), color = VALUES(color), orden = VALUES(orden)
            `);
        }

        // 4. Tabla de Reglas de Seguimientos de Workflow
        await connection.query(`
            CREATE TABLE IF NOT EXISTS workflow_seguimientos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rol VARCHAR(30) NOT NULL, -- 'admin', 'supervisor', 'inocuidad', 'consumidor'
                estado_codigo VARCHAR(50) NOT NULL,
                prioridad_codigo INT NOT NULL, -- 10, 20, 30
                disparo_dias DECIMAL(6,2) NOT NULL DEFAULT 3.00,
                repeticiones INT NOT NULL DEFAULT 3,
                emails_elevacion TEXT NULL,
                activo TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_rol_estado_prioridad (rol, estado_codigo, prioridad_codigo),
                INDEX idx_rol_estado (rol, estado_codigo),
                INDEX idx_prioridad (prioridad_codigo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de reglas de seguimiento si la tabla está vacía
        const [seguimientosExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM workflow_seguimientos`);
        if (seguimientosExistentes && seguimientosExistentes[0] && seguimientosExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando reglas de seguimiento de workflow iniciales...');
            const seguimientosIniciales = [
                // Supervisor - Pendiente
                ['supervisor', 'Pendiente', 10, 1.0, 3, 'gerencia@donyeyo.com.ar, calidad@donyeyo.com.ar', 1],
                ['supervisor', 'Pendiente', 20, 2.0, 3, 'gerencia@donyeyo.com.ar', 1],
                ['supervisor', 'Pendiente', 30, 3.0, 3, 'gerencia@donyeyo.com.ar', 1],

                // Inocuidad - Pendiente
                ['inocuidad', 'Pendiente', 10, 1.0, 2, 'jefatura_calidad@donyeyo.com.ar, direccion@donyeyo.com.ar', 1],
                ['inocuidad', 'Pendiente', 20, 2.0, 2, 'jefatura_calidad@donyeyo.com.ar', 1],
                ['inocuidad', 'Pendiente', 30, 4.0, 2, 'jefatura_calidad@donyeyo.com.ar', 1],

                // Consumidor - En curso
                ['consumidor', 'En curso', 10, 2.0, 2, 'atencionalcliente@donyeyo.com.ar', 1],
                ['consumidor', 'En curso', 20, 4.0, 2, 'atencionalcliente@donyeyo.com.ar', 1],
                ['consumidor', 'En curso', 30, 7.0, 2, 'atencionalcliente@donyeyo.com.ar', 1],

                // Admin - Pendiente
                ['admin', 'Pendiente', 10, 1.0, 2, 'admin_guardia@donyeyo.com.ar', 1],
                ['admin', 'Pendiente', 20, 2.0, 2, 'admin_guardia@donyeyo.com.ar', 1],
                ['admin', 'Pendiente', 30, 3.0, 2, 'admin_guardia@donyeyo.com.ar', 1]
            ];

            for (const seg of seguimientosIniciales) {
                await connection.query(`
                    INSERT INTO workflow_seguimientos (rol, estado_codigo, prioridad_codigo, disparo_dias, repeticiones, emails_elevacion, activo)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE disparo_dias = VALUES(disparo_dias), repeticiones = VALUES(repeticiones)
                `, seg);
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_seg_reclamo (reclamo_id),
                KEY idx_seg_destinatario (destinatario_tipo),
                KEY idx_seg_fecha (enviado_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            await connection.query('ALTER TABLE seguimiento_notificaciones ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        } catch (_) {}

        // 7. Tabla de Logs de Modificaciones en Configuraciones del Sistema
        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs_configuracion (
                id INT AUTO_INCREMENT PRIMARY KEY,
                modulo VARCHAR(100) NOT NULL, -- 'prioridades_sla', 'cortesia', 'estados_workflow', 'seguimientos', 'cobertura_supervisores'
                accion VARCHAR(50) NOT NULL, -- 'creacion', 'modificacion', 'toggle_activo', 'eliminacion'
                descripcion TEXT NOT NULL,
                actor VARCHAR(100) NOT NULL DEFAULT 'admin',
                actor_email VARCHAR(150) NULL,
                valores_anteriores JSON NULL,
                valores_nuevos JSON NULL,
                ip_address VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_log_cfg_modulo (modulo),
                KEY idx_log_cfg_accion (accion),
                KEY idx_log_cfg_fecha (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 8. Tabla de Logs de Envíos de Emails (Historial exhaustivo de todas las emisiones)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs_emails (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reclamo_id VARCHAR(50) NULL,
                destinatario_tipo VARCHAR(50) NOT NULL, -- 'supervisor', 'inocuidad', 'consumidor', 'admin', 'elevacion'
                destinatario_email VARCHAR(255) NOT NULL,
                tipo_disparo VARCHAR(30) NOT NULL DEFAULT 'automatico', -- 'automatico', 'manual'
                asunto VARCHAR(255) NOT NULL,
                motivo TEXT NOT NULL, -- Explicación detallada del por qué se envió
                mensaje_resumen TEXT NULL, -- Resumen del cuerpo del correo para rápida lectura
                cuerpo_html MEDIUMTEXT NULL, -- Contenido HTML o plantilla completa emitida
                actor VARCHAR(100) DEFAULT 'sistema', -- 'cron_sistema', 'administrador', etc.
                actor_email VARCHAR(150) NULL,
                reintento_nro INT DEFAULT 1,
                estado_envio VARCHAR(50) DEFAULT 'enviado', -- 'enviado', 'fallido', 'simulado_test'
                error_mensaje TEXT NULL,
                metadata JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_log_em_reclamo (reclamo_id),
                KEY idx_log_em_destinatario (destinatario_tipo),
                KEY idx_log_em_disparo (tipo_disparo),
                KEY idx_log_em_estado (estado_envio),
                KEY idx_log_em_fecha (created_at)
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

        // 8. Tabla de Categorías de Productos (con mapeo de emails de Inocuidad)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS producto_categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL UNIQUE,
                inocuidad_emails TEXT NOT NULL,
                activo TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_activo (activo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de categorías de productos si está vacía
        const [catsExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM producto_categorias`);
        if (catsExistentes && catsExistentes[0] && catsExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando categorías de productos iniciales con emails de inocuidad...');
            const categoriasIniciales = [
                ['Pastas Frescas', 'inocuidad.pastas@donyeyo.com.ar, calidad@donyeyo.com.ar', 1],
                ['Tapas y Masas', 'inocuidad.tapas@donyeyo.com.ar, calidad@donyeyo.com.ar', 1],
                ['Panificados y Secos', 'inocuidad.panificados@donyeyo.com.ar, calidad@donyeyo.com.ar', 1]
            ];
            for (const cat of categoriasIniciales) {
                await connection.query(`
                    INSERT INTO producto_categorias (nombre, inocuidad_emails, activo)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE inocuidad_emails = VALUES(inocuidad_emails)
                `, cat);
            }
        }

        // 9. Tabla de Catálogo de Productos (nombre interno, packaging y categoría)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS productos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre_interno VARCHAR(255) NOT NULL,
                nombre_empaque VARCHAR(255) NOT NULL,
                categoria_id INT NOT NULL,
                activo TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_nombre_empaque (nombre_empaque),
                INDEX idx_categoria_id (categoria_id),
                CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) 
                    REFERENCES producto_categorias(id) ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de productos si está vacía
        const [prodsExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM productos`);
        if (prodsExistentes && prodsExistentes[0] && prodsExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando productos iniciales de catálogo...');
            const productosIniciales = [
                ['Ravioles de Ricota y Pollo 500g', 'Ravioles Ricota y Pollo Don Yeyo x 500g', 1, 1],
                ['Ñoquis de Papa 500g', 'Ñoquis de Papa Clásicos Don Yeyo x 500g', 1, 1],
                ['Tallarines al Huevo 500g', 'Fideos Tallarines al Huevo Don Yeyo x 500g', 1, 1],
                ['Tapas de Empanadas Hojaldre x 12', 'Tapas para Empanadas Hojaldradas Don Yeyo 12 un', 2, 1],
                ['Tapas de Pascualina Criolla x 2', 'Pascualina Criolla Don Yeyo x 2 discos', 2, 1],
                ['Pan de Mesa Blanco 400g', 'Pan de Mesa Lactal Blanco Don Yeyo 400g', 3, 1]
            ];
            for (const prod of productosIniciales) {
                await connection.query(`
                    INSERT INTO productos (nombre_interno, nombre_empaque, categoria_id, activo)
                    VALUES (?, ?, ?, ?)
                `, prod);
            }
        }

        // 10. Tabla de Configuración Global del Sistema (Textos de Emails, Botones y Parámetros)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS config_sistema (
                clave VARCHAR(100) NOT NULL PRIMARY KEY,
                valor LONGTEXT NULL,
                categoria VARCHAR(50) NOT NULL DEFAULT 'general',
                etiqueta VARCHAR(150) NULL,
                descripcion VARCHAR(255) NULL,
                valor_defecto LONGTEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_categoria (categoria)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Sembrado inicial de configuraciones si está vacía
        const [configsExistentes] = await connection.query(`SELECT COUNT(*) as cant FROM config_sistema WHERE clave LIKE 'email_%'`);
        if (configsExistentes && configsExistentes[0] && configsExistentes[0].cant === 0) {
            console.log('[STARTUP] Sembrando configuraciones globales y textos de fábrica para emails...');
            const configuracionesIniciales = [
                // 1. Email Supervisor
                ['email_supervisor_asunto', '[Acción Requerida] Reclamo #{claim_id} - {consumidor_nombre} ({localidad})', 'email_supervisor', 'Asunto del correo a Supervisor', 'Variables admitidas: {claim_id}, {consumidor_nombre}, {localidad}', '[Acción Requerida] Reclamo #{claim_id} - {consumidor_nombre} ({localidad})'],
                ['email_supervisor_titulo', 'Acción Comercial Requerida - Reclamo #{claim_id}', 'email_supervisor', 'Título del encabezado', 'Título principal del banner superior', 'Acción Comercial Requerida - Reclamo #{claim_id}'],
                ['email_supervisor_intro', 'Se ha puesto en curso un reclamo en tu zona de cobertura que requiere de tu intervención para reposición o entrega de cortesía.', 'email_supervisor', 'Mensaje introductorio', 'Párrafo de apertura antes de los datos del consumidor', 'Se ha puesto en curso un reclamo en tu zona de cobertura que requiere de tu intervención para reposición o entrega de cortesía.'],
                ['email_supervisor_leyenda_botones', 'Por favor, una vez gestionado este caso, informá el estado haciendo clic en el botón correspondiente:', 'email_supervisor', 'Texto sobre botones de acción', 'Instrucción antes de los botones de interacción rápida', 'Por favor, una vez gestionado este caso, informá el estado haciendo clic en el botón correspondiente:'],
                ['email_supervisor_btn_resuelto', '✓ Pude Resolver la Acción', 'email_supervisor', 'Texto botón: Resuelto', 'Botón verde de acción rápida', '✓ Pude Resolver la Acción'],
                ['email_supervisor_btn_imposibilidad', '✕ Existe una Imposibilidad', 'email_supervisor', 'Texto botón: Imposibilidad', 'Botón rojo que abre el formulario de motivo', '✕ Existe una Imposibilidad'],

                // 2. Email Consumidor
                ['email_consumidor_asunto', 'Seguimiento de tu Reclamo en Don Yeyo #{claim_id}', 'email_consumidor', 'Asunto del correo a Consumidor', 'Variables: {claim_id}, {consumidor_nombre}', 'Seguimiento de tu Reclamo en Don Yeyo #{claim_id}'],
                ['email_consumidor_titulo', 'Don Yeyo - Seguimiento de tu Reclamo #{claim_id}', 'email_consumidor', 'Título de cabecera', 'Encabezado del correo de conformidad', 'Don Yeyo - Seguimiento de tu Reclamo #{claim_id}'],
                ['email_consumidor_intro', 'Nos contactamos para saber cómo te fue con la resolución de tu reclamo y si recibiste la reposición de tus productos de parte de nuestro equipo comercial.', 'email_consumidor', 'Mensaje de consulta', 'Cuerpo explicativo de la encuesta', 'Nos contactamos para saber cómo te fue con la resolución de tu reclamo y si recibiste la reposición de tus productos de parte de nuestro equipo comercial.'],
                ['email_consumidor_btn_conforme', '✓ Resuelto', 'email_consumidor', 'Texto botón: Resuelto', 'Botón verde que abre la página de encuesta (5 estrellas y comentario)', '✓ Resuelto'],
                ['email_consumidor_btn_disconforme', '~ Resuelto Disconforme', 'email_consumidor', 'Texto botón: Disconforme (Legacy)', 'Botón naranja de disconformidad', '~ Resuelto Disconforme'],
                ['email_consumidor_btn_no_resuelto', '✕ No Resuelto', 'email_consumidor', 'Texto botón: No Resuelto', 'Botón rojo que abre la página para seleccionar tipo de problema y comentario', '✕ No Resuelto'],

                // 3. Email Inocuidad
                ['email_inocuidad_asunto', '[Calidad / Inocuidad] Nuevo Reclamo Aprobado #{claim_id} - {consumidor_nombre}', 'email_inocuidad', 'Asunto del correo a Inocuidad', 'Variables: {claim_id}, {consumidor_nombre}', '[Calidad / Inocuidad] Nuevo Reclamo Aprobado #{claim_id} - {consumidor_nombre}'],
                ['email_inocuidad_titulo', 'Expediente Técnico - Reclamo Aprobado #{claim_id}', 'email_inocuidad', 'Título de cabecera', 'Encabezado del expediente técnico', 'Expediente Técnico - Reclamo Aprobado #{claim_id}'],
                ['email_inocuidad_intro', 'El reclamo #{claim_id} ha sido Aprobado por la administración. Se envía copia completa del expediente para iniciar la investigación técnica, análisis de lote y trazabilidad correspondiente.', 'email_inocuidad', 'Mensaje introductorio', 'Párrafo de remisión técnica', 'El reclamo #{claim_id} ha sido Aprobado por la administración. Se envía copia completa del expediente para iniciar la investigación técnica, análisis de lote y trazabilidad correspondiente.'],
                ['email_inocuidad_btn_gestor', 'Abrir en el Gestor Web', 'email_inocuidad', 'Texto botón: Gestor Web', 'Botón azul marino para ver el reclamo online', 'Abrir en el Gestor Web'],
                ['email_inocuidad_btn_evidencias', 'Descargar Evidencias ZIP', 'email_inocuidad', 'Texto botón: Evidencias', 'Botón violeta para descargar paquete de fotos', 'Descargar Evidencias ZIP'],

                // 4. Email Elevación
                ['email_elevacion_asunto', '[ELEVACIÓN] Sin respuesta de acción - Reclamo #{claim_id} ({supervisor})', 'email_elevacion', 'Asunto del correo de elevación', 'Variables: {claim_id}, {supervisor}', '[ELEVACIÓN] Sin respuesta de acción - Reclamo #{claim_id} ({supervisor})'],
                ['email_elevacion_titulo', 'ALERTA DE ELEVACIÓN AUTOMÁTICA - Reclamo #{claim_id}', 'email_elevacion', 'Título de cabecera', 'Encabezado de alerta directiva', 'ALERTA DE ELEVACIÓN AUTOMÁTICA - Reclamo #{claim_id}'],
                ['email_elevacion_intro', 'Se ha activado la regla de elevación ejecutiva por haberse agotado el número máximo de recordatorios sin respuesta oportuna.', 'email_elevacion', 'Mensaje de advertencia', 'Cuerpo de la alerta de escalamiento', 'Se ha activado la regla de elevación ejecutiva por haberse agotado el número máximo de recordatorios sin respuesta oportuna.'],
                ['email_elevacion_btn_revisar', 'Revisar caso en el Gestor Web', 'email_elevacion', 'Texto botón: Revisar', 'Enlace directo al caso en el gestor', 'Revisar caso en el Gestor Web'],

                // 5. Email Conflicto / Fraude
                ['email_fraude_asunto', '🚨 [CONFLICTO / POSIBLE FRAUDE] Discrepancia en Reclamo #{claim_id} - {supervisor}', 'email_fraude', 'Asunto de alerta de fraude', 'Variables: {claim_id}, {supervisor}', '🚨 [CONFLICTO / POSIBLE FRAUDE] Discrepancia en Reclamo #{claim_id} - {supervisor}'],
                ['email_fraude_titulo', '🚨 ALERTA CRÍTICA: POSIBLE FRAUDE / CONFLICTO', 'email_fraude', 'Título de cabecera', 'Encabezado rojo de discrepancia grave', '🚨 ALERTA CRÍTICA: POSIBLE FRAUDE / CONFLICTO'],
                ['email_fraude_intro', 'Se ha detectado una inconsistencia grave en el seguimiento del Reclamo #{claim_id}: El supervisor declaró haber entregado la reposición pero el consumidor informó NO haber recibido el producto.', 'email_fraude', 'Mensaje de auditoría', 'Detalle de la discrepancia comercial', 'Se ha detectado una inconsistencia grave en el seguimiento del Reclamo #{claim_id}: El supervisor declaró haber entregado la reposición pero el consumidor informó NO haber recibido el producto.'],
                ['email_fraude_btn_auditar', 'Auditar Reclamo en Gestor Web', 'email_fraude', 'Texto botón: Auditar', 'Botón de auditoría inmediata', 'Auditar Reclamo en Gestor Web'],

                // 6. Configuración General y Notificaciones de Respaldo
                ['emails_admin_notificaciones', 'administracion@donyeyo.com.ar', 'general', 'Emails de Administración', 'Direcciones receptoras de avisos de imposibilidad, respuestas de consumidores y alertas de conflicto (separadas por coma)', 'administracion@donyeyo.com.ar'],
                ['emails_inocuidad_default', 'inocuidad@donyeyo.com.ar', 'general', 'Email Inocuidad General (Respaldo)', 'Casilla a la que se remite el expediente si el producto no tiene categoría asignada', 'inocuidad@donyeyo.com.ar'],
                ['emails_elevacion_default', 'calidad@donyeyo.com.ar, gerencia@donyeyo.com.ar', 'general', 'Emails de Elevación (Respaldo)', 'Casillas directivas notificadas cuando una regla de seguimiento no especifica emails propios', 'calidad@donyeyo.com.ar, gerencia@donyeyo.com.ar'],
                ['email_logo_url', '', 'general', 'URL Pública del Logotipo (HTTPS)', 'URL pública absoluta con HTTPS al logotipo de Don Yeyo para encabezados de emails y vistas públicas. Si está vacío, se muestra texto corporativo.', ''],
                ['email_pie_institucional', 'Sistema de Gestión de Reclamos Automatizado - Don Yeyo S.A.', 'general', 'Firma y Pie de Página de Correos', 'Texto al pie de todas las plantillas HTML', 'Sistema de Gestión de Reclamos Automatizado - Don Yeyo S.A.'],
                ['mensaje_conservar_muestra', 'Por favor, recordá conservar el producto reclamado junto a su envase y lote original para un eventual peritaje o análisis de laboratorio.', 'general', 'Mensaje de Conservación de Muestra', 'Texto de recomendación al registrar un nuevo reclamo', 'Por favor, recordá conservar el producto reclamado junto a su envase y lote original para un eventual peritaje o análisis de laboratorio.'],
                ['mensaje_reapertura_personal', 'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.', 'general', 'Mensaje de Reabrir Caso (Personal Interno / Supervisión / Inocuidad)', 'Texto de orientación mostrado a Supervisores o Personal de Calidad cuando intentan accionar sobre un reclamo que ya registró un cambio de estado previo.', 'Si necesitás reconsiderar tu decisión o reabrir el expediente de este reclamo, por favor contactate con la Administración de Don Yeyo S.A. indicando el número de caso.']
            ];

            for (const cfg of configuracionesIniciales) {
                await connection.query(`
                    INSERT INTO config_sistema (clave, valor, categoria, etiqueta, descripcion, valor_defecto)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), etiqueta = VALUES(etiqueta), descripcion = VALUES(descripcion), valor_defecto = VALUES(valor_defecto)
                `, cfg);
            }
        }

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
