# Don Yeyo S.A. - Plataforma de Gestión de Reclamos Web

Sistema integral corporativo para la recepción, triaje geográfico, aprobación administrativa, seguimiento de supervisores y dictamen de calidad/inocuidad de reclamos de consumidores de **Don Yeyo S.A.**

---

## 🏗 Arquitectura del Proyecto

El proyecto está organizado en dos componentes desacoplados con sus propios entornos y dependencias independientes, preparado para despliegue serverless continuo en **Netlify**:

```
dy_gestion_reclamos_web/
├── client/                     # Frontend SPA en React + Vite
│   ├── src/
│   │   ├── components/         # Header, Drawer, Modal, ConfirmModal, StatusBadge, Layout
│   │   ├── config/             # MSAL Azure AD SSO y Contexto de Autenticación
│   │   ├── pages/              # Dashboard, ReclamosList, ReclamoDetailModal, ImposibilidadPublic
│   │   ├── services/           # Cliente Axios e interceptores seguros
│   │   ├── index.css           # Sistema de diseño Don Yeyo (Dark/Light + Glassmorphism)
│   │   ├── App.jsx             # Enrutamiento con React Router DOM
│   │   └── main.jsx            # Entry point
│   ├── .env                    # Variables locales de entorno del cliente
│   ├── .env.template           # Plantilla documentada
│   └── package.json
│
├── server/                     # Backend API REST en Node.js + Express
│   ├── functions/              # Netlify Serverless Functions (api.js)
│   ├── config/                 # Conexión MySQL Pool (RDS), esquemas DDL y roles RBAC
│   ├── credentials/            # Cuenta de servicio de Google Sheets (service-account JSON)
│   ├── data/                   # Respaldo GeoJSON de cobertura geográfica de supervisores
│   ├── middlewares/            # Autenticación JWT y control de roles RBAC
│   ├── routes/                 # Rutas auth, reclamos, auditoría, sincronización y supervisores
│   ├── services/
│   │   ├── reclamosDatabaseService.js # Persistencia transaccional MySQL, items, auditoría y notificaciones
│   │   ├── googleSheetsService.js   # Dual-write y sincronización en paralelo con Google Sheets
│   │   ├── supervisorLookupService.js # Geolocalización con persistencia de GeoJSON en MySQL
│   │   ├── emailWorkflowService.js  # Envío de correos y generación de tokens HMAC seguros
│   │   └── cronFollowupService.js   # Reglas de seguimiento de días N, M, O, P, F con contador persistente
│   ├── index.js                # Servidor Express con Helmet, CORS, MySQL y Rate Limiting
│   ├── .env                    # Variables locales de entorno del servidor
│   ├── .env.template           # Plantilla documentada
│   └── package.json
│
├── netlify.toml                # Orquestación de build, redirects SPA y funciones serverless
├── .gitignore                  # Exclusión de credenciales y node_modules
└── README.md
```

---

## 🗄️ Arquitectura Híbrida: MySQL (AWS RDS) + Google Sheets en Paralelo

Para satisfacer la necesidad de alto rendimiento en el gestor web y simultáneamente garantizar que los **tableros de Power BI** y los usuarios corporativos sigan contando con los datos en tiempo real en la planilla de **Google Sheets**:

1. **Lectura Acelerada (<10 ms):**
   - El Gestor Web consulta los reclamos e ítems directamente desde la base de datos **MySQL en AWS RDS**.
2. **Escritura Dual en Paralelo (Dual-Write):**
   - Cada cambio de estado o reasignación se persiste de inmediato en **MySQL** (con registro de auditoría transaccional) y se refleja en paralelo en **Google Sheets** (`batchUpdate`).
   - Power BI y las áreas que consumen la hoja de cálculo continúan trabajando sin interrupciones.
3. **Auditoría de Estados y Trazabilidad:**
   - Cada transición de estado (`Pendiente` -> `En curso` -> `Resuelto`, etc.) queda registrada en la tabla `auditoria_reclamos` con actor, fecha, valor anterior, valor nuevo y motivo.
   - Endpoint disponible: `GET /api/reclamos/:id/auditoria`.
4. **Sincronización Manual y Automática:**
   - La aplicación sincroniza automáticamente al iniciar y dispone del endpoint `POST /api/reclamos/sync` para forzar la sincronización Sheets -> MySQL ante la llegada de nuevos registros externos.
5. **Persistencia de Geometría de Supervisores (GeoJSON):**
   - Las versiones del archivo `cobertura_supervisores.geojson` importadas por los administradores se guardan en la tabla `cobertura_supervisores_geo`, sorteando la limitación de sistemas de archivos de solo lectura en Serverless (Netlify).

---

## 🚀 Ejecución en Desarrollo Local

Cada parte se levanta desde su propio directorio para evitar duplicación de variables de entorno:

### Backend (`server`)
```bash
cd server
npm install
npm run dev
# Inicia la API de Express en el puerto configurado
```

### Frontend (`client`)
```bash
cd client
npm install
npm run dev
# Inicia el cliente React en el navegador
```

---

## ☁️ Despliegue en Netlify

El archivo [netlify.toml](file:///C:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/netlify.toml) ubicado en la raíz se encarga de:
1. Instalar dependencias en `server` y `client` y construir el bundle de producción del cliente (`publish = "client/dist"`).
2. Empaquetar el backend de Express como una **Netlify Function** serverless (`functions = "server/functions"` con `api.js`).
3. Redirigir llamadas de `/api/*` automáticamente al handler serverless (`/.netlify/functions/api/:splat`).
4. Redirigir rutas de navegación SPA (`/*`) a `/index.html`.

En las variables de entorno de la configuración de Netlify (**Site configuration** -> **Environment variables**), ingresar las variables requeridas.
> [!IMPORTANT]
> **Credenciales de Google Sheets en Netlify**:
> En entornos serverless como Netlify, los archivos en `credentials/*.json` están excluidos del repositorio Git por seguridad (.gitignore).
> Por lo tanto, en lugar de `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` o `GOOGLE_APPLICATION_CREDENTIALS`, debés configurar en Netlify la variable:
> - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: El contenido del archivo de la cuenta de servicio codificado en Base64 (método más confiable para evitar problemas de saltos de línea).
> - o `GOOGLE_SERVICE_ACCOUNT_JSON`: El texto JSON completo de la cuenta de servicio.

### ⏰ Tarea Programada Nativa de Netlify (Scheduled Function)
El seguimiento de reclamos, recordatorios a supervisores y encuestas a consumidores se ejecutan automáticamente de forma nativa en Netlify, sin necesidad de servidores 24/7 ni de servicios de cron externos:
- **Función Serverless:** `server/functions/scheduledFollowup.js`.
- **Cronograma Base:** Configurado en `netlify.toml` para dispararse en días hábiles durante el horario laboral.
- **Parametrización por Variables de Entorno:**
  - `CRON_FOLLOWUP_ENABLED`: `true` (por defecto) o `false` para desactivar el cron por completo con efecto inmediato y sin redeploy.
  - `CRON_HORAS_EJECUCION_ARG`: Lista de horas en zona horaria Argentina (`America/Argentina/Buenos_Aires`) en las que se debe ejecutar (ej. `"9,16"` para ejecutar a las 09:00 y a las 16:00 hs, o `"10"` para una sola vez al día). Si la hora actual no coincide, la función finaliza en milisegundos sin consumir cómputo.


---

## 🔑 Configuración en Microsoft Entra ID (Azure AD SSO)

Para habilitar el inicio de sesión corporativo con cuentas `@donyeyo.com.ar` mediante MSAL:

1. **Acceder al Portal de Administración:**
   - Ingresá al [Centro de Administración de Microsoft Entra](https://entra.microsoft.com/) o al [Portal de Azure - App Registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps).

2. **Crear el Registro de la Aplicación:**
   - Navegá a **Microsoft Entra ID** → **App registrations (Registro de aplicaciones)** → **New registration (Nuevo registro)**.
   - **Name (Nombre):** `Gestión de Reclamos Web - Don Yeyo`.
   - **Supported account types (Tipos de cuenta admitidos):** 
     - Seleccionar `Accounts in this organizational directory only (Don Yeyo S.A. only - Single tenant)`.

3. **Configurar la Plataforma y Redirect URIs:**
   - En la sección **Redirect URI (URI de redirección)**:
     - Seleccionar tipo: **Single-page application (SPA)** *(Importante: no seleccionar "Web")*.
     - Agregar los URIs correspondientes:
       - Desarrollo local: `http://localhost:5173`
       - Producción (Netlify): `https://<tu-sitio>.netlify.app`
   - *(Podés agregar ambos URIs en cualquier momento desde **Authentication** → **Single-page application**).*

4. **Flujos Implícitos (Authentication):**
   - En el menú lateral **Authentication**:
     - En **Implicit grant and hybrid flows**, marcar:
       - `ID tokens (used for implicit and hybrid flows)`
       - `Access tokens (used for implicit flows)`
     - Guardar los cambios.

5. **Permisos de API (API Permissions):**
   - En **API permissions**, verificar que esté presente `Microsoft Graph` con el permiso delegado:
     - `User.Read` (Delegated)
   - Hacer clic en **Grant admin consent for Don Yeyo S.A.** (Conceder consentimiento de administrador) para que los usuarios no reciban solicitudes de aprobación en su primer acceso.

6. **Copiar Parámetros de Entorno:**
   - Ir a **Overview (Información general)** y copiar:
     - **Application (client) ID:** colocar en `VITE_AZURE_AD_CLIENT_ID`
     - **Directory (tenant) ID:** colocar en `VITE_AZURE_AD_TENANT_ID`

---

## 🔐 Seguridad y Principio de Cero Confianza (Zero-Trust)

Este sistema implementa un modelo de seguridad estricto para evitar elevación de privilegios:

1. **Resolución de Roles Exclusiva en Backend (`server/config/roles.js`):**
   - Los permisos (**Administrador**, **Inocuidad**, **Sysadmin**) se resuelven en el servidor evaluando la identidad del usuario contra listas de autorización corporativas.
   - **Ningún valor en el DOM, cookies o `localStorage` puede otorgar permisos.** El frontend solo almacena un token JWT opaco firmado criptográficamente con HMAC-SHA256 (`APP_SECRET`).
   - Cualquier intento de manipular el token en el cliente invalida la firma y resulta en un rechazo inmediato `401 Unauthorized`.
   - Cada llamada protegida (`/api/reclamos/:id/*`) pasa por `requireRole()`, bloqueando en el servidor cualquier acción no permitida con `403 Forbidden`.

2. **Acciones Públicas Protegidas por Tokens Criptográficos:**
   - Los enlaces enviados a supervisores y consumidores (por ejemplo, para informar entrega o imposibilidad) están firmados con HMAC usando el `APP_SECRET` del servidor y tienen expiración temporal.
   - No se expone información de la cuenta de servicio de Google ni endpoints de escritura desprotegidos.

---

## ⚙️ Variables de Entorno

### Backend (`server/.env`)
| Variable | Descripción | Ejemplo / Formato |
| :--- | :--- | :--- |
| `PORT` | Puerto del servidor Express local | `3001` |
| `APP_SECRET` | Clave secreta para firma de JWT y tokens de acción | *(string secreto)* |
| `DB_HOST` | Host de la base de datos MySQL en AWS RDS | `dydb2-instance-1.cz8kik28igwg.us-east-1.rds.amazonaws.com` |
| `DB_NAME` | Nombre de la base de datos | `Reclamos` |
| `DB_USER` | Usuario de MySQL | `DBAdmin_Reclamos` |
| `DB_PASS` | Clave de acceso a la base de datos | *(password)* |
| `DB_PORT` | Puerto de conexión MySQL | `3306` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID de la hoja de cálculo de Reclamos | *(Google Spreadsheet ID)* |
| `GOOGLE_SHEETS_TAB_NAME` | Nombre de la pestaña de reclamos | `Reclamos 2023` |
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | Ruta local al JSON de la cuenta de servicio (desarrollo) | `credentials/reclamos-501813-311b1979c9e5.json` |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Contenido del JSON en Base64 (Recomendado para Netlify) | *(string base64)* |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Contenido del JSON en texto plano (alternativa Netlify) | *(JSON string)* |
| `RECLAMOS_NUMERO_CORTE` | ID numérico de corte a partir del cual se gestionan | `20233357` |
| `EMAILS_ADMINS` | Correos con rol de Administrador | `admin1@empresa.com,admin2@empresa.com` |
| `SMTP_*` | Servidor SMTP saliente para correos a **Consumidores** (`SMTP_HOST`, `PORT`, `USER`, `PASSWORD`, `NAME`, `ENCRYPT`) | Servidor saliente institucional Don Yeyo |
| `ALERTA_SMTP_*` | Servidor SMTP saliente para **Alertas y Notificaciones Internas** (supervisores, calidad, administración, elevación) | `smtp-mail.outlook.com`, puerto `587`, TLS |
| `CRON_CONSUMIDOR_DIAS_FIN_SIN_RESPUESTA` | Días (J) sin respuesta del consumidor tras el último requerimiento para pasar a **FSR** | `7` |
| `EMAIL_TEST_MODE` | Activar modo de pruebas para interceptar todos los correos del sistema | `false` o `true` |
| `EMAIL_TEST_RECIPIENT` | Casilla única de destino para correos en modo de prueba | `testing-reclamos@donyeyo.com.ar` |

### Frontend (`client/.env`)
| Variable | Descripción | Ejemplo / Formato |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL base de la API del servidor | `/api` *(en producción)* o `http://localhost:3001/api` |
| `VITE_AZURE_AD_CLIENT_ID` | Client ID de la App registrada en Azure Entra ID | *(UUID Azure Application Client ID)* |
| `VITE_AZURE_AD_TENANT_ID` | Tenant ID de Microsoft Office 365 | *(UUID Directory Tenant ID)* |
| `VITE_MOCK_AUTH` | Habilitar usuario mock para desarrollo local | `false` |

---

## 📊 Ciclo de Vida del Reclamo y Workflow Multi-Actor

1. **Ingreso desde Web (`donyeyo.com.ar`):**
   - El consumidor completa el formulario indicando domicilio y producto.
   - El backend web consulta a la API centralizada del gestor (`/api/supervisores/lookup`) para geolocalizar al supervisor y persiste la fila en Google Sheets.
   - El reclamo nace con `estado_admin: Pendiente`, `estado_supervisor: Pendiente`, `estado_inocuidad: Pendiente`, `estado_consumidor: Pendiente`.
   - Se envía un correo interno a administración con un **enlace único y seguro (Webhook Anti-tampering con JWT/HMAC)** para iniciar la gestión con un solo clic.

2. **Aprobación o Desaprobación del Reclamo en Recepción:**
   - **Aprobación ("En curso") con Submodal Interactivo:**
     - El administrador aprueba el reclamo mediante el botón **"Aprobar Reclamo"** (en el Gestor Web) o desde el correo inicial (`/api/public/actions/admin-quick`).
     - Se despliega un submodal emergente independiente (montado vía React Portal a `document.body`) que exige seleccionar el **Nivel de Prioridad** (Alta, Media o Baja) con su SLA y actualiza en tiempo real los ítems de regalo de cortesía configurados.
     - **Regla Estricta de Negocio:** **Bajo ninguna circunstancia un reclamo puede avanzar a "En curso" si no tiene supervisor asignado.**
       - Si el reclamo carece de supervisor (o figura como "Sin asignar"), el webhook/modal detiene el avance y exige **asignar el supervisor comercial responsable** antes de proceder.
     - **Efectos automáticos al Aprobar:**
       - `estado_admin` pasa a **"En curso"** (Aprobado) y registra su fecha/hora exacta.
       - `estado_consumidor` se sincroniza a **"En curso"** con su respectivo timestamp.
       - `estado_supervisor` se coloca en **"Pendiente"** con su timestamp.
       - `estado_inocuidad` se coloca en **"Pendiente"** con su timestamp.
       - **Doble despacho de notificaciones por email:**
         1. **Supervisor Comercial:** Correo detallado con datos del consumidor, nivel de prioridad, SLA y desglose de los ítems de cortesía a entregar.
         2. **Calidad & Inocuidad:** Expediente técnico integral (lotes, vencimientos, defectos, envase, descripciones y ZIP) para investigación.
   - **Desaprobación con Submodal Interactivo:**
     - Siguiendo la misma coherencia visual y de usabilidad que la aprobación, al presionar **"Desaprobar"** en la Card 1 (Ingreso), se abre un submodal emergente vía Portal.
     - Requiere tipificar el **Tipo de Desaprobación** formal (visible al consumidor, ej.: "No se constata defecto atribuible a elaboración o envasado", "Producto vencido al comprar", etc.) y una **Observación Interna** obligatoria (🔒 visible solo para auditoría del personal).
     - Al confirmar, el `estado_admin` pasa a **"Desaprobado"**, el consumidor a **"Cerrado"** y se cancelan las ramas de Inocuidad y Compensación ("Sin acciones").
   - **Reenvío Manual de Correos:** En el modal de detalle, las cards de Inocuidad y Supervisor disponen de un botón interactivo sutil en la esquina inferior derecha para reenviar los correos ante cualquier contingencia.

3. **Ciclo de Vida y Ramas de Decisión:**
   - **Recepción (Pendiente Admin):** Etapa de ingreso y evaluación de procedencia.
     - **Desaprobar:** Válido únicamente en Recepción. Requiere motivo de rechazo; pasa los estados derivados a *"Sin acciones"*.
     - **Aprobar Reclamo:** Requiere tener supervisor asignado. Deriva simultáneamente al flujo de compensación en campo y a Calidad & Inocuidad.
   - **Acción de Compensación (Supervisor):**
     - El supervisor recibe el correo inicial y los recordatorios automáticos del cron según los plazos y periodicidades configuradas en la matriz de **Reglas de Seguimiento** (`workflow_seguimientos`) para informar si pudo resolver la entrega o si existe una imposibilidad.
   - **Control de Calidad e Inocuidad:**
     - Calidad & Inocuidad recibe el expediente técnico para investigación técnica, despachándose al grupo de emails que corresponda según la categoría de los productos reclamados.
   - **Validación del Consumidor y Regla FSR:**
     - Tras la entrega de la compensación, el cron consulta automáticamente al consumidor sobre su conformidad según los días estipulados en la matriz de seguimiento.
     - Si transcurren los días máximos configurados sin que el consumidor responda a la encuesta, su estado pasa automáticamente a **Finalizado Sin Respuesta (FSR)**.
   - **Transición Automática a "Finalizado":**
     - Cuando concurren simultáneamente:
       1. Calidad & Inocuidad dictaminó un estado distinto de *Pendiente*.
       2. El supervisor completó la acción (*Resuelto* o *Imposibilidad*).
       3. El consumidor cerró su circuito (distinto de *Pendiente*, *En curso* y *Sin acciones*, incluyendo *FSR*).
     - El `estado_admin` asume automáticamente el valor **"Finalizado"**, sellando el cierre integral del caso con auditoría y sincronización completa.

---

## 🧪 Pruebas Funcionales y Automatización E2E (Playwright)

El proyecto cuenta con una especificación formal de casos de uso funcionales en [`CASOS_DE_USO_TESTS_FUNCIONALES.md`](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/CASOS_DE_USO_TESTS_FUNCIONALES.md) y una suite completa de pruebas End-to-End automatizadas implementada sobre **Playwright**:

- **Aislamiento y Determinismo:** Mocks integrales de endpoints de backend (`mockApi.js`), permitiendo ejecutar los tests sin depender de conexiones activas a Google Sheets, SMTP ni base de datos MySQL.
- **Bypass de Autenticación:** Utiliza `VITE_MOCK_AUTH=true` con `.env.test` para validar flujos administrativos sin desplegar popups de Microsoft Entra ID.

### Comandos de Ejecución de Tests:

```bash
# Ejecutar todas las pruebas E2E en consola (modo headless)
npm --prefix client run test:e2e

# Ejecutar pruebas interactivas con interfaz gráfica de Playwright (UI Mode)
npm --prefix client run test:e2e:ui
```

### Casos de Uso Cubiertos por la Suite Automatizada:
1. **Dashboard & KPIs:** Carga de métricas, contadores por estado, renderizado de reclamos recientes con badges (incluyendo `FSR`) y navegación al modal de detalle.
2. **Listado General & Filtros:** Búsqueda reactiva por texto libre, filtrado por Estado Administración y por Estado Consumidor.
3. **Gestión de Expediente (Modal 4 Cards):**
   - Requerimiento estricto de supervisor antes de aprobar (`btnAprobar` bloqueado y advertencia visible).
   - Asignación de supervisor y habilitación inmediata de aprobación.
   - Aprobación del reclamo con confirmación y sincronización de cards.
   - Reenvío interactivo de expedientes a Calidad & Inocuidad y al Supervisor.
4. **Portal Público de Imposibilidad (`/imposibilidad`):** Validación de token criptográfico HMAC, selección obligatoria de motivo e informe de imposibilidad de entrega.
5. **Reglas de Compensación & Cortesía:** Apertura del modal interactivo desde el Drawer, visualización matemática de la fórmula de Google Sheets, gestión de defectos estándar/especiales y simulador en tiempo real.

---

## 🎯 Prioridades Mandatorias y Reglas de Cortesía

Al momento de aprobar un reclamo (ya sea desde el botón del correo electrónico o desde el panel de gestión web), **es mandatorio exigir el nivel de prioridad según la gravedad del caso mediante un control de lista desplegable sin valor por defecto prefijado**, garantizando que el operador tome una decisión consciente antes de avanzar.

### 1. Tabla de Prioridades (`workflow_prioridades`)

Al igual que la tabla de estados, el sistema dispone de la tabla MySQL `workflow_prioridades` estructurada con las prioridades canónicas corporativas:

| Código | Prioridad | SLA (Días) | Descripción Operativa | Regla de Cortesía Sugerida (JSON) |
| :---: | :---: | :---: | :--- | :--- |
| **10** | **Alta** | 3 | Casos críticos y graves que implican reconocer el error rápidamente | `[{"codigo":"codigo1","descripcion":" 1 reemplazo + 2 productos a elección + 2 de kg"}]` |
| **20** | **Media** | 7 | Casos leves que no representan un daño importante para el consumidor | `[{"codigo":"codigo2","descripcion":" 1 reemplazo"}]` |
| **30** | **Baja** | 14 | Casos donde es notorio que el problema se debió a cuestiones agenas a la empresa | `[{"codigo":"codigo3","descripcion":" 1 reemplazo + 1 de kg"}]` |

> [!NOTE]
> **Políticas de Configuración:** Los nombres, códigos y descripciones operativas de las prioridades son estrictamente inmutables para resguardar la coherencia del workflow (no es posible crear nuevas prioridades, eliminarlas, ni alterar sus nombres). La **cantidad de días de SLA** y las **reglas de cortesía asociadas** son plenamente configurables y editables por el administrador.

### 2. Edición Dinámica de Reglas de Cortesía y SLA por Prioridad
- **Acceso:** Menú lateral (`Drawer` → `Configuración` → `Reglas de Cortesía`).
- **Administración Flexible:** Permite al administrador definir una o más reglas de cortesía para cada prioridad (`Alta`, `Media`, `Baja`), agregando, editando el texto descriptivo o eliminando reglas redundantes. Asimismo, permite **ajustar la cantidad de días de SLA** de cada nivel de prioridad.
- **Validación Mandatoria:** Cada nivel de prioridad debe contener un SLA numérico válido (> 0) y obligatoriamente **al menos una regla de cortesía** no vacía para poder guardar.
- **Persistencia:** Las reglas se almacenan serializadas en formato JSON en la columna `reglas_cortesia` y el tiempo de resolución en la columna `sla` de la tabla `workflow_prioridades` (`PUT /api/prioridades/:codigo/reglas`).

### 3. Aprobación y Aplicación Automática
1. **Control Desplegable Mandatorio:** Tanto en el modal de aprobación de la interfaz web como en el enlace rápido del email (`/api/public/actions/admin-quick`), el control `<select>` inicia sin valor prefijado (`-- Seleccionar nivel de prioridad (obligatorio) --`), bloqueando el avance hasta que se seleccione una opción.
2. **Cálculo de SLA:** Al confirmar la aprobación, el sistema calcula automáticamente la fecha límite de SLA (`fecha_limite_sla = now() + sla * 24h`) y guarda en la base de datos `prioridad`, `prioridad_nombre`, `sla_dias` y `regla_cortesia_aplicada`.
3. **Cortesía en Reclamo e Ítems:** Aplica automáticamente la regla de cortesía de la prioridad en los ítems del reclamo y en la columna S de Google Sheets, notificando al supervisor comercial y al área de Calidad & Inocuidad.
4. **Visibilidad en el Expediente:** El reclamo aprobado exhibe en la Card de Ingreso una insignia destacada con el nivel de prioridad, el SLA comprometido y el detalle del producto de cortesía derivado.

---

## 🚦 Abstracción de Estados del Workflow y Detección de Conflicto / Fraude

### 1. Estados Dinámicos en Base de Datos (`workflow_estados`)
- **Descripciones y Colores de Badge Personalizables:** Los administradores pueden gestionar el catálogo completo desde la sección de página completa **Estados** (`/estados`, accesible desde el menú lateral `Drawer` → `Configuración` → `Estados`). Los estados se presentan en una grilla estructurada con columnas (*Nombre con muestra de color, Rol, Descripción, Acciones*), disponiendo de un modal de fondo 100% opaco para:
  1. **Definir el color del badge:** Selección rápida mediante paleta corporativa sugerida, picker cromático nativo o código hexadecimal, con previsualización reactiva en tiempo real.
  2. **Editar la descripción operativa:** La cual se consume globalmente y se refleja de inmediato como **tooltip explicativo** al posar el cursor sobre cualquier badge en el Dashboard, Bandeja de Reclamos y expedientes.
- **Protección de Workflows:** Los nombres y códigos de los estados permanecen estrictamente inmutables con candado de seguridad para preservar los flujos de negocio.

### 2. Flujo de Imposibilidad y Desaprobación
- **Supervisor (Imposibilidad):** Al reportar una imposibilidad (vía web o formulario público), se tipifica el `tipo_imposibilidad` que será transparente para el consumidor, resguardando la observación interna del supervisor de forma confidencial.
- **Administrador (Desaprobado):** Al desaprobar un reclamo, se tipifica el `tipo_desaprobacion` visible para el consumidor y se registra la fundamentación interna protegida.
- **Regla de Cierre Unificado:** En ambos escenarios, el estado del consumidor pasa automáticamente a **`Cerrado`**, y los estados de Inocuidad y Supervisor se fijan en **`Sin acciones`**.

### 3. Transición Automática a "Resuelto sin confirmar" (Consumidor)
- **Declaración de Resolución por Supervisor:** En el momento en que el `estado_supervisor` se establece como **`Resuelto`** (ya sea mediante el botón de acción rápida del email del supervisor `/api/public/actions/supervisor-quick` o manualmente desde el panel de gestión `/api/reclamos/:id/estado-supervisor`), el sistema dispara la transición automática de `estado_consumidor` al estado:
  $$\text{estado\_supervisor} = \text{"Resuelto"} \implies \text{estado\_consumidor} = \text{"Resuelto sin confirmar"}$$
- **Significado y Regla de Negocio:** Este estado indica que el supervisor comercial declaró haber entregado la reposición y cortesía acordada, pero se encuentra a la espera de la confirmación efectiva de recepción y satisfacción por parte del consumidor.
- **Protección de Cierre Administrativo:** El auto-finalizado administrativo (`checkAndFinalizeAdminState`) no da por finalizado el reclamo mientras el consumidor permanezca en `Resuelto sin confirmar`, garantizando que deba existir una respuesta formal del consumidor (`Resuelto conforme`, `Resuelto disconforme`, `No resuelto`), o bien el vencimiento de los plazos de seguimiento (`FSR` / `Cerrado`).

### 4. Detección de Discrepancia Crítica y Fraude Comercial
- **Alerta de Fraude:** Si el supervisor comercial marcó la reposición como `Resuelto` (afirmando haber entregado la cortesía) y posteriormente el consumidor responde mediante el enlace de correo que **no fue resuelto** (`No resuelto`), el sistema detecta una anomalía severa o posible engaño.
- **Acciones Automáticas:**
  1. Se marca el reclamo como `en_conflicto = 1` y se guarda la traza temporal y motivo en la base de datos.
  2. Se despacha de forma instantánea un **email crítico de alerta de fraude** a la casilla de los administradores con el expediente y los datos del supervisor.
  3. En la grilla del Gestor Web y en el Dashboard, la fila del reclamo cambia su fondo a un tono de alerta rojizo (`.claim-row-conflicto`) y se muestra la insignia destacada **`⚠️ Conflicto`**.
  4. En el modal de detalle del reclamo, se despliega un panel superior de auditoría con la advertencia de conflicto para la intervención administrativa.

### 5. Seguimiento Automático y Auto-Cierre
- Cuando el supervisor resuelve el reclamo, el servicio en segundo plano (`cronFollowupService`) consulta al consumidor vía correo electrónico. Si luego del ciclo programado de N consultas el consumidor no responde, su estado pasa automáticamente a **`Cerrado`** y el reclamo administrativo se declara como `Finalizado`.

---

## ⏱️ Reglas de Seguimientos de Workflow y Escalamiento Automático

### 1. Pantalla de Gestión de Reglas (`/seguimientos`)
- **Acceso:** Menú lateral (`Drawer` → `Configuración` → `Reglas de Seguimientos`).
- **Arquitectura de Grilla Completa:** Diseñada como pantalla independiente (al igual que el gestor de estados `/estados`), permitiendo administrar reglas complejas con filtros reactivos por rol, prioridad y estado activo/inactivo.
- **Persistencia en Base de Datos:** Los registros se almacenan en la tabla MySQL `workflow_seguimientos`, vinculada relacionalmente con `workflow_estados` (actor y código) y `workflow_prioridades` (código numérico y SLA).

### 2. Estructura de la Tabla `workflow_seguimientos`
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` | Identificador único de la regla |
| `rol` | `VARCHAR(30)` | Rol destinatario (`admin`, `supervisor`, `inocuidad`, `consumidor`) |
| `estado_codigo` | `VARCHAR(50)` | Código del estado en el que debe encontrarse el reclamo |
| `prioridad_codigo` | `INT` | Nivel de prioridad del caso (`10` Alta, `20` Media, `30` Baja) |
| `disparo_dias` | `DECIMAL(6,2)` | Días tras la asignación del estado para enviar el 1° email interactivo |
| `repeticiones` | `INT` | Cantidad máxima de recordatorios periódicos antes de escalar |
| `emails_elevacion` | `TEXT` | Direcciones de correo notificadas ante el agotamiento de repeticiones |
| `activo` | `TINYINT(1)` | Flag para habilitar o pausar la regla en el cron de automatización |

### 3. Dinámica del Intervalo $N$ y Escalamiento
Para garantizar que la periodicidad de los recordatorios respete la urgencia del caso y el tiempo remanente antes del vencimiento del SLA, el intervalo de reenvío **$N$** (en días y horas) se calcula deduciendo los días de disparo del 1° correo interactivo y dividiendo ese remanente por la cantidad de **Repeticiones de Seguimiento**:

$$N = \frac{\text{SLA de la Prioridad} - \text{Disparo Inicial}}{\text{Repeticiones de Seguimiento}}$$

> [!NOTE]
> - Se valida que el **Disparo Inicial** no sea superior al **SLA de la Prioridad**.
> - Si el Disparo Inicial iguala al SLA, el remanente resulta 0 ($N = 0$), lo cual indica que no habrá recordatorios intermedios antes de la elevación.
> - $N$ puede resultar en un número no entero que represente fracciones de día (por ejemplo, con SLA de 3 días, disparo inicial de 1 día y 4 repeticiones: $(3 - 1) / 4 = 0.5$ días = 12 horas entre recordatorios).

#### Ciclo de Notificación y Elevación:
1. **Asignación del Estado:** El caso ingresa o cambia al estado configurado en la regla (ej. Supervisor `Pendiente`).
2. **Disparo Inicial:** Se aguardan los días establecidos en **Disparo Inicial** para remitir el primer correo electrónico interactivo con botones de acción rápida para cambio de estado.
3. **Recordatorios periódicos (cada $N$ días):** Si el destinatario no procede a cambiar el estado del reclamo (no interactúa con los botones del correo ni gestiona desde la web), transcurren $N$ días y el sistema reenvía un recordatorio (si $N > 0$).
4. **Ciclo de Reenvío:** El recordatorio se reitera cada $N$ días mientras el reclamo continúe sin modificarse, hasta alcanzar el número máximo configurado en **Repeticiones de Seguimiento**.
5. **Elevación Ejecutiva:** Al agotarse el tope de repeticiones sin resolución, el sistema procede de inmediato a **elevar el caso**, remitiendo una advertencia a las casillas indicadas en **Emails de Elevación** para la intervención de jefatura o gerencia.

---

## 📋 Auditoría y Logs del Sistema (`/logs`)

Para garantizar trazabilidad absoluta, transparencia operativa y control de auditoría corporativa, el sistema dispone de un módulo integral de **Logs del Sistema**, accesible desde el menú lateral (`Drawer` → `Auditoría` → `Logs del Sistema`).

### 1. Registros de Auditoría y Trazabilidad

El módulo consolida dos grandes fuentes de eventos:

1. **Envíos de Emails (Todos los correos emitidos):**
   - Registra de manera unificada y automática cada correo electrónico despachado por el sistema, sin importar el motivo (aprobación, acciones de supervisor, resarcimiento, notificaciones de inocuidad, seguimiento interactivo, alertas de elevación, alertas de posible fraude comercial, o notificaciones de imposibilidad).
   - **Trazabilidad de Disparo:** Tipifica si el correo fue emitido mediante un **disparo automático** (por workflow de aprobación o por el servicio en segundo plano cron) o un **disparo manual** (reenvío intencional realizado por un administrador desde el expediente).
   - **Información Detallada:**
     - **Motivo del Envío:** Explicación humana y contextual clara de la razón del envío (ej. *"Disparo de seguimiento interactivo #1 al supervisor..."*, *"Alerta de fraude comercial enviada a administradores..."*, *"Reenvío manual de correo de acciones al supervisor solicitado por admin"*).
     - **Contenido y Resumen:** Resumen sintetizado del mensaje, asunto oficial y visor del cuerpo HTML completo emitido.
     - **Destinatarios y Roles:** Dirección de correo destino y tipo de rol (`supervisor`, `inocuidad`, `consumidor`, `admin`).
     - **Actor y Responsable:** Email del actor responsable o identificador del proceso de sistema/cron.
     - **Estado de Envío:** `enviado`, `simulado_test` o `fallido` con mensaje de error técnico capturado ante excepciones.

2. **Modificaciones en Configuraciones del Sistema:**
   - Registra cualquier alteración en los catálogos y parámetros del sistema:
     - **Reglas de Cortesía y SLA:** Cambios en descripciones de cortesía o días de SLA por nivel de prioridad.
     - **Configuración Global de Cortesía:** Ajustes en políticas globales.
     - **Estados de Workflow:** Modificaciones en descripciones operativas o colores de badge.
     - **Reglas de Seguimiento:** Creación, edición de parámetros ($N$, disparos, repeticiones, emails de elevación), cambios de estado activo/inactivo o eliminación de reglas.
     - **Zonificación de Supervisores:** Actualizaciones del archivo GeoJSON de polígonos de cobertura.
   - **Inspección Comparativa (Diff):** Cada registro de configuración almacena en formato JSON estructurado los `valores_anteriores` y los `valores_nuevos`, permitiendo al auditor contrastar con exactitud el antes y después en el modal de detalle.

### 2. Tablas de Base de Datos MySQL

| Tabla | Propósito | Campos Clave |
| :--- | :--- | :--- |
| `logs_emails` | Historial integral de correos emitidos | `id`, `reclamo_id`, `destinatario_tipo`, `destinatario_email`, `tipo_disparo` (`automatico`/`manual`), `asunto`, `motivo`, `mensaje_resumen`, `cuerpo_html`, `actor`, `actor_email`, `reintento_nro`, `estado_envio`, `error_mensaje`, `metadata`, `created_at` |
| `logs_configuracion` | Auditoría de cambios en parámetros y reglas | `id`, `modulo`, `accion`, `descripcion`, `actor`, `actor_email`, `valores_anteriores`, `valores_nuevos`, `ip_address`, `created_at` |

### 3. Experiencia de Usuario y Filtros Interactivos

- **Filtro por Categoría:** Pestañas reactivas para ver *Todos*, sólo *Emails* o sólo *Configuraciones*.
- **Filtro por Disparo:** Visualización exclusiva de disparos *Automáticos* o *Manuales*.
- **Filtro por Estado:** Filtrado instantáneo por envíos *Enviados*, *Simulados* o *Fallidos*.
- **Buscador en Vivo:** Búsqueda libre por destinatario, asunto, motivo, reclamo ID, actor, módulo o descripción.
- **Modal Flotante de Inspección:** Ventana emergente con fondo opaco que despliega la ficha completa del log, con renderizado visual del correo enviado y comparativa de valores antes/después en configuraciones.

---

## ⚙️ Pantalla de Configuración del Sistema (`/configuracion`)

Se incorporó una sección integral de administración del sistema orientada a parametrizar el comportamiento general de la plataforma, evitando valores hardcodeados y persistiendo toda la configuración en la tabla `config_sistema` de la base de datos MySQL, con soporte pleno para modo claro y modo oscuro.

### 1. Pestañas y Capacidades

1. **📧 Plantillas & Botones de Email:**
   - **Editor Dinámico por Tipo de Correo:** Permite personalizar asuntos, títulos, introducciones, bloques de instrucción/advertencia y los textos de los botones interactivos para:
     - Supervisor Comercial (resolución e imposibilidad).
     - Encuesta de satisfacción al Consumidor (conforme, disconforme, no resuelto).
     - Notificación de cierre y agradecimiento al Consumidor.
     - Derivación técnica a Inocuidad & Calidad.
     - Alerta de escalación y elevación a Gerencia.
     - Alerta de posible fraude comercial / discrepancias graves.
   - **Comodines Soportados:** Sustitución automática de `{claim_id}`, `{consumidor_nombre}`, `{localidad}` y `{supervisor}`.
   - **Live Preview (Vista Previa en Vivo):** Renderiza en tiempo real cómo se visualizará el correo con los estilos institucionales Don Yeyo y los botones configurados.
   - **Botón "Enviar Email de Muestra":** Herramienta de testeo interactiva que permite especificar el email de destino (por defecto el configurado en `EMAIL_TEST_RECIPIENT`) y el número de reclamo para poblar la plantilla con datos reales y despachar una muestra en vivo.
   - **Restablecer Valores de Fábrica:** Botón de un solo clic que recupera todos los textos predeterminados de fábrica de la compañía almacenados en `valor_defecto`.

2. **🏷️ Categorías & Grupos de Inocuidad:**
   - **Mapeo por Categoría:** Cada reclamo involucra productos clasificados en categorías (ej. *Pastas Frescas*, *Tapas y Masas*, *Panificados y Secos*).
   - **Asignación de Casillas:** Define a qué conjunto de correos electrónicos de laboratorio e inocuidad debe enviarse el expediente técnico según los productos del reclamo. Si un reclamo incluye productos de múltiples categorías, el sistema unifica y deduplica los destinatarios automáticamente.
   - **Gestión:** Alta, edición de casillas y baja lógica (`activo`).

3. **📦 Catálogo de Productos y Empaques:**
   - **Autocompletado Predictivo:** Alimenta el buscador del formulario web público para consumidores (`GET /api/public/productos?q=...`), ordenado alfabéticamente por `nombre_empaque` ascendente.
   - **Mapeo Interno:** Vincula el nombre comercial de empaque buscado por el consumidor con el `nombre_interno` requerido por Google Sheets y con la categoría correspondiente.
   - **Compatibilidad Sheets:** Se continúa guardando el string textual en `reclamo_items` sin requerir migraciones destructivas ni almacenamiento forzado de IDs numéricos.

4. **⚙️ Parámetros Generales:**
   - Casillas de respaldo por defecto para Inocuidad y Elevación cuando no aplique una categoría específica.
   - Mensaje estándar para consumidores recomendando la conservación de muestra física para peritaje.
   - Pie de firma institucional unificado para todos los correos.

---

## 🔗 Enrutamiento Directo (Deep-Linking y Favoritos)

Todas las secciones, grillas, pestañas y fichas/formularios (modales) cuentan con su propia URL dedicada para que el usuario pueda compartir enlaces directos (incluyendo los links enviados por correo electrónico) o guardarlos en los favoritos del navegador:

| Sección / Funcionalidad | URL de Grilla / Vista | URL de Ficha / Formulario / Sub-vista |
| :--- | :--- | :--- |
| **Dashboard Ejecutivo** | `/` | — |
| **Bandeja de Reclamos** | `/reclamos` | `/reclamos/:id` *(ej. `/reclamos/20233364` abre la grilla con el modal del reclamo desplegado)* |
| **Reglas de Cortesía** | `/reglas-cortesia` | Modal de configuración de SLA y reglas de cortesía por prioridad |
| **Cobertura Supervisores** | `/cobertura-supervisores` | Modal de mapa GeoJSON, probador de coordenadas e importación/exportación |
| **Catálogo de Estados** | `/estados` | `/estados/:id` *(abre el modal de edición de color y descripción del estado)* |
| **Reglas de Seguimientos** | `/seguimientos` | `/seguimientos/nuevo` *(crear regla)* y `/seguimientos/:id` *(editar regla existente)* |
| **Logs y Auditoría** | `/logs`, `/logs/emails`, `/logs/configuracion` | `/logs/:categoria/:id` *(ej. `/logs/email/101` o `/logs/configuracion/501` abre la ficha del evento)* |
| **Configuración - Emails** | `/configuracion` o `/configuracion/emails` | `/configuracion/emails/:tipo` *(ej. `/configuracion/emails/inocuidad`)* |
| **Configuración - Categorías** | `/configuracion/categorias` | `/configuracion/categorias/nueva` y `/configuracion/categorias/:id` |
| **Configuración - Productos** | `/configuracion/productos` | `/configuracion/productos/nuevo` y `/configuracion/productos/:id` |
| **Configuración - Parámetros** | `/configuracion/parametros` | Formulario de parámetros globales |
| **Portal Imposibilidad** | `/imposibilidad?token=...` | Formulario público firmado para supervisores |
| **Encuesta Consumidor** | `/encuesta-consumidor?token=...` | Portal público con escala de satisfacción de 5 emojis o reporte de problema para consumidores |

---

## ⭐ Encuesta Interactiva de Seguimiento al Consumidor (`/encuesta-consumidor`)

El correo electrónico de seguimiento que recibe el consumidor (`sendConsumerFollowupEmail`) presenta dos botones principales de acción rápida (**`✓ Resuelto`** y **`✕ No Resuelto`**), los cuales abren la página web pública `/encuesta-consumidor?token=...` preseleccionando el modo correspondiente con una interfaz minimalista, limpia y de alto contraste:

1. **Cuando el consumidor hace clic en "✓ Resuelto":**
   - Entra directamente al flujo de calificación sin redundancias (no vuelve a preguntar si se resolvió).
   - Muestra una **escala de 5 emojis de satisfacción**:
     - 😡 Muy insatisfecho (1)
     - 🙁 Insatisfecho (2)
     - 😐 Neutral (3)
     - 🙂 Satisfecho (4)
     - 😄 Muy satisfecho (5)
   - Dispone de un área de texto con placeholder directo: *"Escribe aquí cualquier comentario adicional que quieras hacernos llegar."* (sin labels innecesarios).
   - Muestra de forma concisa el encabezado: *"Seguimiento de tu Reclamo #<nro>"* y el logotipo corporativo.
   - Al enviar, el estado del consumidor pasa a **`Resuelto conforme`**, se guardan en MySQL `consumidor_puntuacion` y `consumidor_comentario`, se notifica a los administradores y se evalúa el cierre automático del reclamo (`checkAndFinalizeAdminState`).

2. **Cuando el consumidor hace clic en "✕ No Resuelto":**
   - Se abre el selector visual del **tipo de problema**:
     - **`No recibí reposición`**: Establece el estado del consumidor en **`No resuelto`**. Si el supervisor comercial había declarado previamente el caso como `Resuelto`, el sistema dispara automáticamente la **detección de conflicto / posible fraude** (`marcarConflicto` + `sendFraudAlertToAdmins`).
     - **`No estoy satisfecho con lo recibido`**: Establece el estado del consumidor en **`Resuelto disconforme`**.
   - Incluye el mismo campo limpio de comentarios adicionales (`consumidor_comentario`).

3. **Visibilidad en el Gestor Web:**
   - En el modal de detalle del reclamo ([ReclamoDetailModal.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ReclamoDetailModal.jsx), Card 4 *"Consumidor"*), se exhibe la calificación con estrellas/emojis, el tipo de problema informado y el comentario textual del consumidor.

---

## 🎨 Logotipo Institucional en Correos y Vistas Públicas

Todas las plantillas de correo salientes (`emailWorkflowService.js`), las páginas públicas (`EncuestaConsumidorPublic.jsx`, `ImposibilidadPublic.jsx`) y el simulador de correos en el panel de configuración renderizan el logotipo institucional de **Don Yeyo**:
- **Parametrización en `/configuracion/parametros`:** Se configura y edita directamente desde la pestaña de **Parámetros Globales** en el panel de gestión web (clave: `email_logo_url` en la base de datos MySQL `config_sistema` o variable de entorno `EMAIL_LOGO_URL`).
- **Inserción Directa de URL Pública HTTPS:** En el cuerpo HTML de todos los correos salientes se inserta la URL pública configurada directamente en la etiqueta `<img src="..." />`, permitiendo a los clientes de correo descargar la imagen corporativa limpia sin necesidad de adjuntar archivos ni mecanismos complejos.
- **Previsualización en Tiempo Real:** El panel de configuración cuenta con un visor en tiempo real que valida si la imagen responde y carga correctamente desde la URL ingresada antes de guardar los cambios.
- **Fallback Automático:** Si no se define una URL o el campo se deja en blanco, las cabeceras muestran automáticamente el nombre institucional corporativo *"DON YEYO"* en formato tipográfico.

---

## ✉️ Herramienta de Testeo de Emails de Muestra

En el panel de Configuración de Correos ([ConfiguracionPage.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ConfiguracionPage.jsx)), cada plantilla cuenta con el botón **"Enviar Email de Muestra"**:
- Permite especificar la dirección de email de destino (por defecto toma `EMAIL_TEST_RECIPIENT` o el correo del administrador conectado).
- Permite ingresar el número de reclamo cuyos datos se utilizarán para poblar las variables dinámicas de la plantilla (`{nombre}`, `{apellido}`, `{id}`, `{supervisor}`, etc.).
- Valida la existencia del reclamo en la base de datos y despacha el correo real utilizando el servicio de notificaciones con feedback inmediato.

---

## ⏱️ Simulador Temporal de Seguimiento y Cron por Reclamo

En el modal de detalle de cualquier reclamo ([ReclamoDetailModal.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ReclamoDetailModal.jsx)), los administradores disponen del botón **"⏱️ Simular Avance Temporal (Cron)"**:
- **Avance en el Tiempo (T+N días):** Permite proyectar el comportamiento de las reglas de seguimiento avanzando `+1`, `+2`, `+3`, `+5`, `+7` o `+N` días hacia una fecha virtual futura.
- **Protección Preventiva de Google Sheets:** Dispone de un control interactivo `[ ] Sincronizar en Google Sheets` (desactivado por defecto). Al estar desactivado, el cron evalúa y actualiza localmente en MySQL para ver los resultados en pantalla sin alterar la planilla de Google Sheets de producción ni disparar las acciones operativas del equipo interno.
- **Envíos Redirigidos a Casilla de Pruebas:** Todos los correos disparados por el cron simulado son interceptados y enviados a la casilla configurada en `EMAIL_TEST_RECIPIENT` con un banner explicativo del destinatario y rol original.
- **Visor de Eventos en Tiempo Real:** Exhibe el cálculo de días transcurridos, las reglas aplicadas, el incremento de repeticiones y el detalle de los correos emitidos, con la posibilidad de reiniciar el contador de notificaciones de prueba para volver a testear desde cero.

---

## 🎁 Reglas de Cortesía Dinámicas por Ítems y Aprobación de Reclamos

La gestión de compensaciones por reclamo vincula el nivel de gravedad y el SLA establecido con una definición granular de cortesía basada en **ítems individuales** configurables por los administradores:
- **Gestión por Ítems en Configuración (`workflow_prioridades`):** Cada nivel de prioridad (**Alta**, **Media**, **Baja**) admite la definición de uno o más ítems de compensación (ej: Ítem 1: *"1 reemplazo"*, Ítem 2: *"2 productos a elección"*, Ítem 3: *"2 de kg"*).
- **Actualización Reactiva en el Modal de Aprobación:** En el flujo de aprobación del reclamo ([ReclamoDetailModal.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ReclamoDetailModal.jsx)), al cambiar la selección en el desplegable de prioridades, se actualiza inmediatamente la tarjeta visual exhibiendo la cantidad de días del SLA y el desglose de cada ítem de cortesía con su correspondiente identificador numérico y color de acento según la severidad.
- **Instrucciones Claras en el Email al Supervisor:** El correo despachado automáticamente al supervisor comercial ([emailWorkflowService.js](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/server/services/emailWorkflowService.js)) incluye un bloque destacado superior con el nivel de prioridad, el SLA en días corridos y la lista numerada de ítems de cortesía a entregar, replicando además la compensación completa en cada producto reclamado.
- **Montaje Independiente por Portales:** Tanto el modal de aprobación como el simulador temporal se renderizan directamente en `document.body` mediante `createPortal`, evitando el anidamiento dentro del modal del expediente, previniendo recortes visuales o desbordes en altura con cabeceras y pies de acción fijas y cuerpo scrollable.
- **Adaptabilidad Responsiva Mobile:** El modal de detalle ([ReclamoDetailModal.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ReclamoDetailModal.jsx)) y la tabla de productos reclamados incorporan contención con scroll horizontal táctil (`.claim-products-table-container`), cuadrícula fluida de 1 a 2 columnas para información de contacto y botones de acción apilables adaptados para pantallas táctiles de dispositivos móviles.
- **Sincronización Transaccional:** La regla unificada se persiste en `reclamos.regla_cortesia_aplicada`, en `reclamo_items.producto_cortesia` y en la columna `S` de la planilla de Google Sheets.

---

## 🛡️ Protección contra Acciones Duplicadas en Enlaces Firmados (Anti-Replay / Doble Clic)

Para garantizar la integridad del flujo de negocio y prevenir estados inconsistentes ocasionados por múltiples clics en enlaces de correos electrónicos o navegación repetida:

1. **Protección y Pantalla Informativa para el Consumidor:**
   - Si el consumidor ya respondió la encuesta (estado en `Resuelto conforme`, `Resuelto disconforme`, `No resuelto`, `Cerrado` o con calificación registrada), al abrir el enlace del correo o reenviar el formulario público ([EncuestaConsumidorPublic.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/EncuestaConsumidorPublic.jsx)) el backend responde con los datos históricos y el endpoint `POST /api/public/actions/consumidor-encuesta` rechaza con HTTP 409.
   - La interfaz oculta el formulario de votación y renderiza una tarjeta de alta visibilidad informando que la respuesta ya fue procesada, detallando:
     - Estado registrado (ej. *Resuelto conforme*).
     - Fecha y hora exacta de registro (en formato de hora local argentina).
     - Calificación brindada (estrellas) o tipo de inconveniente seleccionado.
     - Comentario adicional oportunamente enviado.

2. **Protección y Orientación de Reapertura para Supervisores y Personal Interno:**
   - En las acciones rápidas del supervisor por correo ([publicActionRoutes.js](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/server/routes/publicActionRoutes.js)) y en el formulario público de imposibilidad ([ImposibilidadPublic.jsx](file:///c:/Users/gabrielt/Documents/Proyectos/GestionReclamosWeb/dy_gestion_reclamos_web/client/src/pages/ImposibilidadPublic.jsx)), se valida que el reclamo se encuentre en `estado_supervisor === 'Pendiente'`.
   - Si el supervisor ya confirmó resolución, reportó imposibilidad o el reclamo está cerrado, se bloquean las peticiones y se renderiza una pantalla institucional con:
     - El estado registrado previamente y la fecha y hora de la acción.
     - Un bloque destacado con instrucciones sobre cómo proceder si necesita reconsiderar su decisión o reabrir el caso.
   - **Texto de Reapertura Parametrizable:** El mensaje instructivo no se encuentra hardcodeado; se almacena bajo la clave `mensaje_reapertura_personal` en la tabla `config_sistema` y puede ser editado y restablecido a fábrica por los administradores desde `/configuracion/parametros`.

---

## 📄 Licencia y Confidencialidad
Propiedad exclusiva de **Don Yeyo S.A.** Prohibida su reproducción, divulgación o distribución sin autorización previa.




