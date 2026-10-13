# Don Yeyo S.A. - Plataforma de Gestión de Reclamos Web

Sistema integral corporativo para la recepción, triaje geográfico, aprobación administrativa, seguimiento de supervisores y dictamen de calidad/inocuidad de reclamos de consumidores de **Don Yeyo S.A.**

---

## 🏗 Arquitectura del Proyecto

El proyecto está estructurado como un **Monorepo** con separación estricta entre Frontend y Backend:

```
dy_gestion_reclamos_web/
├── client/                     # Frontend SPA en React + Vite
│   ├── src/
│   │   ├── components/         # Header, Drawer, Modal, StatusBadge, Layout
│   │   ├── config/             # MSAL Azure AD SSO y Contexto de Autenticación
│   │   ├── pages/              # Dashboard, ReclamosList, ReclamoDetailModal, ImposibilidadPublic
│   │   ├── services/           # Cliente Axios e interceptores seguros
│   │   ├── index.css           # Sistema de diseño Don Yeyo (Dark/Light + Glassmorphism)
│   │   ├── App.jsx             # Enrutamiento con React Router DOM
│   │   └── main.jsx            # Entry point
│   ├── .env.template           # Variables de entorno del cliente
│   └── package.json
│
├── server/                     # Backend API REST en Node.js + Express
│   ├── config/                 # RBAC estricto del servidor (Admin, Inocuidad, Sysadmin)
│   ├── credentials/            # Cuenta de servicio de Google Sheets (service-account JSON)
│   ├── data/                   # Polígonos GeoJSON de cobertura geográfica de supervisores
│   ├── middlewares/            # Autenticación JWT y control de roles RBAC
│   ├── routes/                 # Rutas auth, reclamos, acciones públicas y cron
│   ├── services/
│   │   ├── googleSheetsService.js   # Lectura/escritura en Google Sheets con corte de numeración
│   │   ├── emailWorkflowService.js  # Envío de correos y generación de tokens HMAC seguros
│   │   └── cronFollowupService.js   # Reglas de seguimiento de días N, M, O, P, F
│   ├── index.js                # Servidor Express con Helmet, CORS y Rate Limiting
│   ├── .env.template           # Variables de entorno del servidor
│   └── package.json
│
├── .gitignore                  # Exclusión de credenciales y node_modules
├── package.json                # Scripts raíz para orquestación con Concurrently
└── README.md
```

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
| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `PORT` | Puerto del servidor Express | `3001` |
| `APP_SECRET` | Clave secreta para firma de JWT y tokens de acción | `clavesecretacompleja2026` |
| `GOOGLE_SHEET_ID` | ID de la hoja de cálculo de Reclamos | `1mIfYKCbjkTcNJM9Uek_DGgogVL8nXPhkfHXN4szV-S4` |
| `GOOGLE_SHEET_TAB` | Nombre de la pestaña de reclamos | `Reclamos 2023` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al JSON de la cuenta de servicio | `credentials/reclamos-service-account.json` |
| `RECLAMOS_NUMERO_CORTE` | ID numérico de reclamo a partir del cual se gestionan | `20233357` |
| `EMAILS_ADMINS` | Correos con rol de Administrador (separados por coma) | `administracion@donyeyo.com.ar` |
| `EMAILS_INOCUIDAD` | Correos de Calidad e Inocuidad | `inocuidad@donyeyo.com.ar` |
| `SMTP_*` | Credenciales del servidor de correo saliente | `smtp.office365.com` / `587` |

### Frontend (`client/.env`)
| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL base de la API del servidor | `http://localhost:3001/api` |
| `VITE_AZURE_AD_CLIENT_ID` | Client ID de la App registrada en Azure Entra ID | `uuid-azure-app` |
| `VITE_AZURE_AD_TENANT_ID` | Tenant ID de Microsoft Office 365 | `uuid-azure-tenant` |
| `VITE_MOCK_AUTH` | Habilitar usuario mock para desarrollo local | `true` / `false` |
| `VITE_MOCK_AUTH_EMAIL` | Email del usuario mock para testing | `administracion@donyeyo.com.ar` |

---

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos
- **Node.js** >= 18.x
- **npm** >= 9.x

### 1. Clonar e Instalar Dependencias
Desde la raíz del proyecto:
```bash
# Instala las dependencias en raíz, server y client simultáneamente
npm run install-all
```

### 2. Configurar Variables de Entorno
Copiar las plantillas en `server` y `client`:
```bash
cp server/.env.template server/.env
cp client/.env.template client/.env
```
*(Completar los valores reales según corresponda).*

### 3. Ejecutar en Modo Desarrollo
Para iniciar ambos servidores (Express en puerto `3001` y Vite en puerto `5173`) con un solo comando:
```bash
npm run dev
```

---

## 📊 Ciclo de Vida del Reclamo y Workflow Multi-Actor

1. **Ingreso desde Web (`donyeyo.com.ar`):**
   - El consumidor completa el formulario indicando domicilio y producto.
   - El backend del sitio web calcula el Supervisor por geolocalización (Ray-Casting GeoJSON) y persiste los datos en Google Sheets.
   - El reclamo nace con `estado_admin: Pendiente`, `estado_supervisor: Pendiente`, `estado_inocuidad: Pendiente`.

2. **Aprobación de Administración:**
   - El administrador ingresa a la plataforma web corporativa.
   - Revisa las fotos/evidencias y decide: **Aprobar** o **Desaprobar** (indicando motivo).
   - Al aprobar, se dispara un correo con el producto de cortesía calculado al supervisor asignado.

3. **Acción del Supervisor:**
   - El supervisor recibe el correo con botones de acción directa: **Confirmar Entrega** o **Informar Imposibilidad**.
   - Si no responde transcurridos $N$ días, el cron de seguimiento envía recordatorios y escala a administración si se superan los plazos máximos.

4. **Validación del Consumidor:**
   - Al marcarse como resuelto, se consulta al consumidor sobre la recepción del producto.

5. **Dictamen de Calidad / Inocuidad:**
   - El departamento de Calidad evalúa lote, vencimiento y defecto, registrando dictamen de **Conforme** o **No Conforme**.

---

## 📄 Licencia y Confidencialidad
Propiedad exclusiva de **Don Yeyo S.A.** Prohibida su reproducción, divulgación o distribución sin autorización previa.
