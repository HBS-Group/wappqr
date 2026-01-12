const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Backend Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 QR Code endpoint: http://localhost:${PORT}/whatsapp/qr`);
    console.log(`📊 Status endpoint: http://localhost:${PORT}/whatsapp/status`);
    console.log(`💬 Send message: POST http://localhost:${PORT}/whatsapp/send`);
});
