const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');
const { startTemporaryWhatsAppQrBot } = require('./temporary-whatsapp-qr-bot');

const ROOT_DIR = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) return;

    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  });
}

[
  path.join(ROOT_DIR, '.env'),
  path.join(ROOT_DIR, '.env.local'),
  path.join(ROOT_DIR, '.env.development.local'),
].forEach(loadEnvFile);

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 4100);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const CURRENT_ADMIN_USERNAME = 'willian';
const CURRENT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CURRENT_STAFF_USERNAME = 'secretaria';
const CURRENT_STAFF_PASSWORD = process.env.STAFF_PASSWORD || '';
const LEGACY_ADMIN_USERNAME = 'dra';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const WHATSAPP_DELIVERY_MODE = String(process.env.WHATSAPP_DELIVERY_MODE || 'meta').trim().toLowerCase();
const WHATSAPP_TEMPORARY_QR_ENABLED = String(process.env.WHATSAPP_TEMPORARY_QR_ENABLED || '').trim() === 'true'
  || WHATSAPP_DELIVERY_MODE === 'temporary_qr';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const WHATSAPP_DOCTOR_PHONE = process.env.WHATSAPP_DOCTOR_PHONE || '';
const WHATSAPP_RESPONSIBLE_PHONE = process.env.WHATSAPP_RESPONSIBLE_PHONE || WHATSAPP_DOCTOR_PHONE;
const WHATSAPP_RESPONSIBLE_NAME = process.env.WHATSAPP_RESPONSIBLE_NAME || '';
const WHATSAPP_DOCTOR_TEMPLATE_NAME = process.env.WHATSAPP_DOCTOR_TEMPLATE_NAME || '';
const WHATSAPP_DOCTOR_TEMPLATE_LANGUAGE = process.env.WHATSAPP_DOCTOR_TEMPLATE_LANGUAGE || 'pt_BR';
const WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED = String(process.env.WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED || '').trim() === 'true';
const WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME = process.env.WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME || '';
const WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME = process.env.WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME || '';
const WHATSAPP_PATIENT_TEMPLATE_LANGUAGE = process.env.WHATSAPP_PATIENT_TEMPLATE_LANGUAGE || 'pt_BR';
const WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED = String(process.env.WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED || '').trim() === 'true';
const WHATSAPP_SESSION_NUDGE_MINUTES = Number(process.env.WHATSAPP_SESSION_NUDGE_MINUTES || 20);
const WHATSAPP_SESSION_MAX_NUDGES = Number(process.env.WHATSAPP_SESSION_MAX_NUDGES || 3);
const WHATSAPP_SESSION_EXPIRE_HOURS = Number(process.env.WHATSAPP_SESSION_EXPIRE_HOURS || 12);
const WHATSAPP_MANUAL_OUTBOUND_SUPPRESS_HOURS = Number(process.env.WHATSAPP_MANUAL_OUTBOUND_SUPPRESS_HOURS || 12);
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || path.join('server', 'data-willian-holanda'));
const ARCHIVE_DIR = path.join(DATA_DIR, 'patient-archives');
const SQLITE_PATH = path.join(DATA_DIR, 'willian-holanda.sqlite');
const LEGACY_JSON_PATH = path.join(DATA_DIR, 'database.json');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const BUILD_INDEX_PATH = path.join(BUILD_DIR, 'index.html');
const LP_BUILD_DIR = path.join(ROOT_DIR, 'codigo-fonte-lp', 'out');
const LP_BUILD_INDEX_PATH = path.join(LP_BUILD_DIR, 'index.html');
const HISTORY_ARCHIVE_AFTER_DAYS = Number(process.env.HISTORY_ARCHIVE_AFTER_DAYS || 30);
const ARCHIVE_FILE_RETENTION_DAYS = Number(process.env.ARCHIVE_FILE_RETENTION_DAYS || 90);
const MEDICAL_RECORD_RETENTION_YEARS = Number(process.env.MEDICAL_RECORD_RETENTION_YEARS || 20);
const DEFAULT_TIME_SLOTS = [
  '07:00', '07:30',
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '12:00', '12:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
  '17:00', '17:30',
  '18:00',
];

function assertRequiredSecret(name, value) {
  const normalizedValue = String(value || '').trim();
  const blockedValues = new Set([
    '',
    'willian-holanda-secret-local',
    'troque-esta-chave-antes-de-publicar',
    'COLE_UMA_CHAVE_LONGA_E_ALEATORIA_AQUI',
  ]);

  if (blockedValues.has(normalizedValue) || normalizedValue.length < 24) {
    throw new Error(`${name} precisa ser definido com um valor forte antes de iniciar o servidor (${NODE_ENV}).`);
  }

  return normalizedValue;
}

assertRequiredSecret('JWT_SECRET', JWT_SECRET);

app.use(cors());
app.use(express.json({
  limit: '20mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer;
  },
}));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

let temporaryWhatsAppQrBot = null;
let temporaryWhatsAppQrStatus = {
  enabled: WHATSAPP_TEMPORARY_QR_ENABLED,
  state: WHATSAPP_TEMPORARY_QR_ENABLED ? 'starting' : 'disabled',
  connected: false,
  readyAt: '',
  lastQrAt: '',
  lastError: '',
  clientInfo: null,
};
const recentInboundTextBySender = new Map();

const db = new DatabaseSync(SQLITE_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS available_dates (
    date TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS available_time_slots (
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (date, time)
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    cpf TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    status TEXT NOT NULL,
    procedure_name TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by_user_id TEXT,
    appointment_time TEXT DEFAULT '',
    source TEXT NOT NULL DEFAULT 'panel',
    contact_phone TEXT DEFAULT '',
    FOREIGN KEY(created_by_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS patient_archive_files (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    records_count INTEGER NOT NULL DEFAULT 0,
    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    deleted_at TEXT DEFAULT '',
    deleted_reason TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT,
    actor_display_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    profile_name TEXT DEFAULT '',
    message_type TEXT NOT NULL,
    message_text TEXT DEFAULT '',
    status TEXT NOT NULL,
    appointment_id TEXT DEFAULT '',
    meta_message_id TEXT DEFAULT '',
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone_number TEXT PRIMARY KEY,
    step TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_inbound_dedup (
    meta_message_id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    message_text TEXT DEFAULT '',
    payload_json TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    processed_at TEXT DEFAULT '',
    processing_status TEXT NOT NULL DEFAULT 'received'
  );

  CREATE TABLE IF NOT EXISTS whatsapp_automation_events (
    notification_key TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    event_type TEXT NOT NULL,
    appointment_id TEXT DEFAULT '',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function columnExists(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definitionSql) {
  if (!columnExists(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

function ensureSchemaMigrations() {
  ensureColumn('appointments', 'appointment_time', `TEXT DEFAULT ''`);
  ensureColumn('appointments', 'source', `TEXT NOT NULL DEFAULT 'panel'`);
  ensureColumn('appointments', 'contact_phone', `TEXT DEFAULT ''`);
  ensureColumn('appointments', 'archived_at', `TEXT DEFAULT ''`);
  ensureColumn('appointments', 'archive_file_id', `TEXT DEFAULT ''`);
  ensureColumn('whatsapp_inbound_dedup', 'processed_at', `TEXT DEFAULT ''`);
  ensureColumn('whatsapp_inbound_dedup', 'processing_status', `TEXT NOT NULL DEFAULT 'received'`);
}

ensureSchemaMigrations();

function nowIso() {
  return new Date().toISOString();
}

function parseIsoDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '').replace(/^00/, '');
}

function isGroupConversationId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.endsWith('@g.us');
}

function normalizeTime(value) {
  const normalized = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : '';
}

function sortUniqueTimes(values) {
  return [...new Set(values.map(normalizeTime).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function formatCpf(value) {
  const digits = normalizeCpf(value);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function maskCpf(value) {
  const digits = normalizeCpf(value);
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 3)}.${'*'.repeat(3)}.${'*'.repeat(3)}-${digits.slice(-2)}`;
}

function verifyMetaSignature(req) {
  if (!WHATSAPP_APP_SECRET) return true;

  const signatureHeader = String(req.headers['x-hub-signature-256'] || '').trim();
  const rawBody = req.rawBody;
  if (!signatureHeader || !rawBody) return false;

  const [algorithm, receivedSignature] = signatureHeader.split('=');
  if (algorithm !== 'sha256' || !receivedSignature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function sortUniqueDates(values) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value))))].sort((a, b) => a.localeCompare(b));
}

function normalizeAvailableTimeSlotsForDates(dates, slotsByDate = {}) {
  return dates.reduce((accumulator, date) => {
    const slots = sortUniqueTimes(slotsByDate?.[date] || []);
    accumulator[date] = slots.length > 0 ? slots : DEFAULT_TIME_SLOTS;
    return accumulator;
  }, {});
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    active: Boolean(user.active),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function getSiteContent() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_content');
  return parseJson(row?.value, {});
}

function setSiteContent(value) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run('site_content', JSON.stringify(value || {}), now);
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    address: row.address,
    cpf: row.cpf,
    date: row.appointment_date,
    time: row.appointment_time || '',
    status: row.status,
    procedureName: row.procedure_name || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id || '',
    source: row.source || 'panel',
    contactPhone: row.contact_phone || '',
    archivedAt: row.archived_at || '',
    archiveFileId: row.archive_file_id || '',
  };
}

function getSchedule() {
  const availableDates = db.prepare('SELECT date FROM available_dates ORDER BY date ASC').all().map((item) => item.date);
  const availableTimeSlots = db.prepare(`
    SELECT date, time
    FROM available_time_slots
    ORDER BY date ASC, time ASC
  `).all().reduce((accumulator, row) => {
    accumulator[row.date] = accumulator[row.date] || [];
    accumulator[row.date].push(row.time);
    return accumulator;
  }, {});
  const appointments = db.prepare(`
    SELECT id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
    FROM appointments
    ORDER BY appointment_date ASC, full_name ASC
  `).all().map(mapAppointmentRow);

  Object.keys(availableTimeSlots).forEach((date) => {
    availableTimeSlots[date] = sortUniqueTimes(availableTimeSlots[date]);
  });

  return { availableDates, availableTimeSlots, appointments };
}

function getFreeTimeSlotsByDate(schedule = getSchedule()) {
  const occupiedSlotsByDate = schedule.appointments.reduce((accumulator, item) => {
    if (item.status === 'cancelado' || !item.time) return accumulator;
    accumulator[item.date] = accumulator[item.date] || new Set();
    accumulator[item.date].add(item.time);
    return accumulator;
  }, {});

  return schedule.availableDates.reduce((accumulator, date) => {
    const occupied = occupiedSlotsByDate[date] || new Set();
    accumulator[date] = sortUniqueTimes((schedule.availableTimeSlots[date] || []).filter((time) => !occupied.has(time)));
    return accumulator;
  }, {});
}

function getDatesWithFreeSlots(schedule = getSchedule()) {
  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const today = dateKeyFromDate(new Date());
  return schedule.availableDates.filter((date) => date >= today && (freeTimeSlotsByDate[date] || []).length > 0);
}

function getWhatsAppSession(phoneNumber) {
  if (!phoneNumber) return null;
  const row = db.prepare(`
    SELECT phone_number, step, draft_json, updated_at
    FROM whatsapp_sessions
    WHERE phone_number = ?
  `).get(normalizePhoneNumber(phoneNumber));
  if (!row) return null;

  return {
    phoneNumber: row.phone_number,
    step: row.step,
    draft: parseJson(row.draft_json, {}),
    updatedAt: row.updated_at,
  };
}

function saveWhatsAppSession(phoneNumber, step, draft = {}) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone || !step) return null;

  db.prepare(`
    INSERT INTO whatsapp_sessions (phone_number, step, draft_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(phone_number) DO UPDATE SET
      step = excluded.step,
      draft_json = excluded.draft_json,
      updated_at = excluded.updated_at
  `).run(normalizedPhone, step, JSON.stringify(draft || {}), nowIso());

  return getWhatsAppSession(normalizedPhone);
}

function touchWhatsAppSession(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  db.prepare('UPDATE whatsapp_sessions SET updated_at = ? WHERE phone_number = ?').run(nowIso(), normalizedPhone);
  return getWhatsAppSession(normalizedPhone);
}

function clearWhatsAppSession(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return;
  db.prepare('DELETE FROM whatsapp_sessions WHERE phone_number = ?').run(normalizedPhone);
}

function getActiveWhatsAppSessionCount() {
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM whatsapp_sessions
    WHERE step NOT IN ('manual_outbound_guard')
  `).get().total || 0;
}

function getAllWhatsAppSessions() {
  return db.prepare(`
    SELECT phone_number, step, draft_json, updated_at
    FROM whatsapp_sessions
    ORDER BY updated_at ASC
  `).all().map((row) => ({
    phoneNumber: row.phone_number,
    step: row.step,
    draft: parseJson(row.draft_json, {}),
    updatedAt: row.updated_at,
  }));
}

function getMinutesSince(isoString) {
  const parsed = parseIsoDate(isoString);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - parsed.getTime()) / (60 * 1000));
}

function isWhatsAppBusinessAutomaticGreeting(text) {
  const normalizedText = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedText.includes('ola estamos feliz por ter voce aqui')
    && normalizedText.includes('wr gastro agradece seu contato')
    && normalizedText.includes('como podemos ajudar');
}

function markManualOutboundGuard(phoneNumber, details = {}) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  const suppressUntil = new Date(Date.now() + WHATSAPP_MANUAL_OUTBOUND_SUPPRESS_HOURS * 60 * 60 * 1000).toISOString();
  return saveWhatsAppSession(normalizedPhone, 'manual_outbound_guard', {
    source: details.source || 'temporary_qr',
    messageText: String(details.text || '').slice(0, 500),
    metaMessageId: details.metaMessageId || '',
    startedByUsAt: nowIso(),
    suppressUntil,
  });
}

function isManualOutboundGuardActive(session) {
  if (session?.step !== 'manual_outbound_guard') return false;
  if (isWhatsAppBusinessAutomaticGreeting(session.draft?.messageText)) return false;
  const suppressUntil = parseIsoDate(session.draft?.suppressUntil);
  return Boolean(suppressUntil && suppressUntil.getTime() > Date.now());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shouldIgnoreRecentRepeatedText(source, phoneNumber, text) {
  if (source === 'simulation') return false;

  const normalizedText = String(text || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalizedText) return false;

  const now = Date.now();
  const key = `${source}:${normalizePhoneNumber(phoneNumber)}:${normalizedText}`;
  const lastSeenAt = recentInboundTextBySender.get(key) || 0;
  recentInboundTextBySender.set(key, now);

  for (const [itemKey, itemSeenAt] of recentInboundTextBySender.entries()) {
    if (now - itemSeenAt > 60_000) {
      recentInboundTextBySender.delete(itemKey);
    }
  }

  return now - lastSeenAt <= 15_000;
}

function getFirstWhatsAppConversationEvent(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  return db.prepare(`
    SELECT direction, status, created_at
    FROM whatsapp_events
    WHERE phone_number = ?
      AND direction IN ('inbound', 'outbound')
      AND status NOT IN ('duplicate_ignored', 'duplicate_text_ignored', 'group_ignored', 'no_reply')
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get(normalizedPhone) || null;
}

function wasWhatsAppConversationStartedByUs(phoneNumber) {
  const firstEvent = getFirstWhatsAppConversationEvent(phoneNumber);
  return firstEvent?.direction === 'outbound';
}

function getAppointmentById(id) {
  const row = db.prepare(`
    SELECT id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
    FROM appointments
    WHERE id = ?
  `).get(id);
  return row ? mapAppointmentRow(row) : null;
}

function normalizeStatus(value) {
  const allowed = ['pendente', 'agendado', 'confirmado', 'concluido', 'cancelado'];
  return allowed.includes(value) ? value : 'agendado';
}

function sanitizeAppointment(input, availableDates, availableTimeSlotsByDate, existingId) {
  const fullName = String(input?.fullName || '').trim();
  const address = String(input?.address || '').trim();
  const cpfDigits = normalizeCpf(input?.cpf);
  const date = String(input?.date || '').trim();
  const time = normalizeTime(input?.time);
  const procedureName = String(input?.procedureName || '').trim();
  const notes = String(input?.notes || '').trim();
  const status = normalizeStatus(input?.status);
  const id = String(existingId || input?.id || `appt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const isWhatsAppLead = id.startsWith('whatsapp-lead-') || Boolean(input?.whatsappLead) || (input?.source === 'whatsapp' && !date);

  if (isWhatsAppLead && fullName) {
    return {
      id,
      fullName,
      address: address || 'Não informado',
      cpf: cpfDigits.length === 11 ? formatCpf(cpfDigits) : '',
      date: '',
      time: '',
      status: status === 'agendado' ? 'pendente' : status,
      procedureName,
      notes,
      createdAt: input?.createdAt ? String(input.createdAt) : nowIso(),
      updatedAt: nowIso(),
      source: 'whatsapp',
      contactPhone: normalizePhoneNumber(input?.contactPhone),
      whatsappLead: true,
    };
  }

  if (!fullName || !address || cpfDigits.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (!availableDates.includes(date)) {
    return null;
  }
  const dateSlots = Array.isArray(availableTimeSlotsByDate?.[date]) ? availableTimeSlotsByDate[date] : [];
  const hasStructuredSlots = dateSlots.length > 0;
  const isLegacyAppointmentWithoutTime = Boolean(existingId) && !time;
  if (hasStructuredSlots && !dateSlots.includes(time) && !isLegacyAppointmentWithoutTime) {
    return null;
  }

  return {
    id,
    fullName,
    address,
    cpf: formatCpf(cpfDigits),
    date,
    time,
    status,
    procedureName,
    notes,
    createdAt: input?.createdAt ? String(input.createdAt) : nowIso(),
    updatedAt: nowIso(),
    source: String(input?.source || 'panel').trim() || 'panel',
    contactPhone: normalizePhoneNumber(input?.contactPhone),
  };
}

function findAppointmentByCpfAndDate(cpf, date) {
  const normalized = normalizeCpf(cpf);
  if (!normalized || !date) return null;

  return getSchedule().appointments.find(
    (item) => normalizeCpf(item.cpf) === normalized && item.date === date && item.status !== 'cancelado'
  ) || null;
}

function hasActiveAppointmentAtSlot(appointments, date, time, ignoreAppointmentId = '') {
  return appointments.some(
    (item) =>
      item.id !== ignoreAppointmentId &&
      item.date === date &&
      item.time === time &&
      item.status !== 'cancelado'
  );
}

function createAppointment(input, actor) {
  const schedule = getSchedule();
  const appointment = sanitizeAppointment(input, schedule.availableDates, schedule.availableTimeSlots);
  if (!appointment) {
    const error = new Error('Dados inválidos para criar agendamento.');
    error.statusCode = 400;
    throw error;
  }

  const duplicate = findAppointmentByCpfAndDate(appointment.cpf, appointment.date);
  if (duplicate) {
    const error = new Error('Ja existe um agendamento ativo para esse CPF nessa data.');
    error.statusCode = 409;
    throw error;
  }
  if (appointment.time && hasActiveAppointmentAtSlot(schedule.appointments, appointment.date, appointment.time)) {
    const error = new Error('Esse horário não está mais disponível.');
    error.statusCode = 409;
    throw error;
  }

  const creatorUserId = actor?.id
    ? db.prepare('SELECT id FROM users WHERE id = ?').get(actor.id)?.id || null
    : null;

  db.prepare(`
    INSERT INTO appointments (
      id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    appointment.id,
    appointment.fullName,
    appointment.address,
    appointment.cpf,
    appointment.date,
    appointment.time,
    appointment.status,
    appointment.procedureName,
    appointment.notes,
    appointment.createdAt,
    appointment.updatedAt,
    creatorUserId,
    appointment.source,
    appointment.contactPhone,
    '',
    ''
  );

  return getAppointmentById(appointment.id);
}

function rescheduleAppointment(appointmentId, nextDate, nextTime, actor) {
  const appointment = getAppointmentById(appointmentId);
  if (!appointment) {
    const error = new Error('Agendamento nao encontrado.');
    error.statusCode = 404;
    throw error;
  }
  if (appointment.status === 'cancelado') {
    const error = new Error('Nao e possivel remarcar um agendamento cancelado.');
    error.statusCode = 409;
    throw error;
  }

  const schedule = getSchedule();
  if (!schedule.availableDates.includes(nextDate)) {
    const error = new Error('A nova data nao esta liberada na agenda.');
    error.statusCode = 409;
    throw error;
  }
  if (!(schedule.availableTimeSlots[nextDate] || []).includes(nextTime)) {
    const error = new Error('O novo horario nao esta liberado na agenda.');
    error.statusCode = 409;
    throw error;
  }
  if (hasActiveAppointmentAtSlot(schedule.appointments, nextDate, nextTime, appointment.id)) {
    const error = new Error('Esse horario nao esta mais disponivel.');
    error.statusCode = 409;
    throw error;
  }

  db.prepare(`
    UPDATE appointments
    SET appointment_date = ?, appointment_time = ?, updated_at = ?
    WHERE id = ?
  `).run(nextDate, nextTime, nowIso(), appointment.id);

  writeAuditLog(actor, 'reschedule_appointment', 'appointment', appointment.id, {
    previousDate: appointment.date,
    previousTime: appointment.time,
    nextDate,
    nextTime,
    source: appointment.source,
  });

  return getAppointmentById(appointment.id);
}

function persistSchedule(input, actor) {
  const currentSchedule = getSchedule();
  const datesFromSlots = Object.entries(input?.availableTimeSlots || {})
    .filter(([, slots]) => sortUniqueTimes(slots || []).length > 0)
    .map(([date]) => String(date));
  const nextAvailableDates = actor.role === 'admin'
    ? sortUniqueDates([...(input?.availableDates || []).map((item) => String(item)), ...datesFromSlots])
    : currentSchedule.availableDates;
  const nextAvailableTimeSlots = actor.role === 'admin'
    ? normalizeAvailableTimeSlotsForDates(nextAvailableDates, input?.availableTimeSlots)
    : currentSchedule.availableTimeSlots;

  const existingAppointmentsById = new Map(
    currentSchedule.appointments.map((item) => [item.id, item])
  );

  const sanitizedAppointments = (Array.isArray(input?.appointments) ? input.appointments : [])
    .map((item) => sanitizeAppointment(item, nextAvailableDates, nextAvailableTimeSlots, item?.id))
    .filter(Boolean)
    .filter((item, index, list) => {
      if (!item.date || !item.time) return true;
      const duplicateIndex = list.findIndex(
        (candidate) =>
          candidate.date === item.date &&
          candidate.time === item.time &&
          candidate.status !== 'cancelado'
      );
      return duplicateIndex === index;
    });

  db.exec('BEGIN');
  try {
    if (actor.role === 'admin') {
      db.prepare('DELETE FROM available_dates').run();
      const insertDate = db.prepare('INSERT INTO available_dates (date, created_at) VALUES (?, ?)');
      nextAvailableDates.forEach((date) => insertDate.run(date, nowIso()));

      db.prepare('DELETE FROM available_time_slots').run();
      const insertTimeSlot = db.prepare('INSERT INTO available_time_slots (date, time, created_at) VALUES (?, ?, ?)');
      nextAvailableDates.forEach((date) => {
        (nextAvailableTimeSlots[date] || []).forEach((time) => insertTimeSlot.run(date, time, nowIso()));
      });
    }

    db.prepare('DELETE FROM appointments').run();
    const insertAppointment = db.prepare(`
      INSERT INTO appointments (
        id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sanitizedAppointments.forEach((item) => {
      const existing = existingAppointmentsById.get(item.id);
      insertAppointment.run(
        item.id,
        item.fullName,
        item.address,
        item.cpf,
        item.date,
        item.time,
        item.status,
        item.procedureName,
        item.notes,
        existing?.createdAt || item.createdAt,
        nowIso(),
        existing?.createdByUserId || actor.id,
        existing?.source || item.source || 'panel',
        existing?.contactPhone || item.contactPhone || '',
        existing?.archivedAt || item.archivedAt || '',
        existing?.archiveFileId || item.archiveFileId || ''
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getSchedule();
}

function writeAuditLog(actor, action, entityType, entityId, details) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_display_name, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor?.id || null,
    actor?.displayName || 'Sistema',
    action,
    entityType,
    entityId || null,
    JSON.stringify(details || {}),
    nowIso()
  );
}

function updateAppointmentStatus(appointmentId, status, actor) {
  const appointment = getAppointmentById(appointmentId);
  if (!appointment) {
    const error = new Error('Agendamento não encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const nextStatus = normalizeStatus(status);
  db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, nowIso(), appointmentId);
  writeAuditLog(actor, 'update_appointment_status', 'appointment', appointmentId, {
    previousStatus: appointment.status,
    nextStatus,
    source: appointment.source,
  });
  return getAppointmentById(appointmentId);
}

function createPanelAppointment(input, actor) {
  const appointment = createAppointment(
    {
      ...input,
      source: 'panel',
    },
    actor
  );

  writeAuditLog(actor, 'create_appointment_panel', 'appointment', appointment.id, {
    date: appointment.date,
    time: appointment.time,
    source: appointment.source,
  });

  return appointment;
}

function updatePanelAppointmentStatus(appointmentId, status, actor) {
  const appointment = updateAppointmentStatus(appointmentId, status, actor);
  return appointment;
}

function reschedulePanelAppointment(appointmentId, nextDate, nextTime, actor) {
  return rescheduleAppointment(appointmentId, nextDate, nextTime, actor);
}

function getAuditLogs(limit = 40) {
  return db.prepare(`
    SELECT id, actor_user_id, actor_display_name, action, entity_type, entity_id, details_json, created_at
    FROM audit_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: parseJson(row.details_json, {}),
    createdAt: row.created_at,
  }));
}

function logWhatsAppEvent({
  direction,
  phoneNumber,
  profileName = '',
  messageType,
  messageText = '',
  status,
  appointmentId = '',
  metaMessageId = '',
  details = {},
}) {
  db.prepare(`
    INSERT INTO whatsapp_events (
      direction, phone_number, profile_name, message_type, message_text, status, appointment_id, meta_message_id, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    direction,
    normalizePhoneNumber(phoneNumber),
    String(profileName || ''),
    messageType,
    String(messageText || ''),
    status,
    appointmentId || '',
    metaMessageId || '',
    JSON.stringify(details || {}),
    nowIso()
  );
}

function getRecentWhatsAppEvents(limit = 30) {
  return db.prepare(`
    SELECT id, direction, phone_number, profile_name, message_type, message_text, status, appointment_id, meta_message_id, details_json, created_at
    FROM whatsapp_events
    ORDER BY id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    direction: row.direction,
    phoneNumber: row.phone_number,
    profileName: row.profile_name || '',
    messageType: row.message_type,
    messageText: row.message_text || '',
    status: row.status,
    appointmentId: row.appointment_id || '',
    metaMessageId: row.meta_message_id || '',
    details: parseJson(row.details_json, {}),
    createdAt: row.created_at,
  }));
}

function getDashboardSummary() {
  const appointments = getSchedule().appointments;
  const activeAppointments = appointments.filter((item) => item.status !== 'cancelado');
  const uniquePatients = new Set(appointments.map((item) => normalizeCpf(item.cpf))).size;
  const byStatus = appointments.reduce((accumulator, item) => {
    accumulator[item.status] = (accumulator[item.status] || 0) + 1;
    return accumulator;
  }, {});

  return {
    totalUsers: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
    activeUsers: db.prepare('SELECT COUNT(*) AS count FROM users WHERE active = 1').get().count,
    releasedDates: db.prepare('SELECT COUNT(*) AS count FROM available_dates').get().count,
    totalAppointments: appointments.length,
    activeAppointments: activeAppointments.length,
    uniquePatients,
    recentHistory: appointments.filter((item) => !item.archivedAt).length,
    archivedHistory: appointments.filter((item) => item.archivedAt).length,
    archiveFiles: db.prepare("SELECT COUNT(*) AS count FROM patient_archive_files WHERE COALESCE(deleted_at, '') = ''").get().count,
    byStatus,
    bySource: appointments.reduce((accumulator, item) => {
      accumulator[item.source || 'panel'] = (accumulator[item.source || 'panel'] || 0) + 1;
      return accumulator;
    }, {}),
  };
}

function dateKeyFromDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToDate(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function getArchiveFileRows(includeDeleted = false) {
  const where = includeDeleted ? '' : "WHERE COALESCE(deleted_at, '') = ''";
  return db.prepare(`
    SELECT id, file_name, file_path, file_size_bytes, sha256, records_count, period_start, period_end, created_at, deleted_at, deleted_reason
    FROM patient_archive_files
    ${where}
    ORDER BY created_at DESC
  `).all().map((row) => ({
    id: row.id,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    sha256: row.sha256,
    recordsCount: row.records_count,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || '',
    deletedReason: row.deleted_reason || '',
  }));
}

function getRetentionStatus() {
  const today = new Date();
  const archiveCutoff = dateKeyFromDate(addDaysToDate(today, -HISTORY_ARCHIVE_AFTER_DAYS));
  const fileCutoffIso = addDaysToDate(today, -ARCHIVE_FILE_RETENTION_DAYS).toISOString();

  return {
    archiveAfterDays: HISTORY_ARCHIVE_AFTER_DAYS,
    archiveFileRetentionDays: ARCHIVE_FILE_RETENTION_DAYS,
    medicalRecordRetentionYears: MEDICAL_RECORD_RETENTION_YEARS,
    archiveCutoffDate: archiveCutoff,
    fileRetentionCutoffAt: fileCutoffIso,
    pendingArchiveCount: db.prepare(`
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE appointment_date <= ?
        AND COALESCE(archived_at, '') = ''
    `).get(archiveCutoff).count,
    archivedAppointmentCount: db.prepare(`
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE COALESCE(archived_at, '') <> ''
    `).get().count,
    activeArchiveFileCount: db.prepare(`
      SELECT COUNT(*) AS count
      FROM patient_archive_files
      WHERE COALESCE(deleted_at, '') = ''
    `).get().count,
    expiredArchiveFileCount: db.prepare(`
      SELECT COUNT(*) AS count
      FROM patient_archive_files
      WHERE COALESCE(deleted_at, '') = ''
        AND created_at <= ?
    `).get(fileCutoffIso).count,
  };
}

function getPatientHistory({ query = '', archived = 'all', limit = 250 } = {}) {
  const rows = getSchedule().appointments;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const digits = normalizeCpf(normalizedQuery);

  return rows
    .filter((item) => {
      if (archived === 'recent' && item.archivedAt) return false;
      if (archived === 'archived' && !item.archivedAt) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        item.fullName,
        item.cpf,
        item.address,
        item.contactPhone,
        item.date,
        item.time,
        item.status,
        item.procedureName,
        item.notes,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery) || (digits && normalizeCpf(item.cpf).includes(digits));
    })
    .sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date);
      if (dateComparison !== 0) return dateComparison;
      return (b.time || '').localeCompare(a.time || '');
    })
    .slice(0, Number(limit) || 250);
}

function createPatientArchiveFile(appointments, actor, reason = 'automatic_30_day_archive') {
  if (!appointments.length) return null;
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const createdAt = nowIso();
  const id = `archive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeTimestamp = createdAt.replace(/[:.]/g, '-');
  const fileName = `patient-history-${safeTimestamp}.json.gz`;
  const filePath = path.join(ARCHIVE_DIR, fileName);
  const periodStart = appointments.reduce((oldest, item) => (!oldest || item.date < oldest ? item.date : oldest), '');
  const periodEnd = appointments.reduce((latest, item) => (!latest || item.date > latest ? item.date : latest), '');
  const payload = {
    exportedAt: createdAt,
    reason,
    retentionPolicy: {
      visibleRecentDays: HISTORY_ARCHIVE_AFTER_DAYS,
      backupFileRetentionDays: ARCHIVE_FILE_RETENTION_DAYS,
      medicalRecordRetentionYears: MEDICAL_RECORD_RETENTION_YEARS,
      note: 'Este arquivo compacta o histórico para recuperação. O registro principal permanece no banco para retenção legal.',
    },
    records: appointments,
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
  fs.writeFileSync(filePath, compressed);
  const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');

  db.prepare(`
    INSERT INTO patient_archive_files (id, file_name, file_path, file_size_bytes, sha256, records_count, period_start, period_end, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fileName, filePath, compressed.length, sha256, appointments.length, periodStart, periodEnd, createdAt);

  const updateAppointment = db.prepare('UPDATE appointments SET archived_at = ?, archive_file_id = ?, updated_at = ? WHERE id = ?');
  appointments.forEach((appointment) => updateAppointment.run(createdAt, id, createdAt, appointment.id));

  writeAuditLog(actor, 'archive_patient_history', 'patient_archive_file', id, {
    recordsCount: appointments.length,
    fileName,
    periodStart,
    periodEnd,
    reason,
  });

  return getArchiveFileRows(true).find((item) => item.id === id) || null;
}

function runRetentionMaintenance(actor = { id: 'system', displayName: 'Sistema', role: 'system' }) {
  const today = new Date();
  const archiveCutoff = dateKeyFromDate(addDaysToDate(today, -HISTORY_ARCHIVE_AFTER_DAYS));
  const fileCutoffIso = addDaysToDate(today, -ARCHIVE_FILE_RETENTION_DAYS).toISOString();
  const pendingRows = db.prepare(`
    SELECT id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
    FROM appointments
    WHERE appointment_date <= ?
      AND COALESCE(archived_at, '') = ''
    ORDER BY appointment_date ASC, appointment_time ASC
  `).all().map(mapAppointmentRow);

  let createdArchive = null;
  if (pendingRows.length > 0) {
    createdArchive = createPatientArchiveFile(pendingRows, actor);
  }

  const expiredFiles = db.prepare(`
    SELECT id, file_name, file_path
    FROM patient_archive_files
    WHERE COALESCE(deleted_at, '') = ''
      AND created_at <= ?
  `).all(fileCutoffIso);
  const deletedAt = nowIso();
  expiredFiles.forEach((file) => {
    const resolvedPath = path.resolve(file.file_path);
    const archiveRoot = path.resolve(ARCHIVE_DIR);
    if (resolvedPath.startsWith(archiveRoot) && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }
    db.prepare(`
      UPDATE patient_archive_files
      SET deleted_at = ?, deleted_reason = ?
      WHERE id = ?
    `).run(deletedAt, `Retencao de ${ARCHIVE_FILE_RETENTION_DAYS} dias para arquivos compactados.`, file.id);
    writeAuditLog(actor, 'delete_expired_archive_file', 'patient_archive_file', file.id, {
      fileName: file.file_name,
      retentionDays: ARCHIVE_FILE_RETENTION_DAYS,
    });
  });

  return {
    ok: true,
    ranAt: nowIso(),
    archivedAppointments: pendingRows.length,
    createdArchive,
    deletedArchiveFiles: expiredFiles.length,
    status: getRetentionStatus(),
    archiveFiles: getArchiveFileRows(),
  };
}

function buildSystemCheckReport(auth) {
  const checks = [];
  const startedAt = nowIso();

  const pushCheck = (key, label, runCheck) => {
    try {
      const details = runCheck();
      checks.push({
        key,
        label,
        ok: true,
        details: details || {},
      });
    } catch (error) {
      checks.push({
        key,
        label,
        ok: false,
        error: error.message || 'Falha ao executar verificação.',
      });
    }
  };

  pushCheck('api', 'API do servidor', () => ({
    status: 'online',
    serverTime: nowIso(),
  }));

  pushCheck('auth', 'Sessão autenticada', () => ({
    userId: auth.id,
    role: auth.role,
    username: auth.username,
  }));

  pushCheck('schedule', 'Agenda e disponibilidade', () => {
    const schedule = getSchedule();
    const dates = Array.isArray(schedule.availableDates) ? schedule.availableDates.length : 0;
    const appointments = Array.isArray(schedule.appointments) ? schedule.appointments.length : 0;
    const invalidDates = (schedule.availableDates || []).filter((date) => (schedule.availableTimeSlots?.[date] || []).length === 0);

    if (invalidDates.length > 0) {
      throw new Error(`Existem datas liberadas sem horário: ${invalidDates[0]}.`);
    }

    return {
      availableDates: dates,
      appointments,
      freeDates: getDatesWithFreeSlots(schedule).length,
    };
  });

  pushCheck('dashboard', 'Painel e resumo', () => {
    const summary = getDashboardSummary();
    return {
      activeAppointments: summary.activeAppointments ?? 0,
      releasedDates: summary.releasedDates ?? 0,
      activeUsers: summary.activeUsers ?? 0,
    };
  });

  if (auth.role === 'admin') {
    pushCheck('whatsapp', 'Integracao do WhatsApp', () => {
      const status = getWhatsAppStatus({ auth });
      return {
        configured: Boolean(status?.configured),
        verifyTokenConfigured: Boolean(status?.verifyTokenConfigured),
        accessTokenConfigured: Boolean(status?.accessTokenConfigured),
        phoneNumberIdConfigured: Boolean(status?.phoneNumberIdConfigured),
        appSecretConfigured: Boolean(status?.appSecretConfigured),
        doctorPhoneConfigured: Boolean(status?.doctorPhoneConfigured),
        responsiblePhoneConfigured: Boolean(status?.responsiblePhoneConfigured),
        doctorTemplateConfigured: Boolean(status?.doctorTemplateConfigured),
        readyForInboundMessages: Boolean(status?.readiness?.readyForInboundMessages),
        readyForDoctorAutomation: Boolean(status?.readiness?.readyForDoctorAutomation),
        readyForPatientReminders: Boolean(status?.readiness?.readyForPatientReminders),
        readyForFullAutomation: Boolean(status?.readiness?.readyForFullAutomation),
        missingCore: status?.readiness?.missingCore || [],
        warnings: status?.readiness?.warnings || [],
        activeConversations: status?.activeConversations ?? 0,
      };
    });

    pushCheck('users', 'Usuários do painel', () => {
      const users = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM users').get();
      return {
        totalUsers: users?.total ?? 0,
        activeUsers: users?.active ?? 0,
      };
    });

    pushCheck('retention', 'Histórico, compactação e backups', () => {
      const status = getRetentionStatus();
      return {
        arquivarAposDias: status.archiveAfterDays,
        apagarArquivosAposDias: status.archiveFileRetentionDays,
        prontuarioAnos: status.medicalRecordRetentionYears,
        pendentesParaArquivar: status.pendingArchiveCount,
        arquivosAtivos: status.activeArchiveFileCount,
        arquivosVencidos: status.expiredArchiveFileCount,
      };
    });
  }

  const failures = checks.filter((item) => !item.ok);
  return {
    ok: failures.length === 0,
    startedAt,
    finishedAt: nowIso(),
    role: auth.role,
    checks,
    summary: failures.length === 0
      ? 'Tudo certo nas verificações principais.'
      : `${failures.length} verificação(ões) apresentou(aram) falha.`,
  };
}

function buildBackupSnapshot() {
  return {
    exportedAt: nowIso(),
    users: db.prepare(`
      SELECT id, username, role, display_name AS displayName, active, created_at AS createdAt, updated_at AS updatedAt
      FROM users
      ORDER BY created_at ASC
    `).all(),
    siteContent: getSiteContent(),
    schedule: getSchedule(),
    retention: {
      status: getRetentionStatus(),
      archiveFiles: getArchiveFileRows(true),
    },
    auditLogs: getAuditLogs(500),
    whatsapp: {
      events: getRecentWhatsAppEvents(500),
    },
  };
}

function ensureSeedData() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0;
  if (hasUsers) return;

  if (!CURRENT_ADMIN_PASSWORD || !CURRENT_STAFF_PASSWORD) {
    throw new Error('Defina ADMIN_PASSWORD e STAFF_PASSWORD no ambiente antes de iniciar uma base nova.');
  }

  const now = nowIso();
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'user-dra',
    CURRENT_ADMIN_USERNAME,
    bcrypt.hashSync(CURRENT_ADMIN_PASSWORD, 10),
    'admin',
    'Willian Holanda',
    1,
    now,
    now
  );
  insertUser.run('user-secretaria', CURRENT_STAFF_USERNAME, bcrypt.hashSync(CURRENT_STAFF_PASSWORD, 10), 'staff', 'Secretaria', 1, now, now);
  setSiteContent({});
}

function migrateLegacyJsonIfNeeded() {
  if (!fs.existsSync(LEGACY_JSON_PATH)) return;
  const hasAnyAppointments = db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count > 0;
  const hasAvailableDates = db.prepare('SELECT COUNT(*) AS count FROM available_dates').get().count > 0;
  const siteContentRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_content');
  if (hasAnyAppointments || hasAvailableDates || siteContentRow?.value) return;

  const legacy = parseJson(fs.readFileSync(LEGACY_JSON_PATH, 'utf8'), null);
  if (!legacy) return;

  if (legacy.siteContent) {
    setSiteContent(legacy.siteContent);
  }

  if (legacy.schedule || legacy.admin) {
    persistSchedule(
      legacy.schedule || legacy.admin,
      { id: 'system', role: 'admin', displayName: 'Migracao' }
    );
  }

  if (Array.isArray(legacy.users)) {
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, password_hash, role, display_name, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    legacy.users.forEach((user) => {
      const now = nowIso();
      insertUser.run(
        user.id,
        user.username,
        user.passwordHash,
        user.role,
        user.displayName,
        user.active ? 1 : 0,
        now,
        now
      );
    });
  }

  writeAuditLog(
    { id: 'system', displayName: 'Migracao', role: 'admin' },
    'legacy_import',
    'database',
    'legacy-json',
    { source: LEGACY_JSON_PATH }
  );
}

ensureSeedData();
migrateLegacyJsonIfNeeded();

function migrateDefaultAdminCredentialsIfNeeded() {
  if (!CURRENT_ADMIN_PASSWORD) return;
  const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get('user-dra');
  if (!adminUser || adminUser.role !== 'admin') return;

  const hasLegacyUsername = adminUser.username === LEGACY_ADMIN_USERNAME;
  const hasCurrentUsername = adminUser.username === CURRENT_ADMIN_USERNAME;
  const hasCurrentPassword = bcrypt.compareSync(CURRENT_ADMIN_PASSWORD, adminUser.password_hash);

  if (hasCurrentUsername && hasCurrentPassword) return;

  if (hasLegacyUsername || hasCurrentUsername) {
    db.prepare('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(
      CURRENT_ADMIN_USERNAME,
      bcrypt.hashSync(CURRENT_ADMIN_PASSWORD, 10),
      nowIso(),
      adminUser.id
    );
  }
}

migrateDefaultAdminCredentialsIfNeeded();

function migrateDefaultStaffCredentialsIfNeeded() {
  if (!CURRENT_STAFF_PASSWORD) return;
  const staffUser = db.prepare('SELECT * FROM users WHERE id = ?').get('user-secretaria');
  if (!staffUser || staffUser.role !== 'staff') return;

  const hasCurrentUsername = staffUser.username === CURRENT_STAFF_USERNAME;
  const hasCurrentPassword = bcrypt.compareSync(CURRENT_STAFF_PASSWORD, staffUser.password_hash);

  if (hasCurrentUsername && hasCurrentPassword) return;

  if (staffUser.username === CURRENT_STAFF_USERNAME) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      bcrypt.hashSync(CURRENT_STAFF_PASSWORD, 10),
      nowIso(),
      staffUser.id
    );
  }
}

migrateDefaultStaffCredentialsIfNeeded();

try {
  runRetentionMaintenance({ id: 'system', displayName: 'Sistema', role: 'system' });
} catch (error) {
  console.warn(`Retention maintenance skipped: ${error.message}`);
}

runWhatsAppAutomationMaintenance().catch((error) => {
  console.warn(`WhatsApp automation maintenance skipped: ${error.message}`);
});

setInterval(() => {
  try {
    runRetentionMaintenance({ id: 'system', displayName: 'Sistema', role: 'system' });
  } catch (error) {
    console.warn(`Retention maintenance failed: ${error.message}`);
  }
}, 24 * 60 * 60 * 1000);

setInterval(() => {
  runWhatsAppAutomationMaintenance().catch((error) => {
    console.warn(`WhatsApp automation maintenance failed: ${error.message}`);
  });
}, 5 * 60 * 1000);

function buildExternalBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;

  const protocol = req?.protocol || 'https';
  const hostFromGetter = typeof req?.get === 'function' ? req.get('host') : '';
  const hostFromHeaders = req?.headers?.host || '';
  const host = hostFromGetter || hostFromHeaders;

  if (host) {
    return `${protocol}://${host}`;
  }

  return 'https://willianholanda.com.br';
}

function isPlaceholderValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return true;

  const placeholders = [
    'defina-um-token-seguro',
    'cole-o-token-da-cloud-api',
    'cole-o-phone-number-id',
    'cole-o-app-secret-da-meta',
    '55dddnumero_do_medico',
    '55dddnumero',
    'cole_o_verify_token_da_meta',
    'cole_o_access_token_da_meta',
    'cole_o_phone_number_id_da_meta',
    'cole_o_app_secret_da_meta',
    'cole_o_numero_do_medico_com_ddi',
    'cole_um_token_de_verificacao_seguro',
    'cole_uma_chave_longa_e_aleatoria_aqui',
    'cole_uma_senha_forte_do_admin',
    'cole_uma_senha_forte_da_secretaria',
  ];

  const lowered = normalized.toLowerCase();
  return placeholders.includes(lowered) || lowered.startsWith('cole_') || lowered.startsWith('defina-');
}

function buildWhatsAppReadiness(req) {
  const callbackUrl = `${buildExternalBaseUrl(req)}/api/whatsapp/webhook`;
  const missingCore = [];
  const warnings = [];

  if (!WHATSAPP_VERIFY_TOKEN || isPlaceholderValue(WHATSAPP_VERIFY_TOKEN)) missingCore.push('WHATSAPP_VERIFY_TOKEN');
  if (!WHATSAPP_ACCESS_TOKEN || isPlaceholderValue(WHATSAPP_ACCESS_TOKEN)) missingCore.push('WHATSAPP_ACCESS_TOKEN');
  if (!WHATSAPP_PHONE_NUMBER_ID || isPlaceholderValue(WHATSAPP_PHONE_NUMBER_ID)) missingCore.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!WHATSAPP_APP_SECRET || isPlaceholderValue(WHATSAPP_APP_SECRET)) missingCore.push('WHATSAPP_APP_SECRET');
  if (!PUBLIC_BASE_URL || !/^https:\/\//i.test(PUBLIC_BASE_URL)) {
    warnings.push('PUBLIC_BASE_URL precisa apontar para o dominio final com HTTPS antes do webhook real.');
  }

  const missingDoctorAutomation = [];
  if (!WHATSAPP_DOCTOR_PHONE || isPlaceholderValue(WHATSAPP_DOCTOR_PHONE)) missingDoctorAutomation.push('WHATSAPP_DOCTOR_PHONE');
  if (!WHATSAPP_DOCTOR_TEMPLATE_NAME || isPlaceholderValue(WHATSAPP_DOCTOR_TEMPLATE_NAME)) {
    if (!WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED) {
      missingDoctorAutomation.push('WHATSAPP_DOCTOR_TEMPLATE_NAME');
    } else {
      warnings.push('Notificacao do medico depende de fallback em texto livre; o ideal e template aprovado.');
    }
  }

  const missingPatientAutomation = [];
  if (
    (!WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME || isPlaceholderValue(WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME))
    && !WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED
  ) {
    missingPatientAutomation.push('WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME');
  }
  if (
    (!WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME || isPlaceholderValue(WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME))
    && !WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED
  ) {
    missingPatientAutomation.push('WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME');
  }
  if (WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED) {
    warnings.push('Lembretes de pacientes estao liberados por texto livre como fallback; o ideal e usar templates aprovados.');
  }

  return {
    callbackUrl,
    readyForWebhookVerification: missingCore.length === 0 && /^https:\/\//i.test(callbackUrl),
    readyForInboundMessages: missingCore.length === 0,
    readyForDoctorAutomation: missingCore.length === 0 && missingDoctorAutomation.length === 0,
    readyForPatientReminders: missingCore.length === 0 && missingPatientAutomation.length === 0,
    readyForFullAutomation: missingCore.length === 0 && missingDoctorAutomation.length === 0 && missingPatientAutomation.length === 0,
    missingCore,
    missingDoctorAutomation,
    missingPatientAutomation,
    warnings,
    nextSteps: [
      ...(missingCore.length ? ['Preencher as credenciais principais da Meta no .env de producao.'] : []),
      ...(!/^https:\/\//i.test(callbackUrl) ? ['Publicar o sistema em dominio fixo com HTTPS e configurar PUBLIC_BASE_URL.'] : []),
      ...(missingDoctorAutomation.length ? ['Configurar telefone e template oficial de notificacao do medico.'] : []),
      ...(missingPatientAutomation.length ? ['Configurar os templates oficiais de lembrete do paciente ou habilitar fallback consciente.'] : []),
      'Executar o teste real no painel: Enviar teste, Testar notificacao do medico e Rodar check completo.',
    ],
  };
}

function getWhatsAppStatus(req) {
  const readiness = buildWhatsAppReadiness(req);
  const responsible = getWhatsAppResponsibleConfig();
  const temporaryQr = temporaryWhatsAppQrBot?.getStatus
    ? temporaryWhatsAppQrBot.getStatus()
    : { ...temporaryWhatsAppQrStatus };
  return {
    deliveryMode: WHATSAPP_DELIVERY_MODE,
    configured: Boolean(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
    verifyTokenConfigured: Boolean(WHATSAPP_VERIFY_TOKEN),
    accessTokenConfigured: Boolean(WHATSAPP_ACCESS_TOKEN),
    phoneNumberIdConfigured: Boolean(WHATSAPP_PHONE_NUMBER_ID),
    appSecretConfigured: Boolean(WHATSAPP_APP_SECRET),
    doctorPhoneConfigured: Boolean(WHATSAPP_DOCTOR_PHONE),
    responsiblePhoneConfigured: Boolean(responsible.phone),
    responsibleName: responsible.name,
    responsiblePhone: responsible.phone,
    responsibleSource: responsible.source,
    doctorTemplateConfigured: Boolean(WHATSAPP_DOCTOR_TEMPLATE_NAME),
    doctorFallbackTextEnabled: WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED,
    patientReminderTemplateConfigured: Boolean(WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME),
    patientSameDayTemplateConfigured: Boolean(WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME),
    patientFallbackTextEnabled: WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED,
    graphVersion: WHATSAPP_GRAPH_VERSION,
    callbackUrl: readiness.callbackUrl,
    temporaryQr,
    activeConversations: getActiveWhatsAppSessionCount(),
    recentEvents: getRecentWhatsAppEvents(25),
    readiness,
  };
}

function getWhatsAppResponsibleConfig() {
  const saved = getSettingJson('whatsapp_responsible', {});
  const savedPhone = normalizePhoneNumber(saved.phone || saved.phoneNumber || '');
  const fallbackPhone = normalizePhoneNumber(WHATSAPP_RESPONSIBLE_PHONE);
  return {
    name: String(saved.name || WHATSAPP_RESPONSIBLE_NAME || '').trim(),
    phone: savedPhone || fallbackPhone,
    source: savedPhone ? 'panel' : (fallbackPhone ? 'env' : ''),
  };
}

function saveWhatsAppResponsibleConfig(input = {}) {
  const name = String(input.name || '').trim();
  const phone = normalizePhoneNumber(input.phone || input.phoneNumber || '');
  if (!phone || phone.length < 10) {
    const error = new Error('Informe um WhatsApp valido para o responsavel, com DDD.');
    error.statusCode = 400;
    throw error;
  }

  const config = { name, phone };
  saveSettingJson('whatsapp_responsible', config);
  return getWhatsAppResponsibleConfig();
}

function normalizeCommandKey(key) {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseStructuredWhatsAppFields(text) {
  return text
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      const separatorIndex = item.search(/[:=]/);
      if (separatorIndex <= 0) return accumulator;

      const key = normalizeCommandKey(item.slice(0, separatorIndex));
      const value = item.slice(separatorIndex + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
}

function parseWhatsAppCommand(text) {
  const rawText = String(text || '').trim();
  const normalizedText = rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!rawText) return { type: 'help' };
  if (/^(ajuda|menu|oi|ola|iniciar|inicio|bom dia|boa tarde|boa noite|help)\b/.test(normalizedText)) return { type: 'help' };
  if (/(^|\b)(atendente|humano|falar com atendente|falar com pessoa)\b/.test(normalizedText)) return { type: 'human_handoff' };
  if (/(^|\b)(pagar|pagamento|quero pagar|fechar|fechar atendimento|finalizar|finalizar atendimento|quero fechar|vou pagar|pix|cartao|cartao de credito|cartao de debito)\b/.test(normalizedText)) return { type: 'payment_interest' };
  if (/(^|\b)(datas|datas liberadas|ver datas|listar datas|horarios|agenda|disponibilidade)\b/.test(normalizedText)) return { type: 'list_dates' };
  if (/(^|\b)(endereco|localizacao|funcionamento|onde fica)\b/.test(normalizedText)) return { type: 'clinic_info' };
  if (/(^|\b)(exame|exames|endoscopia|colonoscopia)\b/.test(normalizedText)) return { type: 'exam_pre_schedule' };
  if (/(^|\b)(agendar cirurgia|agendar cirurgias|marcar cirurgia|marcar cirurgias)\b/.test(normalizedText)) return { type: 'surgery_pre_schedule' };
  if (/(^|\b)(cirurgia|cirurgias|orcamento de cirurgia|orcamentos de cirurgias)\b/.test(normalizedText)) return { type: 'surgery_info' };
  if (/(^|\b)(valor|valores|preco|precos|quanto custa)\b/.test(normalizedText)) return { type: 'pricing_info' };

  const fields = parseStructuredWhatsAppFields(rawText);

  if (/^agendar\b/.test(normalizedText)) return { type: 'consult_pre_schedule', fields };
  if (/^remarcar\b/.test(normalizedText)) return { type: 'reschedule_appointment', fields };
  if (/^cancelar\b/.test(normalizedText)) return { type: 'cancel_appointment', fields };
  if (/^status\b/.test(normalizedText)) return { type: 'appointment_status', fields };
  if (/^pagar\b|^pagamento\b|^fechar\b/.test(normalizedText)) return { type: 'payment_interest', fields };

  return { type: 'help' };
}

function resolveMainMenuChoice(text) {
  const normalizedText = String(text || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/^(1|marcar consulta|marcar|consulta|agendar consulta|agendar)$/.test(normalizedText)) {
    return { type: 'consult_pre_schedule', fields: {} };
  }
  if (/^(2|agendar exame|agendar exames|exame|exames|endoscopia|colonoscopia)$/.test(normalizedText)) {
    return { type: 'exam_pre_schedule', fields: {} };
  }
  if (/^(3|valores|valor|precos|preco|ver valores|quanto custa)$/.test(normalizedText)) {
    return { type: 'pricing_info', fields: {} };
  }
  if (/^(4|cirurgia|cirurgias|orcamento|orcamentos|orcamento de cirurgia|orcamentos de cirurgias)$/.test(normalizedText)) {
    return { type: 'surgery_info', fields: {} };
  }
  if (/^(5|agendar cirurgia|agendar cirurgias|marcar cirurgia|marcar cirurgias)$/.test(normalizedText)) {
    return { type: 'surgery_pre_schedule', fields: {} };
  }
  if (/^(6|atendente|humano|falar com atendente|falar com pessoa)$/.test(normalizedText)) {
    return { type: 'human_handoff', fields: {} };
  }
  if (/^(pagar|pagamento|quero pagar|fechar|finalizar|quero fechar|pix|cartao)$/.test(normalizedText)) {
    return { type: 'payment_interest', fields: {} };
  }

  return null;
}

function formatInteractiveFallback(body, options = [], footer = '') {
  const optionLines = options
    .map((option, index) => {
      const label = typeof option === 'string' ? option : option?.label;
      return label ? `${index + 1}. ${label}` : '';
    })
    .filter(Boolean);

  const lines = [
    String(body || '').trim(),
    optionLines.length ? '' : '',
    ...optionLines,
    footer ? '' : '',
    footer,
  ];

  while (lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function sendTextFallback(to, body) {
  return sendWhatsAppTextMessage(to, body);
}

function sendButtonMessage(to, { body, buttons = [], footer = '' } = {}) {
  return sendTextFallback(to, formatInteractiveFallback(body, buttons, footer));
}

function sendListMessage(to, { body, sections = [], footer = '' } = {}) {
  const options = sections.flatMap((section) => section?.rows || section?.options || []);
  return sendTextFallback(to, formatInteractiveFallback(body, options, footer));
}

function sendMenuMessage(to, { body, options = [], footer = '' } = {}) {
  return sendListMessage(to, { body, sections: [{ rows: options }], footer });
}

function buildAvailableDatesMessage() {
  const schedule = getSchedule();
  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const dates = getDatesWithFreeSlots(schedule).slice(0, 12);
  if (dates.length === 0) {
    return '📅 No momento, não há datas liberadas.\n\nDigite *MENU* para visualizar as opções disponíveis.';
  }

  return [
    '📅 *Datas liberadas*',
    '',
    ...dates.map((date, index) => `${index + 1}. ${date} - ${freeTimeSlotsByDate[date].join(', ')}`),
    '',
    'Para agendar, envie *AGENDAR* e eu vou conduzir você passo a passo.',
    '',
    'Se preferir, envie as informações completas em linhas separadas.',
  ].join('\n');
}

function buildWhatsAppHelpMessage() {
  return [
    '📋 *Comandos disponíveis*',
    '',
    '1️⃣ *DATAS*',
    '2️⃣ *AGENDAR* para fluxo guiado',
    '3️⃣ *STATUS* + CPF e DATA',
    '4️⃣ *CANCELAR* + CPF e DATA',
    '',
    'Exemplo:',
    '',
    '*AGENDAR*',
  ].join('\n');
}

function isTemporaryQrDeliveryMode() {
  return WHATSAPP_DELIVERY_MODE === 'temporary_qr';
}

function shouldDeliverWhatsAppSource(source) {
  if (source === 'meta') return true;
  return source === 'temporary_qr' && isTemporaryQrDeliveryMode();
}

function sendWhatsAppTextMessage(to, body) {
  if (isGroupConversationId(to)) {
    const error = new Error('Envio para grupos bloqueado. O bot responde apenas conversas privadas.');
    error.statusCode = 400;
    throw error;
  }

  if (isTemporaryQrDeliveryMode()) {
    if (!temporaryWhatsAppQrBot) {
      const error = new Error('Bot temporario por QR code nao iniciado.');
      error.statusCode = 503;
      throw error;
    }
    return temporaryWhatsAppQrBot.sendText(to, body);
  }

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    const error = new Error('WhatsApp Cloud API não configurada.');
    error.statusCode = 503;
    throw error;
  }

  return fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhoneNumber(to),
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Falha ao enviar mensagem pelo WhatsApp.');
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function sendWhatsAppTemplateMessage(to, templateName, bodyParameters = [], languageCode = 'pt_BR') {
  if (isTemporaryQrDeliveryMode()) {
    const body = [
      `Template temporario: ${templateName || 'mensagem'}`,
      ...bodyParameters.map((value) => String(value || '').trim()).filter(Boolean),
    ].join('\n');
    return sendWhatsAppTextMessage(to, body);
  }

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    const error = new Error('WhatsApp Cloud API nao configurada.');
    error.statusCode = 503;
    throw error;
  }

  const parameters = bodyParameters
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => ({ type: 'text', text: value }));

  return fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhoneNumber(to),
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: parameters.length
          ? [
            {
              type: 'body',
              parameters,
            },
          ]
          : [],
      },
    }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'Falha ao enviar template pelo WhatsApp.');
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function reserveInboundMetaMessage(metaMessageId, phoneNumber, messageText, payload = {}) {
  const normalizedId = String(metaMessageId || '').trim();
  if (!normalizedId) return true;

  const result = db.prepare(`
    INSERT OR IGNORE INTO whatsapp_inbound_dedup (
      meta_message_id, phone_number, message_text, payload_json, first_seen_at, processed_at, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedId,
    normalizePhoneNumber(phoneNumber),
    String(messageText || ''),
    JSON.stringify(payload || {}),
    nowIso(),
    '',
    'received'
  );

  return Boolean(result.changes);
}

function completeInboundMetaMessage(metaMessageId, processingStatus) {
  const normalizedId = String(metaMessageId || '').trim();
  if (!normalizedId) return;

  db.prepare(`
    UPDATE whatsapp_inbound_dedup
    SET processed_at = ?, processing_status = ?
    WHERE meta_message_id = ?
  `).run(nowIso(), String(processingStatus || 'processed'), normalizedId);
}

function updateWhatsAppEventsStatusByMetaMessageId(metaMessageId, status, details = {}) {
  const normalizedId = String(metaMessageId || '').trim();
  if (!normalizedId) return;

  const rows = db.prepare(`
    SELECT id, details_json
    FROM whatsapp_events
    WHERE meta_message_id = ?
  `).all(normalizedId);

  const updateStatement = db.prepare(`
    UPDATE whatsapp_events
    SET status = ?, details_json = ?
    WHERE id = ?
  `);

  rows.forEach((row) => {
    updateStatement.run(
      String(status || ''),
      JSON.stringify({ ...parseJson(row.details_json, {}), ...(details || {}) }),
      row.id
    );
  });
}

function buildDoctorAppointmentSummary(appointment) {
  return [
    'Novo agendamento recebido',
    `Paciente: ${appointment.fullName}`,
    `Data: ${appointment.date}`,
    `Hora: ${appointment.time || 'A definir'}`,
    `Procedimento: ${appointment.procedureName || 'Consulta'}`,
    `CPF: ${maskCpf(appointment.cpf) || 'Nao informado'}`,
    'Origem: WhatsApp',
  ].join('\n');
}

function buildProfessionalDatesMessage() {
  const schedule = getSchedule();
  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const dates = getDatesWithFreeSlots(schedule).slice(0, 12);
  if (dates.length === 0) {
    return [
      '📅 *Agenda WR Gastro*',
      '',
      'No momento, não há horários liberados para agendamento pelo WhatsApp.',
      '',
      'Se preferir, digite *ATENDENTE* para falar com nossa equipe.',
    ].join('\n');
  }

  return [
    '📅 *Datas disponíveis*',
    '',
    'Estas são as próximas datas com horários liberados:',
    '',
    ...dates.map((date, index) => `${index + 1}. ${date} - ${freeTimeSlotsByDate[date].join(', ')}`),
    '',
    '👇 O que deseja fazer agora?',
    '',
    '1️⃣ Agendar consulta',
    '2️⃣ Agendar exame',
    '3️⃣ Remarcar',
    '4️⃣ Voltar ao menu',
  ].join('\n');
}

function buildProfessionalHelpMessage() {
  return [
    '👨‍⚕️ *WR Gastro*',
    '',
    'Olá! Seja muito bem-vindo(a). 😊',
    '',
    'Será um prazer ajudar você.',
    '',
    '📋 *Como podemos ajudar hoje?*',
    '',
    '1️⃣ Marcar consulta',
    '',
    '2️⃣ Agendar exames',
    '',
    '3️⃣ Ver valores de consultas e exames',
    '',
    '4️⃣ Solicitar orçamento cirúrgico',
    '',
    '5️⃣ Agendar cirurgia',
    '',
    '6️⃣ Falar com atendente',
    '',
    '✍️ Digite apenas o número da opção desejada.',
  ].join('\n');
}

function buildPricingInfoMessage() {
  return [
    '💰 *Valores atualmente praticados*',
    '',
    '👨‍⚕️ Consulta Gastroenterológica',
    '',
    'R$ 450,00',
    '',
    '🔬 Endoscopia',
    '',
    'R$ 550,00',
    '',
    '🩺 Colonoscopia',
    '',
    'R$ 1.000,00',
    '',
    '━━━━━━━━━━━━━━━',
    '',
    '💳 *Formas de pagamento*',
    '',
    '• Pix',
    '• Dinheiro',
    '• Cartão de Débito',
    '• Cartão de Crédito',
    '',
    '━━━━━━━━━━━━━━━',
    '',
    '📄 *Convênios aceitos*',
    '',
    '• Aura Saúde',
    '• Geap',
    '• Fusex',
    '• Humana (somente exames)',
    '',
    '━━━━━━━━━━━━━━━',
    '',
    '👇 O que deseja fazer agora?',
    '',
    '1️⃣ Agendar consulta',
    '',
    '2️⃣ Agendar exame',
    '',
    '3️⃣ Falar com atendente',
  ].join('\n');
}

function buildSurgeryInfoMessage() {
  return [
    '🩺 *Orçamento Cirúrgico*',
    '',
    'A WR Gastro realiza diversos procedimentos cirúrgicos e gastroenterológicos.',
    '',
    'Como cada caso possui características específicas, os valores e orientações podem variar.',
    '',
    '📋 Para receber um orçamento personalizado, vamos realizar uma avaliação inicial.',
    '',
    'Escolha uma opção:',
    '',
    '1️⃣ Solicitar orçamento',
    '',
    '2️⃣ Falar com atendente',
  ].join('\n');
}

function buildClinicInfoMessage() {
  return [
    '📍 *WR Gastro*',
    '',
    '*Endereço:*',
    'Rua Urbano Santos, 1160',
    'Jucara',
    'Imperatriz - MA',
    '',
    '*Horário de atendimento:*',
    'Segunda a Sexta: 07:00 às 18:00',
    'Sábado: 07:00 às 12:00',
    'Domingo: Fechado',
    '',
    'Para falar com nossa equipe, responda *5*.',
  ].join('\n');
}

function buildConsultPreScheduleStartMessage() {
  return [
    '🏥 *Agendamento de Consulta*',
    '',
    'Vou coletar algumas informações para realizar seu pré-agendamento.',
    '',
    'ℹ️ A consulta não será confirmada automaticamente.',
    '',
    'Nossa equipe verificará a disponibilidade e retornará por aqui para confirmação.',
    '',
    '👤 Informe o nome completo do paciente.',
  ].join('\n');
}

function buildExamPreScheduleStartMessage() {
  return [
    '🔬 *Agendamento de Exames*',
    '',
    'Vou coletar algumas informações para realizar seu pré-agendamento.',
    '',
    'ℹ️ O exame não será confirmado automaticamente.',
    '',
    'Nossa equipe verificará a disponibilidade e retornará para confirmação.',
    '',
    '👤 Informe o nome completo do paciente.',
  ].join('\n');
}

function buildSurgeryQuoteStartMessage() {
  return [
    '👤 Informe o nome completo do paciente.',
  ].join('\n');
}

function buildSurgeryScheduleStartMessage() {
  return [
    '*Agendar cirurgia*',
    '',
    'Vou coletar seus dados para pre-agendamento da sua cirurgia.',
    'A cirurgia não será confirmado automaticamente. A equipe da WR Gastro ira validar a disponibilidade e retornar por aqui.',
    '',
    'Para começar, envie o nome completo do paciente.',
  ].join('\n');
}

function buildProfessionalGuidedStartMessage() {
  const schedule = getSchedule();
  const dates = getDatesWithFreeSlots(schedule);
  if (!dates.length) {
    return [
      '📅 No momento, não há horários liberados para agendamento.',
      '',
      'Se preferir, digite *ATENDENTE* para falar com nossa equipe.',
    ].join('\n');
  }

  return [
    '🏥 *Agendamento WR Gastro*',
    '',
    'Vou conduzir seu agendamento em poucos passos.',
    '',
    '👤 Para começar, envie o nome completo do paciente.',
    '',
    '📅 *Datas com vaga no momento:*',
    buildFreeDatesListText(schedule),
  ].join('\n');
}

function buildProfessionalGuidedSummary(draft) {
  const isExam = draft.flowType === 'exam_appointment';
  return [
    isExam ? '🔬 *Confira os dados do exame:*' : '🏥 *Confira os dados do atendimento:*',
    '',
    `👤 *Paciente:* ${draft.fullName}`,
    `📄 *CPF:* ${formatCpf(draft.cpf)}`,
    `📍 *Endereço:* ${draft.address}`,
    `📅 *Data:* ${draft.date}`,
    `🕒 *Horário:* ${draft.time}`,
    `${isExam ? '🔬 *Exame:*' : '🩺 *Procedimento:*'} ${draft.procedureName || 'Não informado'}`,
    `📝 *Observações:* ${draft.notes || 'Nenhuma'}`,
    '',
    'Deseja confirmar?',
    '',
    '1️⃣ Confirmar',
    '2️⃣ Corrigir',
    '3️⃣ Cancelar',
  ].join('\n');
}

function buildRescheduleStartMessage() {
  return [
    '📅 *Remarcação de atendimento*',
    '',
    'Vamos localizar seu agendamento com segurança.',
    '',
    '📄 Primeiro, envie o CPF com 11 dígitos do agendamento que deseja alterar.',
  ].join('\n');
}

function isSessionExpired(session) {
  return getMinutesSince(session?.updatedAt) >= WHATSAPP_SESSION_EXPIRE_HOURS * 60;
}

function buildDoctorRescheduleSummary(appointment, previousDate, previousTime) {
  return [
    'Agendamento remarcado',
    `Paciente: ${appointment.fullName}`,
    `De: ${previousDate}${previousTime ? ` as ${previousTime}` : ''}`,
    `Para: ${appointment.date}${appointment.time ? ` as ${appointment.time}` : ''}`,
    `Procedimento: ${appointment.procedureName || 'Consulta'}`,
    `CPF: ${maskCpf(appointment.cpf) || 'Nao informado'}`,
    'Origem: WhatsApp',
  ].join('\n');
}

function buildResponsibleLeadSummary(sender, lead = {}) {
  const responsible = getWhatsAppResponsibleConfig();
  const reason = lead.reason || lead.type || 'Atendimento solicitado';
  const typeLabel = lead.typeLabel || 'Atendimento pelo WhatsApp';
  const patientName = lead.fullName || sender.profileName || 'Paciente sem nome informado';
  const contactPhone = normalizePhoneNumber(lead.phone || lead.contactPhone || sender.phoneNumber);
  const requestedService = lead.examName || lead.procedureName || lead.typeLabel || 'Atendimento';
  const preferredDate = lead.preferredDate || 'Nao informada';
  const preferredTime = lead.preferredTime || 'Nao informado';
  const notes = lead.notes || 'Nenhuma';
  const lastMessage = lead.lastMessage || lead.messageText || 'Nao informada';

  return [
    'Novo atendimento aguardando equipe - WR Gastro',
    '',
    `Motivo: ${reason}`,
    `Tipo: ${typeLabel}`,
    `Nome: ${patientName}`,
    `CPF: ${maskCpf(lead.cpf) || 'Nao informado'}`,
    `Telefone: ${contactPhone || 'Nao informado'}`,
    `Procedimento/Exame: ${requestedService}`,
    `Data desejada: ${preferredDate}`,
    `Horario desejado: ${preferredTime}`,
    `Observacoes: ${notes}`,
    `Ultima mensagem do paciente: ${lastMessage}`,
    '',
    `Responsavel: ${responsible.name || 'Responsavel configurado'}`,
  ].join('\n');
}

function buildResponsibleAppointmentSummary(appointment) {
  const responsible = getWhatsAppResponsibleConfig();
  return [
    'Novo agendamento confirmado pelo WhatsApp',
    '',
    `Responsavel: ${responsible.name || 'Responsavel configurado'}`,
    `Paciente: ${appointment.fullName}`,
    `WhatsApp: ${appointment.contactPhone || 'Nao informado'}`,
    `Data: ${appointment.date}`,
    `Horario: ${appointment.time || 'A definir'}`,
    `Procedimento: ${appointment.procedureName || 'Nao informado'}`,
    `CPF: ${maskCpf(appointment.cpf) || 'Nao informado'}`,
    `Observacoes: ${appointment.notes || 'Nenhuma'}`,
    '',
    'O horario ja foi bloqueado na agenda do dashboard.',
  ].join('\n');
}

async function notifyResponsibleAboutLead(sender, lead = {}) {
  const responsiblePhone = getWhatsAppResponsibleConfig().phone;
  if (!responsiblePhone) {
    return { sent: false, skipped: true, reason: 'responsible_not_configured' };
  }

  const summaryText = buildResponsibleLeadSummary(sender, lead);
  const notificationKey = `lead_handoff:${lead.leadId || sender.phoneNumber}:${lead.type || 'human_handoff'}`;
  if (!reserveAutomationEvent(notificationKey, 'lead_handoff', responsiblePhone, '', {
    leadId: lead.leadId || '',
    patientPhone: sender.phoneNumber,
    type: lead.type || 'human_handoff',
  })) {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }

  try {
    const payload = await sendWhatsAppTextMessage(responsiblePhone, summaryText);
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: responsiblePhone,
      profileName: '',
      messageType: 'text',
      messageText: summaryText,
      status: 'sent',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: {
        source: 'responsible_lead_notification',
        leadId: lead.leadId || '',
        patientPhone: sender.phoneNumber,
        leadType: lead.type || 'human_handoff',
      },
    });
    return { sent: true, payload };
  } catch (error) {
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: responsiblePhone,
      profileName: '',
      messageType: 'text',
      messageText: summaryText,
      status: 'failed',
      details: {
        source: 'responsible_lead_notification',
        leadId: lead.leadId || '',
        patientPhone: sender.phoneNumber,
        leadType: lead.type || 'human_handoff',
        error: error.message || 'Falha ao notificar responsavel.',
        payload: error.payload || null,
      },
    });
    return { sent: false, skipped: false, reason: 'send_failed', error };
  }
}

function getSettingJson(key, fallback = {}) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return parseJson(row?.value, fallback);
}

function saveSettingJson(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value || {}), nowIso());
}

async function notifyResponsibleAboutAppointment(appointment) {
  const responsiblePhone = getWhatsAppResponsibleConfig().phone;
  if (!responsiblePhone || !appointment) {
    return { sent: false, skipped: true, reason: 'responsible_not_configured' };
  }

  const summaryText = buildResponsibleAppointmentSummary(appointment);
  const notificationKey = `responsible_appointment:${appointment.id}`;
  if (!reserveAutomationEvent(notificationKey, 'responsible_appointment', responsiblePhone, appointment.id, {
    appointmentId: appointment.id || '',
    patientPhone: appointment.contactPhone || '',
  })) {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }

  try {
    const payload = await sendWhatsAppTextMessage(responsiblePhone, summaryText);
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: responsiblePhone,
      profileName: '',
      messageType: 'text',
      messageText: summaryText,
      status: 'sent',
      appointmentId: appointment.id || '',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: {
        source: 'responsible_appointment_notification',
        patientPhone: appointment.contactPhone || '',
      },
    });
    return { sent: true, payload };
  } catch (error) {
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: responsiblePhone,
      profileName: '',
      messageType: 'text',
      messageText: summaryText,
      status: 'failed',
      appointmentId: appointment.id || '',
      details: {
        source: 'responsible_appointment_notification',
        patientPhone: appointment.contactPhone || '',
        error: error.message || 'Falha ao notificar responsavel sobre o agendamento.',
        payload: error.payload || null,
      },
    });
    return { sent: false, skipped: false, reason: 'send_failed', error };
  }
}

async function notifyDoctorAboutAppointment(appointment) {
  const doctorPhone = normalizePhoneNumber(WHATSAPP_DOCTOR_PHONE);
  if (!doctorPhone || !appointment) {
    return { sent: false, skipped: true, reason: 'doctor_not_configured' };
  }

  const summaryText = buildDoctorAppointmentSummary(appointment);
  const templateParameters = [
    appointment.fullName,
    appointment.date,
    appointment.time || 'A definir',
    appointment.procedureName || 'Consulta',
    maskCpf(appointment.cpf) || 'Nao informado',
    'WhatsApp',
  ];

  try {
    let payload;
    let channel = 'template';

    if (isTemporaryQrDeliveryMode()) {
      channel = 'text_fallback';
      payload = await sendWhatsAppTextMessage(doctorPhone, summaryText);
    } else if (WHATSAPP_DOCTOR_TEMPLATE_NAME) {
      payload = await sendWhatsAppTemplateMessage(
        doctorPhone,
        WHATSAPP_DOCTOR_TEMPLATE_NAME,
        templateParameters,
        WHATSAPP_DOCTOR_TEMPLATE_LANGUAGE
      );
    } else if (WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED) {
      channel = 'text_fallback';
      payload = await sendWhatsAppTextMessage(doctorPhone, summaryText);
    } else {
      return { sent: false, skipped: true, reason: 'template_not_configured' };
    }

    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: doctorPhone,
      messageType: channel === 'template' ? 'template' : 'text',
      messageText: summaryText,
      status: 'sent',
      appointmentId: appointment.id || '',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: {
        source: 'doctor_notification',
        notificationChannel: channel,
        templateName: WHATSAPP_DOCTOR_TEMPLATE_NAME || '',
      },
    });

    return { sent: true, channel, payload };
  } catch (error) {
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: doctorPhone,
      messageType: WHATSAPP_DOCTOR_TEMPLATE_NAME ? 'template' : 'text',
      messageText: summaryText,
      status: 'failed',
      appointmentId: appointment.id || '',
      details: {
        source: 'doctor_notification',
        templateName: WHATSAPP_DOCTOR_TEMPLATE_NAME || '',
        error: error.message || 'Falha ao notificar o medico.',
        payload: error.payload || null,
      },
    });

    return { sent: false, skipped: false, reason: 'send_failed', error };
  }
}

async function notifyDoctorAboutReschedule(appointment, previousDate, previousTime) {
  const doctorPhone = normalizePhoneNumber(WHATSAPP_DOCTOR_PHONE);
  if (!doctorPhone || !appointment) {
    return { sent: false, skipped: true, reason: 'doctor_not_configured' };
  }

  const body = buildDoctorRescheduleSummary(appointment, previousDate, previousTime);

  if (!WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED && !isTemporaryQrDeliveryMode()) {
    return { sent: false, skipped: true, reason: 'text_fallback_disabled' };
  }

  try {
    const payload = await sendWhatsAppTextMessage(doctorPhone, body);
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: doctorPhone,
      messageType: 'text',
      messageText: body,
      status: 'sent',
      appointmentId: appointment.id || '',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: {
        source: 'doctor_reschedule_notification',
      },
    });
    return { sent: true, channel: 'text_fallback', payload };
  } catch (error) {
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: doctorPhone,
      messageType: 'text',
      messageText: body,
      status: 'failed',
      appointmentId: appointment.id || '',
      details: {
        source: 'doctor_reschedule_notification',
        error: error.message || 'Falha ao notificar o medico sobre a remarcacao.',
        payload: error.payload || null,
      },
    });
    return { sent: false, skipped: false, reason: 'send_failed', error };
  }
}

function resolveCommandField(fields, aliases) {
  for (const alias of aliases) {
    const value = fields[normalizeCommandKey(alias)];
    if (value) return value;
  }
  return '';
}

function reserveAutomationEvent(notificationKey, eventType, phoneNumber, appointmentId = '', payload = {}) {
  const key = String(notificationKey || '').trim();
  if (!key) return true;

  const result = db.prepare(`
    INSERT OR IGNORE INTO whatsapp_automation_events (
      notification_key, phone_number, event_type, appointment_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    key,
    normalizePhoneNumber(phoneNumber),
    String(eventType || ''),
    appointmentId || '',
    JSON.stringify(payload || {}),
    nowIso()
  );

  return Boolean(result.changes);
}

function buildPatientReminderText(appointment, reminderLabel) {
  return [
    'Equipe Willian Holanda',
    '',
    `Lembrete do seu atendimento ${reminderLabel}.`,
    `Paciente: ${appointment.fullName}`,
    `Data: ${appointment.date}`,
    `Horario: ${appointment.time || 'A definir'}`,
    `Procedimento: ${appointment.procedureName || 'Consulta'}`,
    '',
    'Se precisar remarcar, responda REMARCAR.',
  ].join('\n');
}

function buildHumanHandoffMessage() {
  return [
    '🤝 Perfeito!',
    '',
    'Vou encaminhar seu atendimento para nossa equipe.',
    '',
    '📲 Em breve um de nossos atendentes continuará seu atendimento por aqui.',
    '',
    'Agradecemos pela sua paciência. 💙',
  ].join('\n');
}

function buildPaymentTransferMessage() {
  return [
    '✅ Perfeito!',
    '',
    'Vou encaminhar seu atendimento para nossa equipe financeira.',
    '',
    '📲 Em breve você receberá as orientações para pagamento e finalização.',
  ].join('\n');
}

function buildNoReplyOutcome(action, details = {}) {
  return {
    replyText: '',
    action,
    noReply: true,
    details,
  };
}

function shouldSendHumanTransferMessage(session) {
  const draft = session?.draft || {};
  const status = String(draft.conversationStatus || '').trim();
  const silentStatuses = ['assigned_to_agent', 'waiting_human', 'transferred_to_human', 'paused_bot'];

  if (silentStatuses.includes(status)) return false;
  if (draft.humanTransferMessageSent) return false;
  if (draft.assignedAgentId) return false;
  if (session?.step === 'human_handoff') return false;

  return true;
}

function markHumanTransferSession(phoneNumber, draft = {}, extra = {}) {
  return saveWhatsAppSession(phoneNumber, 'human_handoff', {
    ...(draft || {}),
    ...(extra || {}),
    conversationStatus: extra.conversationStatus || draft.conversationStatus || 'waiting_human',
    humanTransferMessageSent: true,
    humanTransferSentAt: draft.humanTransferSentAt || nowIso(),
    botPaused: true,
  });
}

function transferToHuman(sender, reason, summary = {}, existingSession = null) {
  const existingDraft = existingSession?.draft || {};
  const type = reason === 'payment_requested' ? 'payment_interest' : 'human_handoff';

  if (!shouldSendHumanTransferMessage(existingSession)) {
    return buildNoReplyOutcome('human_handoff_silent', {
      reason: 'human_transfer_already_active',
      conversationStatus: existingDraft.conversationStatus || '',
    });
  }

  const transferDraft = markHumanTransferSession(sender.phoneNumber, existingDraft, {
    source: sender.source || existingDraft.source || 'meta',
    intent: type,
    transferReason: reason,
    lead: summary,
  })?.draft || {};

  if (type === 'payment_interest') {
    return {
      replyText: buildPaymentTransferMessage(),
      action: 'payment_interest',
      lead: {
        ...(summary || {}),
        type: 'payment_interest',
        typeLabel: 'Cliente quer pagar ou fechar atendimento',
        reason,
        contactPhone: sender.phoneNumber,
        notes: summary.notes || 'Cliente demonstrou interesse em pagar ou fechar atendimento.',
      },
      details: { conversationStatus: transferDraft.conversationStatus || 'waiting_human' },
    };
  }

  return {
    replyText: buildHumanHandoffMessage(),
    action: 'human_handoff',
    lead: {
      ...(summary || {}),
      type: 'human_handoff',
      typeLabel: summary.typeLabel || 'Cliente quer falar com atendente',
      reason,
      contactPhone: sender.phoneNumber,
      notes: summary.notes || 'Cliente pediu para falar com atendente.',
    },
    details: { conversationStatus: transferDraft.conversationStatus || 'waiting_human' },
  };
}

function buildHumanTransferOutcome(command, sender, existingSession = null) {
  const reason = command.type === 'payment_interest' ? 'payment_requested' : 'user_requested_attendant';
  return transferToHuman(sender, reason, {
    lastMessage: command.lastMessage || '',
  }, existingSession);
}

function buildSessionResumeMessage(session) {
  const stepLabels = {
    consult_full_name: 'nome completo',
    consult_phone: 'telefone',
    consult_insurance: 'convenio ou particular',
    consult_procedure: 'tipo de atendimento/procedimento',
    consult_preferred_date: 'melhor data',
    consult_preferred_time: 'melhor horario',
    consult_notes: 'observacoes',
    exam_full_name: 'nome completo',
    exam_phone: 'telefone',
    exam_name: 'exame desejado',
    exam_insurance: 'convenio ou particular',
    exam_preferred_date: 'melhor data',
    exam_preferred_time: 'melhor horario',
    exam_notes: 'observacoes',
    surgery_menu: 'escolha entre orcamento ou atendente',
    surgery_quote_full_name: 'nome completo',
    surgery_quote_phone: 'telefone',
    surgery_quote_procedure: 'procedimento desejado',
    surgery_quote_notes: 'observacoes',
    surgery_schedule_full_name: 'nome completo',
    surgery_schedule_phone: 'telefone',
    surgery_schedule_procedure: 'cirurgia desejada',
    surgery_schedule_insurance: 'convenio',
    surgery_schedule_notes: 'observacoes',
    name: 'nome completo',
    cpf: 'CPF',
    address: 'endereco completo',
    date: 'data do atendimento',
    time: 'horario do atendimento',
    procedure: 'procedimento',
    notes: 'observacoes',
    confirm: 'confirmacao final',
    reschedule_cpf: 'CPF do agendamento',
    reschedule_current_date: 'data atual do agendamento',
    reschedule_new_date: 'nova data',
    reschedule_new_time: 'novo horario',
    reschedule_confirm: 'confirmacao da remarcacao',
  };

  return [
    '📋 *Vamos continuar seu atendimento*',
    '',
    `Falta apenas: *${stepLabels[session?.step] || 'concluir o atendimento'}*.`,
    '',
    'Pode continuar respondendo por aqui.',
  ].join('\n');
}

function getSessionNudgeCount(session) {
  const baseKey = `session_nudge:${session.phoneNumber}:${session.updatedAt}`;
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM whatsapp_automation_events
    WHERE phone_number = ?
      AND event_type = 'session_nudge'
      AND (notification_key = ? OR notification_key LIKE ?)
  `).get(normalizePhoneNumber(session.phoneNumber), baseKey, `${baseKey}:%`);

  return row?.total || 0;
}

function buildSessionNudgeMessage(session, nudgeNumber) {
  const remaining = Math.max(WHATSAPP_SESSION_MAX_NUDGES - nudgeNumber, 0);
  const stepLabel = buildSessionResumeMessage(session)
    .split('Falta apenas: ')[1]
    ?.split('.')[0] || 'concluir o atendimento';

  if (remaining <= 0) {
    return [
      '⏳ Como não tivemos retorno, vou encerrar este atendimento por enquanto.',
      '',
      'Nenhum horário foi reservado.',
      '',
      'Quando quiser recomeçar, envie *OI* ou *MENU*.',
    ].join('\n');
  }

  return [
    'Oi, você ainda está por aí?',
    '',
    `Seu atendimento está parado na etapa: *${stepLabel}*.`,
    '',
    'Pode continuar respondendo por aqui.',
    `Depois de mais ${remaining} aviso(s), encerrarei esse atendimento automaticamente.`,
  ].join('\n');
}

function normalizeOptionalNote(value) {
  const normalized = normalizeCommandKey(value);
  return normalized === 'pular' || normalized === 'nao' || normalized === 'nenhuma' ? '' : String(value || '').trim();
}

function buildWhatsAppLeadProcedureName(lead = {}) {
  if (lead.examName) return `Exame: ${lead.examName}`;
  if (lead.type === 'surgery_pre_schedule' && lead.procedureName) return `Cirurgia: ${lead.procedureName}`;
  if (lead.procedureName) return `Procedimento: ${lead.procedureName}`;
  if (lead.type === 'surgery_pre_schedule') return 'Pré-agendamento de cirurgia';
  if (lead.type === 'surgery_quote') return 'Orçamento de cirurgia';
  if (lead.type === 'exam_pre_schedule') return 'Pré-agendamento de exame';
  if (lead.type === 'consult_pre_schedule') return 'Pré-agendamento de consulta';
  return lead.typeLabel || 'Atendimento via WhatsApp';
}

function buildWhatsAppLeadNotes(lead = {}) {
  return [
    lead.typeLabel ? `Tipo: ${lead.typeLabel}` : '',
    lead.phone ? `Telefone informado: ${lead.phone}` : '',
    lead.insurance ? `Convênio/particular: ${lead.insurance}` : '',
    lead.preferredDate ? `Data desejada: ${lead.preferredDate}` : '',
    lead.preferredTime ? `Horário desejado: ${lead.preferredTime}` : '',
    lead.examName ? `Exame: ${lead.examName}` : '',
    lead.procedureName ? `Procedimento: ${lead.procedureName}` : '',
    lead.notes ? `Observações: ${lead.notes}` : '',
  ].filter(Boolean).join('\n');
}

function createWhatsAppLeadPanelRecord(sender, leadId, lead = {}) {
  if (!leadId) return null;
  const existing = getAppointmentById(leadId);
  if (existing) return existing;

  const fullName = String(lead.fullName || sender.profileName || 'Paciente WhatsApp').trim();
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO appointments (
      id, full_name, address, cpf, appointment_date, appointment_time, status, procedure_name, notes, created_at, updated_at, created_by_user_id, source, contact_phone, archived_at, archive_file_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId,
    fullName,
    String(lead.address || 'Não informado').trim() || 'Não informado',
    normalizeCpf(lead.cpf).length === 11 ? formatCpf(lead.cpf) : '',
    '',
    '',
    'pendente',
    buildWhatsAppLeadProcedureName(lead),
    buildWhatsAppLeadNotes(lead),
    createdAt,
    createdAt,
    null,
    'whatsapp',
    normalizePhoneNumber(lead.phone || sender.phoneNumber),
    '',
    ''
  );

  writeAuditLog(
    { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
    'create_whatsapp_lead_panel_record',
    'appointment',
    leadId,
    { phoneNumber: sender.phoneNumber, leadType: lead.type || '' }
  );

  return getAppointmentById(leadId);
}

function recordWhatsAppLead(sender, lead) {
  const leadId = `whatsapp-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const details = {
    leadId,
    source: 'whatsapp',
    lead,
  };

  logWhatsAppEvent({
    direction: 'internal',
    phoneNumber: sender.phoneNumber,
    profileName: sender.profileName,
    messageType: 'lead',
    messageText: `${lead.typeLabel || 'Atendimento'} - ${lead.fullName || 'Paciente sem nome'}`,
    status: 'pending_human_confirmation',
    details,
  });

  writeAuditLog(
    { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
    lead.type || 'whatsapp_lead',
    'whatsapp_lead',
    leadId,
    details
  );

  createWhatsAppLeadPanelRecord(sender, leadId, lead);

  return leadId;
}

function buildPreScheduleCompleteMessage() {
  return [
    '✅ *Pré-agendamento recebido com sucesso!*',
    '',
    'Nossa equipe verificará a disponibilidade do exame solicitado.',
    '',
    '📲 Em breve entraremos em contato por aqui para confirmação e orientações.',
  ].join('\n');
}

function buildConsultPreScheduleCompleteMessage() {
  return [
    '✅ *Pré-agendamento realizado com sucesso!*',
    '',
    'Recebemos suas informações.',
    '',
    'Nossa equipe irá analisar a disponibilidade e retornará em breve para confirmação.',
    '',
    '💙 Agradecemos pela preferência.',
  ].join('\n');
}

function buildSurgeryQuoteCompleteMessage() {
  return [
    '✅ *Solicitação recebida com sucesso!*',
    '',
    'Nossa equipe avaliará as informações enviadas.',
    '',
    '📲 Em breve retornaremos por aqui com mais orientações.',
  ].join('\n');
}

function buildSurgeryScheduleCompleteMessage() {
  return [
    'Suas informações foram recebidas com sucesso.',
    '',
    'A equipe da WR Gastro ira verificar a disponibilidade e retornara por aqui para confirmação e orientações.',
    '',
    'Certo.',
    '',
    'Vou encaminhar seu atendimento para a equipe da WR Gastro.',
    'Em breve um de nossos atendentes continuara seu atendimento por aqui.',
  ].join('\n');
}

function isGuidedScheduleTrigger(text) {
  const normalizedText = String(text || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /^(agendar|marcar|quero agendar|agendamento)\b/.test(normalizedText);
}

function buildFreeDatesListText(schedule = getSchedule()) {
  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const dates = getDatesWithFreeSlots(schedule);
  if (dates.length === 0) {
    return '📅 No momento não há datas liberadas.';
  }

  return dates
    .slice(0, 12)
    .map((date, index) => `${index + 1}. ${date} (${freeTimeSlotsByDate[date].length} horário(s) livre(s))`)
    .join('\n');
}

function resolveDateSelection(input, schedule = getSchedule()) {
  const value = String(input || '').trim();
  if (!value) return '';

  const dates = getDatesWithFreeSlots(schedule);
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    return dates[index] || '';
  }

  return dates.includes(value) ? value : '';
}

function resolveTimeSelection(date, input, schedule = getSchedule()) {
  const value = String(input || '').trim();
  if (!date || !value) return '';

  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const times = freeTimeSlotsByDate[date] || [];

  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    return times[index] || '';
  }

  return times.includes(normalizeTime(value)) ? normalizeTime(value) : '';
}

function buildFreeTimesListText(date, schedule = getSchedule()) {
  const freeTimeSlotsByDate = getFreeTimeSlotsByDate(schedule);
  const times = freeTimeSlotsByDate[date] || [];
  if (times.length === 0) {
    return `📅 Não há horários livres para ${date}.`;
  }

  return [
    `🕒 *Horários livres em ${date}:*`,
    ...times.map((time, index) => `${index + 1}. ${time}`),
  ].join('\n');
}

function buildGuidedStartMessage() {
  const schedule = getSchedule();
  const dates = getDatesWithFreeSlots(schedule);
  if (dates.length === 0) {
    return [
      '📅 No momento, não há datas liberadas.',
      '',
      'Digite *MENU* para visualizar as opções disponíveis.',
    ].join('\n');
  }

  return [
    '🏥 *Agendamento pelo WhatsApp*',
    '',
    '👤 Primeiro, envie o nome completo do paciente.',
    '',
    '📅 *Datas com vaga no momento:*',
    buildFreeDatesListText(schedule),
  ].join('\n');
}

function buildGuidedSummary(draft) {
  return [
    '📋 *Confira os dados do agendamento:*',
    '',
    `👤 *Nome:* ${draft.fullName}`,
    `📄 *CPF:* ${formatCpf(draft.cpf)}`,
    `📍 *Endereço:* ${draft.address}`,
    `📅 *Data:* ${draft.date}`,
    `🕒 *Horário:* ${draft.time}`,
    `🩺 *Procedimento:* ${draft.procedureName || 'Não informado'}`,
    `📝 *Observações:* ${draft.notes || 'Nenhuma'}`,
    '',
    'Responda *CONFIRMAR* para concluir ou *CANCELAR FLUXO* para apagar esse atendimento.',
  ].join('\n');
}

function executeGuidedWhatsAppFlow(session, text, sender) {
  const message = String(text || '').trim();
  const normalizedMessage = normalizeCommandKey(message);
  const schedule = getSchedule();
  const datesWithFreeSlots = getDatesWithFreeSlots(schedule);

  if (!datesWithFreeSlots.length) {
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: '📅 No momento, não há datas liberadas. Digite *MENU* para visualizar as opções disponíveis.',
      action: 'guided_no_dates',
    };
  }

  if (normalizedMessage === 'cancelarfluxo') {
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: '✅ *Agendamento cancelado.*\n\nQuando quiser voltar, envie *MENU*.',
      action: 'guided_cancelled',
    };
  }

  const draft = { ...(session?.draft || {}) };

  if (session.step === 'name') {
    if (message.length < 5) {
      return { replyText: '👤 Informe o nome completo do paciente.', action: 'guided_retry_name' };
    }
    draft.fullName = message;
    saveWhatsAppSession(sender.phoneNumber, 'cpf', draft);
    return { replyText: '📄 Agora informe o CPF com 11 dígitos.', action: 'guided_collect_cpf' };
  }

  if (session.step === 'cpf') {
    const cpf = normalizeCpf(message);
    if (cpf.length !== 11) {
      return { replyText: '⚠️ Não consegui validar esse CPF. Envie os 11 dígitos, por favor.', action: 'guided_retry_cpf' };
    }
    draft.cpf = cpf;
    saveWhatsAppSession(sender.phoneNumber, 'address', draft);
    return { replyText: '📍 Perfeito. Agora envie o endereço completo.', action: 'guided_collect_address' };
  }

  if (session.step === 'address') {
    if (message.length < 6) {
      return { replyText: '📍 Envie um endereço mais completo para continuarmos.', action: 'guided_retry_address' };
    }
    draft.address = message;
    saveWhatsAppSession(sender.phoneNumber, 'date', draft);
    return {
      replyText: [
        '📅 Escolha a data do atendimento.',
        'Você pode responder com o número da lista ou com a data no formato *AAAA-MM-DD*.',
        '',
        buildFreeDatesListText(schedule),
      ].join('\n'),
      action: 'guided_collect_date',
    };
  }

  if (session.step === 'date') {
    const selectedDate = resolveDateSelection(message, schedule);
    if (!selectedDate) {
      return {
        replyText: [
          '⚠️ Não consegui identificar uma data livre.',
          'Responda com o número da lista ou com a data no formato *AAAA-MM-DD*.',
          '',
          buildFreeDatesListText(schedule),
        ].join('\n'),
        action: 'guided_retry_date',
      };
    }
    draft.date = selectedDate;
    saveWhatsAppSession(sender.phoneNumber, 'time', draft);
    return {
      replyText: [
        '🕒 Agora escolha o horário.',
        'Você pode responder com o número da lista ou com o horário no formato *HH:MM*.',
        '',
        buildFreeTimesListText(selectedDate, schedule),
      ].join('\n'),
      action: 'guided_collect_time',
    };
  }

  if (session.step === 'time') {
    const selectedTime = resolveTimeSelection(draft.date, message, schedule);
    if (!selectedTime) {
      return {
        replyText: [
          '⚠️ Esse horário não está livre.',
          'Escolha um dos horários abaixo:',
          '',
          buildFreeTimesListText(draft.date, schedule),
        ].join('\n'),
        action: 'guided_retry_time',
      };
    }
    draft.time = selectedTime;
    saveWhatsAppSession(sender.phoneNumber, 'procedure', draft);
    return {
      replyText: '🩺 Se quiser, envie o procedimento. Se preferir pular, responda *PULAR*.',
      action: 'guided_collect_procedure',
    };
  }

  if (session.step === 'procedure') {
    draft.procedureName = normalizedMessage === 'pular' ? '' : message;
    saveWhatsAppSession(sender.phoneNumber, 'notes', draft);
    return {
      replyText: '📝 Se quiser adicionar observações, envie agora. Se não, responda *PULAR*.',
      action: 'guided_collect_notes',
    };
  }

  if (session.step === 'notes') {
    draft.notes = normalizedMessage === 'pular' ? '' : message;
    saveWhatsAppSession(sender.phoneNumber, 'confirm', draft);
    return {
      replyText: buildProfessionalGuidedSummary(draft),
      action: 'guided_confirm',
    };
  }

  if (session.step === 'confirm') {
    if (normalizedMessage !== 'confirmar') {
      return {
        replyText: 'Para concluir, responda *CONFIRMAR*. Se quiser apagar esse fluxo, envie *CANCELAR FLUXO*.',
        action: 'guided_retry_confirm',
      };
    }

    const appointment = createAppointment(
      {
        fullName: draft.fullName,
        address: draft.address,
        cpf: draft.cpf,
        date: draft.date,
        time: draft.time,
        procedureName: draft.procedureName || '',
        notes: draft.notes || '',
        source: 'whatsapp',
        contactPhone: sender.phoneNumber,
      },
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );

    clearWhatsAppSession(sender.phoneNumber);
    writeAuditLog(
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
      'create_appointment_whatsapp_guided',
      'appointment',
      appointment.id,
      { phoneNumber: sender.phoneNumber }
    );

    return {
      replyText: `✅ *Agendamento confirmado!*\n\n👤 Paciente: ${appointment.fullName}\n📅 Data: ${appointment.date}\n🕒 Horário: ${appointment.time}`,
      action: 'guided_create_appointment',
      appointment,
    };
  }

  clearWhatsAppSession(sender.phoneNumber);
  return {
    replyText: buildProfessionalHelpMessage(),
    action: 'guided_reset',
  };
}

function executeWhatsAppCommand(command, sender) {
  if (command.type === 'help') {
    clearWhatsAppSession(sender.phoneNumber);
    return { replyText: buildProfessionalHelpMessage(), action: 'help' };
  }

  if (command.type === 'pricing_info') {
    saveWhatsAppSession(sender.phoneNumber, 'pricing_menu', {
      source: sender.source || 'meta',
      type: 'pricing_menu',
      typeLabel: 'Valores',
    });
    return { replyText: buildPricingInfoMessage(), action: 'pricing_info' };
  }

  if (command.type === 'payment_interest') {
    return buildHumanTransferOutcome(command, sender, getWhatsAppSession(sender.phoneNumber));
  }

  if (command.type === 'clinic_info') {
    clearWhatsAppSession(sender.phoneNumber);
    return { replyText: buildClinicInfoMessage(), action: 'clinic_info' };
  }

  if (command.type === 'list_dates') {
    clearWhatsAppSession(sender.phoneNumber);
    return { replyText: buildProfessionalDatesMessage(), action: 'list_dates' };
  }

  const cpf = resolveCommandField(command.fields || {}, ['cpf']);
  const date = resolveCommandField(command.fields || {}, ['data', 'date']);
  const time = resolveCommandField(command.fields || {}, ['hora', 'horario', 'time']);

  if (command.type === 'appointment_status') {
    const appointment = findAppointmentByCpfAndDate(cpf, date);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo com esse CPF e essa data.\n\nDigite *DATAS* para ver as opções disponíveis.',
        action: 'status_not_found',
      };
    }

    return {
      replyText: `📋 *Agendamento encontrado*\n\n👤 Paciente: ${appointment.fullName}\n📅 Data: ${appointment.date}${appointment.time ? `\n🕒 Horário: ${appointment.time}` : ''}\n\n*Status atual:* ${appointment.status}.`,
      action: 'status_found',
      appointment,
    };
  }

  if (command.type === 'cancel_appointment') {
    const appointment = findAppointmentByCpfAndDate(cpf, date);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo para cancelar com esse CPF e essa data.',
        action: 'cancel_not_found',
      };
    }

    const updated = updateAppointmentStatus(appointment.id, 'cancelado', {
      id: 'whatsapp-bot',
      displayName: 'WhatsApp',
      role: 'system',
    });
    return {
      replyText: `✅ *Cancelamento concluído.*\n\nO agendamento de ${updated.fullName} em ${updated.date}${updated.time ? ` às ${updated.time}` : ''} foi cancelado com sucesso.`,
      action: 'cancel_appointment',
      appointment: updated,
    };
  }

  if (command.type === 'create_appointment') {
    const fullName = resolveCommandField(command.fields || {}, ['nome', 'nomecompleto']);
    const address = resolveCommandField(command.fields || {}, ['endereco']);
    const procedureName = resolveCommandField(command.fields || {}, ['procedimento']);
    const notes = resolveCommandField(command.fields || {}, ['obs', 'observacoes', 'observacao']);

    if (!fullName || !address || !cpf || !date || !time) {
      saveWhatsAppSession(sender.phoneNumber, 'name', {});
      return {
        replyText: buildProfessionalGuidedStartMessage(),
        action: 'guided_start',
      };
    }

    const appointment = createAppointment(
      {
        fullName,
        address,
        cpf,
        date,
        time,
        procedureName,
        notes,
        source: 'whatsapp',
        contactPhone: sender.phoneNumber,
      },
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );

    writeAuditLog(
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
      'create_appointment_whatsapp',
      'appointment',
      appointment.id,
      { phoneNumber: sender.phoneNumber }
    );

    return {
      replyText: `✅ *Agendamento criado com sucesso!*\n\n👤 Paciente: ${appointment.fullName}\n📅 Data: ${appointment.date}\n🕒 Horário: ${appointment.time}\n\n*Status:* ${appointment.status}.`,
      action: 'create_appointment',
      appointment,
    };
  }

  return { replyText: buildProfessionalHelpMessage(), action: 'help' };
}

function executeEnhancedGuidedWhatsAppFlow(session, text, sender) {
  const message = String(text || '').trim();
  const normalizedMessage = normalizeCommandKey(message);
  const schedule = getSchedule();
  const datesWithFreeSlots = getDatesWithFreeSlots(schedule);
  const draft = { ...(session?.draft || {}) };

  if (['cancelarfluxo', 'cancelar', 'sair', 'encerrar'].includes(normalizedMessage)) {
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: '✅ *Atendimento cancelado com sucesso.*\n\nQuando quiser retomar, envie *MENU* para ver as opções disponíveis.',
      action: 'guided_cancelled',
    };
  }

  if (session.step === 'human_handoff') {
    return buildNoReplyOutcome('human_handoff_silent', {
      reason: 'waiting_human',
      conversationStatus: draft.conversationStatus || 'waiting_human',
    });
  }

  if (session.step === 'surgery_menu') {
    if (normalizedMessage === '1' || normalizedMessage.includes('orcamento')) {
      saveWhatsAppSession(sender.phoneNumber, 'surgery_quote_full_name', { source: draft.source || 'meta' });
      return { replyText: buildSurgeryQuoteStartMessage(), action: 'surgery_quote_start' };
    }
    if (normalizedMessage === '2' || normalizedMessage === '5' || normalizedMessage.includes('atendente')) {
      return transferToHuman(sender, 'user_requested_attendant', {
        typeLabel: 'Orcamento de cirurgia',
        procedureName: 'Orcamento de cirurgia',
        lastMessage: message,
      }, session);
    }
    if (normalizedMessage === '3' || normalizedMessage.includes('menu') || normalizedMessage.includes('voltar')) {
      clearWhatsAppSession(sender.phoneNumber);
      return { replyText: buildProfessionalHelpMessage(), action: 'help' };
    }
    return { replyText: buildSurgeryInfoMessage(), action: 'surgery_info_retry' };
  }

  if (session.step === 'pricing_menu') {
    if (normalizedMessage === '1' || normalizedMessage.includes('consulta')) {
      saveWhatsAppSession(sender.phoneNumber, 'consult_full_name', {
        source: draft.source || sender.source || 'meta',
        type: 'consult_pre_schedule',
        typeLabel: 'Pre-agendamento de consulta',
      });
      return { replyText: buildConsultPreScheduleStartMessage(), action: 'consult_pre_schedule_start' };
    }
    if (normalizedMessage === '2' || normalizedMessage.includes('exame')) {
      saveWhatsAppSession(sender.phoneNumber, 'exam_full_name', {
        source: draft.source || sender.source || 'meta',
        type: 'exam_pre_schedule',
        typeLabel: 'Pre-agendamento de exame',
      });
      return { replyText: buildExamPreScheduleStartMessage(), action: 'exam_pre_schedule_start' };
    }
    if (normalizedMessage === '6' || /(pagar|pagamento|fechar|finalizar|pix|cartao)/.test(normalizedMessage)) {
      return transferToHuman(sender, 'payment_requested', {
        typeLabel: 'Cliente quer pagar ou fechar atendimento',
        lastMessage: message,
      }, session);
    }
    if (normalizedMessage === '3' || normalizedMessage.includes('atendente')) {
      return transferToHuman(sender, 'user_requested_attendant', {
        typeLabel: 'Cliente quer falar com atendente',
        lastMessage: message,
      }, session);
    }
    if (normalizedMessage.includes('menu') || normalizedMessage.includes('voltar')) {
      clearWhatsAppSession(sender.phoneNumber);
      return { replyText: buildProfessionalHelpMessage(), action: 'help' };
    }
    return { replyText: buildPricingInfoMessage(), action: 'pricing_info_retry' };
  }

  if (session.step === 'dates_menu') {
    if (normalizedMessage === '1' || normalizedMessage.includes('consulta')) {
      saveWhatsAppSession(sender.phoneNumber, 'consult_full_name', {
        source: draft.source || sender.source || 'meta',
        type: 'consult_pre_schedule',
        typeLabel: 'Pre-agendamento de consulta',
      });
      return { replyText: buildConsultPreScheduleStartMessage(), action: 'consult_pre_schedule_start' };
    }
    if (normalizedMessage === '2' || normalizedMessage.includes('exame')) {
      saveWhatsAppSession(sender.phoneNumber, 'exam_full_name', {
        source: draft.source || sender.source || 'meta',
        type: 'exam_pre_schedule',
        typeLabel: 'Pre-agendamento de exame',
      });
      return { replyText: buildExamPreScheduleStartMessage(), action: 'exam_pre_schedule_start' };
    }
    if (normalizedMessage === '3' || normalizedMessage.includes('remarcar')) {
      saveWhatsAppSession(sender.phoneNumber, 'reschedule_cpf', { source: draft.source || sender.source || 'meta' });
      return { replyText: buildRescheduleStartMessage(), action: 'reschedule_start' };
    }
    if (normalizedMessage === '4' || normalizedMessage.includes('menu') || normalizedMessage.includes('voltar')) {
      clearWhatsAppSession(sender.phoneNumber);
      return { replyText: buildProfessionalHelpMessage(), action: 'help' };
    }
    return { replyText: buildProfessionalDatesMessage(), action: 'list_dates_retry' };
  }

  if (session.step === 'consult_full_name') {
    if (message.length < 5) {
      return { replyText: '👤 Qual o nome completo do paciente?', action: 'consult_retry_name' };
    }
    draft.type = 'consult_pre_schedule';
    draft.typeLabel = 'Pre-agendamento de consulta';
    draft.fullName = message;
    draft.contactPhone = sender.phoneNumber;
    saveWhatsAppSession(sender.phoneNumber, 'consult_phone', draft);
    return { replyText: '📞 Qual o melhor telefone para contato?', action: 'consult_collect_phone' };
  }

  if (session.step === 'consult_phone') {
    const phone = normalizePhoneNumber(message);
    if (phone.length < 10) {
      return { replyText: '📞 Informe um telefone válido com DDD para contato.', action: 'consult_retry_phone' };
    }
    draft.phone = phone;
    saveWhatsAppSession(sender.phoneNumber, 'consult_insurance', draft);
    return {
      replyText: [
        '📄 Possui convênio?',
        '',
        'Caso possua, informe o nome do convênio.',
      ].join('\n'),
      action: 'consult_collect_insurance',
    };
  }

  if (session.step === 'consult_insurance') {
    if (message.length < 3) {
      return { replyText: '📄 Informe o convênio ou responda *PARTICULAR*.', action: 'consult_retry_insurance' };
    }
    draft.insurance = message;
    saveWhatsAppSession(sender.phoneNumber, 'consult_preferred_date', draft);
    return { replyText: '📅 Qual a data desejada para o atendimento?', action: 'consult_collect_preferred_date' };
  }

  if (session.step === 'consult_preferred_date') {
    if (message.length < 2) {
      return { replyText: '📅 Informe a data desejada para o atendimento.', action: 'consult_retry_preferred_date' };
    }
    draft.preferredDate = message;
    saveWhatsAppSession(sender.phoneNumber, 'consult_preferred_time', draft);
    return { replyText: '🕒 Qual horário você prefere?', action: 'consult_collect_preferred_time' };
  }

  if (session.step === 'consult_preferred_time') {
    if (message.length < 2) {
      return { replyText: '🕒 Informe o horário de sua preferência.', action: 'consult_retry_preferred_time' };
    }
    draft.preferredTime = message;
    saveWhatsAppSession(sender.phoneNumber, 'consult_notes', draft);
    return {
      replyText: [
        '📝 Deseja adicionar alguma observação?',
        '',
        'Caso não tenha, responda:',
        '',
        '*PULAR*',
      ].join('\n'),
      action: 'consult_collect_notes',
    };
  }

  if (session.step === 'consult_notes') {
    draft.notes = normalizeOptionalNote(message);
    draft.leadId = recordWhatsAppLead(sender, draft);
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: buildConsultPreScheduleCompleteMessage(),
      action: 'consult_pre_schedule_complete',
      lead: draft,
    };
  }

  if (session.step === 'exam_full_name') {
    if (message.length < 5) {
      return { replyText: '👤 Qual o nome completo do paciente?', action: 'exam_retry_name' };
    }
    draft.type = 'exam_pre_schedule';
    draft.typeLabel = 'Pre-agendamento de exame';
    draft.fullName = message;
    draft.contactPhone = sender.phoneNumber;
    saveWhatsAppSession(sender.phoneNumber, 'exam_phone', draft);
    return { replyText: '📞 Qual o melhor telefone para contato?', action: 'exam_collect_phone' };
  }

  if (session.step === 'exam_phone') {
    const phone = normalizePhoneNumber(message);
    if (phone.length < 10) {
      return { replyText: '📞 Informe um telefone válido com DDD para contato.', action: 'exam_retry_phone' };
    }
    draft.phone = phone;
    saveWhatsAppSession(sender.phoneNumber, 'exam_name', draft);
    return {
      replyText: [
        '🩺 Qual exame deseja realizar?',
        '',
        'Exemplos:',
        '',
        '• Endoscopia',
        '• Colonoscopia',
        '• Outro exame solicitado',
      ].join('\n'),
      action: 'exam_collect_name',
    };
  }

  if (session.step === 'exam_name') {
    if (message.length < 3) {
      return { replyText: '🩺 Informe qual exame deseja realizar.', action: 'exam_retry_name_field' };
    }
    draft.examName = message;
    saveWhatsAppSession(sender.phoneNumber, 'exam_insurance', draft);
    return {
      replyText: [
        '📄 Informe seu convênio.',
        '',
        'Caso não possua, responda:',
        '',
        '*PARTICULAR*',
      ].join('\n'),
      action: 'exam_collect_insurance',
    };
  }

  if (session.step === 'exam_insurance') {
    if (message.length < 3) {
      return { replyText: '📄 Informe seu convênio ou responda *PARTICULAR*.', action: 'exam_retry_insurance' };
    }
    draft.insurance = message;
    saveWhatsAppSession(sender.phoneNumber, 'exam_preferred_date', draft);
    return { replyText: '📅 Qual data deseja realizar o exame?', action: 'exam_collect_preferred_date' };
  }

  if (session.step === 'exam_preferred_date') {
    if (message.length < 2) {
      return { replyText: '📅 Informe a data desejada para realizar o exame.', action: 'exam_retry_preferred_date' };
    }
    draft.preferredDate = message;
    saveWhatsAppSession(sender.phoneNumber, 'exam_preferred_time', draft);
    return { replyText: '🕒 Qual horário prefere?', action: 'exam_collect_preferred_time' };
  }

  if (session.step === 'exam_preferred_time') {
    if (message.length < 2) {
      return { replyText: '🕒 Informe o horário de sua preferência.', action: 'exam_retry_preferred_time' };
    }
    draft.preferredTime = message;
    saveWhatsAppSession(sender.phoneNumber, 'exam_notes', draft);
    return {
      replyText: [
        '📝 Deseja adicionar alguma observação?',
        '',
        'Caso não tenha, responda:',
        '',
        '*PULAR*',
      ].join('\n'),
      action: 'exam_collect_notes',
    };
  }

  if (session.step === 'exam_notes') {
    draft.notes = normalizeOptionalNote(message);
    draft.leadId = recordWhatsAppLead(sender, draft);
    markHumanTransferSession(sender.phoneNumber, draft, {
      source: draft.source || 'meta',
      leadId: draft.leadId,
      transferReason: 'exam_pre_schedule_finished',
    });
    return {
      replyText: buildPreScheduleCompleteMessage(),
      action: 'exam_pre_schedule_complete',
      lead: draft,
    };
  }

  if (session.step === 'surgery_quote_full_name') {
    if (message.length < 5) {
      return { replyText: '👤 Informe o nome completo do paciente.', action: 'surgery_quote_retry_name' };
    }
    draft.type = 'surgery_quote';
    draft.typeLabel = 'Orcamento de cirurgia';
    draft.fullName = message;
    draft.contactPhone = sender.phoneNumber;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_quote_phone', draft);
    return { replyText: '📞 Informe o telefone para contato.', action: 'surgery_quote_collect_phone' };
  }

  if (session.step === 'surgery_quote_phone') {
    const phone = normalizePhoneNumber(message);
    if (phone.length < 10) {
      return { replyText: '📞 Informe um telefone válido com DDD para contato.', action: 'surgery_quote_retry_phone' };
    }
    draft.phone = phone;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_quote_procedure', draft);
    return { replyText: '🩺 Qual procedimento deseja realizar?', action: 'surgery_quote_collect_procedure' };
  }

  if (session.step === 'surgery_quote_procedure') {
    if (message.length < 3) {
      return { replyText: '🩺 Informe o procedimento que deseja realizar.', action: 'surgery_quote_retry_procedure' };
    }
    draft.procedureName = message;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_quote_notes', draft);
    return {
      replyText: [
        '📝 Deseja adicionar alguma observação importante?',
        '',
        'Caso não tenha, responda:',
        '',
        '*PULAR*',
      ].join('\n'),
      action: 'surgery_quote_collect_notes',
    };
  }

  if (session.step === 'surgery_quote_notes') {
    draft.notes = normalizeOptionalNote(message);
    draft.leadId = recordWhatsAppLead(sender, draft);
    markHumanTransferSession(sender.phoneNumber, draft, {
      source: draft.source || 'meta',
      leadId: draft.leadId,
      transferReason: 'surgery_budget_finished',
    });
    return {
      replyText: buildSurgeryQuoteCompleteMessage(),
      action: 'surgery_quote_complete',
      lead: draft,
    };
  }

  if (session.step === 'surgery_schedule_full_name') {
    if (message.length < 5) {
      return { replyText: 'Nome completo do paciente:', action: 'surgery_schedule_retry_name' };
    }
    draft.type = 'surgery_pre_schedule';
    draft.typeLabel = 'Pre-agendamento de cirurgia';
    draft.fullName = message;
    draft.contactPhone = sender.phoneNumber;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_schedule_phone', draft);
    return { replyText: 'Telefone para contato:', action: 'surgery_schedule_collect_phone' };
  }

  if (session.step === 'surgery_schedule_phone') {
    const phone = normalizePhoneNumber(message);
    if (phone.length < 10) {
      return { replyText: 'Informe um telefone válido com DDD para contato.', action: 'surgery_schedule_retry_phone' };
    }
    draft.phone = phone;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_schedule_procedure', draft);
    return { replyText: 'Qual cirurgia deseja agendar:', action: 'surgery_schedule_collect_procedure' };
  }

  if (session.step === 'surgery_schedule_procedure') {
    if (message.length < 3) {
      return { replyText: 'Informe qual cirurgia deseja agendar.', action: 'surgery_schedule_retry_procedure' };
    }
    draft.procedureName = message;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_schedule_insurance', draft);
    return { replyText: 'Convênio:', action: 'surgery_schedule_collect_insurance' };
  }

  if (session.step === 'surgery_schedule_insurance') {
    if (message.length < 3) {
      return { replyText: 'Informe o convênio ou responda *PARTICULAR*.', action: 'surgery_schedule_retry_insurance' };
    }
    draft.insurance = message;
    saveWhatsAppSession(sender.phoneNumber, 'surgery_schedule_notes', draft);
    return { replyText: 'Observações, ou PULAR', action: 'surgery_schedule_collect_notes' };
  }

  if (session.step === 'surgery_schedule_notes') {
    draft.notes = normalizeOptionalNote(message);
    draft.leadId = recordWhatsAppLead(sender, draft);
    markHumanTransferSession(sender.phoneNumber, draft, {
      source: draft.source || 'meta',
      leadId: draft.leadId,
      transferReason: 'surgery_schedule_finished',
    });
    return {
      replyText: buildSurgeryScheduleCompleteMessage(),
      action: 'surgery_pre_schedule_complete',
      lead: draft,
    };
  }

  if (!datesWithFreeSlots.length && !String(session?.step || '').startsWith('human_')) {
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: '📅 No momento, não há horários liberados.\n\nSe preferir, digite *ATENDENTE* para falar com nossa equipe.',
      action: 'guided_no_dates',
    };
  }

  if (session.step === 'name') {
    if (message.length < 5) {
      return { replyText: '👤 Para seguir com segurança, informe o nome completo do paciente.', action: 'guided_retry_name' };
    }
    draft.fullName = message;
    saveWhatsAppSession(sender.phoneNumber, 'cpf', draft);
    return { replyText: '📄 Perfeito. Agora informe o CPF com 11 dígitos.', action: 'guided_collect_cpf' };
  }

  if (session.step === 'cpf') {
    const cpf = normalizeCpf(message);
    if (cpf.length !== 11) {
      return { replyText: '⚠️ Não consegui validar esse CPF. Envie os 11 dígitos, sem pontos ou traços.', action: 'guided_retry_cpf' };
    }
    draft.cpf = cpf;
    saveWhatsAppSession(sender.phoneNumber, 'address', draft);
    return { replyText: '📍 Perfeito. Agora envie o endereço completo.', action: 'guided_collect_address' };
  }

  if (session.step === 'address') {
    if (message.length < 6) {
      return { replyText: '📍 Preciso de um endereço mais completo para continuar o cadastro.', action: 'guided_retry_address' };
    }
    draft.address = message;
    saveWhatsAppSession(sender.phoneNumber, 'date', draft);
    return {
      replyText: [
        '📅 Agora escolha a data do atendimento.',
        'Você pode responder com o número da lista ou com a data no formato *AAAA-MM-DD*.',
        '',
        buildFreeDatesListText(schedule),
      ].join('\n'),
      action: 'guided_collect_date',
    };
  }

  if (session.step === 'date') {
    const selectedDate = resolveDateSelection(message, schedule);
    if (!selectedDate) {
      return {
        replyText: [
          '⚠️ Não consegui identificar uma data livre.',
          'Responda com o número da lista ou com a data no formato *AAAA-MM-DD*.',
          '',
          buildFreeDatesListText(schedule),
        ].join('\n'),
        action: 'guided_retry_date',
      };
    }
    draft.date = selectedDate;
    saveWhatsAppSession(sender.phoneNumber, 'time', draft);
    return {
      replyText: [
        '🕒 Agora escolha o horário.',
        'Você pode responder com o número da lista ou com o horário no formato *HH:MM*.',
        '',
        buildFreeTimesListText(selectedDate, schedule),
      ].join('\n'),
      action: 'guided_collect_time',
    };
  }

  if (session.step === 'time') {
    const selectedTime = resolveTimeSelection(draft.date, message, schedule);
    if (!selectedTime) {
      return {
        replyText: [
          '⚠️ Esse horário não está mais livre.',
          'Escolha uma das opcoes abaixo:',
          '',
          buildFreeTimesListText(draft.date, schedule),
        ].join('\n'),
        action: 'guided_retry_time',
      };
    }
    draft.time = selectedTime;
    if (draft.lockProcedure && draft.procedureName) {
      saveWhatsAppSession(sender.phoneNumber, 'notes', draft);
      return {
        replyText: '📝 Se quiser adicionar observações, envie agora. Se não, responda *PULAR*.',
        action: 'guided_collect_notes',
      };
    }

    saveWhatsAppSession(sender.phoneNumber, 'procedure', draft);
    return {
      replyText: draft.procedurePrompt || '🩺 Se desejar, envie o procedimento. Se quiser pular essa etapa, responda *PULAR*.',
      action: 'guided_collect_procedure',
    };
  }

  if (session.step === 'procedure') {
    draft.procedureName = normalizedMessage === 'pular' ? '' : message;
    saveWhatsAppSession(sender.phoneNumber, 'notes', draft);
    return {
      replyText: '📝 Se quiser adicionar observações, envie agora. Se não, responda *PULAR*.',
      action: 'guided_collect_notes',
    };
  }

  if (session.step === 'notes') {
    draft.notes = normalizedMessage === 'pular' ? '' : message;
    saveWhatsAppSession(sender.phoneNumber, 'confirm', draft);
    return {
      replyText: buildProfessionalGuidedSummary(draft),
      action: 'guided_confirm',
    };
  }

  if (session.step === 'confirm') {
    if (['2', 'corrigir'].includes(normalizedMessage)) {
      saveWhatsAppSession(sender.phoneNumber, 'name', draft);
      return {
        replyText: '✏️ Vamos corrigir os dados.\n\n👤 Envie novamente o nome completo do paciente.',
        action: 'guided_correct',
      };
    }

    if (['3', 'cancelar', 'cancelarfluxo', 'sair', 'encerrar'].includes(normalizedMessage)) {
      clearWhatsAppSession(sender.phoneNumber);
      return {
        replyText: '✅ *Atendimento cancelado com sucesso.*\n\nQuando quiser retomar, envie *MENU*.',
        action: 'guided_cancelled',
      };
    }

    if (!['1', 'confirmar'].includes(normalizedMessage)) {
      return {
        replyText: '⚠️ Para concluir com segurança, responda *CONFIRMAR*.\n\nPara corrigir, responda *CORRIGIR*.\nPara sair, responda *CANCELAR*.',
        action: 'guided_retry_confirm',
      };
    }

    const appointment = createAppointment(
      {
        fullName: draft.fullName,
        address: draft.address,
        cpf: draft.cpf,
        date: draft.date,
        time: draft.time,
        procedureName: draft.procedureName || '',
        notes: draft.notes || '',
        source: 'whatsapp',
        contactPhone: sender.phoneNumber,
      },
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );

    clearWhatsAppSession(sender.phoneNumber);
    writeAuditLog(
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
      'create_appointment_whatsapp_guided',
      'appointment',
      appointment.id,
      { phoneNumber: sender.phoneNumber }
    );

    return {
      replyText: [
        '✅ *Agendamento confirmado com sucesso!*',
        '',
        `👤 Paciente: ${appointment.fullName}`,
        `📅 Data: ${appointment.date}`,
        `🕒 Horário: ${appointment.time}`,
        '',
        'O horário já ficou reservado no sistema.',
      ].join('\n'),
      action: 'guided_create_appointment',
      appointment,
    };
  }

  if (session.step === 'reschedule_cpf') {
    const cpf = normalizeCpf(message);
    if (cpf.length !== 11) {
      return { replyText: '📄 Envie o CPF com 11 dígitos do agendamento que deseja remarcar.', action: 'reschedule_retry_cpf' };
    }
    draft.cpf = cpf;
    saveWhatsAppSession(sender.phoneNumber, 'reschedule_current_date', draft);
    return {
      replyText: '📅 Agora informe a data atual do agendamento no formato *AAAA-MM-DD*.',
      action: 'reschedule_collect_current_date',
    };
  }

  if (session.step === 'reschedule_current_date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(message)) {
      return {
        replyText: '⚠️ Não consegui identificar a data atual.\n\nEnvie no formato *AAAA-MM-DD*.',
        action: 'reschedule_retry_current_date',
      };
    }
    const appointment = findAppointmentByCpfAndDate(draft.cpf, message);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo com esse CPF e essa data.\n\nConfira os dados ou envie *ATENDENTE*.',
        action: 'reschedule_not_found',
      };
    }
    draft.appointmentId = appointment.id;
    draft.currentDate = appointment.date;
    draft.currentTime = appointment.time || '';
    draft.fullName = appointment.fullName;
    saveWhatsAppSession(sender.phoneNumber, 'reschedule_new_date', draft);
    return {
      replyText: [
        '📋 *Agendamento localizado*',
        '',
        `👤 Paciente: ${appointment.fullName}`,
        `📅 Data atual: ${appointment.date}${appointment.time ? ` às ${appointment.time}` : ''}`,
        '',
        'Agora escolha a nova data.',
        '',
        buildFreeDatesListText(schedule),
      ].join('\n'),
      action: 'reschedule_collect_new_date',
    };
  }

  if (session.step === 'reschedule_new_date') {
    const selectedDate = resolveDateSelection(message, schedule);
    if (!selectedDate) {
      return {
        replyText: [
          '⚠️ Não consegui identificar a nova data.',
          'Responda com o número da lista ou com a data no formato *AAAA-MM-DD*.',
          '',
          buildFreeDatesListText(schedule),
        ].join('\n'),
        action: 'reschedule_retry_new_date',
      };
    }
    draft.newDate = selectedDate;
    saveWhatsAppSession(sender.phoneNumber, 'reschedule_new_time', draft);
    return {
      replyText: [
        `🕒 Agora escolha o novo horário para *${selectedDate}*.`,
        '',
        buildFreeTimesListText(selectedDate, schedule),
      ].join('\n'),
      action: 'reschedule_collect_new_time',
    };
  }

  if (session.step === 'reschedule_new_time') {
    const selectedTime = resolveTimeSelection(draft.newDate, message, schedule);
    if (!selectedTime) {
      return {
        replyText: [
          '⚠️ Esse horário não está disponível.',
          '',
          buildFreeTimesListText(draft.newDate, schedule),
        ].join('\n'),
        action: 'reschedule_retry_new_time',
      };
    }
    draft.newTime = selectedTime;
    saveWhatsAppSession(sender.phoneNumber, 'reschedule_confirm', draft);
    return {
      replyText: [
        '📋 *Confira a remarcação:*',
        '',
        `👤 Paciente: ${draft.fullName}`,
        `De: ${draft.currentDate}${draft.currentTime ? ` às ${draft.currentTime}` : ''}`,
        `Para: ${draft.newDate} às ${draft.newTime}`,
        '',
        'Responda *CONFIRMAR* para concluir ou *CANCELAR FLUXO* para sair.',
      ].join('\n'),
      action: 'reschedule_confirm',
    };
  }

  if (session.step === 'reschedule_confirm') {
    if (['2', 'corrigir'].includes(normalizedMessage)) {
      saveWhatsAppSession(sender.phoneNumber, 'reschedule_new_date', draft);
      return {
        replyText: [
          '✏️ Vamos corrigir a remarcação.',
          'Escolha novamente a nova data.',
          '',
          buildFreeDatesListText(schedule),
        ].join('\n'),
        action: 'reschedule_correct',
      };
    }

    if (['3', 'cancelar', 'cancelarfluxo', 'sair', 'encerrar'].includes(normalizedMessage)) {
      clearWhatsAppSession(sender.phoneNumber);
      return {
        replyText: '✅ *Atendimento cancelado com sucesso.*\n\nQuando quiser retomar, envie *MENU*.',
        action: 'reschedule_cancelled',
      };
    }

    if (!['1', 'confirmar'].includes(normalizedMessage)) {
      return {
        replyText: '⚠️ Para concluir a remarcação, responda *CONFIRMAR*.\n\nPara corrigir, responda *CORRIGIR*.\nPara sair, responda *CANCELAR*.',
        action: 'reschedule_retry_confirm',
      };
    }

    const previousDate = draft.currentDate;
    const previousTime = draft.currentTime;
    const appointment = rescheduleAppointment(
      draft.appointmentId,
      draft.newDate,
      draft.newTime,
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );

    clearWhatsAppSession(sender.phoneNumber);
    notifyDoctorAboutReschedule(appointment, previousDate, previousTime).catch(() => {});
    return {
      replyText: `✅ *Remarcação concluída com sucesso!*\n\nSeu atendimento ficou para ${appointment.date} às ${appointment.time}.`,
      action: 'reschedule_complete',
      appointment,
    };
  }

  clearWhatsAppSession(sender.phoneNumber);
  return {
    replyText: buildProfessionalHelpMessage(),
    action: 'guided_reset',
  };
}

function executeEnhancedWhatsAppCommand(command, sender) {
  if (command.type === 'help') {
    clearWhatsAppSession(sender.phoneNumber);
    return { replyText: buildProfessionalHelpMessage(), action: 'help' };
  }

  if (command.type === 'consult_pre_schedule') {
    saveWhatsAppSession(sender.phoneNumber, 'consult_full_name', {
      source: sender.source || 'meta',
      type: 'consult_pre_schedule',
      typeLabel: 'Pre-agendamento de consulta',
    });
    return { replyText: buildConsultPreScheduleStartMessage(), action: 'consult_pre_schedule_start' };
  }

  if (command.type === 'exam_pre_schedule') {
    saveWhatsAppSession(sender.phoneNumber, 'exam_full_name', {
      source: sender.source || 'meta',
      type: 'exam_pre_schedule',
      typeLabel: 'Pre-agendamento de exame',
    });
    return { replyText: buildExamPreScheduleStartMessage(), action: 'exam_pre_schedule_start' };
  }

  if (command.type === 'surgery_pre_schedule') {
    saveWhatsAppSession(sender.phoneNumber, 'surgery_schedule_full_name', {
      source: sender.source || 'meta',
      type: 'surgery_pre_schedule',
      typeLabel: 'Pre-agendamento de cirurgia',
    });
    return { replyText: buildSurgeryScheduleStartMessage(), action: 'surgery_pre_schedule_start' };
  }

  if (command.type === 'pricing_info') {
    saveWhatsAppSession(sender.phoneNumber, 'pricing_menu', {
      source: sender.source || 'meta',
      type: 'pricing_menu',
      typeLabel: 'Valores',
    });
    return { replyText: buildPricingInfoMessage(), action: 'pricing_info' };
  }

  if (command.type === 'payment_interest') {
    return buildHumanTransferOutcome(command, sender, getWhatsAppSession(sender.phoneNumber));
  }

  if (command.type === 'clinic_info') {
    clearWhatsAppSession(sender.phoneNumber);
    return { replyText: buildClinicInfoMessage(), action: 'clinic_info' };
  }

  if (command.type === 'surgery_info') {
    saveWhatsAppSession(sender.phoneNumber, 'surgery_menu', { source: sender.source || 'meta' });
    return { replyText: buildSurgeryInfoMessage(), action: 'surgery_info' };
  }

  if (command.type === 'human_handoff') {
    return buildHumanTransferOutcome(command, sender, getWhatsAppSession(sender.phoneNumber));
  }

  if (command.type === 'list_dates') {
    saveWhatsAppSession(sender.phoneNumber, 'dates_menu', {
      source: sender.source || 'meta',
      type: 'dates_menu',
      typeLabel: 'Datas disponiveis',
    });
    return { replyText: buildProfessionalDatesMessage(), action: 'list_dates' };
  }

  const cpf = resolveCommandField(command.fields || {}, ['cpf']);
  const date = resolveCommandField(command.fields || {}, ['data', 'date']);
  const time = resolveCommandField(command.fields || {}, ['hora', 'horario', 'time']);

  if (command.type === 'appointment_status') {
    const appointment = findAppointmentByCpfAndDate(cpf, date);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo com esse CPF e essa data.\n\nSe quiser, envie *DATAS* para ver novas vagas.',
        action: 'status_not_found',
      };
    }

    return {
      replyText: `📋 *Agendamento encontrado*\n\n👤 Paciente: ${appointment.fullName}\n📅 Data: ${appointment.date}${appointment.time ? `\n🕒 Horário: ${appointment.time}` : ''}\n\n*Status atual:* ${appointment.status}.`,
      action: 'status_found',
      appointment,
    };
  }

  if (command.type === 'cancel_appointment') {
    const appointment = findAppointmentByCpfAndDate(cpf, date);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo para cancelar com esse CPF e essa data.',
        action: 'cancel_not_found',
      };
    }

    const updated = updateAppointmentStatus(appointment.id, 'cancelado', {
      id: 'whatsapp-bot',
      displayName: 'WhatsApp',
      role: 'system',
    });
    clearWhatsAppSession(sender.phoneNumber);
    return {
      replyText: `✅ *Cancelamento concluído.*\n\nO agendamento de ${updated.fullName} em ${updated.date}${updated.time ? ` às ${updated.time}` : ''} foi cancelado com sucesso.`,
      action: 'cancel_appointment',
      appointment: updated,
    };
  }

  if (command.type === 'reschedule_appointment') {
    const currentDate = resolveCommandField(command.fields || {}, ['dataatual', 'data', 'date']);
    const newDate = resolveCommandField(command.fields || {}, ['novadata']);
    const newTime = resolveCommandField(command.fields || {}, ['novahora', 'novohorario', 'hora', 'horario', 'time']);

    if (!cpf || !currentDate || !newDate || !newTime) {
      saveWhatsAppSession(sender.phoneNumber, 'reschedule_cpf', { source: sender.source || 'meta' });
      return {
        replyText: buildRescheduleStartMessage(),
        action: 'reschedule_start',
      };
    }

    const appointment = findAppointmentByCpfAndDate(cpf, currentDate);
    if (!appointment) {
      return {
        replyText: '⚠️ Não encontrei um agendamento ativo com esse CPF e a data informada.',
        action: 'reschedule_not_found',
      };
    }

    const updated = rescheduleAppointment(
      appointment.id,
      newDate,
      normalizeTime(newTime),
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );
    notifyDoctorAboutReschedule(updated, appointment.date, appointment.time).catch(() => {});
    return {
      replyText: `✅ *Remarcação concluída com sucesso!*\n\nSeu atendimento ficou para ${updated.date} às ${updated.time}.`,
      action: 'reschedule_complete',
      appointment: updated,
    };
  }

  if (command.type === 'create_appointment') {
    const fullName = resolveCommandField(command.fields || {}, ['nome', 'nomecompleto']);
    const address = resolveCommandField(command.fields || {}, ['endereco']);
    const procedureName = resolveCommandField(command.fields || {}, ['procedimento']);
    const notes = resolveCommandField(command.fields || {}, ['obs', 'observacoes', 'observacao']);

    if (!fullName || !address || !cpf || !date || !time) {
      saveWhatsAppSession(sender.phoneNumber, 'name', { source: sender.source || 'meta' });
      return {
        replyText: buildProfessionalGuidedStartMessage(),
        action: 'guided_start',
      };
    }

    const appointment = createAppointment(
      {
        fullName,
        address,
        cpf,
        date,
        time,
        procedureName,
        notes,
        source: 'whatsapp',
        contactPhone: sender.phoneNumber,
      },
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' }
    );

    writeAuditLog(
      { id: 'whatsapp-bot', displayName: 'WhatsApp', role: 'system' },
      'create_appointment_whatsapp',
      'appointment',
      appointment.id,
      { phoneNumber: sender.phoneNumber }
    );

    return {
      replyText: `✅ *Agendamento criado com sucesso!*\n\n👤 Paciente: ${appointment.fullName}\n📅 Data: ${appointment.date}\n🕒 Horário: ${appointment.time}`,
      action: 'create_appointment',
      appointment,
    };
  }

  return { replyText: buildProfessionalHelpMessage(), action: 'help' };
}

async function processIncomingWhatsAppMessage({
  from,
  replyTo = '',
  profileName,
  text,
  metaMessageId = '',
  source = 'meta',
  fromMe = false,
  fromMeBot = false,
}) {
  if (isGroupConversationId(from)) {
    logWhatsAppEvent({
      direction: 'inbound',
      phoneNumber: '',
      profileName: String(profileName || ''),
      messageType: 'text',
      messageText: text,
      status: 'group_ignored',
      metaMessageId,
      details: { source, groupConversation: true },
    });

    return {
      sender: {
        phoneNumber: '',
        profileName: String(profileName || ''),
        source,
      },
      commandType: 'group_ignored',
      action: 'group_ignored',
      replyText: '',
      appointment: null,
      delivered: false,
      groupIgnored: true,
    };
  }

  const sender = {
    phoneNumber: normalizePhoneNumber(from),
    replyTo: String(replyTo || '').trim(),
    profileName: String(profileName || ''),
    source,
  };
  const dedupPayload = { from, profileName, text, source, fromMe: Boolean(fromMe), fromMeBot: Boolean(fromMeBot) };

  if (fromMe) {
    const automaticBusinessGreeting = !fromMeBot && isWhatsAppBusinessAutomaticGreeting(text);
    if (!fromMeBot && !automaticBusinessGreeting) {
      markManualOutboundGuard(sender.phoneNumber, { source, text, metaMessageId });
    }

    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: sender.phoneNumber,
      profileName: sender.profileName,
      messageType: 'text',
      messageText: text,
      status: 'from_me_ignored',
      metaMessageId,
      details: {
        source,
        fromMe: true,
        fromMeBot: Boolean(fromMeBot),
        automaticBusinessGreeting,
        manualOutboundGuard: !fromMeBot && !automaticBusinessGreeting,
      },
    });

    return {
      sender,
      commandType: 'from_me',
      action: 'from_me_ignored',
      replyText: '',
      appointment: null,
      delivered: false,
      noReply: true,
      fromMe: true,
      fromMeBot: Boolean(fromMeBot),
    };
  }

  if (metaMessageId && !reserveInboundMetaMessage(metaMessageId, sender.phoneNumber, text, dedupPayload)) {
    logWhatsAppEvent({
      direction: 'inbound',
      phoneNumber: sender.phoneNumber,
      profileName: sender.profileName,
      messageType: 'text',
      messageText: text,
      status: 'duplicate_ignored',
      metaMessageId,
      details: { source, duplicate: true },
    });

    return {
      sender,
      commandType: 'duplicate',
      action: 'duplicate_ignored',
      replyText: '',
      appointment: null,
      delivered: false,
      duplicate: true,
    };
  }

  if (shouldIgnoreRecentRepeatedText(source, sender.phoneNumber, text)) {
    logWhatsAppEvent({
      direction: 'inbound',
      phoneNumber: sender.phoneNumber,
      profileName: sender.profileName,
      messageType: 'text',
      messageText: text,
      status: 'duplicate_text_ignored',
      metaMessageId,
      details: { source, duplicateTextWindowSeconds: 15 },
    });

    if (metaMessageId) {
      completeInboundMetaMessage(metaMessageId, 'processed');
    }

    return {
      sender,
      commandType: 'duplicate_text',
      action: 'duplicate_text_ignored',
      replyText: '',
      appointment: null,
      delivered: false,
      duplicate: true,
    };
  }

  let command = parseWhatsAppCommand(text);
  command.lastMessage = String(text || '').trim();
  let activeSession = getWhatsAppSession(sender.phoneNumber);
  if (activeSession && isSessionExpired(activeSession)) {
    clearWhatsAppSession(sender.phoneNumber);
    activeSession = null;
  }
  if (activeSession?.step === 'manual_outbound_guard' && !isManualOutboundGuardActive(activeSession)) {
    clearWhatsAppSession(sender.phoneNumber);
    activeSession = null;
  }
  const manualOutboundGuardActive = isManualOutboundGuardActive(activeSession);
  const conversationStartedByUs = !activeSession && wasWhatsAppConversationStartedByUs(sender.phoneNumber);
  if (!activeSession && command.type === 'help') {
    command = resolveMainMenuChoice(text) || command;
  }

  logWhatsAppEvent({
    direction: 'inbound',
    phoneNumber: sender.phoneNumber,
    profileName: sender.profileName,
    messageType: 'text',
    messageText: text,
    status: 'received',
    metaMessageId,
    details: { source, commandType: command.type, conversationStartedByUs, manualOutboundGuardActive },
  });

  let outcome;
  try {
    if (manualOutboundGuardActive) {
      outcome = buildNoReplyOutcome('manual_outbound_reply_guard', {
        reason: 'conversation_started_manually_by_clinic',
        suppressUntil: activeSession.draft?.suppressUntil || '',
      });
    } else if (activeSession?.step === 'human_handoff') {
      outcome = buildNoReplyOutcome('human_handoff_silent', {
        reason: 'waiting_human',
        conversationStatus: activeSession.draft?.conversationStatus || 'waiting_human',
      });
    } else if (conversationStartedByUs && !['human_handoff', 'payment_interest'].includes(command.type)) {
      outcome = buildNoReplyOutcome('conversation_started_by_us', {
        reason: 'conversation_started_by_us',
      });
    } else if (activeSession && ['human_handoff', 'payment_interest'].includes(command.type)) {
      outcome = executeEnhancedWhatsAppCommand(command, sender);
    } else if (activeSession && !/^(ajuda|menu|oi|ola|bom dia|boa tarde|boa noite|help)\b/i.test(String(text || '').trim())) {
      touchWhatsAppSession(sender.phoneNumber);
      outcome = executeEnhancedGuidedWhatsAppFlow(activeSession, text, sender);
      if (getMinutesSince(activeSession.updatedAt) >= WHATSAPP_SESSION_NUDGE_MINUTES) {
        outcome.replyText = `${buildSessionResumeMessage(activeSession)}\n\n${outcome.replyText}`;
      }
    } else if (activeSession && command.type === 'help') {
      clearWhatsAppSession(sender.phoneNumber);
      outcome = executeEnhancedWhatsAppCommand(command, sender);
    } else if (command.type === 'help' && isGuidedScheduleTrigger(text)) {
      saveWhatsAppSession(sender.phoneNumber, 'consult_full_name', {
        source,
        type: 'consult_pre_schedule',
        typeLabel: 'Pre-agendamento de consulta',
      });
      outcome = {
        replyText: buildConsultPreScheduleStartMessage(),
        action: 'consult_pre_schedule_start',
      };
    } else if (command.type === 'reschedule_appointment' && !resolveCommandField(command.fields || {}, ['cpf'])) {
      saveWhatsAppSession(sender.phoneNumber, 'reschedule_cpf', { source });
      outcome = {
        replyText: buildRescheduleStartMessage(),
        action: 'reschedule_start',
      };
    } else {
      outcome = executeEnhancedWhatsAppCommand(command, sender);
    }
  } catch (error) {
    if (metaMessageId) {
      completeInboundMetaMessage(metaMessageId, 'failed');
    }
    outcome = {
      replyText: error.message || 'Não foi possível processar sua mensagem agora. Tente novamente em instantes.',
      action: 'error',
      error,
    };
  }

  let outboundMetaMessageId = '';
  let deliveryStatus = 'simulated';
  const hasReplyText = Boolean(String(outcome.replyText || '').trim());
  if (shouldDeliverWhatsAppSource(source) && hasReplyText) {
    try {
      await sleep(randomInt(1000, 3000));
      const sendResult = await sendTextFallback(sender.replyTo || sender.phoneNumber, outcome.replyText);
      outboundMetaMessageId = sendResult?.messages?.[0]?.id || '';
      deliveryStatus = 'sent';
    } catch (error) {
      outcome.error = outcome.error || error;
      deliveryStatus = 'failed';
    }
  } else if (!hasReplyText) {
    deliveryStatus = 'no_reply';
  }

  logWhatsAppEvent({
    direction: 'outbound',
    phoneNumber: sender.phoneNumber,
    profileName: sender.profileName,
    messageType: 'text',
    messageText: outcome.replyText,
    status: deliveryStatus,
    appointmentId: outcome.appointment?.id || '',
    metaMessageId: outboundMetaMessageId,
    details: {
      source,
      action: outcome.action,
      commandType: command.type,
      noReply: !hasReplyText,
      ...(outcome.details || {}),
      error: outcome.error?.message || '',
    },
  });

  if (metaMessageId) {
    completeInboundMetaMessage(metaMessageId, outcome.error ? 'failed' : 'processed');
  }

  if (shouldDeliverWhatsAppSource(source) && outcome.appointment && ['guided_create_appointment', 'create_appointment'].includes(outcome.action)) {
    await notifyDoctorAboutAppointment(outcome.appointment);
  }

  if (shouldDeliverWhatsAppSource(source) && ['human_handoff', 'payment_interest'].includes(outcome.action)) {
    await notifyResponsibleAboutLead(sender, outcome.lead || {
      type: 'human_handoff',
      typeLabel: 'Atendimento solicitado',
      contactPhone: sender.phoneNumber,
      notes: 'Cliente pediu para falar com atendente.',
      lastMessage: String(text || '').trim(),
    });
  }

  return {
    sender,
    commandType: command.type,
    action: outcome.action,
    replyText: outcome.replyText,
    appointment: outcome.appointment || null,
    delivered: shouldDeliverWhatsAppSource(source) && hasReplyText,
    noReply: !hasReplyText,
  };
}

function processWhatsAppStatusUpdate(statusItem = {}) {
  const metaMessageId = String(statusItem?.id || '').trim();
  const recipientId = normalizePhoneNumber(statusItem?.recipient_id || '');
  const currentStatus = String(statusItem?.status || '').trim() || 'unknown';
  const details = {
    source: 'meta_status',
    conversation: statusItem?.conversation || null,
    pricing: statusItem?.pricing || null,
    timestamp: statusItem?.timestamp || '',
  };

  if (metaMessageId) {
    updateWhatsAppEventsStatusByMetaMessageId(metaMessageId, currentStatus, details);
  }

  logWhatsAppEvent({
    direction: 'status',
    phoneNumber: recipientId,
    messageType: 'status',
    status: currentStatus,
    metaMessageId,
    details,
  });
}

async function sendPatientAppointmentReminder(appointment, reminderType) {
  const patientPhone = normalizePhoneNumber(appointment?.contactPhone);
  if (!patientPhone || !appointment) {
    return { sent: false, skipped: true, reason: 'patient_phone_missing' };
  }

  const templateName = reminderType === 'same_day'
    ? WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME
    : WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME;
  const reminderLabel = reminderType === 'same_day' ? 'de hoje' : 'de amanha';
  const bodyText = buildPatientReminderText(appointment, reminderLabel);
  const notificationKey = `${reminderType}:${appointment.id}`;

  if (!reserveAutomationEvent(notificationKey, reminderType, patientPhone, appointment.id, { date: appointment.date, time: appointment.time })) {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }

  try {
    let payload;
    let messageType = 'template';

    if (isTemporaryQrDeliveryMode()) {
      messageType = 'text';
      payload = await sendWhatsAppTextMessage(patientPhone, bodyText);
    } else if (templateName) {
      payload = await sendWhatsAppTemplateMessage(
        patientPhone,
        templateName,
        [appointment.fullName, appointment.date, appointment.time || 'A definir', appointment.procedureName || 'Consulta'],
        WHATSAPP_PATIENT_TEMPLATE_LANGUAGE
      );
    } else if (WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED) {
      messageType = 'text';
      payload = await sendWhatsAppTextMessage(patientPhone, bodyText);
    } else {
      return { sent: false, skipped: true, reason: 'template_not_configured' };
    }

    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: patientPhone,
      messageType,
      messageText: bodyText,
      status: 'sent',
      appointmentId: appointment.id || '',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: {
        source: 'patient_reminder',
        reminderType,
        templateName,
      },
    });

    return { sent: true, payload };
  } catch (error) {
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: patientPhone,
      messageType: templateName ? 'template' : 'text',
      messageText: bodyText,
      status: 'failed',
      appointmentId: appointment.id || '',
      details: {
        source: 'patient_reminder',
        reminderType,
        templateName,
        error: error.message || 'Falha ao enviar lembrete.',
        payload: error.payload || null,
      },
    });
    return { sent: false, skipped: false, reason: 'send_failed', error };
  }
}

async function runWhatsAppAutomationMaintenance() {
  const appointments = getSchedule().appointments.filter((item) => item.status !== 'cancelado');
  const now = new Date();

  for (const appointment of appointments) {
    if (!appointment.time) continue;

    const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}:00`);
    if (Number.isNaN(appointmentDateTime.getTime())) continue;

    const diffMs = appointmentDateTime.getTime() - now.getTime();
    const diffHours = diffMs / (60 * 60 * 1000);

    if (diffHours > 23 && diffHours <= 25) {
      await sendPatientAppointmentReminder(appointment, 'day_before');
    }
    if (diffHours > 1 && diffHours <= 3) {
      await sendPatientAppointmentReminder(appointment, 'same_day');
    }
  }

  const sessions = getAllWhatsAppSessions();
  for (const session of sessions) {
    if (session.step === 'manual_outbound_guard') {
      if (!isManualOutboundGuardActive(session)) {
        clearWhatsAppSession(session.phoneNumber);
      }
      continue;
    }
    if (String(session.step || '').startsWith('human_')) continue;
    const minutesSince = getMinutesSince(session.updatedAt);
    if (minutesSince < WHATSAPP_SESSION_NUDGE_MINUTES) continue;

    const sentNudges = getSessionNudgeCount(session);
    if (sentNudges >= WHATSAPP_SESSION_MAX_NUDGES) {
      clearWhatsAppSession(session.phoneNumber);
      continue;
    }

    const nudgeNumber = sentNudges + 1;
    const nudgeKey = `session_nudge:${session.phoneNumber}:${session.updatedAt}:${nudgeNumber}`;
    if (!reserveAutomationEvent(nudgeKey, 'session_nudge', session.phoneNumber, '', {
      step: session.step,
      nudgeNumber,
      sessionUpdatedAt: session.updatedAt,
    })) {
      continue;
    }

    const sessionSource = session.draft?.source || 'meta';
    if (!shouldDeliverWhatsAppSource(sessionSource)) continue;

    const body = buildSessionNudgeMessage(session, nudgeNumber);

    try {
      const payload = await sendWhatsAppTextMessage(session.phoneNumber, body);
      if (nudgeNumber >= WHATSAPP_SESSION_MAX_NUDGES) {
        clearWhatsAppSession(session.phoneNumber);
      }
      logWhatsAppEvent({
        direction: 'outbound',
        phoneNumber: session.phoneNumber,
        messageType: 'text',
        messageText: body,
        status: 'sent',
        metaMessageId: payload?.messages?.[0]?.id || '',
        details: {
          source: 'session_nudge',
          step: session.step,
          nudgeNumber,
          sessionClosed: nudgeNumber >= WHATSAPP_SESSION_MAX_NUDGES,
        },
      });
    } catch (error) {
      logWhatsAppEvent({
        direction: 'outbound',
        phoneNumber: session.phoneNumber,
        messageType: 'text',
        messageText: body,
        status: 'failed',
        details: {
          source: 'session_nudge',
          step: session.step,
          error: error.message || 'Falha ao enviar lembrete de conversa parada.',
          payload: error.payload || null,
        },
      });
    }
  }
}

const whatsappWebhookQueue = [];
let isProcessingWhatsAppWebhookQueue = false;

function enqueueWhatsAppWebhookJob(job) {
  whatsappWebhookQueue.push(job);
  if (!isProcessingWhatsAppWebhookQueue) {
    process.nextTick(drainWhatsAppWebhookQueue);
  }
}

async function drainWhatsAppWebhookQueue() {
  if (isProcessingWhatsAppWebhookQueue) return;
  isProcessingWhatsAppWebhookQueue = true;

  while (whatsappWebhookQueue.length) {
    const job = whatsappWebhookQueue.shift();
    try {
      await job();
    } catch (error) {
      console.error(`WhatsApp webhook job failed: ${error.message}`);
    }
  }

  isProcessingWhatsAppWebhookQueue = false;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Token ausente.' });
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

function adminRequired(req, res, next) {
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem fazer isso.' });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/site-content', (_req, res) => {
  res.json(getSiteContent());
});

app.get('/api/admin/schedule', authRequired, (_req, res) => {
  res.json(getSchedule());
});

app.get('/api/admin/dashboard', authRequired, (req, res) => {
  res.json({
    summary: getDashboardSummary(),
    auditLogs: getAuditLogs(req.auth.role === 'admin' ? 40 : 15),
  });
});

app.get('/api/admin/system-check', authRequired, (req, res) => {
  try {
    const report = buildSystemCheckReport(req.auth);
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Falha ao executar diagnóstico do sistema.' });
  }
});

app.get('/api/admin/integrations/whatsapp', authRequired, adminRequired, (req, res) => {
  res.json(getWhatsAppStatus(req));
});

app.put('/api/admin/integrations/whatsapp/responsible', authRequired, adminRequired, (req, res) => {
  try {
    const responsible = saveWhatsAppResponsibleConfig(req.body || {});
    writeAuditLog(req.auth, 'update_whatsapp_responsible', 'whatsapp', 'responsible', {
      name: responsible.name,
      phoneConfigured: Boolean(responsible.phone),
    });
    return res.json({ ok: true, responsible, status: getWhatsAppStatus(req) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao salvar responsavel do WhatsApp.' });
  }
});

app.get('/api/admin/backup', authRequired, adminRequired, (_req, res) => {
  const snapshot = buildBackupSnapshot();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="backup-willian-holanda-${Date.now()}.json"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

app.get('/api/admin/patient-history', authRequired, (req, res) => {
  res.json({
    retention: getRetentionStatus(),
    archiveFiles: req.auth.role === 'admin' ? getArchiveFileRows() : [],
    records: getPatientHistory({
      query: req.query.q,
      archived: req.query.archived,
      limit: req.query.limit,
    }),
  });
});

app.post('/api/admin/retention/run', authRequired, adminRequired, (req, res) => {
  try {
    const result = runRetentionMaintenance(req.auth);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Falha ao executar manutenção do histórico.' });
  }
});

app.get('/api/admin/archive-files', authRequired, adminRequired, (_req, res) => {
  res.json({
    retention: getRetentionStatus(),
    archiveFiles: getArchiveFileRows(),
  });
});

app.get('/api/admin/archive-files/:id/download', authRequired, adminRequired, (req, res) => {
  const file = db.prepare(`
    SELECT id, file_name, file_path
    FROM patient_archive_files
    WHERE id = ?
      AND COALESCE(deleted_at, '') = ''
  `).get(req.params.id);

  if (!file) {
    return res.status(404).json({ error: 'Arquivo de histórico não encontrado.' });
  }

  const resolvedPath = path.resolve(file.file_path);
  const archiveRoot = path.resolve(ARCHIVE_DIR);
  if (!resolvedPath.startsWith(archiveRoot) || !fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'Arquivo físico não está disponível no servidor.' });
  }

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
  return res.sendFile(resolvedPath);
});

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = req.query['hub.verify_token'];

  if (mode === 'subscribe' && verifyToken && verifyToken === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Falha na verificação do webhook do WhatsApp.' });
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  if (!verifyMetaSignature(req)) {
    return res.status(403).json({ error: 'Assinatura do webhook do WhatsApp invalida.' });
  }

  const changes = Array.isArray(req.body?.entry)
    ? req.body.entry.flatMap((entry) => entry.changes || [])
    : [];

  try {
    for (const change of changes) {
      const value = change?.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      const statuses = value.statuses || [];

      for (const message of messages) {
        if (message?.type !== 'text') continue;
        const contact = contacts.find((item) => normalizePhoneNumber(item.wa_id) === normalizePhoneNumber(message.from)) || contacts[0];
        enqueueWhatsAppWebhookJob(async () => {
          await processIncomingWhatsAppMessage({
            from: message.from,
            profileName: contact?.profile?.name || '',
            text: message.text?.body || '',
            metaMessageId: message.id || '',
            source: 'meta',
          });
        });
      }

      for (const statusItem of statuses) {
        enqueueWhatsAppWebhookJob(async () => {
          processWhatsAppStatusUpdate(statusItem);
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao processar webhook do WhatsApp.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);

  if (!user || !user.active || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  writeAuditLog(sanitizeUser(user), 'login', 'session', user.id, { username: user.username });

  return res.json({
    token,
    user: sanitizeUser(user),
  });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.post('/api/auth/change-password', authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  if (!bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual inválida.' });
  }

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    nowIso(),
    user.id
  );

  writeAuditLog(req.auth, 'change_password', 'user', user.id, {});
  return res.json({ ok: true });
});

app.post('/api/admin/whatsapp/simulate-inbound', authRequired, adminRequired, async (req, res) => {
  const rawFrom = String(req.body?.from || '').trim();
  const from = isGroupConversationId(rawFrom) ? rawFrom : normalizePhoneNumber(rawFrom);
  const text = String(req.body?.text || '').trim();
  const profileName = String(req.body?.profileName || 'Simulação').trim();
  const metaMessageId = String(req.body?.metaMessageId || '').trim();
  const source = String(req.body?.source || 'simulation').trim() || 'simulation';
  const fromMe = Boolean(req.body?.fromMe);

  if (!from || !text) {
    return res.status(400).json({ error: 'Informe telefone e mensagem para simular o WhatsApp.' });
  }

  try {
    const result = await processIncomingWhatsAppMessage({
      from,
      profileName,
      text,
      metaMessageId,
      source,
      fromMe,
    });

    return res.json({
      ok: true,
      result,
      status: getWhatsAppStatus(req),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao simular mensagem do WhatsApp.' });
  }
});

app.post('/api/admin/whatsapp/test-message', authRequired, adminRequired, async (req, res) => {
  const to = normalizePhoneNumber(req.body?.to);
  const text = String(req.body?.text || '').trim();

  if (!to || !text) {
    return res.status(400).json({ error: 'Informe telefone e mensagem para enviar o teste.' });
  }

  try {
    const payload = await sendWhatsAppTextMessage(to, text);
    logWhatsAppEvent({
      direction: 'outbound',
      phoneNumber: to,
      messageType: 'text',
      messageText: text,
      status: 'sent',
      metaMessageId: payload?.messages?.[0]?.id || '',
      details: { source: 'admin_test' },
    });
    return res.json({ ok: true, payload, status: getWhatsAppStatus(req) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Falha ao enviar teste do WhatsApp.',
      details: error.payload || null,
    });
  }
});

app.post('/api/admin/whatsapp/test-responsible-notification', authRequired, adminRequired, async (req, res) => {
  const sender = {
    phoneNumber: normalizePhoneNumber(req.body?.patientPhone || '5599999999999'),
    profileName: String(req.body?.patientName || 'Paciente de Teste').trim(),
    source: 'admin_test',
  };
  const lead = {
    leadId: `responsible-test-${Date.now()}`,
    type: req.body?.type || 'human_handoff',
    typeLabel: req.body?.typeLabel || 'Cliente quer falar com atendente',
    fullName: req.body?.patientName || 'Paciente de Teste',
    contactPhone: sender.phoneNumber,
    procedureName: req.body?.procedureName || 'Endoscopia',
    preferredDate: req.body?.preferredDate || 'Nao informada',
    preferredTime: req.body?.preferredTime || 'Nao informado',
    notes: req.body?.notes || 'Teste enviado pelo painel administrativo.',
    insurance: req.body?.insurance || 'Nao informado',
  };

  try {
    const result = await notifyResponsibleAboutLead(sender, lead);
    if (result.error) {
      return res.status(result.error.statusCode || 500).json({
        ok: false,
        error: result.error.message || 'Falha ao enviar notificacao ao responsavel.',
        details: result.error.payload || null,
      });
    }

    return res.json({ ok: true, result, status: getWhatsAppStatus(req) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'Falha ao testar notificacao do responsavel.',
      details: error.payload || null,
    });
  }
});

app.post('/api/admin/whatsapp/test-doctor-notification', authRequired, adminRequired, async (req, res) => {
  const schedule = getSchedule();
  const appointment = sanitizeAppointment(
    {
      fullName: req.body?.fullName || 'Paciente de Teste',
      address: req.body?.address || 'Endereco interno',
      cpf: req.body?.cpf || '12345678901',
      date: req.body?.date || (schedule.availableDates[0] || dateKeyFromDate(new Date())),
      time: req.body?.time || '09:00',
      procedureName: req.body?.procedureName || 'Consulta',
      notes: req.body?.notes || 'Teste de notificacao',
      source: 'whatsapp',
      contactPhone: req.body?.contactPhone || '',
    },
    schedule.availableDates,
    schedule.availableTimeSlots,
    'doctor-notification-test'
  );

  if (!appointment) {
    return res.status(400).json({ error: 'Dados invalidos para teste da notificacao do medico.' });
  }

  const result = await notifyDoctorAboutAppointment(appointment);
  if (result.error) {
    return res.status(result.error.statusCode || 500).json({
      ok: false,
      error: result.error.message || 'Falha ao enviar notificacao ao medico.',
      details: result.error.payload || null,
    });
  }

  return res.json({ ok: true, result, status: getWhatsAppStatus(req) });
});

app.get('/api/admin/users', authRequired, adminRequired, (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(sanitizeUser);
  res.json(users);
});

app.post('/api/admin/users', authRequired, adminRequired, (req, res) => {
  const { username, password, role, displayName } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Preencha usuário, senha e nome de exibição.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername);
  if (existing) {
    return res.status(409).json({ error: 'Esse usuário já existe.' });
  }

  const user = {
    id: `user-${Date.now()}`,
    username: normalizedUsername,
    passwordHash: bcrypt.hashSync(String(password), 10),
    role: role === 'admin' ? 'admin' : 'staff',
    displayName: String(displayName).trim(),
    active: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.username, user.passwordHash, user.role, user.displayName, user.active, user.createdAt, user.updatedAt);

  writeAuditLog(req.auth, 'create_user', 'user', user.id, { username: user.username, role: user.role });
  return res.status(201).json({ user: sanitizeUser({ ...user, display_name: user.displayName }) });
});

app.patch('/api/admin/users/:id', authRequired, adminRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const nextDisplayName = req.body.displayName ? String(req.body.displayName).trim() : user.display_name;
  const nextRole = req.body.role === 'admin' ? 'admin' : req.body.role === 'staff' ? 'staff' : user.role;
  const nextActive = typeof req.body.active === 'boolean' ? (req.body.active ? 1 : 0) : user.active;
  const nextPasswordHash =
    req.body.password && String(req.body.password).length >= 6
      ? bcrypt.hashSync(String(req.body.password), 10)
      : user.password_hash;

  if (req.body.password && String(req.body.password).length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }
  if (user.id === req.auth.id && nextActive === 0) {
    return res.status(400).json({ error: 'VocÃª nÃ£o pode desativar o prÃ³prio acesso.' });
  }
  if (user.id === req.auth.id && nextRole !== 'admin') {
    return res.status(400).json({ error: 'VocÃª nÃ£o pode remover o prÃ³prio perfil de administrador.' });
  }
  if (user.role === 'admin' && (nextRole !== 'admin' || nextActive === 0)) {
    const activeAdminCount = db.prepare(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE role = 'admin' AND active = 1
    `).get().total || 0;

    if (activeAdminCount <= 1) {
      return res.status(400).json({ error: 'Mantenha pelo menos um administrador ativo no sistema.' });
    }
  }

  db.prepare(`
    UPDATE users
    SET display_name = ?, role = ?, active = ?, password_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(nextDisplayName, nextRole, nextActive, nextPasswordHash, nowIso(), user.id);

  writeAuditLog(req.auth, 'update_user', 'user', user.id, {
    role: nextRole,
    active: Boolean(nextActive),
    passwordChanged: Boolean(req.body.password),
  });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return res.json({ user: sanitizeUser(updated) });
});

app.put('/api/admin/site-content', authRequired, adminRequired, (req, res) => {
  const nextContent = { ...(req.body || {}) };
  delete nextContent.admin;
  setSiteContent(nextContent);
  writeAuditLog(req.auth, 'save_content', 'site_content', 'site_content', {
    sections: Object.keys(nextContent || {}),
  });
  return res.json({ ok: true });
});

app.put('/api/admin/schedule', authRequired, adminRequired, (req, res) => {
  const schedule = persistSchedule(req.body, req.auth);
  writeAuditLog(req.auth, 'save_schedule', 'schedule', 'main', {
    availableDates: schedule.availableDates.length,
    availableTimeSlots: Object.values(schedule.availableTimeSlots || {}).reduce((total, items) => total + items.length, 0),
    appointments: schedule.appointments.length,
  });
  return res.json({ ok: true, schedule });
});

app.post('/api/panel/appointments', authRequired, (req, res) => {
  try {
    const appointment = createPanelAppointment(req.body || {}, req.auth);
    return res.status(201).json({ ok: true, appointment, schedule: getSchedule() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao criar agendamento.' });
  }
});

app.patch('/api/panel/appointments/:id/status', authRequired, (req, res) => {
  try {
    const appointment = updatePanelAppointmentStatus(req.params.id, req.body?.status, req.auth);
    return res.json({ ok: true, appointment, schedule: getSchedule() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao atualizar status do agendamento.' });
  }
});

app.patch('/api/panel/appointments/:id/reschedule', authRequired, (req, res) => {
  try {
    const appointment = reschedulePanelAppointment(
      req.params.id,
      String(req.body?.date || '').trim(),
      normalizeTime(req.body?.time),
      req.auth
    );
    return res.json({ ok: true, appointment, schedule: getSchedule() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao remarcar agendamento.' });
  }
});

if (fs.existsSync(BUILD_INDEX_PATH)) {
  app.use('/admin', express.static(BUILD_DIR));
  app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
    res.sendFile(BUILD_INDEX_PATH);
  });
}

if (fs.existsSync(LP_BUILD_DIR)) {
  const serveLandingPage = express.static(LP_BUILD_DIR);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/admin' || req.path.startsWith('/admin/')) {
      return next();
    }
    return serveLandingPage(req, res, next);
  });

  app.get('/', (_req, res) => {
    res.sendFile(LP_BUILD_INDEX_PATH);
  });

  app.get(/^(?!\/(?:api|admin)(?:\/|$)).*/, (_req, res) => {
    res.sendFile(LP_BUILD_INDEX_PATH);
  });
}

temporaryWhatsAppQrBot = startTemporaryWhatsAppQrBot({
  enabled: WHATSAPP_TEMPORARY_QR_ENABLED,
  dataDir: DATA_DIR,
  processIncomingMessage: processIncomingWhatsAppMessage,
  onStatusChange: (status) => {
    temporaryWhatsAppQrStatus = status;
  },
  logger: console,
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  if (WHATSAPP_TEMPORARY_QR_ENABLED) {
    console.log('Bot temporario por QR ativado. Aguarde o QR code no terminal.');
  }
});


