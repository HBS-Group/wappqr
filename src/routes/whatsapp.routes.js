const router = require('express').Router();
const { client, getQR, isReady, isInitializing } = require('../whatsapp/client');

// Get QR Code endpoint
router.get('/qr', (req, res) => {
    if (isReady()) {
        return res.json({
            status: 'connected',
            message: 'WhatsApp is already connected'
        });
    }

    const qr = getQR();

    if (qr) {
        return res.json({
            status: 'qr_available',
            qr: qr
        });
    }

    if (isInitializing()) {
        return res.json({
            status: 'loading',
            message: 'WhatsApp is initializing...'
        });
    }

    res.json({
        status: 'disconnected',
        message: 'WhatsApp is not connected. Please wait for QR code.'
    });
});

// Check connection status
router.get('/status', (req, res) => {
    res.json({
        connected: isReady(),
        initializing: isInitializing(),
        hasQR: !!getQR()
    });
});

// Get WhatsApp profile information
router.get('/profile', async (req, res) => {
    try {
        if (!isReady()) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const info = await client.info;

        res.json({
            success: true,
            profile: {
                name: info.pushname || 'Not set',
                number: info.wid.user,
                platform: info.platform,
                server: info.wid.server
            },
            note: 'This is the name recipients will see when you send messages'
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send message endpoint
router.post('/send', async (req, res) => {
    try {
        if (!isReady()) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone and message are required'
            });
        }

        // Format phone number (add country code format)
        const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;

        await client.sendMessage(formattedPhone, message);

        res.json({
            success: true,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send message'
        });
    }
});

// Send welcome message with license key data
router.post('/send-welcome', async (req, res) => {
    try {
        if (!isReady()) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const { phone, key, email, webappLink } = req.body;

        if (!phone || !key || !email) {
            return res.status(400).json({
                success: false,
                error: 'Phone, key, and email are required'
            });
        }

        // Format phone number (remove any non-digit characters except +)
        let cleanPhone = phone.replace(/[^\d+]/g, '');

        // Remove leading + if exists
        if (cleanPhone.startsWith('+')) {
            cleanPhone = cleanPhone.substring(1);
        }

        const formattedPhone = `${cleanPhone}@c.us`;

        // Create welcome message
        const welcomeMessage = `🎉 *مرحباً بك في EstateNexus!*

تم تفعيل حسابك بنجاح! إليك بيانات تسجيل الدخول:

🔑 *مفتاح الترخيص:*
\`${key}\`

📧 *البريد الإلكتروني:*
${email}

📱 *رقم الهاتف:*
${phone}

🌐 *رابط التطبيق:*
${webappLink || 'https://x.com'}

ℹ️ *كيفية الدخول:*
1. افتح التطبيق من الرابط أعلاه
2. أدخل مفتاح الترخيص
3. ابدأ باستخدام جميع المميزات

💡 *نصيحة:* احفظ مفتاح الترخيص في مكان آمن

إذا واجهت أي مشكلة، لا تتردد في التواصل معنا!

مع تحياتنا،
*فريق EstateNexus* 🏢`;

        await client.sendMessage(formattedPhone, welcomeMessage);

        console.log(`✅ Welcome message sent to ${phone}`);

        res.json({
            success: true,
            message: 'Welcome message sent successfully',
            phone: formattedPhone
        });
    } catch (error) {
        console.error('Error sending welcome message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send welcome message'
        });
    }
});

// Logout/Disconnect endpoint
router.post('/logout', async (req, res) => {
    try {
        await client.logout();
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
