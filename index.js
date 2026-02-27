const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode
} = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const config = require('./config');
const { commands } = require('./command');

// 1. Plugins Load කිරීමේ පද්ධතිය
console.log("Plugins පූරණය වෙමින් පවතී...");
const pluginsPath = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsPath)) fs.mkdirSync(pluginsPath);

fs.readdirSync(pluginsPath).forEach((file) => {
    if (path.extname(file).toLowerCase() === ".js") {
        require(path.join(pluginsPath, file));
    }
});
console.log("සියලුම Plugins සාර්ථකව පූරණය විය! ✅");

async function connectToWA() {
    const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/session_data');
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // Terminal පාවිච්චි නොකරන්නේ නම් මෙය false කරන්න
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        }
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWA();
        } else if (connection === 'open') {
            console.log('සම්බන්ධතාවය සාර්ථකයි! 🚀');
        }
    });

    conn.ev.on('messages.upsert', async (mek) => {
        try {
            const msg = mek.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const m = msg.message;
            const body = (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "");
            
            const isCmd = body.startsWith(config.PREFIX);
            const command = isCmd ? body.slice(config.PREFIX.length).trim().split(' ')[0].toLowerCase() : "";
            const args = body.trim().split(/ +/).slice(1);
            const q = args.join(' ');

            // Commands ක්‍රියාත්මක කිරීමේ කොටස
            const cmd = commands.find((c) => c.pattern === command);
            if (cmd) {
                const reply = (text) => conn.sendMessage(from, { text: text }, { quoted: msg });
                
                await cmd.function(conn, msg, mek, {
                    from,
                    body,
                    isCmd,
                    command,
                    args,
                    q,
                    reply
                });
            }
        } catch (e) {
            console.error(e);
        }
    });
}

connectToWA();
