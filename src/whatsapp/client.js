const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let qrImage = null;
let isReady = false;
let isInitializing = false;
let client = null;

/**
 * Creates and configures a new WhatsApp client instance
 */
function createClient() {
    const newClient = new Client({
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
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check'
            ]
        }
    });

    // Event Listeners
    newClient.on('qr', async (qr) => {
        console.log('QR Code received');
        try {
            qrImage = await qrcode.toDataURL(qr);
            isInitializing = true;
        } catch (error) {
            console.error('Error generating QR code:', error);
        }
    });

    newClient.on('ready', async () => {
        isReady = true;
        isInitializing = false;
        qrImage = null;
        console.log('✅ WhatsApp Client Ready');

        try {
            const info = await newClient.info;
            console.log('\n📱 WhatsApp Profile Information:');
            console.log('   Name:', info.pushname || 'Not set');
            console.log('   Number:', info.wid.user);
            console.log('   Platform:', info.platform);
        } catch (error) {
            console.error('Could not fetch profile info:', error.message);
        }
    });

    newClient.on('authenticated', () => {
        console.log('✅ WhatsApp Authenticated');
    });

    newClient.on('auth_failure', (msg) => {
        console.error('❌ Authentication failed:', msg);
        isReady = false;
        isInitializing = false;
    });

    newClient.on('disconnected', (reason) => {
        console.log('⚠️ WhatsApp disconnected:', reason);
        isReady = false;
        isInitializing = false;
        qrImage = null;
    });

    newClient.on('change_state', state => {
        console.log('🔄 WhatsApp State Changed:', state);
    });

    newClient.on('loading_screen', (percent, message) => {
        console.log('⏳ WhatsApp Loading:', percent, '%', message);
        isInitializing = true;
    });

    // Handle unexpected errors within the client
    newClient.on('error', (error) => {
        console.error('❌ WhatsApp Client Error:', error);
        // If it's a critical error, we might want to trigger a logout/re-init
        if (error.message && (error.message.includes('Session closed') || error.message.includes('Browser closed'))) {
            logout();
        }
    });

    return newClient;
}

// Initial client setup
client = createClient();
client.initialize().catch(err => {
    console.error('❌ Initial WhatsApp initialization failed:', err);
});

/**
 * Safely logs out and re-initializes the client
 */
async function logout() {
    console.log('🔄 Initiating WhatsApp logout...');
    
    try {
        if (client) {
            // Remove disconnected listener to avoid double-triggering logic
            client.removeAllListeners('disconnected');
            
            if (isReady) {
                await client.logout();
                console.log('✅ Logged out successfully');
            } else {
                await client.destroy();
                console.log('✅ Client destroyed');
            }
        }
    } catch (error) {
        console.error('❌ Error during logout:', error);
    } finally {
        // Reset state
        isReady = false;
        isInitializing = false;
        qrImage = null;
        
        // Re-initialize a fresh client
        console.log('⏳ Re-initializing WhatsApp client for new session...');
        setTimeout(() => {
            client = createClient();
            client.initialize().catch(err => {
                console.error('❌ Error re-initializing WhatsApp after logout:', err);
            });
        }, 2000);
    }
}

/**
 * Helper to get profile info
 */
async function getProfileInfo() {
    if (!isReady || !client) return null;
    try {
        return await client.info;
    } catch (error) {
        console.error('Error getting profile info:', error);
        return null;
    }
}

/**
 * Helper to send message with robust error handling and retry logic
 * Specifically addresses the 'markedUnread' error in whatsapp-web.js
 */
async function sendMessage(to, message, retries = 3) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }

    try {
        // 1. Validate number and get correct ID
        const numberId = await client.getNumberId(to);
        if (!numberId) {
            throw new Error(`The number ${to} is not registered on WhatsApp`);
        }
        const targetId = numberId._serialized;

        console.log(`📤 Sending message to ${targetId} (Attempt: ${4 - retries})...`);

        // 2. Pre-load the chat to ensure it exists in the internal WhatsApp Store
        // This often prevents the 'markedUnread' error which occurs when a chat is missing from the Store
        try {
            await client.getChatById(targetId);
        } catch (e) {
            console.warn(`⚠️ Warning: Could not pre-load chat ${targetId}:`, e.message);
        }

        // 3. Attempt to send
        // Some versions of the library allow passing sendSeen: false in options
        // even if not officially documented, it can bypass the problematic code path
        return await client.sendMessage(targetId, message, { sendSeen: false });

    } catch (error) {
        const isMarkedUnreadError = error.message && error.message.includes('markedUnread');
        
        if (isMarkedUnreadError && retries > 0) {
            const delay = (4 - retries) * 2000; // Increasing delay: 2s, 4s, 6s
            console.warn(`⚠️ Caught markedUnread error. Retrying in ${delay}ms... (${retries} retries left)`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return await sendMessage(to, message, retries - 1);
        }

        console.error(`❌ Failed to send message to ${to}:`, error.message);
        throw error;
    }
}




module.exports = {
    get client() { return client; },
    getQR: () => qrImage,
    isReady: () => isReady,
    isInitializing: () => isInitializing,
    logout,
    getProfileInfo,
    sendMessage
};

