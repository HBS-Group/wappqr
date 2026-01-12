const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp.routes');

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'], // Frontend URLs
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/whatsapp', whatsappRoutes);

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
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

module.exports = app;
