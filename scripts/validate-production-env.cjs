const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2] || '.env.production.local';
const resolvedPath = path.resolve(process.cwd(), targetPath);

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return accumulator;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) return accumulator;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    accumulator[key] = value;
    return accumulator;
  }, {});
}

function isPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith('cole_')
    || normalized.startsWith('defina-')
    || normalized === 'troque-esta-chave-antes-de-publicar'
    || normalized === 'cole_uma_chave_longa_e_aleatoria_aqui'
    || normalized === 'cole_uma_senha_forte_do_admin'
    || normalized === 'cole_uma_senha_forte_da_secretaria'
  );
}

function logSection(title) {
  console.log(`\n${title}`);
}

if (!fs.existsSync(resolvedPath)) {
  console.error(`Arquivo nao encontrado: ${resolvedPath}`);
  process.exit(1);
}

const env = parseEnvFile(resolvedPath);
const errors = [];
const warnings = [];

const requiredCore = [
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'STAFF_PASSWORD',
  'PUBLIC_BASE_URL',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_APP_SECRET',
];

requiredCore.forEach((key) => {
  if (isPlaceholder(env[key])) {
    errors.push(`${key} esta ausente ou com placeholder.`);
  }
});

if (env.PUBLIC_BASE_URL && !/^https:\/\//i.test(env.PUBLIC_BASE_URL)) {
  errors.push('PUBLIC_BASE_URL precisa usar HTTPS.');
}

if (!isPlaceholder(env.JWT_SECRET) && String(env.JWT_SECRET).trim().length < 24) {
  errors.push('JWT_SECRET precisa ter pelo menos 24 caracteres.');
}

const doctorReady = !isPlaceholder(env.WHATSAPP_DOCTOR_PHONE)
  && (!isPlaceholder(env.WHATSAPP_DOCTOR_TEMPLATE_NAME) || String(env.WHATSAPP_DOCTOR_FALLBACK_TEXT_ENABLED).trim() === 'true');
if (!doctorReady) {
  warnings.push('Notificacao automatica do medico ainda nao esta pronta.');
}

const patientReminderReady = (
  !isPlaceholder(env.WHATSAPP_PATIENT_REMINDER_TEMPLATE_NAME)
  && !isPlaceholder(env.WHATSAPP_PATIENT_SAME_DAY_TEMPLATE_NAME)
) || String(env.WHATSAPP_PATIENT_FALLBACK_TEXT_ENABLED).trim() === 'true';
if (!patientReminderReady) {
  warnings.push('Lembretes automaticos de pacientes ainda nao estao completos.');
}

console.log(`Validando: ${resolvedPath}`);

logSection('Resumo');
console.log(`Erros: ${errors.length}`);
console.log(`Avisos: ${warnings.length}`);

if (errors.length) {
  logSection('Erros');
  errors.forEach((item) => console.log(`- ${item}`));
}

if (warnings.length) {
  logSection('Avisos');
  warnings.forEach((item) => console.log(`- ${item}`));
}

logSection('Status');
console.log(`- Core Meta pronto: ${errors.length === 0 ? 'SIM' : 'NAO'}`);
console.log(`- Automacao do medico pronta: ${doctorReady ? 'SIM' : 'NAO'}`);
console.log(`- Lembretes de pacientes prontos: ${patientReminderReady ? 'SIM' : 'NAO'}`);

if (errors.length) {
  process.exit(1);
}
