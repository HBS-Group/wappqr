const router = require('express').Router();
const whatsapp = require('../whatsapp/client');

// Get QR Code endpoint
router.get('/qr', (req, res) => {
    if (whatsapp.isReady()) {
        return res.json({
            status: 'connected',
            message: 'WhatsApp is already connected.'
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

// Get all chats
router.get('/chats', async (req, res) => {
    try {
        const chats = await whatsapp.getAllChats();
        res.json({ success: true, chats });
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get messages for a chat
router.get('/chats/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit } = req.query;
        const messages = await whatsapp.getChatMessages(chatId, limit ? parseInt(limit) : undefined);
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, error: error.message });
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

        const { phone, message, agentName } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone and message are required'
            });
        }

        // Clean phone number: remove spaces, +, 00 prefix
        let cleanPhone = phone.replace(/[^\d+]/g, ''); 
        if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.substring(1);
        if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2);

        // Format phone number (add country code format)
        const formattedPhone = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

        await whatsapp.sendMessage(formattedPhone, message, agentName);

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

// Send media message endpoint
router.post('/send-media', async (req, res) => {
    try {
        if (!whatsapp.isReady()) {
            return res.status(400).json({ success: false, error: 'WhatsApp is not connected' });
        }

        const { phone, base64, mimetype, filename, caption, agentName } = req.body;

        if (!phone || !base64 || !mimetype) {
            return res.status(400).json({
                success: false,
                error: 'phone, base64, mimetype are required'
            });
        }

        let cleanPhone = phone.replace(/[^\d+]/g, '');
        if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.substring(1);
        if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2);

        const formattedPhone = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

        await whatsapp.sendMediaMessage(formattedPhone, base64, mimetype, filename, caption, agentName);

        res.json({ success: true });
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to send media' });
    }
});

// Get media for a specific message
router.get('/chats/:chatId/messages/:messageId/media', async (req, res) => {
    try {
        if (!whatsapp.isReady()) {
            return res.status(400).json({ success: false, error: 'WhatsApp is not connected' });
        }

        const { chatId, messageId } = req.params;
        const { limit } = req.query;

        const media = await whatsapp.getChatMessageMedia(chatId, messageId, limit ? parseInt(limit) : undefined);
        res.json({ success: true, media });
    } catch (error) {
        console.error('Error fetching message media:', error);
        res.status(500).json({ success: false, error: error.message });
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

// Get all labels (WhatsApp Business)
router.get('/labels', async (req, res) => {
    try {
        const labels = await whatsapp.getLabels();
        res.json({ success: true, labels });
    } catch (error) {
        console.error('Error fetching labels:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get labels for a chat
router.get('/chats/:chatId/labels', async (req, res) => {
    try {
        const { chatId } = req.params;
        const labels = await whatsapp.getChatLabels(chatId);
        res.json({ success: true, labels });
    } catch (error) {
        console.error('Error fetching chat labels:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create a new label
router.post('/labels', async (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
        
        const label = await whatsapp.createLabel(name, color);
        res.json({ success: true, label });
    } catch (error) {
        console.error('Error creating label:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update a label
router.put('/labels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color } = req.body;
        
        await whatsapp.updateLabel(id, name, color);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating label:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a label
router.delete('/labels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await whatsapp.deleteLabel(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting label:', error);
        // Add in-use label error detection
        if (error.message && error.message.includes('in use')) {
            res.status(400).json({ success: false, error: 'Label is in use' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// Update chat labels
router.put('/chats/:chatId/labels', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { labelIds } = req.body; // Array of label IDs
        
        await whatsapp.updateChatLabels(chatId, labelIds);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating chat labels:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get chat note
router.get('/chats/:chatId/note', async (req, res) => {
    try {
        const { chatId } = req.params;
        const note = await whatsapp.getChatNote(chatId);
        res.json({ success: true, note });
    } catch (error) {
        console.error('Error getting chat note:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update chat note
router.post('/chats/:chatId/note', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { note } = req.body;
        
        await whatsapp.updateChatNote(chatId, note);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating chat note:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Message Actions ---

// Delete message
router.post('/messages/:chatId/:messageId/delete', async (req, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { everyone } = req.body;
        await whatsapp.deleteMessage(chatId, messageId, everyone);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// React to message
router.post('/messages/:chatId/:messageId/react', async (req, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { reaction } = req.body;
        await whatsapp.reactToMessage(chatId, messageId, reaction);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Star message
router.post('/messages/:chatId/:messageId/star', async (req, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { star } = req.body; // boolean
        await whatsapp.starMessage(chatId, messageId, star !== false);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Chat Actions ---

// Archive chat
router.post('/chats/:chatId/archive', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { archive } = req.body; // boolean
        await whatsapp.archiveChat(chatId, archive !== false);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pin chat
router.post('/chats/:chatId/pin', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { pin } = req.body; // boolean
        await whatsapp.pinChat(chatId, pin !== false);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mute chat
router.post('/chats/:chatId/mute', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { duration } = req.body; // seconds, or null to unmute
        await whatsapp.muteChat(chatId, duration);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark chat unread
router.post('/chats/:chatId/mark-unread', async (req, res) => {
    try {
        const { chatId } = req.params;
        await whatsapp.markChatUnread(chatId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Group Actions ---

// Create group
router.post('/groups/create', async (req, res) => {
    try {
        const { name, participantIds } = req.body;
        if (!name || !participantIds || !Array.isArray(participantIds)) {
            return res.status(400).json({ success: false, error: 'Name and participantIds array required' });
        }
        const response = await whatsapp.createGroup(name, participantIds);
        res.json({ success: true, gid: response.gid._serialized });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get group metadata
router.get('/groups/:chatId/metadata', async (req, res) => {
    try {
        const { chatId } = req.params;
        const metadata = await whatsapp.getGroupMetadata(chatId);
        res.json({ success: true, metadata });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update group participants (add, remove, promote, demote)
router.post('/groups/:chatId/participants', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { participantIds, action } = req.body; // action: 'add', 'remove', 'promote', 'demote'
        
        if (!['add', 'remove', 'promote', 'demote'].includes(action)) {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        await whatsapp.updateGroupParticipants(chatId, participantIds, action);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Contact Actions ---

// Get contact info
router.get('/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const contact = await whatsapp.getContact(contactId);
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get blocked contacts
router.get('/contacts/blocked/list', async (req, res) => {
    try {
        const contacts = await whatsapp.getBlockedContacts();
        res.json({ success: true, contacts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Block/Unblock contact
router.post('/contacts/:contactId/block', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { block } = req.body; // boolean
        await whatsapp.setContactBlock(contactId, block !== false);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
