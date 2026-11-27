/**
 * Reading a value as written ("2.5 kA", "IP4X", "24 months", "DDP site") into a comparable form, and
 * the deterministic check between a requirement and an offer. The model only finds the text; the
 * units, conversions and pass/fail are decided here, in code, the way the Python engine does with Pint.
 */
import { ORDINALS, type FieldDef, type FieldKind } from './ontology.ts';

export type Parsed =
  | { ok: true; kind: 'number'; base: number; unit: string; label: string }
  | { ok: true; kind: 'ip'; digits: [number, number]; label: string }
  | { ok: true; kind: 'ordinal'; ord: number; label: string }
  | { ok: true; kind: 'category'; value: string; label: string }
  | { ok: true; kind: 'standards'; items: Map<string, number | null>; label: string }
  | { ok: false; reason: string };

type Ok<K extends string> = Extract<Parsed, { ok: true; kind: K }>;

/** "2,500" → 2500, "31,5" → 31.5, "1.234,5" → 1234.5, "2.5" → 2.5. */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ']/g, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /^\-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// A number with thousands separators ("2,500", "1 250") or without ("2500", "31,5", "2.5"), never cut
// off in the middle of a longer number.
const NUM = String.raw`([+-]?(?:\d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d))`;

interface UnitDef {
  pattern: RegExp;
  factor: number;
  label: string;
}

/** Each numeric kind: its units, how far each is from the base unit, and the base unit's label. */
// factor = {base/unit}: base = n{unit} * factor. {A/kA}=1000, {V/kV}=1000, {m/ft}=0.3048,
// {month/year}=12, {week/working-day}=1/5, {week/day}=1/7, {week/month}=52/12.
// percent: {%} only; no per-day/per-month -> {%/week} normalisation (Python does this).
const UNITS: Partial<Record<FieldKind, { base: string; units: UnitDef[] }>> = {
  current: {
    base: 'A',
    units: [
      { pattern: /^k\s?a\b/i, factor: 1000, label: 'kA' },
      { pattern: /^(a|amps?|amperes?)\b/i, factor: 1, label: 'A' },
    ],
  },
  duration: {
    base: 's',
    units: [
      { pattern: /^(ms|milliseconds?)\b/i, factor: 0.001, label: 'ms' },
      { pattern: /^(s|sec|secs|seconds?)\b/i, factor: 1, label: 's' },
    ],
  },
  voltage: {
    base: 'V',
    units: [
      { pattern: /^k\s?v\b/i, factor: 1000, label: 'kV' },
      { pattern: /^(v|volts?)\b/i, factor: 1, label: 'V' },
    ],
  },
  altitude: {
    base: 'm',
    units: [
      { pattern: /^(ft|feet|foot)\b/i, factor: 0.3048, label: 'ft' },
      { pattern: /^(m|metres?|meters?|masl)\b/i, factor: 1, label: 'm' },
    ],
  },
  months: {
    base: 'months',
    units: [
      { pattern: /^(years?|yrs?)\b/i, factor: 12, label: 'years' },
      { pattern: /^(months?|mos?)\b/i, factor: 1, label: 'months' },
    ],
  },
  lead_time: {
    base: 'weeks',
    units: [
      { pattern: /^(working\s+days?)\b/i, factor: 1 / 5, label: 'working days' },
      { pattern: /^(days?|calendar\s+days?)\b/i, factor: 1 / 7, label: 'days' },
      { pattern: /^(weeks?|wks?)\b/i, factor: 1, label: 'weeks' },
      { pattern: /^(months?)\b/i, factor: 52 / 12, label: 'months' },
    ],
  },
  percent: {
    base: '%',
    units: [{ pattern: /^(%|percent|per\s?cent)/i, factor: 1, label: '%' }],
  },
};

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

function withWordNumbers(text: string): string {
  return text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/gi, (w) => String(WORD_NUMBERS[w.toLowerCase()]));
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

function parseNumeric(kind: FieldKind, text: string): Parsed {
  const def = UNITS[kind];
  if (!def) return { ok: false, reason: 'no unit table' };
  const re = new RegExp(NUM + String.raw`\s*`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseNumber(m[1]); // {unit as stated}; base below = n{unit} * factor{base/unit}
    if (n === null) continue;
    const rest = text.slice(m.index + m[0].length);
    const unit = def.units.find((u) => u.pattern.test(rest));
    if (unit) return { ok: true, kind: 'number', base: n * unit.factor, unit: unit.label, label: `${fmt(n)} ${unit.label}` };
  }
  return { ok: false, reason: `no ${kind} with a unit` };
}

function parseTemperature(text: string): Parsed {
  const m = text.match(new RegExp(NUM + String.raw`\s*(°|º|deg\.?|degrees?)?\s*(C|F|K)\b`, 'i'));
  if (!m) return { ok: false, reason: 'no temperature with a unit' };
  const n = parseNumber(m[1]);
  if (n === null) return { ok: false, reason: 'unreadable number' };
  const u = m[3].toUpperCase();
  if (u === 'K' && !m[2] && n < 150) return { ok: false, reason: 'ambiguous K' };
  // base: {°C} = ({°F} - 32) * 5/9 | {K} - 273.15 | {°C}
  const c = u === 'F' ? ((n - 32) * 5) / 9 : u === 'K' ? n - 273.15 : n;
  return { ok: true, kind: 'number', base: c, unit: `°${u === 'K' ? 'K' : u}`, label: `${fmt(n)} ${u === 'K' ? 'K' : `°${u}`}` };
}

function parseIp(text: string): Parsed {
  const m = text.match(/\bIP\s?([0-6X])([0-9X])\b/i);
  if (!m) return { ok: false, reason: 'no IP code' };
  const d = (c: string) => (c.toUpperCase() === 'X' ? 0 : Number(c));
  return { ok: true, kind: 'ip', digits: [d(m[1]), d(m[2])], label: `IP${m[1].toUpperCase()}${m[2].toUpperCase()}` };
}

function parseOrdinal(kind: 'incoterm' | 'iac', text: string): Parsed {
  let t = text;
  if (kind === 'incoterm') {
    t = t
      .replace(/ex[- ]?works/gi, ' EXW ')
      .replace(/delivered duty paid/gi, ' DDP ')
      .replace(/delivered at place unloaded/gi, ' DPU ')
      .replace(/delivered at place/gi, ' DAP ')
      .replace(/free carrier/gi, ' FCA ');
    const m = t.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i);
    if (!m) return { ok: false, reason: 'no Incoterm' };
    const v = m[1].toUpperCase();
    return { ok: true, kind: 'ordinal', ord: ORDINALS.incoterm.indexOf(v), label: v };
  }
  const m = t.match(/\bA[\s-]?F(?:[\s-]?L(?:[\s-]?R)?)?\b/i);
  if (!m) return { ok: false, reason: 'no IAC class' };
  const v = m[0].replace(/[^a-z]/gi, '').toUpperCase();
  return { ok: true, kind: 'ordinal', ord: ORDINALS.iac.indexOf(v), label: v };
}

function parseCategory(kind: FieldKind, text: string): Parsed {
  const t = text.toLowerCase();
  switch (kind) {
    case 'material': {
      const al = t.search(/alumin(i)?um|\bal\b|\bal-/);
      const cu = t.search(/copper|\bcu\b|cu-etp|e-cu|\bcu-/);
      if (al < 0 && cu < 0) return { ok: false, reason: 'no conductor material' };
      const isAl = al >= 0 && (cu < 0 || al < cu);
      return isAl
        ? { ok: true, kind: 'category', value: 'Al', label: 'Aluminium' }
        : { ok: true, kind: 'category', value: 'Cu', label: /etp/.test(t) ? 'Cu-ETP' : 'Copper' };
    }
    case 'protocol': {
      const iec = /61850/.test(t);
      const noPrp = /\b(no|without|not|excluding|excl\.?)\s+(?:[\w-]+\s+){0,3}?(prp|parallel redundancy)\b|\bprp\s+(not|is not|excluded|optional)\b/.test(t);
      const prp = !noPrp && /\bprp\b|parallel redundancy/.test(t);
      const other = t.match(/modbus|dnp3|iec\s?60870|profibus|rj-?45/);
      if (iec && prp) return { ok: true, kind: 'category', value: 'IEC61850+PRP', label: 'IEC 61850 with PRP' };
      if (iec) return { ok: true, kind: 'category', value: 'IEC61850', label: 'IEC 61850 without PRP' };
      if (other) return { ok: true, kind: 'category', value: 'OTHER', label: other[0].toUpperCase() };
      return { ok: false, reason: 'no protocol' };
    }
    case 'marshalling': {
      if (/\b(not|no|un)[\s-]*(pre[\s-]?wired|wired|included)|by (others|the (purchaser|buyer|client|owner))|excluded|left to|loose|site wiring|purchaser'?s scope|buyer'?s scope/.test(t)) {
        return { ok: true, kind: 'category', value: 'NOT_PREWIRED', label: 'not pre-wired' };
      }
      if (/pre[\s-]?wired|factory[\s-]?wired|included|fully wired|wired to terminal/.test(t)) {
        return { ok: true, kind: 'category', value: 'PREWIRED', label: 'pre-wired' };
      }
      return { ok: false, reason: 'no marshalling scope' };
    }
    case 'scope': {
      if (/\b(excluded|not included|not in (our|the) scope|by (others|the (purchaser|buyer|client)))\b/.test(t)) {
        return { ok: true, kind: 'number', base: 0, unit: '', label: 'excluded' };
      }
      if (/\b(optional|separately|extra cost|on request|additional cost|not part of)\b/.test(t)) {
        return { ok: true, kind: 'number', base: 0, unit: '', label: 'quoted separately' };
      }
      if (/\b(included|inclusive|in (our|the) scope|part of (the|our) supply|provided)\b/.test(t)) {
        return { ok: true, kind: 'number', base: 1, unit: '', label: 'included' };
      }
      return { ok: false, reason: 'no scope statement' };
    }
    default:
      return { ok: false, reason: `unknown kind ${kind}` };
  }
}

function parseFatDays(text: string): Parsed {
  const t = withWordNumbers(text.toLowerCase());
  const days = t.match(/(\d+(?:[.,]\d+)?)[\s-]*(?:\(\w+\)\s*)?(?:working[\s-]+|witness(?:ed)?[\s-]+|test[\s-]+)?days?\b/);
  if (days) {
    const n = parseNumber(days[1]);
    if (n !== null) return { ok: true, kind: 'number', base: n, unit: 'days', label: `${fmt(n)} ${n === 1 ? 'day' : 'days'}` };
  }
  if (/\b(excluded|not included|at (extra|additional) cost|charged|chargeable|not witnessed|none|no witnessed)\b/.test(t)) {
    return { ok: true, kind: 'number', base: 0, unit: 'days', label: '0 days' };
  }
  const bare = t.trim().match(/^(\d+(?:[.,]\d+)?)$/);
  if (bare) {
    const n = parseNumber(bare[1])!;
    return { ok: true, kind: 'number', base: n, unit: 'days', label: `${fmt(n)} ${n === 1 ? 'day' : 'days'}` };
  }
  return { ok: false, reason: 'no witnessed FAT days' };
}

// "0.5 % per day", "2 %/month", "1 % for each complete week", "0.1 % daily": an LD rate's period.
const RATE_PERIOD = /^\s*(?:of\s+(?:the\s+)?[^.;,]{0,40}?\s+)?(?:per|\/|each|every|for each)\s*(?:(?:complete|full|started|commenced|whole)\s+)?(week|day|month)\b/i;
const RATE_WEEKLY = /^\s*(?:of\s+[^.;,]{0,40}?\s+)?(weekly|daily)\b/i;
// {X/week}: {%/X} * {X/week} -> {%/week}, the same factors as the Python engine's _PER_WEEK_FACTOR.
const PER_WEEK: Record<string, number> = { week: 1, day: 7, month: 12 / 52 };

function parsePercent(text: string): Parsed {
  const re = new RegExp(NUM + String.raw`\s*(%|percent|per\s?cent)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseNumber(m[1]);
    if (n === null) continue;
    const after = text.slice(m.index + m[0].length);
    const period = after.match(RATE_PERIOD);
    const weekly = period ? null : after.match(RATE_WEEKLY);
    if (period || weekly) {
      const unit = period ? period[1].toLowerCase() : weekly![1].toLowerCase() === 'daily' ? 'day' : 'week';
      return { ok: true, kind: 'number', base: n * PER_WEEK[unit], unit: '%/week', label: `${fmt(n)} % per ${unit}` };
    }
    break; // the first percentage has no period: read it as written below
  }
  const r = parseNumeric('percent', text);
  if (r.ok) return r;
  if (/\b(excluded|not accepted|not applicable|none|no (ld|liquidated)|nil)\b/i.test(text)) {
    return { ok: true, kind: 'number', base: 0, unit: '%', label: '0 % (excluded)' };
  }
  return r;
}

function parseStandards(text: string): Parsed {
  const items = new Map<string, number | null>();
  const re = /\b(IEC|IEEE|EN|VDE|ISO|ANSI|BS|DIN)\s*(?:EN\s*)?(\d+(?:[-.]\d+)*)(?:\s*(?:[:/]|ed\.?|edition)\s*(\d{4}))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const id = `${m[1].toUpperCase()} ${m[2]}`;
    const year = m[3] ? Number(m[3]) : null;
    const prev = items.get(id);
    items.set(id, prev === undefined ? year : Math.max(prev ?? 0, year ?? 0) || null);
  }
  if (!items.size) return { ok: false, reason: 'no standard' };
  const label = [...items].map(([id, y]) => (y ? `${id}:${y}` : id)).join(', ');
  return { ok: true, kind: 'standards', items, label };
}

const NUMERIC_KINDS = new Set<FieldKind>(['current', 'duration', 'voltage', 'altitude', 'months', 'lead_time', 'percent', 'temperature', 'fat_days']);
const RANGE = new RegExp(NUM + String.raw`\s*([^\d\s+-][^\d+-]{0,10}?)?\s*(?:to|until|up to|–|—|…|\.\.\.)\s*` + NUM, 'i');

/**
 * A value written as a range ("-25 °C to +40 °C", "1.5 to 2.5 kA"): the bound that the check is
 * about. An "at least" field takes the top of the range, an "at most" field the bottom.
 */
function parseRange(kind: FieldKind, text: string, operator?: string): Parsed | null {
  const m = text.match(RANGE);
  if (!m || m.index === undefined) return null;
  const rest = text.slice(m.index + m[0].length);
  const leftUnit = (m[2] || '').trim();
  const left = parseValue(kind, `${m[1]} ${leftUnit || rest}`);
  const right = parseValue(kind, `${m[3]}${rest}`);
  if (!left.ok || !right.ok || left.kind !== 'number' || right.kind !== 'number') return null;
  if (operator === 'ge') return left.base >= right.base ? left : right;
  if (operator === 'le') return left.base <= right.base ? left : right;
  return left;
}

export function parseValue(kind: FieldKind, text: string | null | undefined, operator?: string): Parsed {
  const t = (text || '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (operator && NUMERIC_KINDS.has(kind)) {
    const ranged = parseRange(kind, t, operator);
    if (ranged) return ranged;
  }
  switch (kind) {
    case 'current':
    case 'duration':
    case 'voltage':
    case 'altitude':
    case 'months':
    case 'lead_time':
      return parseNumeric(kind, withWordNumbers(t));
    case 'percent':
      return parsePercent(t);
    case 'temperature':
      return parseTemperature(t);
    case 'ip':
      return parseIp(t);
    case 'iac':
      return parseOrdinal('iac', t);
    case 'incoterm':
      return parseOrdinal('incoterm', t);
    case 'fat_days':
      return parseFatDays(t);
    case 'standard':
      return parseStandards(t);
    default:
      return parseCategory(kind, t);
  }
}

/** Whether a parsed value is inside the field's believable range for this equipment class. */
export function plausible(field: FieldDef, value: Parsed): boolean {
  if (!field.plausible || !value.ok || value.kind !== 'number') return true;
  const lo = parseValue(field.kind, field.plausible[0]);
  const hi = parseValue(field.kind, field.plausible[1]);
  if (!lo.ok || !hi.ok || lo.kind !== 'number' || hi.kind !== 'number') return true;
  return value.base >= lo.base - 1e-9 && value.base <= hi.base + 1e-9;
}

export interface CheckResult {
  passed: boolean;
  comparable: boolean;
  required: string;
  offered: string;
  /** The offer in the requirement's own unit ("2.5 kA" against "2500 A" reads "2500 A"). */
  offered_canonical: string;
  /** The offer as a number in the requirement's unit, when it was converted. */
  offered_equivalent: number | null;
  /** How far short of the requirement, in the requirement's unit (for shortfall-priced classes). D3{reqUnit} */
  shortfall: number | null;
}

/** The offered number expressed in the unit the requirement was written in. */
function inUnitOf(field: FieldDef, required: Ok<'number'>, offered: Ok<'number'>): { text: string; value: number; converted: boolean } {
  if (field.kind === 'temperature') {
    // {°F} = {°C} * 9/5 + 32; a '°K' requirement is shown in {°C}
    const f = required.unit === '°F';
    const v = f ? (offered.base * 9) / 5 + 32 : offered.base; // {°F} or {°C} (never {K}, even for a '°K' requirement)
    return { text: `${fmt(v)} ${f ? '°F' : '°C'}`, value: v, converted: offered.unit !== required.unit };
  }
  const def = UNITS[field.kind];
  const unit = def?.units.find((u) => u.label === required.unit);
  const factor = unit?.factor ?? 1;
  // {reqUnit} = {base} / {base/reqUnit}
  const v = offered.base / factor;
  return { text: required.unit ? `${fmt(v)} ${required.unit}` : offered.label, value: v, converted: offered.unit !== required.unit };
}

export function check(field: FieldDef, required: Parsed, offered: Parsed): CheckResult {
  const base = {
    required: required.ok ? required.label : '',
    offered: offered.ok ? offered.label : '',
    offered_canonical: offered.ok ? offered.label : '',
    offered_equivalent: null as number | null,
    shortfall: null as number | null,
  };
  if (!required.ok || !offered.ok || required.kind !== offered.kind) {
    return { ...base, passed: false, comparable: false };
  }
  switch (required.kind) {
    case 'number': {
      const o = offered as Ok<'number'>;
      // conv.value, reqValue: {reqUnit} ({°C} for a '°K' requirement); eps and pass/fail compare in {base}
      const conv = inUnitOf(field, required, o);
      const reqValue = field.kind === 'temperature' && required.unit === '°F' ? (required.base * 9) / 5 + 32 : required.base / (UNITS[field.kind]?.units.find((u) => u.label === required.unit)?.factor ?? 1);
      const eps = 1e-9 * Math.max(1, Math.abs(required.base));
      let passed: boolean;
      if (field.operator === 'le') passed = o.base <= required.base + eps;
      else if (field.operator === 'eq') passed = Math.abs(o.base - required.base) <= eps;
      else passed = o.base >= required.base - eps;
      const shortfall = passed ? 0 : Math.abs(reqValue - conv.value); // {reqUnit} = |{reqUnit} - {reqUnit}|, D3 below
      return {
        ...base,
        passed,
        comparable: true,
        offered_canonical: conv.text,
        offered_equivalent: conv.converted ? Math.round(conv.value * 1000) / 1000 : null,
        shortfall: Math.round(shortfall * 1000) / 1000,
      };
    }
    case 'ip': {
      const o = offered as Ok<'ip'>;
      return { ...base, passed: o.digits[0] >= required.digits[0] && o.digits[1] >= required.digits[1], comparable: true };
    }
    case 'ordinal': {
      const o = offered as Ok<'ordinal'>;
      return { ...base, passed: o.ord >= required.ord, comparable: true };
    }
    case 'category': {
      const o = offered as Ok<'category'>;
      if (field.kind === 'protocol') {
        // PRP required: only 61850 with PRP meets it. 61850 required: either 61850 form does.
        const ok = required.value === 'IEC61850+PRP' ? o.value === 'IEC61850+PRP' : required.value === 'IEC61850' ? o.value.startsWith('IEC61850') : o.value === required.value;
        return { ...base, passed: ok, comparable: true };
      }
      return { ...base, passed: o.value === required.value, comparable: true };
    }
    case 'standards': {
      const o = offered as Ok<'standards'>;
      const missing: string[] = [];
      for (const [id, year] of required.items) {
        if (!o.items.has(id)) missing.push(id);
        else {
          const offeredYear = o.items.get(id);
          if (year && offeredYear && offeredYear < year) missing.push(`${id}:${year}`);
        }
      }
      return { ...base, passed: missing.length === 0, comparable: true };
    }
  }
}

/** "≥", "≤", "=" as the requirement summary writes them. */
export function operatorSymbol(op: string): string {
  return op === 'ge' ? '≥' : op === 'le' ? '≤' : op === 'ord' ? '≥ (class order)' : op === 'all' ? 'includes all of' : '=';
}
