require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const reclamosRoutes = require('./routes/reclamosRoutes');
const publicActionRoutes = require('./routes/publicActionRoutes');
const cronRoutes = require('./routes/cronRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Seguridad HTTP con Helmet
app.use(helmet({
    contentSecurityPolicy: false // Permite integración flexible con interfaces web
}));

// CORS
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({
    origin: (origin, callback) => {
        // Permitir solicitudes sin origin (como apps móviles, curl, o emails)
        if (!origin || origin.startsWith('http://localhost') || origin === corsOrigin) {
            callback(null, true);
        } else {
            callback(null, true); // O cambiar a whitelist estricta en producción
        }
    },
    credentials: true
}));

// Rate Limiting para protección contra abuso DoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 300, // Máximo 300 peticiones por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes desde esta IP, por favor intentá más tarde.' }
});
app.use('/api/', limiter);

// Parsing de JSON y URL-Encoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rutas de API
app.use('/api/auth', authRoutes);
app.use('/api/reclamos', reclamosRoutes);
app.use('/api/public/actions', publicActionRoutes);
app.use('/api/cron', cronRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'dy-gestion-reclamos-server',
        timestamp: new Date().toISOString()
    });
});

// Manejador de rutas no encontradas 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Ruta API no encontrada' });
});

// Manejador global de errores
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message
    });
});

// Iniciar servidor local si no está corriendo como Serverless Function de Netlify
if (!process.env.NETLIFY) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 DY-GESTIÓN-RECLAMOS API Server corriendo en puerto ${PORT}`);
        console.log(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✂️  Corte de Reclamos: ID >= ${process.env.RECLAMOS_NUMERO_CORTE || '0'}`);
        console.log(`====================================================`);
    });
}

module.exports = app;
