/* eslint-env node */
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

let qrImage = null;
let isReady = false;
let isInitializing = false;
let client = null;
let io = null;

function setSocket(socketIo) {
    io = socketIo;
    console.log('🔌 Socket.IO instance received in WhatsApp client');
}

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
            if (io) io.emit('whatsapp_qr', qrImage);
        } catch (error) {
            console.error('Error generating QR code:', error);
        }
    });

    newClient.on('ready', async () => {
        isReady = true;
        isInitializing = false;
        qrImage = null;
        console.log('✅ WhatsApp Client Ready');
        if (io) io.emit('whatsapp_ready');

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
        if (io) io.emit('whatsapp_disconnected', reason);
    });

    newClient.on('change_state', state => {
        console.log('🔄 WhatsApp State Changed:', state);
    });

    newClient.on('message_create', async (msg) => {
        if (io) {
            try {
                // Get chat to ensure we have contact info
                const chat = await msg.getChat();
                
                io.emit('whatsapp_message', {
                    id: msg.id._serialized,
                    body: msg.body,
                    from: msg.from,
                    to: msg.to,
                    fromMe: msg.fromMe,
                    timestamp: msg.timestamp,
                    hasMedia: msg.hasMedia,
                    type: msg.type,
                    author: msg.author,
                    chatId: chat.id._serialized,
                    chatName: chat.name || msg.from,
                    unreadCount: chat.unreadCount,
                    // Product/Order metadata
                    title: msg.title || msg._data?.title,
                    description: msg.description || msg._data?.description,
                    orderTitle: msg.orderTitle || msg._data?.orderTitle,
                    itemCount: msg.itemCount || msg._data?.itemCount,
                    totalAmount1000: msg.totalAmount1000 || msg._data?.totalAmount1000,
                    totalCurrencyCode: msg.totalCurrencyCode || msg._data?.totalCurrencyCode
                });
            } catch (error) {
                console.error('Error processing message for socket:', error);
            }
        }
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
 * Get all chats
 */
async function getAllChats() {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        const chats = await client.getChats();
        const enrichedChats = await Promise.all(chats.map(async chat => {
            let phoneNumber = chat.id.user;
            try {
                const contact = await chat.getContact();
                if (contact) {
                    if (contact.number) {
                        phoneNumber = contact.number;
                    } else if (contact.id && contact.id.server === 'c.us') {
                        phoneNumber = contact.id.user;
                    }
                }
            } catch (err) {
                console.error(`Error fetching contact for chat ${chat.id._serialized}:`, err);
                // Keep default user ID as phone number if contact fetch fails
            }

            return {
                id: chat.id._serialized,
                name: chat.name || phoneNumber,
                phoneNumber: phoneNumber,
                unreadCount: chat.unreadCount,
                lastMessage: chat.lastMessage ? {
                    body: chat.lastMessage.body,
                    timestamp: chat.lastMessage.timestamp,
                    fromMe: chat.lastMessage.fromMe,
                    type: chat.lastMessage.type
                } : null,
                isGroup: chat.isGroup,
                timestamp: chat.timestamp,
                labels: chat.labels || []
            };
        }));
        return enrichedChats;
    } catch (error) {
        console.error('Error getting chats:', error);
        throw error;
    }
}

/**
 * Get messages for a specific chat
 */
async function getChatMessages(chatId, limit = 50) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }

    // Clean ID: remove leading 00 or + from the user part if present
    // This fixes issues where frontend sends 0020... instead of 20...
    let cleanChatId = chatId;
    if (chatId.includes('@')) {
        let [user, server] = chatId.split('@');
        if (user.startsWith('00')) user = user.substring(2);
        if (user.startsWith('+')) user = user.substring(1);
        cleanChatId = `${user}@${server}`;
    }

    try {
        const chat = await client.getChatById(cleanChatId);
        const messages = await chat.fetchMessages({ limit });
        return messages.map(msg => ({
            id: msg.id._serialized,
            body: msg.body,
            fromMe: msg.fromMe,
            timestamp: msg.timestamp,
            type: msg.type,
            ack: msg.ack,
            hasMedia: msg.hasMedia,
            author: msg.author, // For groups
            // Product/Order metadata
            title: msg.title || msg._data?.title,
            description: msg.description || msg._data?.description,
            orderTitle: msg.orderTitle || msg._data?.orderTitle,
            itemCount: msg.itemCount || msg._data?.itemCount,
            totalAmount1000: msg.totalAmount1000 || msg._data?.totalAmount1000,
            totalCurrencyCode: msg.totalCurrencyCode || msg._data?.totalCurrencyCode
        }));
    } catch (error) {
        console.error(`Error getting messages for ${chatId}:`, error);
        throw error;
    }
}

/**
 * Helper to send message with robust error handling and retry logic
 * Specifically addresses the 'markedUnread' error in whatsapp-web.js
 */
async function sendMessage(to, message, agentName = null, retries = 3) {
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

        // Format message with agent name if provided
        const finalMessage = agentName ? `${message}\n\n~ ${agentName}` : message;

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
        return await client.sendMessage(targetId, finalMessage, { sendSeen: false });

    } catch (error) {
        const isMarkedUnreadError = error.message && error.message.includes('markedUnread');
        
        if (isMarkedUnreadError && retries > 0) {
            const delay = (4 - retries) * 2000; // Increasing delay: 2s, 4s, 6s
            console.warn(`⚠️ Caught markedUnread error. Retrying in ${delay}ms... (${retries} retries left)`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return await sendMessage(to, message, agentName, retries - 1);
        }

        console.error(`❌ Failed to send message to ${to}:`, error.message);
        throw error;
    }
}

/**
 * Get all labels (WhatsApp Business)
 */
async function getLabels() {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        return await client.getLabels();
    } catch (error) {
        console.error('Error getting labels:', error);
        throw error;
    }
}

/**
 * Get labels for a specific chat
 */
async function getChatLabels(chatId) {
    if (!isReady || !client) {
       throw new Error('WhatsApp is not connected');
   }
   
   // Clean ID logic
   let cleanChatId = chatId;
   if (chatId.includes('@')) {
       let [user, server] = chatId.split('@');
       if (user.startsWith('00')) user = user.substring(2);
       if (user.startsWith('+')) user = user.substring(1);
       cleanChatId = `${user}@${server}`;
   }

   try {
       const chat = await client.getChatById(cleanChatId);
       return chat.labels || [];
   } catch (error) {
       console.error(`Error getting labels for ${chatId}:`, error);
       throw error;
   }
}

/**
 * Update labels for a specific chat
 * @param {string} chatId 
 * @param {string[]} labelIds 
 */
async function updateChatLabels(chatId, labelIds) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }

    // Clean ID logic
    let cleanChatId = chatId;
    if (chatId.includes('@')) {
        let [user, server] = chatId.split('@');
        if (user.startsWith('00')) user = user.substring(2);
        if (user.startsWith('+')) user = user.substring(1);
        cleanChatId = `${user}@${server}`;
    }

    try {
        const chat = await client.getChatById(cleanChatId);
        
        // Try standard method first
        if (chat.changeLabels) {
             try {
                 await chat.changeLabels(labelIds);
                 return true;
             } catch (err) {
                 console.warn('chat.changeLabels failed, trying fallback:', err);
             }
        }

        // Fallback to Puppeteer injection
        console.log(`Using Puppeteer fallback for updateChatLabels on ${cleanChatId}`);
        await client.pupPage.evaluate(async (chatId, labelIds) => {
            if (!window.Store || !window.Store.Chat || !window.Store.Label) {
                throw new Error('Store not found');
            }
            const chat = window.Store.Chat.get(chatId);
            if (!chat) throw new Error('Chat not found');
            
            const labels = labelIds.map(id => window.Store.Label.get(id)).filter(Boolean);
            
            if (window.Store.Label.addOrRemoveLabels) {
                await window.Store.Label.addOrRemoveLabels(labels, [chat]);
            } else if (window.Store.Cmd && window.Store.Cmd.labelChat) {
                await window.Store.Cmd.labelChat(chat, labels, true);
            } else {
                 throw new Error('No suitable method found to update labels');
            }
        }, cleanChatId, labelIds);

        return true;
    } catch (error) {
        console.error(`Error updating labels for ${chatId}:`, error);
        throw error;
    }
}

/**
 * Create a new label
 * @param {string} name 
 * @param {string} colorHex 
 */
async function createLabel(name, colorHex) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        // Use puppeteer injection if standard method is missing
        if (client.createLabel) {
            return await client.createLabel(name);
        }

        // Fallback to Puppeteer injection
        const labelId = await client.pupPage.evaluate(async (name, color) => {
            // Check if Store.Label exists
            if (!window.Store || !window.Store.Label) {
                throw new Error('Store.Label not found');
            }
            // Add label
            const labelId = await window.Store.Label.add({ name, hexColor: color });
            return labelId;
        }, name, colorHex);

        // Fetch and return the new label
        const labels = await client.getLabels();
        return labels.find(l => l.id === labelId) || { id: labelId, name, hexColor: colorHex };

    } catch (error) {
        console.error('Error creating label:', error);
        throw error;
    }
}

/**
 * Update a label
 * @param {string} labelId 
 * @param {string} name 
 * @param {string} colorHex 
 */
async function updateLabel(labelId, name, colorHex) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        // Fallback to Puppeteer injection
        await client.pupPage.evaluate(async (labelId, name, color) => {
             if (!window.Store || !window.Store.Label) {
                throw new Error('Store.Label not found');
            }
            const label = window.Store.Label.get(labelId);
            if (label) {
                // Update properties in memory
                label.name = name;
                if (color) label.hexColor = color;
                
                // Method 1: label.save()
                if (typeof label.save === 'function') {
                    await label.save();
                    return;
                }
                
                // Method 2: window.Store.Cmd.saveLabel(label)
                if (window.Store.Cmd && typeof window.Store.Cmd.saveLabel === 'function') {
                    await window.Store.Cmd.saveLabel(label);
                    return;
                }
                
                // Method 3: window.Store.Label.add with merge
                // This is a common pattern in Backbone collections to update models
                // We construct the object explicitly
                const labelData = { id: labelId, name: name, hexColor: color || label.hexColor };
                if (window.Store.Label.add) {
                    await window.Store.Label.add(labelData, { merge: true });
                    return;
                }

                throw new Error('No valid method found to save label (checked: save(), Cmd.saveLabel(), Label.add())');
            } else {
                throw new Error('Label not found in Store');
            }
        }, labelId, name, colorHex);

        return true;
    } catch (error) {
        console.error('Error updating label:', error);
        throw error;
    }
}

/**
 * Delete a label
 * @param {string} labelId 
 */
async function deleteLabel(labelId) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        const labels = await client.getLabels();
        const label = labels.find(l => l.id === labelId);
        
        // Try standard method
        if (label && typeof label.delete === 'function') {
             await label.delete();
             return true;
        }

        // Fallback to Puppeteer injection
        await client.pupPage.evaluate(async (labelId) => {
             if (!window.Store || !window.Store.Label) {
                throw new Error('Store.Label not found');
            }
            const label = window.Store.Label.get(labelId);
            if (label) {
                await label.delete();
            }
        }, labelId);
        
        return true;
    } catch (error) {
        console.error('Error deleting label:', error);
        throw error;
    }
}

/**
 * Get chat note
 * @param {string} chatId 
 */
async function getChatNote(chatId) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        // Clean ID logic
        let cleanChatId = chatId;
        if (chatId.includes('@')) {
            let [user, server] = chatId.split('@');
            if (user.startsWith('00')) user = user.substring(2);
            if (user.startsWith('+')) user = user.substring(1);
            cleanChatId = `${user}@${server}`;
        }

        const chat = await client.getChatById(cleanChatId);
        // Note: getCustomerNote might not be on chat object in all versions, 
        // but we checked prototype and it exists.
        // If it returns undefined, return empty string.
        const note = await chat.getCustomerNote();
        return note || '';
    } catch (error) {
        console.error(`Error getting note for ${chatId}:`, error);
        throw error;
    }
}

/**
 * Update chat note
 * @param {string} chatId 
 * @param {string} note 
 */
async function updateChatNote(chatId, note) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }
    try {
        // Clean ID logic
        let cleanChatId = chatId;
        if (chatId.includes('@')) {
            let [user, server] = chatId.split('@');
            if (user.startsWith('00')) user = user.substring(2);
            if (user.startsWith('+')) user = user.substring(1);
            cleanChatId = `${user}@${server}`;
        }

        const chat = await client.getChatById(cleanChatId);
        await chat.addOrEditCustomerNote(note);
        return true;
    } catch (error) {
        console.error(`Error updating note for ${chatId}:`, error);
        throw error;
    }
}

function normalizeChatId(chatId) {
    let cleanChatId = chatId;
    if (chatId && chatId.includes('@')) {
        let [user, server] = chatId.split('@');
        if (user.startsWith('00')) user = user.substring(2);
        if (user.startsWith('+')) user = user.substring(1);
        cleanChatId = `${user}@${server}`;
    }
    return cleanChatId;
}

async function sendMediaMessage(to, base64, mimetype, filename, caption, agentName = null, retries = 3) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }

    try {
        const numberId = await client.getNumberId(to);
        if (!numberId) {
            throw new Error(`The number ${to} is not registered on WhatsApp`);
        }
        const targetId = numberId._serialized;

        const media = new MessageMedia(mimetype, base64, filename);
        const finalCaption = agentName
            ? `${caption || ''}${caption ? '\n\n' : ''}~ ${agentName}`
            : (caption || undefined);

        const options = finalCaption ? { caption: finalCaption, sendSeen: false } : { sendSeen: false };
        return await client.sendMessage(targetId, media, options);
    } catch (error) {
        const isMarkedUnreadError = error.message && error.message.includes('markedUnread');

        if (isMarkedUnreadError && retries > 0) {
            const delay = (4 - retries) * 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return await sendMediaMessage(to, base64, mimetype, filename, caption, agentName, retries - 1);
        }

        throw error;
    }
}

async function getChatMessageMedia(chatId, messageId, limit = 200) {
    if (!isReady || !client) {
        throw new Error('WhatsApp is not connected');
    }

    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    const messages = await chat.fetchMessages({ limit });

    const msg = messages.find(m => m?.id?._serialized === messageId);
    if (!msg) {
        throw new Error('Message not found in fetched window');
    }
    if (!msg.hasMedia) {
        throw new Error('Message has no media');
    }

    const media = await msg.downloadMedia();
    if (!media) {
        throw new Error('Failed to download media');
    }

    return {
        mimetype: media.mimetype,
        data: media.data,
        filename: media.filename
    };
}

/**
 * Message Actions
 */
async function deleteMessage(chatId, messageId, everyone = true) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    const messages = await chat.fetchMessages({ limit: 50 }); // Fetch recent messages to find the one to delete
    const msg = messages.find(m => m.id._serialized === messageId);
    
    if (!msg) throw new Error('Message not found');
    await msg.delete(everyone);
    return true;
}

async function reactToMessage(chatId, messageId, reaction) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const msg = messages.find(m => m.id._serialized === messageId);
    
    if (!msg) throw new Error('Message not found');
    await msg.react(reaction);
    return true;
}

async function starMessage(chatId, messageId, star = true) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const msg = messages.find(m => m.id._serialized === messageId);
    
    if (!msg) throw new Error('Message not found');
    if (star) await msg.star();
    else await msg.unstar();
    return true;
}

/**
 * Chat Actions
 */
async function archiveChat(chatId, archive = true) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    if (archive) await chat.archive();
    else await chat.unarchive();
    return true;
}

async function pinChat(chatId, pin = true) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    await chat.pin(pin);
    return true;
}

async function muteChat(chatId, duration = null) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    
    if (duration) {
        // duration in seconds
        const unmuteDate = new Date();
        unmuteDate.setSeconds(unmuteDate.getSeconds() + duration);
        await chat.mute(unmuteDate);
    } else {
        await chat.unmute();
    }
    return true;
}

async function markChatUnread(chatId) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    await chat.markUnread();
    return true;
}

/**
 * Group Actions
 */
async function createGroup(name, participantIds) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    // Ensure participantIds are properly formatted
    const participants = participantIds.map(id => {
        let cleanId = id.replace(/[^\d]/g, '');
        return cleanId.includes('@c.us') ? cleanId : `${cleanId}@c.us`;
    });
    
    return await client.createGroup(name, participants);
}

async function getGroupMetadata(chatId) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    
    if (!chat.isGroup) throw new Error('Chat is not a group');
    
    // Refresh group metadata if needed, though wwebjs usually keeps it synced
    // const metadata = chat.groupMetadata; 
    // Sometimes it's better to fetch fresh participants
    return {
        id: chat.id._serialized,
        name: chat.name,
        description: chat.description,
        owner: chat.owner,
        participants: chat.participants,
        creation: chat.creation
    };
}

async function updateGroupParticipants(chatId, participantIds, action) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanChatId = normalizeChatId(chatId);
    const chat = await client.getChatById(cleanChatId);
    
    if (!chat.isGroup) throw new Error('Chat is not a group');

    const participants = participantIds.map(id => {
        let cleanId = id.replace(/[^\d]/g, '');
        return cleanId.includes('@c.us') ? cleanId : `${cleanId}@c.us`;
    });

    switch (action) {
        case 'add':
            await chat.addParticipants(participants);
            break;
        case 'remove':
            await chat.removeParticipants(participants);
            break;
        case 'promote':
            await chat.promoteParticipants(participants);
            break;
        case 'demote':
            await chat.demoteParticipants(participants);
            break;
        default:
            throw new Error('Invalid action');
    }
    return true;
}

/**
 * Contact Actions
 */
async function getContact(contactId) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanId = normalizeChatId(contactId);
    const contact = await client.getContactById(cleanId);
    return {
        id: contact.id._serialized,
        name: contact.name,
        pushname: contact.pushname,
        number: contact.number,
        isBusiness: contact.isBusiness,
        isEnterprise: contact.isEnterprise,
        isBlocked: contact.isBlocked,
        about: await contact.getAbout()
    };
}

async function getBlockedContacts() {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const contacts = await client.getBlockedContacts();
    return contacts.map(c => ({
        id: c.id._serialized,
        name: c.name,
        number: c.number
    }));
}

async function setContactBlock(contactId, block = true) {
    if (!isReady || !client) throw new Error('WhatsApp is not connected');
    const cleanId = normalizeChatId(contactId);
    const contact = await client.getContactById(cleanId);
    
    if (block) await contact.block();
    else await contact.unblock();
    return true;
}

module.exports = {
    get client() { return client; },
    getQR: () => qrImage,
    isReady: () => isReady,
    isInitializing: () => isInitializing,
    logout,
    getProfileInfo,
    sendMessage,
    sendMediaMessage,
    getAllChats,
    getChatMessages,
    getChatMessageMedia,
    getLabels,
    getChatLabels,
    updateChatLabels,
    createLabel,
    deleteLabel,
    updateLabel,
    getChatNote,
    updateChatNote,
    setSocket,
    // Message Actions
    deleteMessage,
    reactToMessage,
    starMessage,
    // Chat Actions
    archiveChat,
    pinChat,
    muteChat,
    markChatUnread,
    // Group Actions
    createGroup,
    getGroupMetadata,
    updateGroupParticipants,
    // Contact Actions
    getContact,
    getBlockedContacts,
    setContactBlock
};

