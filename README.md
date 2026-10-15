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

2. **Aprobación del Reclamo ("En curso") y Notificación Dual:**
   - El administrador aprueba el reclamo mediante el botón **"Aprobar Reclamo"** (en el Gestor Web) o desde el correo inicial (`/api/public/actions/admin-quick`).
   - **Regla Estricta de Negocio:** **Bajo ninguna circunstancia un reclamo puede avanzar a "En curso" si no tiene supervisor asignado.**
     - Si el reclamo carece de supervisor (o figura como "Sin asignar"), el webhook/modal detiene el avance y exige **asignar el supervisor comercial responsable** antes de proceder.
   - **Efectos automáticos al Aprobar:**
     - `estado_admin` pasa a **"En curso"** (Aprobado) y registra su fecha/hora exacta.
     - `estado_consumidor` se sincroniza a **"En curso"** con su respectivo timestamp.
     - `estado_supervisor` se coloca en **"Pendiente"** con su timestamp.
     - `estado_inocuidad` se coloca en **"Pendiente"** con su timestamp.
     - **Doble despacho de notificaciones por email:**
       1. **Supervisor Comercial:** Correo detallado con los datos de entrega y las instrucciones de reposición/cortesía.
       2. **Calidad & Inocuidad:** Expediente técnico integral (lotes, vencimientos, defectos, envase, descripciones y ZIP) para iniciar la investigación y registro de caso.
   - **Reenvío Manual de Correos:** En el modal de detalle, las cards de Inocuidad y Supervisor disponen de un botón interactivo sutil en la esquina inferior derecha para reenviar los correos ante cualquier contingencia.

3. **Ciclo de Vida y Ramas de Decisión:**
   - **Recepción (Pendiente Admin):** Etapa de ingreso y evaluación de procedencia.
     - **Desaprobar:** Válido únicamente en Recepción. Requiere motivo de rechazo; pasa los estados derivados a *"Sin acciones"*.
     - **Aprobar Reclamo:** Requiere tener supervisor asignado. Deriva simultáneamente al flujo de compensación en campo y a Calidad & Inocuidad.
   - **Acción de Compensación (Supervisor):**
     - El supervisor recibe el correo inicial y los recordatorios automáticos del cron (`CRON_SUPERVISOR_DIAS_CONSULTA`) para informar si pudo resolver la entrega o si existe una imposibilidad.
   - **Control de Calidad e Inocuidad:**
     - Calidad & Inocuidad recibe el expediente técnico para investigación técnica, dictaminando de forma independiente en el sistema.
   - **Validación del Consumidor y Regla FSR:**
     - Tras la entrega de la compensación, el cron consulta automáticamente al consumidor sobre su conformidad (`CRON_CONSUMIDOR_DIAS_CONSULTA`).
     - Si transcurren `J` días (`CRON_CONSUMIDOR_DIAS_FIN_SIN_RESPUESTA`) sin que el consumidor responda a la encuesta, su estado pasa automáticamente a **Finalizado Sin Respuesta (FSR)**.
   - **Transición Automática a "Finalizado":**
     - Cuando concurren simultáneamente:
       1. Calidad & Inocuidad dictaminó un estado distinto de *Pendiente*.
       2. El supervisor completó la acción (*Resuelto* o *Imposibilidad*).
       3. El consumidor cerró su circuito (distinto de *Pendiente*, *En curso* y *Sin acciones*, incluyendo *FSR*).
     - El `estado_admin` asume automáticamente el valor **"Finalizado"**, sellando el cierre integral del caso con auditoría y sincronización completa.

---

## 📄 Licencia y Confidencialidad
Propiedad exclusiva de **Don Yeyo S.A.** Prohibida su reproducción, divulgación o distribución sin autorización previa.
