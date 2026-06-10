import React, { useEffect, useMemo, useRef, useState } from 'react';
import { defaultSiteContent } from '../content/defaultSiteContent';
import { useSiteContent } from '../content/SiteContentContext';

function cloneContent(content) {
  return JSON.parse(JSON.stringify(content));
}

function setAtPath(obj, path, value) {
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let current = next;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] };
    current = current[key];
  }

  current[path[path.length - 1]] = value;
  return next;
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function normalizeTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : '';
}

function formatDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sortTimes(values) {
  return [...new Set(values.map(normalizeTime).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function formatDateLabel(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTimeLabel(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDateKey(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateRange(startDate, endDate) {
  return `${startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

function buildPeriodSummary(label, startDate, endDate, appointments, availableTimeSlots) {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const periodAppointments = appointments.filter((item) => item.date >= startKey && item.date <= endKey);
  const activeAppointments = periodAppointments.filter((item) => item.status !== 'cancelado');
  const availableSlots = Object.entries(availableTimeSlots || {}).reduce((total, [date, slots]) => {
    if (date < startKey || date > endKey) return total;
    return total + (Array.isArray(slots) ? slots.length : 0);
  }, 0);
  const uniquePatients = new Set(periodAppointments.map((item) => normalizeCpf(item.cpf)).filter(Boolean)).size;
  const countStatus = (status) => periodAppointments.filter((item) => item.status === status).length;

  return {
    label,
    range: formatDateRange(startDate, endDate),
    total: periodAppointments.length,
    active: activeAppointments.length,
    completed: countStatus('concluido'),
    confirmed: countStatus('confirmado'),
    scheduled: countStatus('agendado'),
    canceled: countStatus('cancelado'),
    uniquePatients,
    availableSlots,
    occupancy: availableSlots > 0 ? Math.round((activeAppointments.length / availableSlots) * 100) : 0,
    whatsapp: periodAppointments.filter((item) => item.source === 'whatsapp').length,
  };
}

function buildPerformanceSummaries(appointments, availableTimeSlots, todayDate) {
  const today = parseDateKey(todayDate);
  const weekDay = today.getDay();
  const weekStart = addDays(today, weekDay === 0 ? -6 : 1 - weekDay);
  const weekEnd = addDays(weekStart, 6);
  const monthStartDate = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12);
  const fortnightStart = today.getDate() <= 15
    ? monthStartDate
    : new Date(today.getFullYear(), today.getMonth(), 16, 12);
  const fortnightEnd = today.getDate() <= 15
    ? new Date(today.getFullYear(), today.getMonth(), 15, 12)
    : monthEndDate;

  return [
    buildPeriodSummary('Semana', weekStart, weekEnd, appointments, availableTimeSlots),
    buildPeriodSummary('Quinzena', fortnightStart, fortnightEnd, appointments, availableTimeSlots),
    buildPeriodSummary('Mês', monthStartDate, monthEndDate, appointments, availableTimeSlots),
  ];
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameMonth(a, b) {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function monthDays(date) {
  const first = monthStart(date);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const days = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    days.push(current);
  }
  return days;
}

function sortDates(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function getEditableTimeOptions(dateString, appointment, freeTimeSlotsByDate) {
  if (!dateString) return [];
  const currentTime = appointment?.date === dateString && appointment?.time ? [appointment.time] : [];
  return sortTimes([...(freeTimeSlotsByDate[dateString] || []), ...currentTime]);
}

const medicalTypeOptions = [
  { key: 'consulta', label: 'Consulta', color: '#0EA5E9', background: '#E0F2FE' },
  { key: 'exame', label: 'Exame', color: '#F59E0B', background: '#FEF3C7' },
  { key: 'procedimento', label: 'Procedimento', color: '#8B5CF6', background: '#EDE9FE' },
];

function inferAppointmentType(appointment = {}) {
  const text = [appointment.procedureName, appointment.notes].join(' ').toLowerCase();
  if (/(endoscopia|colonoscopia|exame|ultrassom|bioimpedancia)/i.test(text)) return medicalTypeOptions[1];
  if (/(cirurgia|procedimento|orçamento|orcamento)/i.test(text)) return medicalTypeOptions[2];
  return medicalTypeOptions[0];
}

function getStatusPalette(status) {
  if (status === 'cancelado') return { label: 'Cancelado', color: '#EF4444', background: '#FEE2E2', border: '#FECACA' };
  if (status === 'confirmado' || status === 'concluido') return { label: status === 'concluido' ? 'Concluído' : 'Confirmado', color: '#16A34A', background: '#DCFCE7', border: '#BBF7D0' };
  return { label: status || 'Pendente', color: '#64748B', background: '#F1F5F9', border: '#E2E8F0' };
}

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

function toggleDateInSchedule(schedule, dateString) {
  const exists = schedule.availableDates.includes(dateString);
  const nextDates = exists ? schedule.availableDates.filter((item) => item !== dateString) : sortDates([...schedule.availableDates, dateString]);
  const nextAppointments = schedule.appointments.filter((item) => item.archivedAt || item.status === 'cancelado' || nextDates.includes(item.date));
  const nextAvailableTimeSlots = { ...(schedule.availableTimeSlots || {}) };

  if (exists) {
    delete nextAvailableTimeSlots[dateString];
  } else {
    nextAvailableTimeSlots[dateString] = sortTimes([...(nextAvailableTimeSlots[dateString] || []), ...DEFAULT_TIME_SLOTS]);
  }

  return {
    ...schedule,
    availableDates: nextDates,
    availableTimeSlots: nextAvailableTimeSlots,
    appointments: nextAppointments,
  };
}

function baseInputStyle() {
  return {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    color: '#0F172A',
    borderRadius: '12px',
    padding: '12px 14px',
    fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
    fontSize: '14px',
    lineHeight: 1.6,
    outline: 'none',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  };
}

function Field({ label, value, onChange, multiline = false, placeholder, type = 'text', disabled = false, autoFocus = false, onKeyDown }) {
  const sharedStyle = {
    ...baseInputStyle(),
    opacity: disabled ? 0.55 : 1,
  };

  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#64748B',
          marginBottom: '8px',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={4}
          disabled={disabled}
          style={{ ...sharedStyle, resize: 'vertical', minHeight: '110px' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          style={sharedStyle}
        />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#64748B',
          marginBottom: '8px',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{
          ...baseInputStyle(),
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionCard({ id, title, eyebrow, description, children, style }) {
  return (
    <section
      id={id}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '28px',
        marginBottom: '24px',
        boxShadow: '0 18px 48px rgba(15,23,42,0.07)',
        ...style,
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        {eyebrow ? (
          <div style={{ color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '11px', marginBottom: '8px', fontWeight: 800 }}>
            {eyebrow}
          </div>
        ) : null}
        <h2 style={{ margin: 0, fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 'clamp(24px, 3vw, 34px)', color: '#0F172A', letterSpacing: 0 }}>
          {title}
        </h2>
        {description ? <p style={{ margin: '10px 0 0', color: '#64748B', lineHeight: 1.7 }}>{description}</p> : null}
      </div>
      <div style={{ display: 'grid', gap: '18px' }}>{children}</div>
    </section>
  );
}

function Row({ children, minWidth = 220, style }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: '16px', ...style }}>{children}</div>;
}

function ActionButton({ children, onClick, variant = 'outline', type = 'button', disabled = false, stretch = false, style }) {
  const [isHovered, setIsHovered] = useState(false);
  const palette =
    variant === 'primary'
      ? { background: '#0EA5E9', color: '#FFFFFF', border: '1px solid #0EA5E9', hoverBackground: '#0284C7', hoverColor: '#FFFFFF', hoverBorder: '#0284C7', hoverShadow: '0 14px 28px rgba(14,165,233,0.24)' }
      : variant === 'danger'
        ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', hoverBackground: '#FEE2E2', hoverColor: '#B91C1C', hoverBorder: '#FCA5A5', hoverShadow: '0 12px 24px rgba(239,68,68,0.12)' }
        : { background: '#FFFFFF', color: '#334155', border: '1px solid #CBD5E1', hoverBackground: '#F8FAFC', hoverColor: '#0F172A', hoverBorder: '#94A3B8', hoverShadow: '0 12px 24px rgba(15,23,42,0.08)' };

  const hoverStyles = !disabled && isHovered
    ? {
      background: palette.hoverBackground,
      color: palette.hoverColor,
      border: `1px solid ${palette.hoverBorder}`,
      transform: 'translateY(-1px)',
      boxShadow: palette.hoverShadow,
    }
    : {};

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ ...palette, ...hoverStyles, borderRadius: '12px', padding: '12px 18px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 800, width: stretch ? '100%' : 'auto', transition: 'background 180ms ease, color 180ms ease, border 180ms ease, transform 180ms ease, box-shadow 180ms ease', ...style }}
    >
      {children}
    </button>
  );
}

function SectionMenuLink({ href, label }) {
  return (
    <a
      href={href}
      style={{
        textDecoration: 'none',
        borderRadius: '12px',
        padding: '11px 14px',
        color: '#334155',
        border: '1px solid #E2E8F0',
        background: '#FFFFFF',
        fontSize: '13px',
        lineHeight: 1.2,
        fontWeight: 700,
      }}
    >
      {label}
    </a>
  );
}

function QuickActionCard({ title, description, children }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: '18px', padding: '18px', border: '1px solid #E2E8F0', display: 'grid', gap: '12px' }}>
      <div>
        <strong style={{ display: 'block', fontSize: '17px', marginBottom: '6px', color: '#0F172A' }}>{title}</strong>
        <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>{description}</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function ItemCard({ title, children, onRemove }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <strong style={{ color: '#0F172A', fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>{title}</strong>
        {onRemove ? <ActionButton variant="danger" onClick={onRemove}>Remover</ActionButton> : null}
      </div>
      <div style={{ display: 'grid', gap: '14px' }}>{children}</div>
    </div>
  );
}

function UploadField({ label, value, onChange }) {
  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Field label={`${label} (URL ou base64)`} value={value} onChange={onChange} multiline />
      <div style={{ marginTop: '10px' }}>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>
      {value ? <div style={{ marginTop: '14px' }}><img src={value} alt={label} style={{ width: '100%', maxWidth: '260px', borderRadius: '16px', border: '1px solid #BAE6FD', boxShadow: '0 18px 34px rgba(0,0,0,0.24)' }} /></div> : null}
    </div>
  );
}

function CalendarLegend() {
  return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#64748B', fontSize: '13px' }}>{medicalTypeOptions.map((item) => <span key={item.key} style={{ borderRadius: '999px', padding: '7px 10px', background: item.background, color: item.color, fontWeight: 800 }}>{item.label}</span>)}<span style={{ borderRadius: '999px', padding: '7px 10px', background: '#DCFCE7', color: '#16A34A', fontWeight: 800 }}>Confirmado</span><span style={{ borderRadius: '999px', padding: '7px 10px', background: '#FEE2E2', color: '#DC2626', fontWeight: 800 }}>Cancelado</span></div>;
}

function UserStatusPill({ active, role }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ borderRadius: '999px', padding: '7px 11px', background: role === 'admin' ? '#E0F2FE' : '#E2E8F0', color: role === 'admin' ? '#C9F6FF' : '#FFFFFF', fontSize: '12px' }}>{role === 'admin' ? 'Admin' : 'Equipe'}</span>
      <span style={{ borderRadius: '999px', padding: '7px 11px', background: active ? '#DCFCE7' : '#FEE2E2', color: active ? '#BEEFFF' : '#E7B1B1', fontSize: '12px' }}>{active ? 'Ativo' : 'Inativo'}</span>
    </div>
  );
}

function SourcePill({ source }) {
  const palette = source === 'whatsapp'
    ? { background: '#DCFCE7', color: '#BEEFFF' }
    : { background: '#E0F2FE', color: '#C9F6FF' };

  return (
    <span style={{ borderRadius: '999px', padding: '7px 11px', background: palette.background, color: palette.color, fontSize: '12px' }}>
      {source === 'whatsapp' ? 'WhatsApp' : 'Painel'}
    </span>
  );
}

function StatCard({ label, value, tone = 'gold' }) {
  const tones = {
    gold: { background: '#E0F2FE', border: '#BAE6FD', color: '#0284C7' },
    green: { background: '#DCFCE7', border: '#BBF7D0', color: '#16A34A' },
    white: { background: '#F8FAFC', border: '#E2E8F0', color: '#334155' },
  };
  const palette = tones[tone] || tones.gold;

  return (
    <div style={{ background: palette.background, border: `1px solid ${palette.border}`, borderRadius: '18px', padding: '18px', minHeight: '118px', display: 'grid', alignContent: 'space-between' }}>
      <div style={{ color: '#64748B', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 800 }}>
        {label}
      </div>
      <strong style={{ color: palette.color, fontSize: '32px', fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", fontWeight: 900 }}>
        {value}
      </strong>
    </div>
  );
}

function PeriodSummaryCard({ period }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '18px', display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ display: 'block', fontSize: '18px', marginBottom: '4px' }}>{period.label}</strong>
          <span style={{ color: '#64748B', fontSize: '13px' }}>{period.range}</span>
        </div>
        <span style={{ borderRadius: '8px', padding: '8px 10px', background: '#E0F2FE', color: '#D9F7FF', fontSize: '12px' }}>
          {period.occupancy}% ocupação
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
        <div><strong style={{ color: '#D9F7FF', fontSize: '24px' }}>{period.total}</strong><div style={{ color: '#94A3B8', fontSize: '12px' }}>agendamentos</div></div>
        <div><strong style={{ color: '#BEEFFF', fontSize: '24px' }}>{period.completed}</strong><div style={{ color: '#94A3B8', fontSize: '12px' }}>realizados</div></div>
        <div><strong style={{ color: '#FFFFFF', fontSize: '20px' }}>{period.confirmed}</strong><div style={{ color: '#94A3B8', fontSize: '12px' }}>confirmados</div></div>
        <div><strong style={{ color: '#E7B1B1', fontSize: '20px' }}>{period.canceled}</strong><div style={{ color: '#94A3B8', fontSize: '12px' }}>cancelados</div></div>
      </div>

      <div style={{ display: 'grid', gap: '6px', color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>
        <div><strong>Pacientes únicos:</strong> {period.uniquePatients}</div>
        <div><strong>Vagas liberadas:</strong> {period.availableSlots}</div>
        <div><strong>Via WhatsApp:</strong> {period.whatsapp}</div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const {
    siteContent,
    loading,
    login,
    logout,
    currentUser,
    users,
    dashboard,
    whatsAppStatus,
    patientHistory,
    saveContent,
    resetContent,
    saveSchedule,
    createAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
    changeOwnPassword,
    createUser,
    updateUser,
    downloadBackup,
    simulateWhatsAppInbound,
    sendWhatsAppTestMessage,
    updateWhatsAppResponsible,
    testResponsibleWhatsAppNotification,
    testDoctorWhatsAppNotification,
    runSystemCheck,
    refreshPatientHistory,
    runRetentionMaintenance,
    downloadArchiveFile,
    refreshAll,
    refreshSchedule,
  } = useSiteContent();

  const [draft, setDraft] = useState(() => cloneContent(siteContent));
  const [loginForm, setLoginForm] = useState({ username: 'willian', password: '' });
  const [appointmentForm, setAppointmentForm] = useState({ fullName: '', address: '', cpf: '', date: '', time: '', procedureName: '', notes: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [userForm, setUserForm] = useState({ displayName: '', username: '', password: '', role: 'staff' });
  const [slotEditor, setSlotEditor] = useState({ date: '', time: '' });
  const [whatsAppSimulationForm, setWhatsAppSimulationForm] = useState({
    from: '5599999999999',
    profileName: 'Paciente WhatsApp',
    text: 'AGENDAR',
  });
  const [whatsAppOutboundForm, setWhatsAppOutboundForm] = useState({
    to: '5599999999999',
    text: 'Mensagem de teste enviada pelo painel.',
  });
  const [whatsAppResponsibleForm, setWhatsAppResponsibleForm] = useState({
    name: '',
    phone: '',
  });
  const [doctorNotificationForm, setDoctorNotificationForm] = useState({
    fullName: 'Paciente de Teste',
    cpf: '12345678901',
    date: '',
    time: '09:00',
    procedureName: 'Consulta',
  });
  const [userEdits, setUserEdits] = useState({});
  const [slotReleaseType, setSlotReleaseType] = useState('consulta');
  const [systemDate, setSystemDate] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(new Date()));
  const autoFollowSystemMonth = useRef(true);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('');
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [systemCheckReport, setSystemCheckReport] = useState(null);
  const [systemCheckModalOpen, setSystemCheckModalOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentDetailsOpen, setAppointmentDetailsOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [appointmentEditOpen, setAppointmentEditOpen] = useState(false);
  const [appointmentEditForm, setAppointmentEditForm] = useState({ date: '', time: '' });
  const [lastConfirmation, setLastConfirmation] = useState('');
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const isAdmin = currentUser?.role === 'admin';
  const dashboardUrl = useMemo(() => `${window.location.origin}/`, []);
  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth < 1100;
  const sectionPadding = isMobile ? '20px' : '28px';
  const pagePadding = isMobile ? '14px' : '24px';
  const calendarCellMinHeight = isMobile ? '64px' : '78px';
  const calendarGap = isMobile ? '6px' : '8px';
  const compactButtonStyle = isMobile ? { width: '100%' } : null;
  const adminScheduleOnly = isAdmin;

  useEffect(() => {
    setDraft(cloneContent(siteContent));
  }, [siteContent]);

  useEffect(() => {
    setWhatsAppResponsibleForm({
      name: whatsAppStatus?.responsibleName || '',
      phone: whatsAppStatus?.responsiblePhone || '',
    });
  }, [whatsAppStatus?.responsibleName, whatsAppStatus?.responsiblePhone]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const refreshSystemDate = () => {
      const nextDate = new Date();
      setSystemDate(nextDate);
      if (autoFollowSystemMonth.current) {
        setCalendarMonth(monthStart(nextDate));
      }
    };

    refreshSystemDate();
    const interval = window.setInterval(refreshSystemDate, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedCalendarDate((previous) => {
      if (previous && siteContent.admin.availableDates.includes(previous)) return previous;
      return siteContent.admin.availableDates[0] || '';
    });
  }, [siteContent.admin.availableDates]);

  useEffect(() => {
    setUserEdits(users.reduce((accumulator, user) => {
      accumulator[user.id] = { displayName: user.displayName, role: user.role, active: user.active, password: '' };
      return accumulator;
    }, {}));
  }, [users]);

  useEffect(() => {
    closeAppointmentEditor();
  }, [selectedPatientId]);

  const flashNotice = (type, message) => setNotice({ type, message });
  const updateDraft = (path, value) => setDraft((previous) => setAtPath(previous, path, value));
  const availableTimeSlots = draft.admin.availableTimeSlots || {};

  const saveScheduleOptimistically = async (nextSchedule, successMessage, rollbackSchedule = draft.admin, busy = 'schedule') => {
    setDraft((previous) => ({ ...previous, admin: nextSchedule }));
    setBusyKey(busy);
    try {
      await saveSchedule(nextSchedule);
      if (successMessage) flashNotice('success', successMessage);
      return true;
    } catch (error) {
      setDraft((previous) => ({ ...previous, admin: rollbackSchedule }));
      flashNotice('error', error.message);
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const toggleAvailableDate = async (dateString) => {
    if (!isAdmin || busyKey) return;

    const wasAvailable = draft.admin.availableDates.includes(dateString);
    const nextSchedule = toggleDateInSchedule(draft.admin, dateString);

    setDraft((previous) => ({ ...previous, admin: toggleDateInSchedule(previous.admin, dateString) }));

    setSelectedCalendarDate(dateString);
    setBusyKey('schedule');
    try {
      await saveSchedule(nextSchedule);
      flashNotice('success', wasAvailable ? 'Dia bloqueado e agenda salva automaticamente.' : 'Dia liberado e agenda salva automaticamente para a recepção.');
    } catch (error) {
      setDraft((previous) => ({ ...previous, admin: draft.admin }));
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const updateAppointment = async (id, field, value) => {
    if (!draft.admin.appointments.some((item) => item.id === id)) return;
    setBusyKey(`appointment-${id}`);
    try {
      await updateAppointmentStatus(id, value);
      flashNotice('success', 'Agendamento atualizado automaticamente.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const cancelAppointment = async (id) => {
    const appointment = draft.admin.appointments.find((item) => item.id === id);
    if (!appointment) return;
    const nextAppointments = draft.admin.appointments.map((item) => (
      item.id === id ? { ...item, status: 'cancelado', updatedAt: new Date().toISOString() } : item
    ));
    const saved = await saveScheduleOptimistically(
      { ...draft.admin, appointments: nextAppointments },
      'Agendamento cancelado e horário liberado automaticamente.',
      draft.admin,
      `appointment-${id}`
    );
    if (saved && selectedPatientId === id) setSelectedPatientId('');
  };

  const cancelAppointmentSecure = async (id) => {
    const appointment = draft.admin.appointments.find((item) => item.id === id);
    if (!appointment) return;
    setBusyKey(`appointment-${id}`);
    try {
      await updateAppointmentStatus(id, 'cancelado');
      flashNotice('success', 'Agendamento cancelado e horário liberado automaticamente.');
      if (selectedPatientId === id) setSelectedPatientId('');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const setAppointmentStatusSecure = async (id, status) => {
    if (!draft.admin.appointments.some((item) => item.id === id)) return;
    setBusyKey(`appointment-${id}`);
    try {
      await updateAppointmentStatus(id, status);
      flashNotice('success', 'Agendamento atualizado automaticamente.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const openAppointmentEditor = (appointment) => {
    if (!appointment) return;
    setAppointmentEditForm({ date: appointment.date, time: appointment.time || '' });
    setAppointmentEditOpen(true);
  };

  const closeAppointmentEditor = () => {
    setAppointmentEditOpen(false);
    setAppointmentEditForm({ date: '', time: '' });
  };

  const openAppointmentDetails = (id) => {
    const appointment = draft.admin.appointments.find((item) => item.id === id);
    if (!appointment) return;
    setSelectedPatientId(id);
    setAppointmentEditOpen(false);
    setAppointmentEditForm({ date: appointment.date, time: appointment.time || '' });
    jumpToDate(appointment.date);
  };

  const handleRescheduleAppointment = async () => {
    if (!selectedPatient || busyKey === `appointment-${selectedPatient.id}`) return;

    const nextDate = appointmentEditForm.date;
    const nextTime = normalizeTime(appointmentEditForm.time);

    if (!nextDate || !nextTime) {
      flashNotice('error', 'Selecione a nova data e o novo horário.');
      return;
    }
    if (!draft.admin.availableDates.includes(nextDate)) {
      flashNotice('error', 'A data escolhida não foi liberada pela administração.');
      return;
    }
    if (!(draft.admin.availableTimeSlots?.[nextDate] || []).includes(nextTime)) {
      flashNotice('error', 'O horário escolhido não está liberado pela administração.');
      return;
    }

    const duplicate = draft.admin.appointments.some((item) => (
      item.id !== selectedPatient.id &&
      item.date === nextDate &&
      item.time === nextTime &&
      item.status !== 'cancelado'
    ));
    if (duplicate) {
      flashNotice('error', 'Já existe outro paciente nesse horário.');
      return;
    }

    const nextAppointments = draft.admin.appointments.map((item) => (
      item.id === selectedPatient.id
        ? { ...item, date: nextDate, time: nextTime, updatedAt: new Date().toISOString() }
        : item
    ));
    const saved = await saveScheduleOptimistically(
      { ...draft.admin, appointments: nextAppointments },
      'Horário do paciente alterado com sucesso.',
      draft.admin,
      `appointment-${selectedPatient.id}`
    );

    if (saved) {
      setAppointmentEditOpen(false);
      jumpToDate(nextDate);
    }
  };

  const submitRescheduleAppointment = async () => {
    if (!selectedPatient || busyKey === `appointment-${selectedPatient.id}`) return;

    const nextDate = appointmentEditForm.date;
    const nextTime = normalizeTime(appointmentEditForm.time);

    if (!nextDate || !nextTime) {
      flashNotice('error', 'Selecione a nova data e o novo horário.');
      return;
    }
    if (!draft.admin.availableDates.includes(nextDate)) {
      flashNotice('error', 'A data escolhida não foi liberada pela administração.');
      return;
    }
    if (!(draft.admin.availableTimeSlots?.[nextDate] || []).includes(nextTime)) {
      flashNotice('error', 'O horário escolhido não está liberado pela administração.');
      return;
    }

    const duplicate = draft.admin.appointments.some((item) => (
      item.id !== selectedPatient.id &&
      item.date === nextDate &&
      item.time === nextTime &&
      item.status !== 'cancelado'
    ));
    if (duplicate) {
      flashNotice('error', 'Já existe outro paciente nesse horário.');
      return;
    }

    setBusyKey(`appointment-${selectedPatient.id}`);
    try {
      await rescheduleAppointment(selectedPatient.id, { date: nextDate, time: nextTime });
      flashNotice('success', 'Horário do paciente alterado com sucesso.');
      setAppointmentEditOpen(false);
      jumpToDate(nextDate);
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const addTimeSlotToDate = async (dateString, timeValue) => {
    const normalizedTime = normalizeTime(timeValue);
    if (!dateString || !normalizedTime) {
      flashNotice('error', 'Selecione uma data e informe um horário válido.');
      return;
    }

    const nextSlots = sortTimes([...(draft.admin.availableTimeSlots?.[dateString] || []), normalizedTime]);
    const nextDates = draft.admin.availableDates.includes(dateString)
      ? draft.admin.availableDates
      : sortDates([...draft.admin.availableDates, dateString]);
    const nextSchedule = {
      ...draft.admin,
      availableDates: nextDates,
      availableTimeSlots: {
        ...(draft.admin.availableTimeSlots || {}),
        [dateString]: nextSlots,
      },
    };

    const releaseLabel = medicalTypeOptions.find((item) => item.key === slotReleaseType)?.label || 'horário';
    const saved = await saveScheduleOptimistically(nextSchedule, `Horário para ${releaseLabel.toLowerCase()} salvo automaticamente para a recepção e WhatsApp.`, draft.admin);
    if (saved) setSlotEditor((previous) => ({ ...previous, time: '' }));
  };

  const removeTimeSlotFromDate = async (dateString, timeValue) => {
    const hasAppointment = draft.admin.appointments.some(
      (item) => item.date === dateString && item.time === timeValue && item.status !== 'cancelado'
    );
    if (hasAppointment) {
      flashNotice('error', 'Não é possível remover um horário que já possui paciente agendado.');
      return;
    }

    const nextSchedule = {
      ...draft.admin,
      availableTimeSlots: {
        ...(draft.admin.availableTimeSlots || {}),
        [dateString]: (draft.admin.availableTimeSlots?.[dateString] || []).filter((item) => item !== timeValue),
      },
    };

    const saved = await saveScheduleOptimistically(nextSchedule, 'Horário removido automaticamente.', draft.admin);
    if (saved) {
      setAppointmentForm((previous) => (
        previous.date === dateString && previous.time === timeValue
          ? { ...previous, time: '' }
          : previous
      ));
    }
  };
  const closeAppointmentModal = () => {
    setAppointmentModalOpen(false);
    setAppointmentDetailsOpen(false);
    setAppointmentForm({ fullName: '', address: '', cpf: '', date: '', time: '', procedureName: '', notes: '' });
  };

  const openAppointmentModal = (dateString, timeValue = '') => {
    if (!dateString) return;
    const freeTimes = freeTimeSlotsByDate[dateString] || [];
    jumpToDate(dateString);
    setAppointmentForm((previous) => ({
      ...previous,
      date: dateString,
      time: timeValue || freeTimes[0] || '',
    }));
    setAppointmentDetailsOpen(false);
    setAppointmentModalOpen(true);
  };

  const handleAddAppointment = async () => {
    if (busyKey === 'appointment') return;
    const normalizedCpf = normalizeCpf(appointmentForm.cpf);

    if (!appointmentForm.fullName.trim() || !appointmentForm.address.trim() || !normalizedCpf || !appointmentForm.date || !appointmentForm.time) {
      flashNotice('error', 'Preencha nome completo, endereço, CPF, data e horário.');
      return;
    }
    if (normalizedCpf.length !== 11) {
      flashNotice('error', 'O CPF precisa ter 11 dígitos.');
      return;
    }
    if (!draft.admin.availableDates.includes(appointmentForm.date)) {
      flashNotice('error', 'A data escolhida não foi liberada pela administração.');
      return;
    }
    if (!(draft.admin.availableTimeSlots?.[appointmentForm.date] || []).includes(appointmentForm.time)) {
      flashNotice('error', 'O horário escolhido não está liberado pela administração.');
      return;
    }

    const duplicate = draft.admin.appointments.some((item) => item.date === appointmentForm.date && item.time === appointmentForm.time && item.status !== 'cancelado');
    if (duplicate) {
      flashNotice('error', 'Já existe um agendamento ativo nesse horário.');
      return;
    }

    const newAppointment = {
      id: `appt-${Date.now()}`,
      fullName: appointmentForm.fullName.trim(),
      address: appointmentForm.address.trim(),
      cpf: formatCpf(normalizedCpf),
      date: appointmentForm.date,
      time: appointmentForm.time,
      status: 'agendado',
      procedureName: appointmentForm.procedureName.trim(),
      notes: appointmentForm.notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'panel',
    };
    const nextSchedule = {
      ...draft.admin,
      appointments: [...draft.admin.appointments, newAppointment],
    };

    setBusyKey('appointment');
    setDraft((previous) => ({
      ...previous,
      admin: {
        ...previous.admin,
        appointments: [...previous.admin.appointments, newAppointment],
      },
    }));

    try {
      await saveSchedule(nextSchedule);
      const confirmation = `Olá, ${newAppointment.fullName}. Seu atendimento com Willian Holanda foi agendado para ${formatDateLabel(newAppointment.date)} às ${newAppointment.time}.`;
      setLastConfirmation(confirmation);
      flashNotice('success', 'Agendamento salvo e agenda atualizada para todos os painéis.');
      closeAppointmentModal();
    } catch (error) {
      setDraft((previous) => ({
        ...previous,
        admin: {
          ...previous.admin,
          appointments: previous.admin.appointments.filter((item) => item.id !== newAppointment.id),
        },
      }));
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const submitAppointment = async () => {
    if (busyKey === 'appointment') return;
    const normalizedCpf = normalizeCpf(appointmentForm.cpf);

    if (!appointmentForm.fullName.trim() || !appointmentForm.address.trim() || !normalizedCpf || !appointmentForm.date || !appointmentForm.time) {
      flashNotice('error', 'Preencha nome completo, endereço, CPF, data e horário.');
      return;
    }
    if (normalizedCpf.length !== 11) {
      flashNotice('error', 'O CPF precisa ter 11 dígitos.');
      return;
    }
    if (!draft.admin.availableDates.includes(appointmentForm.date)) {
      flashNotice('error', 'A data escolhida não foi liberada pela administração.');
      return;
    }
    if (!(draft.admin.availableTimeSlots?.[appointmentForm.date] || []).includes(appointmentForm.time)) {
      flashNotice('error', 'O horário escolhido não está liberado pela administração.');
      return;
    }

    const duplicate = draft.admin.appointments.some((item) => item.date === appointmentForm.date && item.time === appointmentForm.time && item.status !== 'cancelado');
    if (duplicate) {
      flashNotice('error', 'Já existe um agendamento ativo nesse horário.');
      return;
    }

    const newAppointment = {
      fullName: appointmentForm.fullName.trim(),
      address: appointmentForm.address.trim(),
      cpf: formatCpf(normalizedCpf),
      date: appointmentForm.date,
      time: appointmentForm.time,
      procedureName: appointmentForm.procedureName.trim(),
      notes: appointmentForm.notes.trim(),
      source: 'panel',
    };

    setBusyKey('appointment');
    try {
      const createdAppointment = await createAppointment(newAppointment);
      const confirmation = `Olá, ${newAppointment.fullName}. Seu atendimento com Willian Holanda foi agendado para ${formatDateLabel(newAppointment.date)} às ${newAppointment.time}.`;
      setLastConfirmation(confirmation);
      flashNotice('success', 'Agendamento salvo e agenda atualizada para todos os painéis.');
      if (createdAppointment?.id) {
        setSelectedPatientId(createdAppointment.id);
      }
      closeAppointmentModal();
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleAppointmentKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitAppointment();
  };

  const copyLastConfirmation = async () => {
    if (!lastConfirmation) return;
    try {
      await navigator.clipboard.writeText(lastConfirmation);
      flashNotice('success', 'Confirmação copiada.');
    } catch (_error) {
      flashNotice('error', 'Não foi possível copiar automaticamente.');
    }
  };

  const appointmentsByDate = useMemo(() => [...draft.admin.appointments].sort((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) return dateComparison;
    const timeComparison = (a.time || '').localeCompare(b.time || '');
    if (timeComparison !== 0) return timeComparison;
    return a.fullName.localeCompare(b.fullName);
  }), [draft.admin.appointments]);
  const selectedPatient = useMemo(
    () => draft.admin.appointments.find((item) => item.id === selectedPatientId) || null,
    [draft.admin.appointments, selectedPatientId]
  );

  const monthGrid = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const occupiedSlotsByDate = useMemo(
    () => draft.admin.appointments.reduce((accumulator, item) => {
      if (item.status === 'cancelado' || !item.time) return accumulator;
      accumulator[item.date] = accumulator[item.date] || [];
      accumulator[item.date].push(item.time);
      return accumulator;
    }, {}),
    [draft.admin.appointments]
  );
  const freeTimeSlotsByDate = useMemo(
    () => draft.admin.availableDates.reduce((accumulator, date) => {
      const occupied = new Set(occupiedSlotsByDate[date] || []);
      accumulator[date] = sortTimes((availableTimeSlots[date] || []).filter((time) => !occupied.has(time)));
      return accumulator;
    }, {}),
    [draft.admin.availableDates, availableTimeSlots, occupiedSlotsByDate]
  );
  const receptionistAvailableDates = useMemo(
    () => draft.admin.availableDates.filter((date) => (freeTimeSlotsByDate[date] || []).length > 0),
    [draft.admin.availableDates, freeTimeSlotsByDate]
  );
  const upcomingHighlights = useMemo(() => receptionistAvailableDates.slice(0, 8), [receptionistAvailableDates]);
  const nextSlotsPreview = useMemo(
    () => receptionistAvailableDates.slice(0, 3).map((date) => ({
      date,
      times: (freeTimeSlotsByDate[date] || []).slice(0, 3),
      count: (freeTimeSlotsByDate[date] || []).length,
    })),
    [receptionistAvailableDates, freeTimeSlotsByDate]
  );
  const nextAvailableDate = receptionistAvailableDates[0] || '';
  const todayDate = useMemo(() => formatDateKey(systemDate), [systemDate]);
  const selectedDateSlots = availableTimeSlots[selectedCalendarDate] || [];
  const selectedDateFreeSlots = freeTimeSlotsByDate[selectedCalendarDate] || [];
  const selectedDateOccupiedSlots = selectedDateSlots.filter((time) => !selectedDateFreeSlots.includes(time));
  const selectedDateIsAvailable = draft.admin.availableDates.includes(selectedCalendarDate);
  const selectedDateIsFull = selectedDateIsAvailable && selectedDateSlots.length > 0 && selectedDateFreeSlots.length === 0;
  const selectedDateAppointments = useMemo(
    () => appointmentsByDate.filter((item) => item.date === selectedCalendarDate && item.status !== 'cancelado'),
    [appointmentsByDate, selectedCalendarDate]
  );
  const activeOperationalAppointments = useMemo(
    () => appointmentsByDate.filter((item) => item.status !== 'cancelado' && !item.archivedAt),
    [appointmentsByDate]
  );
  const datesWithoutSlots = draft.admin.availableDates.filter((date) => (availableTimeSlots[date] || []).length === 0);
  const appointmentTimeOptions = appointmentForm.date ? (freeTimeSlotsByDate[appointmentForm.date] || []) : [];
  const appointmentEditDateOptions = useMemo(() => {
    if (!selectedPatient) return [];
    return sortDates([
      ...draft.admin.availableDates.filter((date) => (freeTimeSlotsByDate[date] || []).length > 0),
      selectedPatient.date,
    ]).map((date) => ({ value: date, label: formatDateLabel(date) }));
  }, [draft.admin.availableDates, freeTimeSlotsByDate, selectedPatient]);
  const appointmentEditTimeOptions = useMemo(
    () => getEditableTimeOptions(appointmentEditForm.date, selectedPatient, freeTimeSlotsByDate),
    [appointmentEditForm.date, freeTimeSlotsByDate, selectedPatient]
  );
  const summary = dashboard?.summary || {};
  const retention = patientHistory?.retention || {};
  const historyRecords = patientHistory?.records || [];
  const archiveFiles = patientHistory?.archiveFiles || [];
  const activeUsers = users.filter((user) => user.active);
  const inactiveUsers = users.filter((user) => !user.active);
  const adminUsers = users.filter((user) => user.role === 'admin');
  const adminSectionLinks = [
    { href: '#dashboard-admin', label: 'Dashboard' },
    { href: '#agenda-admin', label: 'Agenda' },
    { href: '#agenda-admin', label: 'Consultas' },
    { href: '#agenda-admin', label: 'Exames' },
    { href: '#agenda-admin', label: 'Procedimentos' },
    { href: '#pacientes-admin', label: 'Pacientes' },
    { href: '#financeiro-admin', label: 'Financeiro' },
    { href: '#whatsapp-admin', label: 'WhatsApp' },
    { href: '#historico-admin', label: 'Relatórios' },
    { href: '#acessos', label: 'Configurações' },
  ];
  useEffect(() => {
    if (appointmentForm.date && !(freeTimeSlotsByDate[appointmentForm.date] || []).includes(appointmentForm.time)) {
      setAppointmentForm((previous) => ({ ...previous, time: '' }));
    }
  }, [appointmentForm.date, appointmentForm.time, freeTimeSlotsByDate]);
  useEffect(() => {
    if (!appointmentForm.date) return;
    const options = freeTimeSlotsByDate[appointmentForm.date] || [];
    if (!appointmentForm.time && options.length > 0) {
      setAppointmentForm((previous) => ({ ...previous, time: options[0] }));
    }
  }, [appointmentForm.date, appointmentForm.time, freeTimeSlotsByDate]);
  useEffect(() => {
    if (doctorNotificationForm.date) return;
    if (!nextAvailableDate && !todayDate) return;
    setDoctorNotificationForm((previous) => ({
      ...previous,
      date: nextAvailableDate || todayDate,
    }));
  }, [doctorNotificationForm.date, nextAvailableDate, todayDate]);
  const auditLogs = dashboard?.auditLogs || [];
  const whatsAppEvents = whatsAppStatus?.recentEvents || [];
  const performanceSummaries = useMemo(
    () => buildPerformanceSummaries(appointmentsByDate, availableTimeSlots, todayDate),
    [appointmentsByDate, availableTimeSlots, todayDate]
  );
  const todayAppointments = useMemo(
    () => appointmentsByDate.filter((item) => item.date === todayDate && item.status !== 'cancelado'),
    [appointmentsByDate, todayDate]
  );
  const todayTypeCounts = useMemo(() => todayAppointments.reduce((accumulator, item) => {
    const appointmentType = inferAppointmentType(item).key;
    accumulator[appointmentType] = (accumulator[appointmentType] || 0) + 1;
    return accumulator;
  }, { consulta: 0, exame: 0, procedimento: 0 }), [todayAppointments]);
  const pendingAppointments = useMemo(
    () => appointmentsByDate.filter((item) => item.status !== 'cancelado' && item.status !== 'confirmado' && item.status !== 'concluido'),
    [appointmentsByDate]
  );
  const canceledAppointments = useMemo(
    () => appointmentsByDate.filter((item) => item.status === 'cancelado'),
    [appointmentsByDate]
  );
  const upcomingAppointments = useMemo(
    () => appointmentsByDate
      .filter((item) => item.status !== 'cancelado' && item.date >= todayDate)
      .slice(0, 5),
    [appointmentsByDate, todayDate]
  );
  const filteredAppointments = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    const operationalAppointments = appointmentsByDate.filter((item) => !item.archivedAt);
    if (!query) return operationalAppointments;
    const digits = normalizeCpf(query);
    return operationalAppointments.filter((item) => {
      const haystack = [
        item.fullName,
        item.cpf,
        item.address,
        item.date,
        item.time,
        item.procedureName,
        item.status,
      ].join(' ').toLowerCase();
      return haystack.includes(query) || (digits && normalizeCpf(item.cpf).includes(digits));
    });
  }, [appointmentsByDate, patientSearch]);
  const quickSlotPresets = DEFAULT_TIME_SLOTS;
  const quickActionDate = selectedCalendarDate || nextAvailableDate || todayDate;

  const jumpToDate = (dateString) => {
    if (!dateString) return;
    const targetDate = new Date(`${dateString}T12:00:00`);
    autoFollowSystemMonth.current = dateString === todayDate;
    setCalendarMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setSelectedCalendarDate(dateString);
  };

  const applyPresetSlotsToDate = async (dateString) => {
    if (!isAdmin || !dateString) return;
    const nextSlots = sortTimes([...(draft.admin.availableTimeSlots?.[dateString] || []), ...quickSlotPresets]);
    const nextDates = draft.admin.availableDates.includes(dateString)
      ? draft.admin.availableDates
      : sortDates([...draft.admin.availableDates, dateString]);
    const nextSchedule = {
      ...draft.admin,
      availableDates: nextDates,
      availableTimeSlots: {
        ...(draft.admin.availableTimeSlots || {}),
        [dateString]: nextSlots,
      },
    };

    await saveScheduleOptimistically(nextSchedule, `Horários padrão salvos em ${formatDateLabel(dateString)}.`, draft.admin);
    jumpToDate(dateString);
  };

  const prepareQuickAppointment = (dateString) => {
    if (!dateString) return;
    openAppointmentModal(dateString);
  };

  useEffect(() => {
    if (isAdmin || !currentUser) return;
    if (selectedCalendarDate && receptionistAvailableDates.includes(selectedCalendarDate)) return;
    if (nextAvailableDate) jumpToDate(nextAvailableDate);
  }, [currentUser, isAdmin, nextAvailableDate, receptionistAvailableDates, selectedCalendarDate]);

  useEffect(() => {
    if (isAdmin || !currentUser) return undefined;

    const refreshVisibleSchedule = () => {
      if (document.visibilityState === 'visible') {
        refreshSchedule().catch(() => {});
      }
    };

    const interval = window.setInterval(refreshVisibleSchedule, 4000);
    window.addEventListener('focus', refreshVisibleSchedule);
    document.addEventListener('visibilitychange', refreshVisibleSchedule);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleSchedule);
      document.removeEventListener('visibilitychange', refreshVisibleSchedule);
    };
  }, [currentUser, isAdmin, refreshSchedule]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const timeout = window.setTimeout(() => {
      refreshPatientHistory({
        query: historySearch,
        archived: historyFilter,
        limit: 250,
      }).catch(() => {});
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [currentUser, historySearch, historyFilter]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusyKey('login');
    try {
      await login(loginForm.username, loginForm.password);
      setLoginForm((previous) => ({ ...previous, password: '' }));
      flashNotice('success', 'Acesso liberado.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveSchedule = async () => {
    if (isAdmin && datesWithoutSlots.length > 0) {
      flashNotice('error', `Existe data liberada sem horário: ${datesWithoutSlots[0]}.`);
      return;
    }

    setBusyKey('schedule');
    try {
      await saveSchedule(draft.admin);
      flashNotice('success', isAdmin ? 'Agenda salva. A recepção já pode ver as datas com horários livres.' : 'Agenda salva no servidor com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveContent = async () => {
    setBusyKey('content');
    try {
      await saveContent(draft);
      flashNotice('success', 'Conteúdo do site salvo com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleReset = async () => {
    setBusyKey('reset');
    try {
      await resetContent();
      setDraft(cloneContent(defaultSiteContent));
      flashNotice('success', 'Conteúdo visual restaurado para o padrão do projeto.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      flashNotice('error', 'Preencha a senha atual e a nova senha.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      flashNotice('error', 'A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      flashNotice('error', 'A confirmação da nova senha não confere.');
      return;
    }

    setBusyKey('password');
    try {
      await changeOwnPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      flashNotice('success', 'Senha atualizada com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleCreateUser = async () => {
    if (!isAdmin) return;
    if (!userForm.displayName.trim() || !userForm.username.trim() || userForm.password.length < 6) {
      flashNotice('error', 'Preencha nome, usuário e uma senha com pelo menos 6 caracteres.');
      return;
    }

    setBusyKey('create-user');
    try {
      await createUser({ displayName: userForm.displayName.trim(), username: userForm.username.trim(), password: userForm.password, role: userForm.role });
      setUserForm({ displayName: '', username: '', password: '', role: 'staff' });
      flashNotice('success', 'Novo acesso criado para a equipe.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleUpdateUser = async (userId) => {
    if (!isAdmin) return;
    const edit = userEdits[userId];
    if (!edit) return;

    const payload = { displayName: edit.displayName.trim(), role: edit.role, active: edit.active };
    if (edit.password) payload.password = edit.password;

    setBusyKey(`user-${userId}`);
    try {
      await updateUser(userId, payload);
      setUserEdits((previous) => ({ ...previous, [userId]: { ...previous[userId], password: '' } }));
      flashNotice('success', 'Perfil atualizado com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleToggleUserAccess = async (user) => {
    if (!isAdmin) return;
    const edit = userEdits[user.id] || {};
    setBusyKey(`user-${user.id}`);
    try {
      await updateUser(user.id, {
        displayName: (edit.displayName || user.displayName).trim(),
        role: edit.role || user.role,
        active: !user.active,
      });
      flashNotice('success', user.active ? 'Acesso desativado com sucesso.' : 'Acesso reativado com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleBackupDownload = async () => {
    setBusyKey('backup');
    try {
      await downloadBackup();
      flashNotice('success', 'Backup exportado com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleRunRetentionMaintenance = async () => {
    if (!isAdmin) return;
    setBusyKey('retention');
    try {
      const result = await runRetentionMaintenance();
      flashNotice('success', `Manutenção concluída: ${result.archivedAppointments} registro(s) compactado(s) e ${result.deletedArchiveFiles} arquivo(s) temporário(s) removido(s).`);
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleDownloadArchiveFile = async (fileId) => {
    setBusyKey(`archive-${fileId}`);
    try {
      await downloadArchiveFile(fileId);
      flashNotice('success', 'Arquivo compactado baixado com sucesso.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleRefreshPanel = async () => {
    setBusyKey('refresh');
    try {
      await refreshAll();
      flashNotice('success', 'Agenda atualizada com as informações mais recentes.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleSimulateWhatsApp = async () => {
    setBusyKey('whatsapp-simulate');
    try {
      const result = await simulateWhatsAppInbound(whatsAppSimulationForm);
      flashNotice('success', `Simulação processada: ${result.replyText}`);
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleSendWhatsAppTest = async () => {
    setBusyKey('whatsapp-send');
    try {
      await sendWhatsAppTestMessage(whatsAppOutboundForm);
      flashNotice('success', 'Mensagem de teste enviada pelo WhatsApp.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveWhatsAppResponsible = async () => {
    setBusyKey('whatsapp-responsible-save');
    try {
      await updateWhatsAppResponsible(whatsAppResponsibleForm);
      flashNotice('success', 'Responsável salvo. Os avisos de atendimento já vão para esse número.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleTestResponsibleNotification = async () => {
    setBusyKey('whatsapp-responsible-test');
    try {
      await testResponsibleWhatsAppNotification({
        patientName: 'Paciente de Teste',
        patientPhone: whatsAppSimulationForm.from,
        procedureName: 'Endoscopia',
        notes: 'Teste de resumo para responsável enviado pelo painel.',
      });
      flashNotice('success', 'Resumo de atendimento enviado para o responsável.');
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleTestDoctorNotification = async () => {
    setBusyKey('whatsapp-doctor-test');
    try {
      const result = await testDoctorWhatsAppNotification(doctorNotificationForm);
      const channel = result?.result?.channel === 'text_fallback' ? 'texto livre' : 'template oficial';
      flashNotice('success', `Notificacao do medico enviada com sucesso via ${channel}.`);
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleRunSystemCheck = async () => {
    setBusyKey('system-check');
    try {
      const report = await runSystemCheck();
      setSystemCheckReport(report);
      setSystemCheckModalOpen(true);
      flashNotice(report.ok ? 'success' : 'error', report.summary);
    } catch (error) {
      flashNotice('error', error.message);
    } finally {
      setBusyKey('');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pagePadding }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#0EA5E9', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '11px', marginBottom: '10px', fontWeight: 800 }}>Painel administrativo</div>
          <h1 style={{ margin: 0, fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", fontSize: '36px', fontWeight: 900 }}>Carregando ambiente</h1>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pagePadding }}>
        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '24px', padding: isMobile ? '24px' : '34px', boxShadow: '0 30px 70px rgba(15,23,42,0.12)' }}>
          <div style={{ color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '11px', marginBottom: '12px', fontWeight: 800 }}>Painel Admin</div>
          <h1 style={{ margin: '0 0 12px', fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", fontWeight: 900, fontSize: isMobile ? '30px' : '38px' }}>Entrar no painel</h1>
          <p style={{ margin: '0 0 22px', color: '#64748B', lineHeight: 1.8 }}>Acesse com o usuário individual da clínica para gerenciar agenda, pacientes e conteúdo autorizado.</p>
          <Row minWidth={isMobile ? 180 : 220}>
            <Field label="Usuário" value={loginForm.username} onChange={(value) => setLoginForm((previous) => ({ ...previous, username: value }))} />
            <Field label="Senha" type="password" value={loginForm.password} onChange={(value) => setLoginForm((previous) => ({ ...previous, password: value }))} />
          </Row>
          <div style={{ marginTop: '18px', color: '#64748B', fontSize: '14px', lineHeight: 1.7, padding: '14px 16px', borderRadius: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            Use apenas o acesso fornecido pela administração. Em caso de esquecimento, solicite a redefinição da senha.
          </div>
          <div style={{ marginTop: '18px' }}><ActionButton type="submit" variant="primary" disabled={busyKey === 'login'} stretch={isMobile}>{busyKey === 'login' ? 'Entrando...' : 'Entrar'}</ActionButton></div>
          {notice ? <div style={{ marginTop: '16px', borderRadius: '16px', padding: '14px 16px', background: notice.type === 'error' ? '#FEF2F2' : '#E0F2FE', border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #BAE6FD', color: notice.type === 'error' ? '#B91C1C' : '#075985', fontWeight: 700 }}>{notice.message}</div> : null}
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="admin-app-shell">
        {isAdmin ? (
          <aside className="admin-sidebar">
            <div className="admin-brand">
              <span>WR</span>
              <div>
                <strong>Willian Holanda</strong>
                <small>Painel medico</small>
              </div>
            </div>
            <nav className="admin-sidebar-nav">
              {adminSectionLinks.map((item) => (
                <a key={`${item.href}-${item.label}`} href={item.href}>{item.label}</a>
              ))}
            </nav>
          </aside>
        ) : null}

        <main className="admin-main" style={{ padding: pagePadding }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        <div className="admin-topbar">
          <div>
            <div style={{ color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '11px', marginBottom: '8px', fontWeight: 800 }}>Painel Administrativo</div>
            <h1 style={{ margin: 0, fontFamily: "'Inter', 'Outfit', system-ui, sans-serif", fontSize: isMobile ? '30px' : '40px', fontWeight: 900, color: '#0F172A', letterSpacing: 0 }}>Willian Holanda</h1>
            <p style={{ margin: '8px 0 0', color: '#64748B' }}>Logado como <strong>{currentUser.displayName}</strong> ({isAdmin ? 'Admin' : 'Equipe'})</p>
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: isMobile ? '100%' : '420px', width: '100%' }}>
            <Field label="Busca rápida" value={patientSearch} onChange={setPatientSearch} placeholder="Buscar paciente, CPF, data ou status" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, max-content))', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
            <a href={dashboardUrl} target="_blank" rel="noreferrer" style={{ color: '#334155' }}><ActionButton>Abrir sistema</ActionButton></a>
            <ActionButton onClick={handleRefreshPanel} disabled={busyKey === 'refresh'} stretch={isMobile}>{busyKey === 'refresh' ? 'Atualizando...' : 'Atualizar agenda'}</ActionButton>
            <ActionButton onClick={handleSaveSchedule} variant="primary" disabled={busyKey === 'schedule'} stretch={isMobile}>{busyKey === 'schedule' ? 'Salvando agenda...' : 'Salvar agenda'}</ActionButton>
            <ActionButton onClick={logout} stretch={isMobile}>Sair</ActionButton>
          </div>
        </div>

        {notice ? <div style={{ marginBottom: '20px', background: notice.type === 'error' ? '#FEF2F2' : '#E0F2FE', border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #BAE6FD', color: notice.type === 'error' ? '#B91C1C' : '#075985', borderRadius: '16px', padding: '14px 16px', fontWeight: 700 }}>{notice.message}</div> : null}

        <SectionCard id="dashboard-admin" eyebrow="Dashboard" title="Visão geral da operação" description="Resumo rápido para acompanhar agenda, pacientes, WhatsApp e disponibilidade do dia." style={{ padding: sectionPadding }}>
          <Row minWidth={isMobile ? 160 : 190}>
            <StatCard label="Consultas hoje" value={todayTypeCounts.consulta || 0} />
            <StatCard label="Exames hoje" value={todayTypeCounts.exame || 0} tone="white" />
            <StatCard label="Procedimentos hoje" value={todayTypeCounts.procedimento || 0} tone="white" />
            <StatCard label="Pacientes aguardando" value={pendingAppointments.length} tone={pendingAppointments.length ? 'white' : 'green'} />
            <StatCard label="Mensagens pendentes" value={whatsAppStatus?.activeConversations ?? 0} tone="white" />
            <StatCard label="Faturamento do dia" value="-" tone="white" />
            <StatCard label="Próximos agendamentos" value={upcomingAppointments.length} tone="green" />
            <StatCard label="Cancelamentos" value={canceledAppointments.length} tone={canceledAppointments.length ? 'white' : 'green'} />
          </Row>
        </SectionCard>
        {isAdmin ? (
          <SectionCard id="whatsapp-admin" eyebrow="WhatsApp Oficial" title="Webhook, testes e operacao" description="Use esta area para validar a integracao oficial da Meta, disparar testes controlados e acompanhar os eventos mais recentes." style={{ padding: sectionPadding }}>
            <Row minWidth={isMobile ? 180 : 220}>
              <StatCard label="Modo envio" value={whatsAppStatus?.deliveryMode === 'temporary_qr' ? 'QR' : 'Meta'} tone={whatsAppStatus?.deliveryMode === 'temporary_qr' ? 'green' : 'white'} />
              <StatCard label="Bot QR" value={whatsAppStatus?.temporaryQr?.connected ? 'Online' : (whatsAppStatus?.temporaryQr?.enabled ? 'Aguardando' : 'Off')} tone={whatsAppStatus?.temporaryQr?.connected ? 'green' : 'white'} />
              <StatCard label="Cloud API" value={whatsAppStatus?.configured ? 'OK' : 'Pendente'} tone={whatsAppStatus?.configured ? 'green' : 'white'} />
              <StatCard label="App Secret" value={whatsAppStatus?.appSecretConfigured ? 'OK' : 'Pendente'} tone={whatsAppStatus?.appSecretConfigured ? 'green' : 'white'} />
              <StatCard label="Responsavel" value={whatsAppStatus?.responsiblePhoneConfigured ? 'OK' : 'Pendente'} tone={whatsAppStatus?.responsiblePhoneConfigured ? 'green' : 'white'} />
            </Row>

            <div style={{ padding: '18px', borderRadius: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: '12px' }}>
              <strong style={{ fontSize: '18px' }}>Status atual</strong>
              <div style={{ color: '#64748B', lineHeight: 1.8 }}>
                <div><strong>Webhook:</strong> {whatsAppStatus?.callbackUrl || '-'}</div>
                <div><strong>Versao Graph:</strong> {whatsAppStatus?.graphVersion || '-'}</div>
                <div><strong>Modo de envio:</strong> {whatsAppStatus?.deliveryMode === 'temporary_qr' ? 'Bot temporario por QR code' : 'Cloud API oficial da Meta'}</div>
                <div><strong>Status QR:</strong> {whatsAppStatus?.temporaryQr?.state || '-'}</div>
                {whatsAppStatus?.responsibleName ? <div><strong>Responsável:</strong> {whatsAppStatus.responsibleName}</div> : null}
                {whatsAppStatus?.temporaryQr?.lastQrAt ? <div><strong>Ultimo QR:</strong> {formatDateTimeLabel(whatsAppStatus.temporaryQr.lastQrAt)}</div> : null}
                {whatsAppStatus?.temporaryQr?.lastError ? <div><strong>Erro QR:</strong> {whatsAppStatus.temporaryQr.lastError}</div> : null}
                <div><strong>Conversas ativas:</strong> {whatsAppStatus?.activeConversations ?? 0}</div>
                <div><strong>Fallback texto medico:</strong> {whatsAppStatus?.doctorFallbackTextEnabled ? 'Ativo' : 'Desligado'}</div>
              </div>
              {whatsAppStatus?.temporaryQr?.qrDataUrl && !whatsAppStatus?.temporaryQr?.connected ? (
                <div style={{ display: 'grid', gap: '10px', justifyItems: 'start', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0' }}>
                  <strong style={{ fontSize: '16px' }}>QR code do WhatsApp</strong>
                  <img src={whatsAppStatus.temporaryQr.qrDataUrl} alt="QR code para conectar WhatsApp" style={{ width: '100%', maxWidth: '260px', borderRadius: '8px', background: '#FFFFFF', padding: '8px' }} />
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <ActionButton onClick={handleRefreshPanel} disabled={busyKey === 'refresh'} stretch={isMobile}>{busyKey === 'refresh' ? 'Atualizando...' : 'Atualizar status'}</ActionButton>
                <ActionButton onClick={handleRunSystemCheck} disabled={busyKey === 'system-check'} stretch={isMobile}>{busyKey === 'system-check' ? 'Testando sistema...' : 'Rodar check completo'}</ActionButton>
              </div>
            </div>

            <div style={{ padding: '18px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E0F2FE', display: 'grid', gap: '14px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Responsável pelos atendimentos</strong>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Este número recebe os resumos quando o cliente pede atendente, quer pagar ou confirma um agendamento pelo WhatsApp.
                </p>
              </div>
              <Row minWidth={isMobile ? 180 : 220}>
                <Field label="Nome do responsável" value={whatsAppResponsibleForm.name} onChange={(value) => setWhatsAppResponsibleForm((previous) => ({ ...previous, name: value }))} />
                <Field label="WhatsApp com DDI e DDD" value={whatsAppResponsibleForm.phone} onChange={(value) => setWhatsAppResponsibleForm((previous) => ({ ...previous, phone: value }))} placeholder="559887338179" />
              </Row>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <ActionButton onClick={handleSaveWhatsAppResponsible} variant="primary" disabled={busyKey === 'whatsapp-responsible-save'} stretch={isMobile}>
                  {busyKey === 'whatsapp-responsible-save' ? 'Salvando...' : 'Salvar responsável'}
                </ActionButton>
                <ActionButton onClick={handleTestResponsibleNotification} disabled={busyKey === 'whatsapp-responsible-test' || !whatsAppStatus?.responsiblePhoneConfigured} stretch={isMobile}>
                  {busyKey === 'whatsapp-responsible-test' ? 'Enviando teste...' : 'Testar aviso'}
                </ActionButton>
              </div>
              <div style={{ color: '#94A3B8', fontSize: '13px', lineHeight: 1.7 }}>
                Atual: {whatsAppStatus?.responsiblePhone ? `${whatsAppStatus.responsiblePhone}${whatsAppStatus?.responsibleSource === 'panel' ? ' (painel)' : ' (.env)'}` : 'nenhum número configurado'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: '18px' }}>
              <div style={{ padding: '18px', borderRadius: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Simular mensagem recebida</strong>
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Teste o fluxo guiado sem depender da Meta.</p>
                </div>
                <Field label="Telefone do paciente" value={whatsAppSimulationForm.from} onChange={(value) => setWhatsAppSimulationForm((previous) => ({ ...previous, from: value }))} />
                <Field label="Nome do perfil" value={whatsAppSimulationForm.profileName} onChange={(value) => setWhatsAppSimulationForm((previous) => ({ ...previous, profileName: value }))} />
                <Field label="Mensagem" value={whatsAppSimulationForm.text} onChange={(value) => setWhatsAppSimulationForm((previous) => ({ ...previous, text: value }))} multiline />
                <ActionButton onClick={handleSimulateWhatsApp} variant="primary" disabled={busyKey === 'whatsapp-simulate'} stretch={isMobile}>{busyKey === 'whatsapp-simulate' ? 'Processando simulacao...' : 'Simular entrada'}</ActionButton>
              </div>

              <div style={{ padding: '18px', borderRadius: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Enviar mensagem de teste</strong>
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Confirme que o numero oficial responde pela Cloud API.</p>
                </div>
                <Field label="Numero destino" value={whatsAppOutboundForm.to} onChange={(value) => setWhatsAppOutboundForm((previous) => ({ ...previous, to: value }))} />
                <Field label="Mensagem" value={whatsAppOutboundForm.text} onChange={(value) => setWhatsAppOutboundForm((previous) => ({ ...previous, text: value }))} multiline />
                <ActionButton onClick={handleSendWhatsAppTest} variant="primary" disabled={busyKey === 'whatsapp-send'} stretch={isMobile}>{busyKey === 'whatsapp-send' ? 'Enviando teste...' : 'Enviar teste'}</ActionButton>
              </div>
            </div>

            <div style={{ padding: '18px', borderRadius: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Testar notificacao do medico</strong>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Envia um resumo de teste para validar o template oficial e o numero configurado.</p>
              </div>
              <Row minWidth={isMobile ? 180 : 220}>
                <Field label="Paciente" value={doctorNotificationForm.fullName} onChange={(value) => setDoctorNotificationForm((previous) => ({ ...previous, fullName: value }))} />
                <Field label="CPF" value={doctorNotificationForm.cpf} onChange={(value) => setDoctorNotificationForm((previous) => ({ ...previous, cpf: value }))} />
                <Field label="Data" type="date" value={doctorNotificationForm.date} onChange={(value) => setDoctorNotificationForm((previous) => ({ ...previous, date: value }))} />
                <Field label="Hora" type="time" value={doctorNotificationForm.time} onChange={(value) => setDoctorNotificationForm((previous) => ({ ...previous, time: value }))} />
                <Field label="Procedimento" value={doctorNotificationForm.procedureName} onChange={(value) => setDoctorNotificationForm((previous) => ({ ...previous, procedureName: value }))} />
              </Row>
              <ActionButton onClick={handleTestDoctorNotification} variant="primary" disabled={busyKey === 'whatsapp-doctor-test'} stretch={isMobile}>{busyKey === 'whatsapp-doctor-test' ? 'Enviando notificacao...' : 'Testar notificacao do medico'}</ActionButton>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <strong style={{ fontSize: '18px' }}>Eventos recentes</strong>
              {whatsAppEvents.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Ainda nao existem eventos recentes do WhatsApp.</p>
              ) : (
                whatsAppEvents.slice(0, 20).map((event) => (
                  <div key={`${event.id}-${event.metaMessageId || 'local'}`} style={{ padding: '14px', borderRadius: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>{event.direction} · {event.status}</strong>
                        <span style={{ color: '#64748B', fontSize: '13px' }}>{event.phoneNumber || '-'} · {formatDateTimeLabel(event.createdAt)}</span>
                      </div>
                      <span style={{ color: '#15ABD1', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{event.messageType}</span>
                    </div>
                    <div style={{ marginTop: '8px', color: '#475569', lineHeight: 1.7 }}>{event.messageText || 'Evento sem corpo de texto.'}</div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        ) : null}

        {isAdmin ? (
          <div style={{ position: 'sticky', top: '12px', zIndex: 4, marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: isMobile ? '14px' : '16px', borderRadius: '20px', background: 'rgba(6,14,22,0.88)', border: '1px solid #E0F2FE', backdropFilter: 'blur(12px)' }}>
              {adminSectionLinks.map((item) => (
                <SectionMenuLink key={item.href} href={item.href} label={item.label} />
              ))}
            </div>
          </div>
        ) : null}

        <SectionCard eyebrow="Ações rápidas" title={adminScheduleOnly ? 'Agenda da administração' : 'Atalhos do dia'} description={adminScheduleOnly ? 'Aqui a administração libera os dias e os horários que ficarão disponíveis para a recepção e para o WhatsApp.' : 'Os botões abaixo deixam o uso mais direto no celular e no atendimento do dia a dia.'} style={{ padding: sectionPadding }}>
          <Row minWidth={isMobile ? 180 : 240}>
            <QuickActionCard title="Agenda" description="Abra o dia certo e já deixe a agenda pronta para uso.">
              <ActionButton onClick={() => jumpToDate(todayDate)} stretch={isMobile} style={compactButtonStyle}>Ir para hoje</ActionButton>
              <ActionButton onClick={() => jumpToDate(nextAvailableDate)} disabled={!nextAvailableDate} stretch={isMobile} style={compactButtonStyle}>Próxima vaga</ActionButton>
              {isAdmin ? <ActionButton onClick={() => applyPresetSlotsToDate(quickActionDate)} variant="primary" stretch={isMobile} style={compactButtonStyle}>Aplicar horários padrão</ActionButton> : null}
              {isAdmin ? <ActionButton onClick={() => toggleAvailableDate(todayDate)} variant={draft.admin.availableDates.includes(todayDate) ? 'danger' : 'primary'} disabled={busyKey === 'schedule'} stretch={isMobile} style={compactButtonStyle}>{draft.admin.availableDates.includes(todayDate) ? 'Fechar hoje' : 'Liberar hoje'}</ActionButton> : null}
              {isAdmin ? <ActionButton onClick={handleSaveSchedule} disabled={busyKey === 'schedule'} stretch={isMobile} style={compactButtonStyle}>{busyKey === 'schedule' ? 'Salvando agenda...' : 'Salvar agenda'}</ActionButton> : null}
            </QuickActionCard>
            {!adminScheduleOnly ? <QuickActionCard title="Atendimento" description="Comece um agendamento sem ficar procurando data disponível.">
              <ActionButton onClick={() => prepareQuickAppointment(nextAvailableDate || todayDate)} variant="primary" disabled={!nextAvailableDate && !todayDate} stretch={isMobile} style={compactButtonStyle}>Novo agendamento</ActionButton>
              <ActionButton onClick={handleRefreshPanel} disabled={busyKey === 'refresh'} stretch={isMobile} style={compactButtonStyle}>{busyKey === 'refresh' ? 'Atualizando...' : 'Atualizar agenda'}</ActionButton>
              <ActionButton onClick={handleSaveSchedule} disabled={busyKey === 'schedule'} stretch={isMobile} style={compactButtonStyle}>Salvar agenda</ActionButton>
            </QuickActionCard> : null}
            {!adminScheduleOnly ? <QuickActionCard title="Comunicação" description="Tenha os comandos mais usados à mão para testes e operação.">
              <ActionButton onClick={handleRunSystemCheck} disabled={busyKey === 'system-check'} stretch={isMobile} style={compactButtonStyle}>{busyKey === 'system-check' ? 'Testando sistema...' : 'Testar todo o sistema'}</ActionButton>
              {!isAdmin ? <ActionButton onClick={() => jumpToDate(nextAvailableDate)} disabled={!nextAvailableDate} stretch={isMobile} style={compactButtonStyle}>Ver próxima data livre</ActionButton> : null}
              {!isAdmin ? <ActionButton onClick={logout} stretch={isMobile} style={compactButtonStyle}>Sair do painel</ActionButton> : null}
            </QuickActionCard> : null}
          </Row>
          {!adminScheduleOnly ? (
            <div style={{ marginTop: '18px', background: '#F8FAFC', borderRadius: '22px', padding: '20px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', fontSize: '18px' }}>Próximos pacientes</strong>
                  <span style={{ color: '#64748B', fontSize: '14px', lineHeight: 1.7 }}>
                    Resumo rápido para a recepção saber quem vem a seguir.
                  </span>
                </div>
                {nextAvailableDate ? (
                  <ActionButton onClick={() => prepareQuickAppointment(nextAvailableDate)} variant="primary" stretch={isMobile} style={compactButtonStyle}>
                    Abrir próxima vaga
                  </ActionButton>
                ) : null}
              </div>
              {upcomingAppointments.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Ainda não existem pacientes agendados para os próximos dias.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {upcomingAppointments.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openAppointmentDetails(item.id)}
                      style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '18px', background: item.date === todayDate ? '#DCFCE7' : 'rgba(255,255,255,0.04)', border: item.date === todayDate ? '1px solid #BBF7D0' : '1px solid #E2E8F0', color: '#FFFFFF', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '4px' }}>{item.fullName}</strong>
                          <span style={{ color: '#64748B', fontSize: '13px' }}>
                            {item.procedureName || 'Procedimento a definir'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', justifyItems: isMobile ? 'flex-start' : 'end', gap: '4px' }}>
                          <span style={{ color: item.date === todayDate ? '#BEEFFF' : '#15ABD1', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {item.date === todayDate ? 'Hoje' : formatDateLabel(item.date)}
                          </span>
                          <strong style={{ fontSize: '15px' }}>{item.time || 'Sem horário'}</strong>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </SectionCard>

        {!adminScheduleOnly && systemCheckReport ? (
          <SectionCard eyebrow="Diagnóstico" title="Último teste do sistema" description="Esse relatório ajuda o suporte a entender rapidamente se o problema está no login, agenda, painel ou WhatsApp." style={{ padding: sectionPadding }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ padding: '16px 18px', borderRadius: '18px', background: systemCheckReport.ok ? '#DCFCE7' : '#FEF2F2', border: systemCheckReport.ok ? '1px solid #BBF7D0' : '1px solid #FECACA' }}>
                <strong style={{ display: 'block', marginBottom: '6px', color: systemCheckReport.ok ? '#BEEFFF' : '#F2C6C6' }}>
                  {systemCheckReport.ok ? 'Sistema aprovado nas verificações principais' : 'Foram encontrados pontos para revisar'}
                </strong>
                <div style={{ color: '#475569', lineHeight: 1.7 }}>
                  <div><strong>Resumo:</strong> {systemCheckReport.summary}</div>
                  <div><strong>Executado em:</strong> {systemCheckReport.finishedAt ? new Date(systemCheckReport.finishedAt).toLocaleString('pt-BR') : '-'}</div>
                  <div><strong>Perfil:</strong> {systemCheckReport.role === 'admin' ? 'Administração' : 'Recepção'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {systemCheckReport.checks.map((item) => (
                  <div key={item.key} style={{ padding: '14px 16px', borderRadius: '18px', background: '#F8FAFC', border: item.ok ? '1px solid #BBF7D0' : '1px solid #FECACA' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <strong>{item.label}</strong>
                      <span style={{ color: item.ok ? '#BEEFFF' : '#F2C6C6', fontSize: '13px' }}>{item.ok ? 'OK' : 'Falhou'}</span>
                    </div>
                    {item.ok ? (
                      <div style={{ color: '#475569', fontSize: '13px', lineHeight: 1.7 }}>
                        {Object.entries(item.details || {}).map(([key, value]) => (
                          <div key={key}><strong>{key}:</strong> {String(value)}</div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#F2C6C6', fontSize: '13px', lineHeight: 1.7 }}>
                        {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        ) : null}

        {!adminScheduleOnly ? (
          <SectionCard eyebrow="Visão geral" title="Painel executivo" description="Resumo rápido para acompanhar equipe, agenda e base de pacientes sem depender do código." style={{ padding: sectionPadding }}>
            <Row>
              <StatCard label="Usuários ativos" value={summary.activeUsers ?? 0} />
              <StatCard label="Datas liberadas" value={summary.releasedDates ?? 0} />
              <StatCard label="Agendamentos ativos" value={summary.activeAppointments ?? 0} tone="green" />
              <StatCard label="Pacientes únicos" value={summary.uniquePatients ?? 0} tone="white" />
              <StatCard label="Conversas Whats" value={whatsAppStatus?.activeConversations ?? 0} tone="white" />
            </Row>

            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '6px', fontSize: '18px' }}>Resumo de desempenho</strong>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Acompanhe semana, quinzena e mês atual com base nos agendamentos da agenda.
                </p>
              </div>
              <Row minWidth={isMobile ? 220 : 260}>
                {performanceSummaries.map((period) => (
                  <PeriodSummaryCard key={period.label} period={period} />
                ))}
              </Row>
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '20px', padding: '20px', border: '1px solid #E2E8F0' }}>
              <strong style={{ display: 'block', marginBottom: '12px', fontSize: '18px' }}>
                Atendimentos de hoje
              </strong>
              {todayAppointments.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Nenhum atendimento ativo para hoje.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {todayAppointments.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                      <div>
                        <strong style={{ display: 'block' }}>{item.fullName}</strong>
                        <span style={{ color: '#64748B', fontSize: '14px' }}>{item.procedureName || 'Procedimento a definir'}</span>
                      </div>
                      <span style={{ color: '#15ABD1', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard id="agenda-admin" eyebrow="Agenda" title="Agenda médica" description="Libere dias, organize horários e acompanhe consultas, exames e procedimentos em uma tela única." style={{ padding: sectionPadding }}>
          <Row minWidth={isMobile ? 150 : 190}>
            <StatCard label="Dias com vaga" value={receptionistAvailableDates.length} tone="green" />
            <StatCard label="Horários livres" value={Object.values(freeTimeSlotsByDate).reduce((total, items) => total + items.length, 0)} tone="green" />
            <StatCard label="Agendamentos ativos" value={activeOperationalAppointments.length} />
            <StatCard label="Hoje" value={todayAppointments.length} tone={todayAppointments.length ? 'green' : 'white'} />
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(360px, 1fr) minmax(360px, 0.95fr)', gap: '16px', alignItems: 'start' }}>
            <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: isMobile ? '14px' : '18px', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                <ActionButton onClick={() => {
                  autoFollowSystemMonth.current = false;
                  setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1));
                }} stretch={isMobile}>Mês anterior</ActionButton>
                <strong style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? '26px' : '30px', fontWeight: 400, textTransform: 'capitalize', textAlign: 'center', flex: 1 }}>{calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
                <ActionButton onClick={() => {
                  autoFollowSystemMonth.current = false;
                  setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1));
                }} stretch={isMobile}>Próximo mês</ActionButton>
              </div>

              {isAdmin ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: calendarGap, marginBottom: '10px', textAlign: 'center', color: '#94A3B8', fontSize: isMobile ? '10px' : '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((item) => <div key={item}>{item}</div>)}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: calendarGap }}>
                    {monthGrid.map((date) => {
                      const dateString = date.toISOString().slice(0, 10);
                      const isCurrentMonth = sameMonth(date, calendarMonth);
                      const isAvailable = draft.admin.availableDates.includes(dateString);
                      const hasAppointment = draft.admin.appointments.some((item) => item.date === dateString && item.status !== 'cancelado');
                      const hasFreeSlot = (freeTimeSlotsByDate[dateString] || []).length > 0;
                      const totalSlots = (availableTimeSlots[dateString] || []).length;
                      const freeSlots = (freeTimeSlotsByDate[dateString] || []).length;
                      const isFull = isAvailable && totalSlots > 0 && freeSlots === 0;
                      const isSelected = selectedCalendarDate === dateString;
                      const canSelectDate = true;
                      const dayTextColor = !isCurrentMonth
                        ? 'rgba(244,251,248,0.18)'
                        : canSelectDate
                          ? '#FFFFFF'
                          : 'rgba(244,251,248,0.38)';
                      const dayBackground = isAvailable
                        ? '#E0F2FE'
                        : '#FFFFFF';

                      return (
                        <button key={dateString} type="button" onClick={() => setSelectedCalendarDate(dateString)} style={{ minHeight: calendarCellMinHeight, padding: isMobile ? '6px' : '8px', borderRadius: '8px', border: isSelected ? '1px solid #15ABD1' : hasAppointment ? '1px solid rgba(17,175,186,0.7)' : '1px solid #E2E8F0', background: dayBackground, color: dayTextColor, cursor: 'pointer', opacity: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: isMobile ? '12px' : '13px' }}>{date.getDate()}</span>
                          <div style={{ display: 'grid', gap: '2px' }}>
                            {hasFreeSlot ? <span style={{ fontSize: isMobile ? '9px' : '10px', color: freeSlots === 1 ? '#D9F7FF' : '#7AE1A5' }}>{freeSlots === 1 ? 'Última vaga' : `${freeSlots} vaga(s)`}</span> : null}
                            {isFull ? <span style={{ fontSize: isMobile ? '9px' : '10px', color: '#E7B1B1' }}>Lotado</span> : null}
                            {hasAppointment && !isFull ? <span style={{ fontSize: isMobile ? '9px' : '10px', color: '#7AE1A5' }}>Paciente</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                    Clique em um dia com vaga para escolher o horário e cadastrar o paciente.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: calendarGap, marginBottom: '2px', textAlign: 'center', color: '#94A3B8', fontSize: isMobile ? '10px' : '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((item) => <div key={item}>{item}</div>)}
                  </div>
                  {monthGrid.every((date) => (freeTimeSlotsByDate[date.toISOString().slice(0, 10)] || []).length === 0) ? (
                    <p style={{ margin: 0, color: '#E7B1B1', lineHeight: 1.7 }}>
                      Nenhuma data livre encontrada neste mês.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: calendarGap }}>
                      {monthGrid.map((date) => {
                        const dateString = date.toISOString().slice(0, 10);
                        const isCurrentMonth = sameMonth(date, calendarMonth);
                        const freeSlots = (freeTimeSlotsByDate[dateString] || []).length;
                        const hasFreeSlot = freeSlots > 0;
                        const isSelected = selectedCalendarDate === dateString;

                        return (
                          <button key={dateString} type="button" disabled={!hasFreeSlot} onClick={() => openAppointmentModal(dateString)} style={{ minHeight: calendarCellMinHeight, padding: isMobile ? '6px' : '8px', borderRadius: '16px', border: isSelected ? '1px solid #15ABD1' : hasFreeSlot ? '1px solid #7DD3FC' : '1px solid #E2E8F0', background: hasFreeSlot ? 'rgba(21,171,209,0.15)' : '#FFFFFF', color: !isCurrentMonth ? 'rgba(244,251,248,0.18)' : hasFreeSlot ? '#FFFFFF' : 'rgba(244,251,248,0.32)', cursor: hasFreeSlot ? 'pointer' : 'not-allowed', opacity: isCurrentMonth ? 1 : 0.62, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: isMobile ? '12px' : '13px' }}>{date.getDate()}</span>
                            {hasFreeSlot ? (
                              <span style={{ fontSize: isMobile ? '9px' : '10px', color: freeSlots === 1 ? '#D9F7FF' : '#BEEFFF' }}>
                                {freeSlots === 1 ? 'Última' : `${freeSlots} livres`}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '18px', display: 'grid', gap: '12px' }}>
                <CalendarLegend />
                {!isAdmin ? <div style={{ color: '#94A3B8', fontSize: '13px' }}>Somente a administração pode liberar ou bloquear datas e horários.</div> : null}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: isMobile ? '14px' : '18px', border: '1px solid #E2E8F0' }}>
                <strong style={{ display: 'block', marginBottom: '14px', fontSize: '18px' }}>Horários do dia</strong>
                <p style={{ margin: '0 0 14px', color: '#64748B', lineHeight: 1.7 }}>
                  {selectedCalendarDate ? formatDateLabel(selectedCalendarDate) : 'Selecione um dia no calendário para ver ou editar os horários.'}
                </p>
                {selectedCalendarDate ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <span style={{ borderRadius: '999px', padding: '8px 12px', background: '#E2E8F0', fontSize: '12px' }}>{selectedDateSlots.length} horário(s)</span>
                    <span style={{ borderRadius: '999px', padding: '8px 12px', background: '#DCFCE7', color: '#BEEFFF', fontSize: '12px' }}>{selectedDateFreeSlots.length} livre(s)</span>
                    <span style={{ borderRadius: '999px', padding: '8px 12px', background: '#FEF2F2', color: '#E7B1B1', fontSize: '12px' }}>{selectedDateOccupiedSlots.length} ocupado(s)</span>
                    {selectedDateFreeSlots.length === 1 ? <span style={{ borderRadius: '999px', padding: '8px 12px', background: '#E0F2FE', color: '#D9F7FF', fontSize: '12px' }}>Última vaga</span> : null}
                    {selectedDateIsFull ? <span style={{ borderRadius: '999px', padding: '8px 12px', background: '#FEF2F2', color: '#E7B1B1', fontSize: '12px' }}>Dia lotado</span> : null}
                  </div>
                ) : null}
                {selectedCalendarDate ? (
                  <>
                    {isAdmin ? (
                      <div style={{ display: 'grid', gap: '12px' }}>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <div style={{ color: '#64748B', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>Tipo de horário</div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                            {medicalTypeOptions.map((item) => {
                              const selected = slotReleaseType === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => setSlotReleaseType(item.key)}
                                  style={{
                                    minHeight: '48px',
                                    borderRadius: '12px',
                                    border: selected ? `1px solid ${item.color}` : '1px solid #E2E8F0',
                                    background: selected ? item.background : '#FFFFFF',
                                    color: selected ? item.color : '#334155',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Liberar Horário para {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <ActionButton onClick={() => toggleAvailableDate(selectedCalendarDate)} variant={draft.admin.availableDates.includes(selectedCalendarDate) ? 'danger' : 'primary'} disabled={busyKey === 'schedule'} stretch={isMobile} style={compactButtonStyle}>
                            {busyKey === 'schedule' ? 'Salvando...' : draft.admin.availableDates.includes(selectedCalendarDate) ? 'Bloquear dia' : 'Liberar dia'}
                          </ActionButton>
                          <ActionButton onClick={() => applyPresetSlotsToDate(selectedCalendarDate)} variant="primary" disabled={busyKey === 'schedule'} stretch={isMobile} style={compactButtonStyle}>Aplicar horários padrão</ActionButton>
                          {!adminScheduleOnly ? <ActionButton onClick={() => openAppointmentModal(selectedCalendarDate)} disabled={!selectedDateFreeSlots.length} stretch={isMobile} style={compactButtonStyle}>Novo agendamento</ActionButton> : null}
                        </div>
                        <Row minWidth={isMobile ? 160 : 180}>
                          <Field label="Novo horário" type="time" value={slotEditor.time} onChange={(value) => setSlotEditor((previous) => ({ ...previous, time: value }))} />
                          <div style={{ display: 'flex', alignItems: 'end' }}>
                            <ActionButton onClick={() => addTimeSlotToDate(selectedCalendarDate, slotEditor.time)} variant="primary" stretch>Adicionar horário</ActionButton>
                          </div>
                        </Row>
                      </div>
                    ) : null}

                    <div style={{ display: 'grid', gap: '10px', marginTop: '14px', maxHeight: isMobile ? '360px' : '520px', overflowY: 'auto', paddingRight: selectedDateSlots.length > 8 ? '4px' : 0 }}>
                      {(selectedDateSlots.length === 0) ? (
                        <p style={{ margin: 0, color: '#64748B' }}>
                          Nenhum horário cadastrado para este dia.
                        </p>
                      ) : (
                        selectedDateSlots.map((time) => (
                          <div key={time} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0' }}>
                            <div>
                              <strong>{time}</strong>
                              <div style={{ color: '#64748B', fontSize: '13px' }}>
                                {(selectedDateFreeSlots || []).includes(time) ? 'Horário livre' : 'Horário ocupado'}
                              </div>
                            </div>
                            {isAdmin ? <ActionButton variant="danger" onClick={() => removeTimeSlotFromDate(selectedCalendarDate, time)}>Remover</ActionButton> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: isMobile ? '14px' : '18px', border: '1px solid #E2E8F0' }}>
                <strong style={{ display: 'block', marginBottom: '14px', fontSize: '18px' }}>Agendamentos do dia</strong>
                {!selectedCalendarDate ? (
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Selecione uma data no calendário.</p>
                ) : selectedDateAppointments.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Nenhum paciente ativo neste dia.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {selectedDateAppointments.map((appointment) => (
                      <button key={appointment.id} type="button" onClick={() => openAppointmentDetails(appointment.id)} style={{ textAlign: 'left', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.04)', color: '#FFFFFF', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                          <div>
                            <strong style={{ display: 'block', fontSize: '15px' }}>{appointment.fullName}</strong>
                            <span style={{ color: '#64748B', fontSize: '13px' }}>{appointment.time || 'Sem horário'} · {appointment.procedureName || 'Procedimento a definir'}</span>
                          </div>
                          <span style={{ borderRadius: '8px', padding: '7px 10px', background: appointment.source === 'whatsapp' ? '#E0F2FE' : '#E2E8F0', color: appointment.source === 'whatsapp' ? '#D9F7FF' : '#475569', fontSize: '12px' }}>{appointment.source === 'whatsapp' ? 'WhatsApp' : 'Painel'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: isMobile ? '14px' : '18px', border: '1px solid #E2E8F0' }}>
                <strong style={{ display: 'block', marginBottom: '14px', fontSize: '18px' }}>Próximas vagas</strong>
                {upcomingHighlights.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Ainda não existem datas abertas com horário livre.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {upcomingHighlights.slice(0, 5).map((date) => {
                      const freeSlotsCount = (freeTimeSlotsByDate[date] || []).length;
                      return (
                        <button key={date} type="button" onClick={() => jumpToDate(date)} style={{ textAlign: 'left', padding: '12px', borderRadius: '8px', background: '#E0F2FE', border: '1px solid #BAE6FD', color: '#D9F7FF', cursor: 'pointer' }}>
                          <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>{formatDateLabel(date)}</strong>
                          <span style={{ fontSize: '12px', color: freeSlotsCount === 1 ? '#D9F7FF' : '#475569' }}>{freeSlotsCount === 1 ? 'Última vaga disponível' : `${freeSlotsCount} horário(s) livre(s)`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div id="pacientes-admin">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                <strong style={{ display: 'block', fontSize: '18px' }}>Pacientes</strong>
                {lastConfirmation ? <ActionButton onClick={copyLastConfirmation}>Copiar confirmação</ActionButton> : null}
              </div>
              <Field label="Buscar paciente" value={patientSearch} onChange={setPatientSearch} placeholder="Nome, CPF, data ou status" />
              <div style={{ height: '14px' }} />
              {filteredAppointments.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  {appointmentsByDate.length === 0 ? 'Nenhum agendamento cadastrado ainda.' : 'Nenhum paciente encontrado nessa busca.'}
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {filteredAppointments.map((appointment) => (
                    <button key={appointment.id} type="button" onClick={() => openAppointmentDetails(appointment.id)} style={{ textAlign: 'left', background: appointment.status === 'cancelado' ? '#FEF2F2' : '#F8FAFC', borderRadius: '8px', padding: '14px', border: appointment.status === 'cancelado' ? '1px solid #FECACA' : '1px solid #E2E8F0', color: '#FFFFFF', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <strong style={{ display: 'block', fontSize: '16px' }}>{appointment.fullName}</strong>
                          <span style={{ color: '#15ABD1', fontSize: '13px' }}>{formatDateLabel(appointment.date)}{appointment.time ? ` às ${appointment.time}` : ''}</span>
                        </div>
                        <span style={{ borderRadius: '8px', padding: '7px 10px', background: appointment.status === 'cancelado' ? '#FEE2E2' : '#DCFCE7', color: appointment.status === 'cancelado' ? '#E7B1B1' : '#BEEFFF', fontSize: '12px' }}>{appointment.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
        </SectionCard>

        <SectionCard id="financeiro-admin" eyebrow="Financeiro" title="Resumo financeiro" description="Área visual preparada para acompanhar valores quando os lançamentos financeiros estiverem disponíveis no painel." style={{ padding: sectionPadding }}>
          <Row minWidth={isMobile ? 150 : 190}>
            <StatCard label="Receita do dia" value="-" tone="white" />
            <StatCard label="Receita do mês" value="-" tone="white" />
            <StatCard label="A receber" value="-" tone="white" />
            <StatCard label="Atrasados" value="-" tone="white" />
            <StatCard label="Despesas" value="-" tone="white" />
            <StatCard label="Saldo" value="-" tone="white" />
          </Row>
        </SectionCard>

        {isAdmin ? (
          <SectionCard id="acessos" eyebrow="Administração" title="Acessos e usuários" description="Crie novos logins da clínica, ajuste perfil, troque senhas e tire ou devolva acesso sem depender do código." style={{ padding: sectionPadding }}>
            <Row minWidth={isMobile ? 180 : 220}>
              <StatCard label="Usuários cadastrados" value={users.length} />
              <StatCard label="Ativos" value={activeUsers.length} tone="green" />
              <StatCard label="Inativos" value={inactiveUsers.length} tone="white" />
              <StatCard label="Administradores" value={adminUsers.length} tone="white" />
            </Row>

            <div style={{ padding: '18px', borderRadius: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Criar novo usuário</strong>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Cadastre um acesso novo para administração ou equipe.
                </p>
              </div>
              <Row minWidth={isMobile ? 180 : 220}>
                <Field label="Nome de exibição" value={userForm.displayName} onChange={(value) => setUserForm((previous) => ({ ...previous, displayName: value }))} />
                <Field label="Usuário" value={userForm.username} onChange={(value) => setUserForm((previous) => ({ ...previous, username: value }))} />
                <Field label="Senha inicial" type="password" value={userForm.password} onChange={(value) => setUserForm((previous) => ({ ...previous, password: value }))} />
                <SelectField
                  label="Perfil"
                  value={userForm.role}
                  onChange={(value) => setUserForm((previous) => ({ ...previous, role: value }))}
                  options={[
                    { value: 'staff', label: 'Equipe' },
                    { value: 'admin', label: 'Administrador' },
                  ]}
                />
              </Row>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <ActionButton onClick={handleCreateUser} variant="primary" disabled={busyKey === 'create-user'} stretch={isMobile}>
                  {busyKey === 'create-user' ? 'Criando usuário...' : 'Criar usuário'}
                </ActionButton>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>Gerenciar acessos</strong>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Aqui você consegue ativar, desativar, trocar o perfil e redefinir a senha de cada pessoa.
                </p>
              </div>
              {users.map((user) => {
                const edit = userEdits[user.id] || { displayName: user.displayName, role: user.role, active: user.active, password: '' };
                const isOwnUser = currentUser?.id === user.id;
                const isSaving = busyKey === `user-${user.id}`;

                return (
                  <div key={user.id} style={{ background: '#F8FAFC', borderRadius: '20px', padding: '18px', border: '1px solid #E2E8F0', display: 'grid', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px' }}>{user.displayName}</strong>
                        <div style={{ color: '#64748B', lineHeight: 1.7 }}>
                          <div><strong>Usuário:</strong> {user.username}</div>
                          <div><strong>Criado em:</strong> {formatDateTimeLabel(user.createdAt)}</div>
                          {isOwnUser ? <div>Este é o seu acesso atual.</div> : null}
                        </div>
                      </div>
                      <UserStatusPill active={user.active} role={user.role} />
                    </div>

                    <Row minWidth={isMobile ? 180 : 220}>
                      <Field
                        label="Nome"
                        value={edit.displayName}
                        onChange={(value) => setUserEdits((previous) => ({ ...previous, [user.id]: { ...edit, displayName: value } }))}
                      />
                      <SelectField
                        label="Perfil"
                        value={edit.role}
                        onChange={(value) => setUserEdits((previous) => ({ ...previous, [user.id]: { ...edit, role: value } }))}
                        options={[
                          { value: 'staff', label: 'Equipe' },
                          { value: 'admin', label: 'Administrador' },
                        ]}
                        disabled={isOwnUser}
                      />
                      <Field
                        label="Nova senha"
                        type="password"
                        value={edit.password}
                        onChange={(value) => setUserEdits((previous) => ({ ...previous, [user.id]: { ...edit, password: value } }))}
                        placeholder="Deixe em branco para manter"
                      />
                    </Row>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <ActionButton onClick={() => handleUpdateUser(user.id)} variant="primary" disabled={isSaving} stretch={isMobile}>
                        {isSaving ? 'Salvando...' : 'Salvar alterações'}
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleToggleUserAccess(user)}
                        variant={user.active ? 'danger' : 'outline'}
                        disabled={isSaving || isOwnUser}
                        stretch={isMobile}
                      >
                        {user.active ? 'Tirar acesso' : 'Reativar acesso'}
                      </ActionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ) : null}

        {currentUser ? (
          <SectionCard id="historico-admin" eyebrow="Histórico" title="Histórico de pacientes" description="Os atendimentos recentes ficam em uso normal. Após 30 dias, o sistema compacta o histórico em arquivo seguro e mantém o registro principal arquivado para retenção legal." style={{ padding: sectionPadding }}>
            <Row minWidth={isMobile ? 180 : 220}>
              <StatCard label="Histórico recente" value={summary.recentHistory ?? 0} tone="white" />
              <StatCard label="Registros arquivados" value={retention.archivedAppointmentCount ?? summary.archivedHistory ?? 0} />
              <StatCard label="Arquivos compactados" value={retention.activeArchiveFileCount ?? summary.archiveFiles ?? 0} tone="green" />
              <StatCard label="A compactar" value={retention.pendingArchiveCount ?? 0} tone="white" />
            </Row>

            <div style={{ padding: '16px 18px', borderRadius: '8px', background: '#E0F2FE', border: '1px solid #BAE6FD', color: '#475569', lineHeight: 1.8 }}>
              <strong style={{ color: '#D9F7FF' }}>Política ativa:</strong> histórico visível por {retention.archiveAfterDays ?? 30} dias, arquivo compactado mantido por {retention.archiveFileRetentionDays ?? 90} dias e registro clínico preservado por {retention.medicalRecordRetentionYears ?? 20} anos. A rotina automática roda ao iniciar o servidor e uma vez por dia.
            </div>

            <Row minWidth={isMobile ? 180 : 240}>
              <Field label="Buscar no histórico" value={historySearch} onChange={setHistorySearch} placeholder="Nome, CPF, data, procedimento ou observação" />
              <SelectField
                label="Filtro"
                value={historyFilter}
                onChange={setHistoryFilter}
                options={[
                  { value: 'all', label: 'Todos os registros' },
                  { value: 'recent', label: 'Somente recentes' },
                  { value: 'archived', label: 'Somente arquivados' },
                ]}
              />
            </Row>

            {isAdmin ? (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <ActionButton onClick={handleRunRetentionMaintenance} variant="primary" disabled={busyKey === 'retention'} stretch={isMobile}>
                  {busyKey === 'retention' ? 'Executando manutenção...' : 'Executar manutenção agora'}
                </ActionButton>
                <ActionButton onClick={handleBackupDownload} disabled={busyKey === 'backup'} stretch={isMobile}>
                  {busyKey === 'backup' ? 'Gerando backup...' : 'Baixar backup completo'}
                </ActionButton>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: '10px' }}>
              <strong style={{ fontSize: '18px' }}>Registros encontrados</strong>
              {historyRecords.length === 0 ? (
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Nenhum registro encontrado para essa busca.</p>
              ) : (
                historyRecords.slice(0, 80).map((item) => (
                  <button key={item.id} type="button" onClick={() => openAppointmentDetails(item.id)} style={{ textAlign: 'left', padding: '14px', borderRadius: '8px', background: item.archivedAt ? '#E0F2FE' : '#F8FAFC', border: item.archivedAt ? '1px solid #BAE6FD' : '1px solid #E2E8F0', color: '#FFFFFF', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>{item.fullName}</strong>
                        <span style={{ color: '#15ABD1', fontSize: '13px' }}>{formatDateLabel(item.date)}{item.time ? ` às ${item.time}` : ''}</span>
                      </div>
                      <span style={{ borderRadius: '8px', padding: '7px 10px', background: item.archivedAt ? '#E0F2FE' : '#DCFCE7', color: item.archivedAt ? '#D9F7FF' : '#BEEFFF', fontSize: '12px' }}>
                        {item.archivedAt ? 'Arquivado' : 'Recente'}
                      </span>
                    </div>
                    <div style={{ marginTop: '8px', color: '#64748B', fontSize: '13px', lineHeight: 1.6 }}>
                      CPF {item.cpf} - {item.procedureName || 'Procedimento a definir'} - status {item.status}
                    </div>
                  </button>
                ))
              )}
            </div>

            {isAdmin ? (
              <div style={{ display: 'grid', gap: '10px' }}>
                <strong style={{ fontSize: '18px' }}>Arquivos compactados</strong>
                {archiveFiles.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>Ainda não existe arquivo compactado. A rotina cria o primeiro quando houver registros com mais de 30 dias.</p>
                ) : (
                  archiveFiles.map((file) => (
                    <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '14px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ color: '#475569', lineHeight: 1.7 }}>
                        <strong style={{ display: 'block', color: '#FFFFFF' }}>{file.fileName}</strong>
                        <span>{file.recordsCount} registro(s) - {formatFileSize(file.fileSizeBytes)} - {file.periodStart || '-'} a {file.periodEnd || '-'}</span>
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>Criado em {formatDateTimeLabel(file.createdAt)}</div>
                      </div>
                      <ActionButton onClick={() => handleDownloadArchiveFile(file.id)} disabled={busyKey === `archive-${file.id}`}>
                        {busyKey === `archive-${file.id}` ? 'Baixando...' : 'Baixar'}
                      </ActionButton>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {!adminScheduleOnly ? (
          <>
            <SectionCard id="seguranca-admin" eyebrow="Segurança" title="Meu acesso" description="Cada pessoa entra com seu próprio usuário. A senha pode ser alterada sem mexer no restante do sistema." style={{ padding: sectionPadding }}>
              <Row minWidth={isMobile ? 180 : 220}>
                <Field label="Senha atual" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((previous) => ({ ...previous, currentPassword: value }))} />
                <Field label="Nova senha" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((previous) => ({ ...previous, newPassword: value }))} />
                <Field label="Confirmar nova senha" type="password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm((previous) => ({ ...previous, confirmPassword: value }))} />
              </Row>
              <ActionButton onClick={handleChangePassword} variant="primary" disabled={busyKey === 'password'} stretch={isMobile}>{busyKey === 'password' ? 'Atualizando...' : 'Atualizar senha'}</ActionButton>
            </SectionCard>

            <SectionCard eyebrow="Modo equipe" title="Permissões da secretaria" description="Neste perfil, o painel fica focado no operacional: ver datas liberadas, cadastrar pacientes, atualizar status e manter os dados organizados.">
              <p style={{ margin: 0, color: '#64748B', lineHeight: 1.8 }}>A liberação de agenda fica reservada para o acesso de administração.</p>
            </SectionCard>
          </>
        ) : null}
        </div>
        </main>
        {isAdmin ? (
          <nav className="admin-mobile-nav">
            {adminSectionLinks.slice(0, 5).map((item) => (
              <a key={`mobile-${item.label}`} href={item.href}>{item.label}</a>
            ))}
          </nav>
        ) : null}
      </div>

      {selectedPatient ? (
        <div
          onClick={() => {
            setSelectedPatientId('');
            closeAppointmentEditor();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '12px' : '24px',
            zIndex: 9998,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '760px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, rgba(8,24,34,0.98) 0%, rgba(6,14,22,0.98) 100%)',
              border: '1px solid #BAE6FD',
              borderRadius: '28px',
              padding: isMobile ? '20px' : '28px',
              boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
              color: '#FFFFFF',
              display: 'grid',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#15ABD1', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '11px', marginBottom: '10px' }}>
                  Atendimento
                </div>
                <h2 style={{ margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: isMobile ? '32px' : '40px' }}>
                  {selectedPatient.fullName}
                </h2>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  {formatDateLabel(selectedPatient.date)}{selectedPatient.time ? ` às ${selectedPatient.time}` : ''}
                </p>
              </div>
              <ActionButton onClick={() => {
                setSelectedPatientId('');
                closeAppointmentEditor();
              }}>Fechar</ActionButton>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', padding: '14px', borderRadius: '8px', background: selectedPatient.status === 'cancelado' ? '#FEF2F2' : '#DCFCE7', border: selectedPatient.status === 'cancelado' ? '1px solid #FECACA' : '1px solid #BBF7D0' }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Agendamento atual</strong>
                  <span style={{ color: '#475569' }}>{formatDateLabel(selectedPatient.date)}{selectedPatient.time ? ` às ${selectedPatient.time}` : ''}</span>
                </div>
                <span style={{ borderRadius: '8px', padding: '8px 10px', background: selectedPatient.status === 'cancelado' ? '#FEE2E2' : '#DCFCE7', color: selectedPatient.status === 'cancelado' ? '#E7B1B1' : '#BEEFFF', fontSize: '12px' }}>{selectedPatient.status}</span>
              </div>
              <Row minWidth={isMobile ? 180 : 260}>
                <div style={{ display: 'grid', gap: '8px', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0', color: '#475569', lineHeight: 1.7 }}>
                  <strong style={{ color: '#FFFFFF' }}>Dados do paciente</strong>
                  <div><strong>Nome:</strong> {selectedPatient.fullName}</div>
                  <div><strong>CPF:</strong> {selectedPatient.cpf}</div>
                  <div><strong>Endereço:</strong> {selectedPatient.address}</div>
                  {selectedPatient.contactPhone ? <div><strong>Telefone:</strong> {selectedPatient.contactPhone}</div> : null}
                </div>
                <div style={{ display: 'grid', gap: '8px', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0', color: '#475569', lineHeight: 1.7 }}>
                  <strong style={{ color: '#FFFFFF' }}>Dados do agendamento</strong>
                  <div><strong>Data:</strong> {formatDateLabel(selectedPatient.date)}</div>
                  <div><strong>Horário:</strong> {selectedPatient.time || 'Sem horário'}</div>
                  <div><strong>Procedimento:</strong> {selectedPatient.procedureName || 'Procedimento a definir'}</div>
                  <div><strong>Origem:</strong> {selectedPatient.source === 'whatsapp' ? 'WhatsApp' : 'Painel'}</div>
                </div>
              </Row>
              <div style={{ display: 'grid', gap: '8px', padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0', color: '#475569', lineHeight: 1.7 }}>
                <strong style={{ color: '#FFFFFF' }}>Observações internas</strong>
                <div>{selectedPatient.notes || 'Sem observações registradas.'}</div>
              </div>
            </div>

            {appointmentEditOpen ? (
              <div style={{ display: 'grid', gap: '12px', padding: '14px', borderRadius: '8px', background: '#E0F2FE', border: '1px solid #BAE6FD' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '16px', marginBottom: '4px' }}>Remarcar paciente</strong>
                  <span style={{ color: '#64748B', lineHeight: 1.7, fontSize: '13px' }}>Escolha uma data e um horário livre. O sistema já bloqueia horários ocupados.</span>
                </div>
                <Row minWidth={isMobile ? 180 : 220}>
                  <SelectField
                    label="Nova data"
                    value={appointmentEditForm.date}
                    onChange={(value) => {
                      const timeOptions = getEditableTimeOptions(value, selectedPatient, freeTimeSlotsByDate);
                      setAppointmentEditForm({ date: value, time: timeOptions[0] || '' });
                    }}
                    options={appointmentEditDateOptions}
                    disabled={busyKey === `appointment-${selectedPatient.id}` || selectedPatient.status === 'cancelado'}
                  />
                  <SelectField
                    label="Novo horário"
                    value={appointmentEditForm.time}
                    onChange={(value) => setAppointmentEditForm((previous) => ({ ...previous, time: value }))}
                    options={appointmentEditTimeOptions.length > 0 ? appointmentEditTimeOptions.map((time) => ({ value: time, label: time })) : [{ value: '', label: 'Sem horário livre' }]}
                    disabled={busyKey === `appointment-${selectedPatient.id}` || selectedPatient.status === 'cancelado' || appointmentEditTimeOptions.length === 0}
                  />
                </Row>
                {appointmentEditForm.date && appointmentEditForm.time ? (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.20)', border: '1px solid #E2E8F0', color: '#D9F7FF', lineHeight: 1.7 }}>
                    Vai mudar para <strong>{formatDateLabel(appointmentEditForm.date)} às {appointmentEditForm.time}</strong>.
                  </div>
                ) : null}
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7, fontSize: '13px' }}>
                  O horário antigo volta a ficar livre assim que a alteração for salva.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <ActionButton onClick={submitRescheduleAppointment} variant="primary" disabled={busyKey === `appointment-${selectedPatient.id}` || selectedPatient.status === 'cancelado' || appointmentEditTimeOptions.length === 0} stretch={isMobile}>
                    {busyKey === `appointment-${selectedPatient.id}` ? 'Salvando...' : 'Salvar novo horário'}
                  </ActionButton>
                  <ActionButton onClick={closeAppointmentEditor} disabled={busyKey === `appointment-${selectedPatient.id}`} stretch={isMobile}>Voltar</ActionButton>
                </div>
              </div>
            ) : null}

            {!appointmentEditOpen ? (
              <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid #E2E8F0', color: '#64748B', lineHeight: 1.7 }}>
                Para mudar o dia ou horário, use <strong style={{ color: '#FFFFFF' }}>Remarcar paciente</strong>. Para liberar o horário sem escolher outro, use <strong style={{ color: '#FFFFFF' }}>Cancelar agendamento</strong>.
              </div>
            ) : null}

            <div style={{ color: '#15ABD1', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '11px' }}>
              Ações do agendamento
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <ActionButton onClick={() => openAppointmentEditor(selectedPatient)} variant="primary" disabled={busyKey === `appointment-${selectedPatient.id}` || selectedPatient.status === 'cancelado'} stretch={isMobile}>Remarcar paciente</ActionButton>
              <ActionButton onClick={() => setAppointmentStatusSecure(selectedPatient.id, 'confirmado')} variant="primary" disabled={busyKey === `appointment-${selectedPatient.id}`} stretch={isMobile}>Confirmar</ActionButton>
              <ActionButton onClick={() => setAppointmentStatusSecure(selectedPatient.id, 'concluido')} disabled={busyKey === `appointment-${selectedPatient.id}`} stretch={isMobile}>Concluir</ActionButton>
              <ActionButton onClick={() => cancelAppointmentSecure(selectedPatient.id)} variant="danger" disabled={busyKey === `appointment-${selectedPatient.id}` || selectedPatient.status === 'cancelado'} stretch={isMobile}>Cancelar agendamento</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {appointmentModalOpen && !isAdmin ? (
        <div
          onClick={closeAppointmentModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '12px' : '24px',
            zIndex: 9998,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, rgba(8,24,34,0.98) 0%, rgba(6,14,22,0.98) 100%)',
              border: '1px solid #BAE6FD',
              borderRadius: '28px',
              padding: isMobile ? '20px' : '28px',
              boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
              color: '#FFFFFF',
              display: 'grid',
              gap: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#15ABD1', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '11px', marginBottom: '10px' }}>
                  Novo agendamento
                </div>
                <h2 style={{ margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: isMobile ? '34px' : '42px' }}>
                  {appointmentForm.date ? formatDateLabel(appointmentForm.date) : 'Escolha uma data'}
                </h2>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.7 }}>
                  Selecione um horário livre e complete os dados do paciente.
                </p>
              </div>
              <ActionButton onClick={closeAppointmentModal} disabled={busyKey === 'appointment'}>Fechar</ActionButton>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '16px' }}>Horários disponíveis</strong>
                {appointmentForm.time ? <span style={{ borderRadius: '8px', padding: '8px 12px', background: '#DCFCE7', color: '#BEEFFF', fontSize: '13px' }}>Selecionado: {appointmentForm.time}</span> : null}
              </div>
              {appointmentTimeOptions.length === 0 ? (
                <p style={{ margin: 0, color: '#E7B1B1', lineHeight: 1.7 }}>Não há horário livre nessa data.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '10px' }}>
                  {appointmentTimeOptions.map((time) => {
                    const selected = appointmentForm.time === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setAppointmentForm((previous) => ({ ...previous, time }))}
                        style={{
                          minHeight: '56px',
                          borderRadius: '8px',
                          border: selected ? '1px solid #15ABD1' : '1px solid #CBD5E1',
                          background: selected ? '#BAE6FD' : '#E2E8F0',
                          color: selected ? '#D9F7FF' : '#FFFFFF',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Row minWidth={isMobile ? 180 : 260}>
              <Field label="Nome completo do paciente" value={appointmentForm.fullName} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, fullName: value }))} autoFocus onKeyDown={handleAppointmentKeyDown} />
              <Field label="CPF" value={appointmentForm.cpf} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, cpf: formatCpf(value) }))} onKeyDown={handleAppointmentKeyDown} />
            </Row>
            <Field label="Endereço" value={appointmentForm.address} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, address: value }))} onKeyDown={handleAppointmentKeyDown} />
            {appointmentDetailsOpen ? (
              <>
                <Row minWidth={isMobile ? 180 : 260}>
                  <Field label="Procedimento (opcional)" value={appointmentForm.procedureName} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, procedureName: value }))} onKeyDown={handleAppointmentKeyDown} />
                  <SelectField label="Data" value={appointmentForm.date} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, date: value, time: (freeTimeSlotsByDate[value] || [])[0] || '' }))} options={[{ value: '', label: 'Selecione uma data' }, ...receptionistAvailableDates.map((date) => ({ value: date, label: formatDateLabel(date) }))]} />
                </Row>
                <Field label="Observações internas" value={appointmentForm.notes} onChange={(value) => setAppointmentForm((previous) => ({ ...previous, notes: value }))} multiline />
              </>
            ) : (
              <ActionButton onClick={() => setAppointmentDetailsOpen(true)} stretch={isMobile}>Adicionar detalhes</ActionButton>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <ActionButton onClick={submitAppointment} variant="primary" disabled={busyKey === 'appointment' || appointmentTimeOptions.length === 0} stretch={isMobile}>
                {busyKey === 'appointment' ? 'Salvando agendamento...' : 'Confirmar agendamento'}
              </ActionButton>
              <ActionButton onClick={closeAppointmentModal} disabled={busyKey === 'appointment'} stretch={isMobile}>Cancelar</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {systemCheckModalOpen && systemCheckReport ? (
        <div
          onClick={() => setSystemCheckModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '16px' : '24px',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              background: 'linear-gradient(180deg, rgba(8,24,34,0.98) 0%, rgba(6,14,22,0.98) 100%)',
              border: systemCheckReport.ok ? '1px solid rgba(17,175,186,0.28)' : '1px solid #FECACA',
              borderRadius: '28px',
              padding: isMobile ? '22px' : '28px',
              boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
              color: '#FFFFFF',
              display: 'grid',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ color: systemCheckReport.ok ? '#BEEFFF' : '#F2C6C6', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '11px', marginBottom: '10px' }}>
                Diagnóstico do sistema
              </div>
              <h2 style={{ margin: '0 0 10px', fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: isMobile ? '34px' : '42px' }}>
                {systemCheckReport.ok ? 'Tudo funcionando perfeitamente' : 'Encontramos um problema'}
              </h2>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.8 }}>
                {systemCheckReport.ok
                  ? 'As verificações principais passaram. Se ainda existir algum comportamento estranho, envie esse resultado para o suporte com o horário do teste.'
                  : 'Uma ou mais verificações falharam. Entre em contato com o suporte e envie esse resultado para acelerar o atendimento.'}
              </p>
            </div>

            <div style={{ padding: '16px 18px', borderRadius: '18px', background: systemCheckReport.ok ? '#DCFCE7' : '#FEF2F2', border: systemCheckReport.ok ? '1px solid #BBF7D0' : '1px solid rgba(231,177,177,0.22)' }}>
              <div style={{ color: 'rgba(244,251,248,0.8)', lineHeight: 1.8 }}>
                <div><strong>Resumo:</strong> {systemCheckReport.summary}</div>
                <div><strong>Executado em:</strong> {systemCheckReport.finishedAt ? new Date(systemCheckReport.finishedAt).toLocaleString('pt-BR') : '-'}</div>
                <div><strong>Perfil:</strong> {systemCheckReport.role === 'admin' ? 'Administração' : 'Recepção'}</div>
              </div>
            </div>

            {!systemCheckReport.ok ? (
              <div style={{ display: 'grid', gap: '10px' }}>
                {systemCheckReport.checks.filter((item) => !item.ok).map((item) => (
                  <div key={item.key} style={{ padding: '14px 16px', borderRadius: '18px', background: 'rgba(255,255,255,0.04)', border: '1px solid #FECACA' }}>
                    <strong style={{ display: 'block', marginBottom: '6px', color: '#F2C6C6' }}>{item.label}</strong>
                    <div style={{ color: 'rgba(244,251,248,0.74)', lineHeight: 1.7 }}>{item.error}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <ActionButton onClick={() => setSystemCheckModalOpen(false)} variant="primary" stretch={isMobile}>Fechar</ActionButton>
              <ActionButton onClick={handleRunSystemCheck} disabled={busyKey === 'system-check'} stretch={isMobile}>
                {busyKey === 'system-check' ? 'Testando novamente...' : 'Testar novamente'}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
