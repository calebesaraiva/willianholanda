const path = require('path');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '').replace(/^00/, '');
}

function buildJid(phoneNumber) {
  const rawValue = String(phoneNumber || '').trim();
  if (rawValue.endsWith('@s.whatsapp.net') || rawValue.endsWith('@lid')) {
    return rawValue;
  }

  const normalized = normalizePhoneNumber(phoneNumber);
  return normalized ? `${normalized}@s.whatsapp.net` : '';
}

function extractMessageText(message = {}) {
  const content = message.message || {};
  return String(
    content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || ''
  ).trim();
}

function getPhoneFromJid(jid = '') {
  return normalizePhoneNumber(String(jid).split('@')[0]);
}

function isGroupJid(jid = '') {
  return String(jid || '').endsWith('@g.us');
}

function startTemporaryWhatsAppQrBot(options = {}) {
  const {
    enabled = false,
    dataDir,
    processIncomingMessage,
    onStatusChange = () => {},
    logger = console,
  } = options;

  const status = {
    enabled: Boolean(enabled),
    state: enabled ? 'starting' : 'disabled',
    connected: false,
    readyAt: '',
    lastQrAt: '',
    qrCode: '',
    qrDataUrl: '',
    reconnectAttempts: 0,
    nextReconnectAt: '',
    lastError: '',
    clientInfo: null,
  };

  const updateStatus = (patch) => {
    Object.assign(status, patch);
    onStatusChange({ ...status });
  };

  if (!enabled) {
    return {
      getStatus: () => ({ ...status }),
      sendText: async () => {
        const error = new Error('Bot temporario por QR code esta desativado.');
        error.statusCode = 503;
        throw error;
      },
    };
  }

  if (typeof processIncomingMessage !== 'function') {
    throw new Error('processIncomingMessage precisa ser informado para iniciar o bot temporario.');
  }

  let baileys = null;
  let socket = null;
  let saveCreds = null;
  let reconnectTimer = null;
  let starting = false;
  const processedMessageIds = new Set();

  const importBaileys = async () => {
    if (!baileys) {
      baileys = await import('@whiskeysockets/baileys');
    }
    return baileys;
  };

  const scheduleReconnect = (reason) => {
    if (reconnectTimer) return;

    const attempts = status.reconnectAttempts + 1;
    const delayMs = Math.min(60_000, Math.max(3_000, attempts * 5_000));
    const nextReconnectAt = new Date(Date.now() + delayMs).toISOString();

    updateStatus({
      state: 'reconnecting',
      connected: false,
      reconnectAttempts: attempts,
      nextReconnectAt,
      lastError: String(reason || ''),
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startSocket().catch((error) => {
        updateStatus({
          state: 'failed',
          connected: false,
          lastError: error.message || 'Falha ao reiniciar o bot temporario.',
        });
        scheduleReconnect(error.message || error);
      });
    }, delayMs);
  };

  const handleMessages = async (messages = []) => {
    for (const message of messages) {
      const messageId = message?.key?.id || '';
      const remoteJid = message?.key?.remoteJid || '';
      if (!messageId || processedMessageIds.has(messageId)) continue;
      if (message?.key?.fromMe || isGroupJid(remoteJid) || remoteJid === 'status@broadcast') continue;

      const text = extractMessageText(message);
      if (!text) continue;

      processedMessageIds.add(messageId);
      try {
        await processIncomingMessage({
          from: getPhoneFromJid(remoteJid),
          replyTo: remoteJid,
          profileName: message.pushName || '',
          text,
          metaMessageId: `temporary:${messageId}`,
          source: 'temporary_qr',
        });
      } catch (error) {
        updateStatus({ lastError: error.message || 'Falha ao processar mensagem recebida.' });
        logger.error(`Falha no bot temporario: ${error.message || error}`);
      } finally {
        setTimeout(() => processedMessageIds.delete(messageId), 5 * 60 * 1000);
      }
    }
  };

  async function startSocket() {
    if (starting) return;
    starting = true;

    try {
      const {
        Browsers,
        DisconnectReason,
        fetchLatestBaileysVersion,
        makeWASocket,
        useMultiFileAuthState,
      } = await importBaileys();

      const sessionPath = path.join(dataDir, 'temporary-whatsapp-session-baileys');
      const auth = await useMultiFileAuthState(sessionPath);
      saveCreds = auth.saveCreds;

      const versionResult = await fetchLatestBaileysVersion().catch(() => ({}));
      socket = makeWASocket({
        auth: auth.state,
        browser: Browsers.appropriate('Desktop'),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 20_000,
        markOnlineOnConnect: true,
        printQRInTerminal: false,
        syncFullHistory: false,
        version: versionResult.version,
      });

      socket.ev.on('creds.update', saveCreds);
      socket.ev.on('connection.update', (update = {}) => {
        if (update.qr) {
          QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
            .then((qrDataUrl) => updateStatus({ qrDataUrl }))
            .catch(() => {});
          updateStatus({
            state: 'qr_pending',
            connected: false,
            lastQrAt: new Date().toISOString(),
            qrCode: update.qr,
            lastError: '',
          });
          logger.log('');
          logger.log('Escaneie este QR code no WhatsApp do numero temporario:');
          qrcode.generate(update.qr, { small: true });
          logger.log('');
        }

        if (update.connection === 'open') {
          updateStatus({
            state: 'ready',
            connected: true,
            readyAt: new Date().toISOString(),
            qrCode: '',
            qrDataUrl: '',
            reconnectAttempts: 0,
            nextReconnectAt: '',
            lastError: '',
            clientInfo: socket?.user
              ? {
                pushname: socket.user.name || '',
                wid: socket.user.id || '',
              }
              : null,
          });
          logger.log('Bot temporario por QR conectado e pronto para responder.');
        }

        if (update.connection === 'close') {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          const reason = update.lastDisconnect?.error?.message || `Conexao encerrada (${statusCode || 'sem codigo'})`;
          updateStatus({ state: 'disconnected', connected: false, lastError: reason });

          if (statusCode === DisconnectReason.loggedOut) {
            updateStatus({
              state: 'logged_out',
              connected: false,
              lastError: 'Sessao encerrada no WhatsApp. Reinicie e escaneie um novo QR code.',
            });
            logger.warn('Sessao do WhatsApp temporario foi encerrada. Sera necessario escanear novo QR.');
            return;
          }

          logger.warn(`WhatsApp temporario desconectado: ${reason}`);
          scheduleReconnect(reason);
        }
      });
      socket.ev.on('messages.upsert', async ({ messages = [], type }) => {
        if (type !== 'notify') return;
        await handleMessages(messages);
      });

      updateStatus({ state: 'starting', connected: false });
    } finally {
      starting = false;
    }
  }

  startSocket().catch((error) => {
    updateStatus({ state: 'failed', connected: false, lastError: error.message || 'Falha ao iniciar o bot temporario.' });
    logger.error(`Nao foi possivel iniciar o bot temporario: ${error.message || error}`);
    scheduleReconnect(error.message || error);
  });

  const waitUntilConnected = async (timeoutMs = 10_000) => {
    if (status.connected) return true;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (status.connected) return true;
    }
    return false;
  };

  return {
    getStatus: () => ({ ...status }),
    sendText: async (to, body) => {
      if (isGroupJid(to)) {
        const error = new Error('Envio para grupos bloqueado. O bot responde apenas conversas privadas.');
        error.statusCode = 400;
        throw error;
      }

      if (!status.connected) {
        scheduleReconnect('Tentativa de envio com bot desconectado.');
      }
      if (!await waitUntilConnected()) {
        const error = new Error('Bot temporario por QR code ainda nao esta conectado.');
        error.statusCode = 503;
        throw error;
      }

      const jid = buildJid(to);
      if (!jid) {
        const error = new Error('Numero de WhatsApp invalido.');
        error.statusCode = 400;
        throw error;
      }

      const sent = await socket.sendMessage(jid, { text: String(body || '') });
      return {
        temporary: true,
        messages: [
          {
            id: sent?.key?.id || `temporary-${Date.now()}`,
          },
        ],
      };
    },
  };
}

module.exports = {
  startTemporaryWhatsAppQrBot,
};
