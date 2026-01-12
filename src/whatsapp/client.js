const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let qrImage = null;
let isReady = false;
let isInitializing = false;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "main-session",
        dataPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', async (qr) => {
    console.log('QR Code received');
    try {
        qrImage = await qrcode.toDataURL(qr);
        isInitializing = true;
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
});

client.on('ready', async () => {
    isReady = true;
    isInitializing = false;
    qrImage = null;
    console.log('✅ WhatsApp Client Ready');

    // Log profile information
    try {
        const info = await client.info;
        console.log('\n📱 WhatsApp Profile Information:');
        console.log('   Name:', info.pushname || 'Not set');
        console.log('   Number:', info.wid.user);
        console.log('   Platform:', info.platform);
        console.log('\n⚠️  IMPORTANT: Messages will be sent from this profile name!');
        console.log('   To change sender name, update your WhatsApp profile on your phone.\n');
    } catch (error) {
        console.error('Could not fetch profile info:', error.message);
    }
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp Authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isReady = false;
    isInitializing = false;
});

client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp disconnected:', reason);
    isReady = false;
    isInitializing = false;
    qrImage = null;
});

// Initialize the client
client.initialize();

module.exports = {
    client,
    getQR: () => qrImage,
    isReady: () => isReady,
    isInitializing: () => isInitializing
};
