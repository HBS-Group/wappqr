const router = require('express').Router();
const whatsapp = require('../whatsapp/client');

// Get QR Code endpoint
router.get('/qr', (req, res) => {
    if (whatsapp.isReady()) {
        return res.json({
            status: 'connected',
            message: 'WhatsApp is already connected'
        });
    }

    const qr = whatsapp.getQR();

    if (qr) {
        return res.json({
            status: 'qr_available',
            qr: qr
        });
    }

    if (whatsapp.isInitializing()) {
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
        connected: whatsapp.isReady(),
        initializing: whatsapp.isInitializing(),
        hasQR: !!whatsapp.getQR()
    });
});

// Get WhatsApp profile information
router.get('/profile', async (req, res) => {
    try {
        if (!whatsapp.isReady()) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const info = await whatsapp.getProfileInfo();

        if (!info) {
            return res.status(500).json({
                success: false,
                error: 'Could not fetch profile information'
            });
        }

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
        if (!whatsapp.isReady()) {
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

        await whatsapp.sendMessage(formattedPhone, message);

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
        console.log('📨 Send-welcome request received:', JSON.stringify(req.body));

        if (!whatsapp.isReady()) {
            console.log('❌ WhatsApp not ready');
            return res.status(400).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const { phone, key, email, webappLink } = req.body;

        if (!phone || !key || !email) {
            console.log('❌ Missing required fields');
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
        console.log('📱 Sending to:', formattedPhone);

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

        // Add timeout to prevent hanging
        const sendPromise = whatsapp.sendMessage(formattedPhone, welcomeMessage);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Message send timeout after 30 seconds')), 30000)
        );

        await Promise.race([sendPromise, timeoutPromise]);

        console.log(`✅ Welcome message sent to ${phone}`);

        res.json({
            success: true,
            message: 'Welcome message sent successfully',
            phone: formattedPhone
        });
    } catch (error) {
        console.error('❌ Error sending welcome message:', error.message);
        console.error('Full error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send welcome message'
        });
    }
});

// Logout/Disconnect endpoint
router.post('/logout', async (req, res) => {
    try {
        // We call the custom logout which handles re-initialization
        await whatsapp.logout();
        res.json({
            success: true,
            message: 'Logged out successfully. The client is re-initializing.'
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
