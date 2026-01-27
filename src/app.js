const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp.routes');
const salesRoutes = require('./routes/crm/sales.routes');
const campaignRoutes = require('./routes/crm/campaigns.routes');

const app = express();

// Parse allowed origins from environment variable (comma-separated)
const getAllowedOrigins = () => {
    const envOrigins = process.env.FRONTEND_URL;
    if (!envOrigins) {
        return ['http://localhost:5173', 'http://localhost:3000'];
    }
    return envOrigins.split(',').map(origin => origin.trim());
};

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();

        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) {
            return callback(null, true);
        }

        // Check if origin matches allowed origins or is a Vercel preview deployment
        const isAllowed = allowedOrigins.some(allowed => origin === allowed) ||
            origin.includes('vercel.app') ||
            origin.includes('localhost');

        if (isAllowed) {
            return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/whatsapp', whatsappRoutes);
app.use('/crm', salesRoutes);
app.use('/campaigns', campaignRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'WhatsApp Backend is running' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';
    
    console.error(`[Error] ${req.method} ${req.path}:`, err);
    
    res.status(statusCode).json({
        success: false,
        error: statusCode === 500 ? 'Internal server error' : err.name,
        message: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});


module.exports = app;
