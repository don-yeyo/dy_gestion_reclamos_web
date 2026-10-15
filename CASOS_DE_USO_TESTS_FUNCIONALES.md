# Casos de Uso para Pruebas Funcionales
## Sistema de Gestión de Reclamos Web - Don Yeyo S.A.

Este documento establece la especificación formal de casos de uso funcionales para pruebas manuales y automatizadas (End-to-End con Playwright) del sistema **dy_gestion_reclamos_web**.

---

## 1. Módulo de Autenticación y Autorización (RBAC)

### CU-01: Autenticación Corporativa con Microsoft Entra ID (Azure AD)
- **Actor:** Usuario Corporativo (Administrador, Inocuidad, Supervisor).
- **Precondiciones:** Disponer de una cuenta activa en el tenant de Microsoft 365 de Don Yeyo S.A.
- **Flujo Principal:**
  1. El usuario accede a la URL raíz del aplicativo (`/`).
  2. Al no poseer sesión activa, se presenta la pantalla de bienvenida con el botón institucional "Iniciar Sesión con Microsoft".
  3. El usuario pulsa el botón; se abre la ventana emergente oficial de MSAL.
  4. El usuario autentica con sus credenciales corporativas y MFA.
  5. El backend recibe el token, resuelve el rol mediante `resolveUserRole()` y emite un JWT firmado de sesión (`dy_auth_token`).
  6. La aplicación redirecciona al Dashboard con el perfil y permisos correspondientes cargados en el menú lateral.
- **Criterio de Aceptación:**
  - El usuario ingresa correctamente y su email/rol se visualizan en el sidebar.
  - Cuentas ajenas al dominio o no autorizadas reciben un mensaje de acceso denegado (HTTP 403) sin acceso a las rutas protegidas.

### CU-02: Bypass de Autenticación para Entornos de Desarrollo y Testing (Mock Auth)
- **Actor:** Desarrollador / Tester automatizado (Playwright).
- **Precondiciones:** Variable de entorno `VITE_MOCK_AUTH=true` configurada en el cliente.
- **Flujo Principal:**
  1. El cliente inicia y detecta la bandera `VITE_MOCK_AUTH=true`.
  2. Sin desplegar popups de Microsoft, invoca automáticamente `/api/auth/validate` con `VITE_MOCK_AUTH_EMAIL` y `VITE_MOCK_AUTH_NAME`.
  3. El backend genera el JWT de pruebas y la sesión se activa inmediatamente.
- **Criterio de Aceptación:**
  - Acceso inmediato al aplicativo en menos de 500ms para ejecuciones CI/CD y pruebas E2E determinísticas.

---

## 2. Dashboard y Métricas Ejecutivas

### CU-03: Visualización de KPIs y Reclamos Recientes
- **Actor:** Administrador / Inocuidad / Auditor.
- **Precondiciones:** Sesión iniciada.
- **Flujo Principal:**
  1. El usuario navega a la ruta principal (`/`).
  2. La vista consulta los endpoints de reclamos y consolida las métricas.
  3. Se renderizan las tarjetas de resumen:
     - Total de Reclamos Registrados.
     - Reclamos Pendientes de Aprobación.
     - Reclamos en Proceso de Calidad & Inocuidad.
     - Acciones de Compensación pendientes / en curso.
     - Casos Finalizados (incluyendo ratio de Finalizados Sin Respuesta - FSR).
  4. Se muestra la tabla de "Reclamos Recientes" con columnas clave: Expediente, Fecha, Consumidor, Producto, Lote, Estado Admin, Estado Inocuidad, Estado Compensación y Estado Consumidor.
- **Criterio de Aceptación:**
  - Toda la información carga sin errores de renderizado.
  - Al hacer click en cualquier fila de reclamo reciente, se abre el modal de detalle del expediente.

---

## 3. Listado General y Motor de Filtros

### CU-04: Búsqueda y Filtrado Multicriterio de Reclamos
- **Actor:** Administrador / Inocuidad.
- **Precondiciones:** Acceder a la sección "Reclamos" (`/reclamos`).
- **Flujo Principal:**
  1. El usuario visualiza la grilla completa de reclamos sincronizada con la base de datos/Google Sheets.
  2. Búsqueda por texto libre: filtra reactivamente por nombre de consumidor, DNI, teléfono, producto, lote o número de reclamo.
  3. Filtro por Estado General / Admin: Pendiente, Aprobado, Desaprobado, Finalizado.
  4. Filtro por Supervisor Asignado: Selección de supervisor específico o "Sin Asignar".
  5. Filtro por Estado de Calidad & Inocuidad: Pendiente, En Investigación, Dictaminado, No Conforme.
  6. Filtro por Estado del Consumidor: Pendiente, En Curso, Conforme, Disconforme, FSR (Finalizado Sin Respuesta).
- **Criterio de Aceptación:**
  - La grilla aplica filtros acumulativos de forma instantánea.
  - Al hacer click sobre cualquier registro se accede a su expediente sin necesidad de botones redundantes.

---

## 4. Gestión del Expediente (Modal de Detalle - 4 Cards)

### CU-05: Validación de Supervisor Obligatorio previo a la Aprobación
- **Actor:** Administrador.
- **Precondiciones:** Reclamo en estado inicial `Pendiente` sin supervisor asignado (`supervisor_asignado = null` o vacío).
- **Flujo:**
  1. El usuario abre el modal de detalle del reclamo.
  2. En la **Card 1 (Ingreso / Decisión)** se visualiza la advertencia visual destacada indicando que el reclamo no cuenta con supervisor asignado.
  3. El botón "Aprobar" permanece deshabilitado o bloqueado.
  4. El administrador selecciona un supervisor desde el selector desplegable provisto en la misma card y pulsa "Asignar".
  5. El sistema actualiza el reclamo, refresca la grilla y habilita el botón "Aprobar".
- **Criterio de Aceptación:**
  - Nunca se puede aprobar un reclamo si no cuenta con un supervisor asignado previamente.

### CU-06: Aprobación del Reclamo y Disparo Dual de Notificaciones
- **Actor:** Administrador.
- **Precondiciones:** Reclamo con supervisor asignado y estado pendiente.
- **Flujo:**
  1. El administrador hace click en "Aprobar".
  2. Se despliega el spinner global de carga bloqueando la pantalla para evitar dobles envíos durante la sincronización asíncrona.
  3. El backend:
     - Actualiza el estado administrativo a `Aprobado`.
     - Establece el estado de Inocuidad en `Pendiente`.
     - Establece el estado de Compensación en `Pendiente`.
     - Despacha correo electrónico al supervisor con los detalles de compensación e instrucciones.
     - Despacha correo electrónico al área de Calidad & Inocuidad con los datos técnicos del reclamo.
  4. Al concluir, la interfaz desbloquea la vista, actualiza los badges a color correspondiente y deshabilita los controles de decisión para evitar re-aprobaciones.
- **Criterio de Aceptación:**
  - Ambos destinatarios reciben sus respectivos correos (o se dirigen a la casilla de testing si `EMAIL_TEST_MODE=true`).
  - Las 4 cards reflejan el nuevo estado de cada actor de forma consistente.

### CU-07: Desaprobación del Reclamo con Registro de Motivo
- **Actor:** Administrador.
- **Precondiciones:** Reclamo en evaluación inicial.
- **Flujo:**
  1. El administrador pulsa "Desaprobar".
  2. Se solicita y registra el motivo fundado del rechazo.
  3. El reclamo transiciona a estado `Desaprobado`.
  4. No se disparan órdenes de compensación hacia el supervisor.
- **Criterio de Aceptación:**
  - El motivo se visualiza de forma destacada en la card correspondiente.

### CU-08: Reenvío Manual de Notificaciones a Inocuidad y Supervisor
- **Actor:** Administrador.
- **Precondiciones:** Reclamo ya aprobado previamente.
- **Flujo:**
  1. En el modal de detalle, en la esquina inferior de la **Card 2 (Calidad & Inocuidad)** y de la **Card 3 (Acción de Compensación)** aparece el botón/icono sutil de reenvío de correo.
  2. Al pulsar el icono correspondiente, se despliega confirmación y spinner.
  3. El backend regenera el correo y lo reenvía al destinatario.
  4. Se muestra notificación modal de éxito con el diseño estándar de Don Yeyo S.A.
- **Criterio de Aceptación:**
  - El correo se reenvía sin alterar los estados ni resetear el historial del reclamo.

---

## 5. Portal Público de Declaración de Imposibilidad

### CU-09: Declaración de Imposibilidad de Compensación por Supervisor
- **Actor:** Supervisor de Zona.
- **Precondiciones:** El supervisor recibe el correo con enlace securizado que incluye token HMAC (`/imposibilidad?token=...`).
- **Flujo:**
  1. El supervisor abre el enlace en su navegador (móvil o de escritorio).
  2. La vista `/imposibilidad` valida la firma del token criptográfico sin exigir inicio de sesión corporativo.
  3. Se muestran los datos básicos del reclamo y del consumidor para verificar el caso.
  4. El supervisor selecciona el motivo de imposibilidad (e.g., "Domicilio inaccesible", "Consumidor no atiende reiteradamente", "Dirección incorrecta", "Falta de stock del producto").
  5. Completa observaciones adicionales y pulsa "Confirmar Imposibilidad".
  6. La pantalla bloquea con spinner y confirma la operación.
  7. El backend actualiza el estado de la compensación a `Imposibilidad` y notifica al administrador.
- **Criterio de Aceptación:**
  - Tokens vencidos o manipulados son rechazados con aviso de seguridad.
  - En el Dashboard y Modal de Detalle, la Card 3 pasa a estado `Imposibilidad` con el motivo registrado visible.

---

## 6. Lógica de Estados Automáticos y Cierre del Caso

### CU-10: Transición Automática a "Finalizado"
- **Actor:** Sistema (Backend / Eventos de sincronización).
- **Precondiciones:** Reclamo previamente `Aprobado` por el Administrador.
- **Regla de Negocio:**
  - Calidad & Inocuidad: Estado distinto de `Pendiente` (ej: `Dictaminado`, `Conforme`, `No Conforme`, `Resuelto`).
  - Supervisor: Estado en `Resuelto` o `Imposibilidad`.
  - Consumidor: Estado distinto de `Pendiente`, `En Curso` y `Sin Acciones` (ej: `Conforme`, `Disconforme`, `FSR`).
- **Resultado:**
  - El sistema conmuta automáticamente el estado general/admin del reclamo a `Finalizado`.
- **Criterio de Aceptación:**
  - El reclamo se clasifica en los filtros bajo `Finalizado` y el badge refleja el color de cierre exitoso.

### CU-11: Cierre por Vencimiento de Plazo sin Respuesta (FSR)
- **Actor:** Tarea Programada (CRON `/api/cron/verificar-fsr`).
- **Precondiciones:** Se envió solicitud de respuesta al consumidor y transcurrieron más de $J$ días configurables desde el último intento de contacto.
- **Flujo:**
  1. El endpoint o cron job evalúa reclamos en espera de respuesta del consumidor.
  2. Si `dias_transcurridos >= DIAS_LIMITE_RESPUESTA_CONSUMIDOR`:
     - El estado del consumidor pasa a `FSR` ("Finalizado Sin Respuesta").
     - Se registra la fecha y motivo de cierre automático.
  3. Si además Inocuidad y Supervisor finalizaron sus partes, el caso se asume `Finalizado`.
- **Criterio de Aceptación:**
  - En la interfaz se muestra el badge `FSR` con tooltip explicativo: *"Finalizado Sin Respuesta: El consumidor no respondió a las solicitudes de seguimiento tras el plazo estipulado"*.

---

## 7. Infraestructura de Correo y Modo Testing

### CU-12: Enrutamiento Dual SMTP y Aislamiento de Testing
- **Actor:** Sistema de Notificaciones.
- **Precondiciones:**
  - Alertas internas: `ALERTA_SMTP_*` (Microsoft Outlook corporativo).
  - Emails a consumidores: `CONSUMIDOR_SMTP_*` (Gmail / Pasarela externa).
  - Modo testing activado: `EMAIL_TEST_MODE=true` con `EMAIL_TEST_RECIPIENT=casilla@donyeyo.com.ar`.
- **Flujo:**
  1. Se dispara cualquier evento de correo en el sistema.
  2. El servicio `emailWorkflowService.js` detecta `EMAIL_TEST_MODE=true`.
  3. El correo no se envía a la casilla real del consumidor ni del personal externo; se redirige íntegramente a `EMAIL_TEST_RECIPIENT`, agregando prefijo en el asunto `[MODO TEST - Para: destinatario_original]`.
- **Criterio de Aceptación:**
  - Cero riesgo de fuga de correos en pruebas.
  - Verificación visual completa del cuerpo HTML y enlaces generados.

---

## 8. Reglas de Compensación & Cortesía (Fórmula Google Sheet)

### CU-13: Cálculo y Configuración Dinámica de Producto de Cortesía
- **Actor:** Administrador / Sistema Automatizado.
- **Precondiciones:**
  - Fórmula original de Google Sheets: `=+SI(P3361="";"";SI(SI.ERROR(BUSCARV(P3361;'Reclamos 2023'!$AJ$15:$AJ$19;1;0);'Reclamos 2023'!$AG$19)=P3361;'Reclamos 2023'!$AG$18;'Reclamos 2023'!$AG$19))`
- **Flujo:**
  1. El Administrador puede abrir el modal **"Reglas de Cortesía"** desde el menú lateral (Drawer -> Configuración).
  2. Puede visualizar la explicación matemática de la fórmula y ajustar:
     - Compensación Estándar (`$AG$18` - defecto leve/catalogado).
     - Compensación Especial / Crítica (`$AG$19` - defecto grave/no listado).
     - Lista de Defectos Estándar (`$AJ$15:$AJ$19`).
  3. Puede utilizar el **Simulador en Vivo** para tipear cualquier defecto y verificar qué cortesía arrojaría.
  4. Al hacer clic en **"Guardar Cambios"**, la regla se persiste en la base de datos MySQL (`config_sistema.clave = 'regla_producto_cortesia'`).
  5. Al **Aprobar el reclamo** (desde el modal de detalle o mediante el enlace rápido de aprobación por email):
     - El backend evalúa cada ítem del reclamo contra la regla activa.
     - Actualiza la celda **"Producto cortesía"** en la **columna S** de Google Sheets.
     - Persiste el valor en la tabla MySQL `reclamo_items.producto_cortesia`.
     - Inserta una tarjeta destacada con el **Producto de Cortesía** asignado en el email de acción enviado al supervisor comercial.
- **Criterio de Aceptación:**
  - Si el reclamo tiene un defecto en la lista estándar, asigna la compensación estándar.
  - Si el reclamo tiene un defecto grave (ej: cuerpo extraño) o no catalogado, asigna la compensación especial.
  - La columna S en Google Sheets, la DB y el email al supervisor quedan perfectamente sincronizados con el mismo valor.

---

## 9. Matriz de Cobertura E2E con Playwright

| ID Test E2E | Escenario Automatizado | Archivo de Prueba |
| :--- | :--- | :--- |
| `TC-E2E-01` | Carga del Dashboard con Mock Auth y visualización de KPIs | `client/e2e/dashboard.spec.js` |
| `TC-E2E-02` | Navegación a Listado de Reclamos y filtrado por estado consumidor | `client/e2e/reclamos-list.spec.js` |
| `TC-E2E-03` | Modal de detalle: visualización de 4 cards y bloqueo de aprobación sin supervisor | `client/e2e/claim-detail-modal.spec.js` |
| `TC-E2E-04` | Acceso a Portal Público de Imposibilidad con token y envío de motivo | `client/e2e/imposibilidad-public.spec.js` |
| `TC-E2E-05` | Feedback visual: Spinners y bloqueo durante operaciones asíncronas | `client/e2e/async-loading.spec.js` |
| `TC-E2E-06` | Apertura de modal de Reglas de Cortesía desde Drawer, verificación de fórmula y simulador interactivo | `client/e2e/reglas-cortesia.spec.js` |
