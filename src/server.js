require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const { setSocket } = require('./whatsapp/client');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for now
        methods: ["GET", "POST"]
    }
});

// Pass socket instance to WhatsApp client
setSocket(io);

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    // In a real production app, you might want to restart the process here
    // but for now, we'll keep it running to maintain the WhatsApp session if possible
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
    console.error('❌ UNHANDLED REJECTION! Shutting down...');
    console.error(reason);
});

server.listen(PORT, () => {
    console.log(`🚀 WhatsApp Backend Server running on port ${PORT}`);
    console.log(`🔌 Socket.IO enabled`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 QR Code endpoint: http://localhost:${PORT}/whatsapp/qr`);
    console.log(`📊 Status endpoint: http://localhost:${PORT}/whatsapp/status`);
    console.log(`💬 Send message: POST http://localhost:${PORT}/whatsapp/send`);
});

// Handle termination signals
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('💥 Process terminated!');
    });
});

