/**
 * The evaluated parameters and rate tables, ported from the Python engine
 * (antova_backend/backend/antova_ingest/ontology.py and rates/*.json) so the built-in engine checks
 * the same things, against the same rules, priced from the same tables.
 */
import rateV2 from './rates/mv_gis_switchgear_v2.json' with { type: 'json' };
import rateExtV1 from './rates/mv_gis_switchgear_ext_v1.json' with { type: 'json' };

export type Criticality = 'MANDATORY' | 'HIGH' | 'MEDIUM' | 'COMMERCIAL';

export type FieldKind =
  | 'current'
  | 'duration'
  | 'voltage'
  | 'temperature'
  | 'ip'
  | 'iac'
  | 'material'
  | 'protocol'
  | 'marshalling'
  | 'fat_days'
  | 'incoterm'
  | 'months'
  | 'lead_time'
  | 'percent'
  | 'scope'
  | 'altitude'
  | 'standard';

export type Operator = 'ge' | 'le' | 'eq' | 'ord' | 'all';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  operator: Operator;
  label: string;
  /** What the model should look for, with the unit it is usually written in. */
  hint: string;
  plausible?: [string, string]; // written with units; parsed to the kind's base unit (values.ts UNITS)
}

export interface ParameterDef {
  id: string;
  name: string;
  category: string;
  criticality: Criticality;
  fields: FieldDef[];
  locateHint: string;
  /** Words that name the parameter in running text: used to pick pages when a document is too long. */
  sweepTerms: RegExp[];
}

const P = (
  id: string,
  name: string,
  category: string,
  criticality: Criticality,
  fields: FieldDef[],
  locateHint: string,
  sweepTerms: RegExp[]
): ParameterDef => ({ id, name, category, criticality, fields, locateHint, sweepTerms });

export const PARAMETERS: ParameterDef[] = [
  P('PARAM-01', 'Rated Short-Time Withstand Current (Ik)', 'Electrical Ratings (IEC 62271-200)', 'MANDATORY',
    [
      { name: 'ik', kind: 'current', operator: 'ge', label: 'Ik', hint: 'short-time withstand current, e.g. "31.5 kA"', plausible: ['10 kA', '100 kA'] },
      { name: 'ik_duration', kind: 'duration', operator: 'ge', label: 't', hint: 'its duration, e.g. "3 s"', plausible: ['0.5 s', '5 s'] },
    ],
    'Rated short-time withstand current Ik of the switchgear and its duration in seconds. Not the internal arc (IAC) test current or duration.',
    [/short[- ]time/i, /\bIk\b/, /withstand current/i, /\d\s*kA\s*(?:\/|for|at|,)?\s*\d+(?:[.,]\d+)?\s*s\b/i]),
  P('PARAM-02', 'Main Busbar Material & Continuous Current', 'Primary Conductors & Materials', 'MANDATORY',
    [
      { name: 'material', kind: 'material', operator: 'eq', label: 'Material', hint: 'busbar conductor material, e.g. "Cu-ETP" or "aluminium"' },
      { name: 'rated_current', kind: 'current', operator: 'ge', label: 'Ir', hint: 'busbar rated continuous current, e.g. "2500 A"', plausible: ['200 A', '6300 A'] },
    ],
    "Main busbar conductor material (copper or aluminium) and the busbar's rated continuous current.",
    [/busbar/i]),
  P('PARAM-03', 'Enclosure Ingress & Internal Arc Rating', 'Mechanical & Safety Protection', 'HIGH',
    [
      { name: 'ip', kind: 'ip', operator: 'ge', label: 'IP', hint: 'enclosure IP code, e.g. "IP54"' },
      { name: 'iac_class', kind: 'iac', operator: 'ord', label: 'IAC', hint: 'internal arc class: AF, AFL or AFLR' },
    ],
    'Enclosure degree of protection (IP code) and internal arc classification (IAC class such as AF, AFL or AFLR).',
    [/\bIP\s?\d[\dX]\b/i, /\bIAC\b/, /internal arc/i, /degree of protection/i]),
  P('PARAM-04', 'IED Protection & Redundant IEC 61850 PRP', 'Control, SCADA & Protection Relays', 'HIGH',
    [
      { name: 'protocol', kind: 'protocol', operator: 'eq', label: 'Protocol', hint: 'IED communication, e.g. "IEC 61850 Ed.2 with PRP" or "Modbus RTU"' },
      { name: 'marshalling', kind: 'marshalling', operator: 'eq', label: 'Marshalling', hint: 'whether RTU/SCADA marshalling is pre-wired, or left to the buyer' },
    ],
    'Protection IED communication (IEC 61850 edition and PRP redundancy, or other ports such as Modbus/RJ45) and whether RTU/SCADA marshalling is pre-wired or left to the buyer.',
    [/61850/, /\bPRP\b/, /marshalling/i, /modbus/i]),
  P('PARAM-05', 'Witnessed Factory Acceptance Test (I-FAT)', 'Quality Assurance & Testing', 'COMMERCIAL',
    [
      { name: 'witnessed_fat_days_included', kind: 'fat_days', operator: 'ge', label: 'Witnessed FAT days', hint: 'client-witnessed FAT days included in the price, e.g. "3 days"; "0" if excluded or charged extra', plausible: ['0', '30'] },
    ],
    'Witnessed factory acceptance test: how many client-witnessed test days are included in the price, or whether witnessed testing is excluded or charged extra.',
    [/witness/i, /\bI?-?FAT\b/, /factory acceptance/i, /routine test/i]),
  P('PARAM-06', 'Incoterms 2020 & Site Unloading', 'Commercial & Logistics Terms', 'COMMERCIAL',
    [
      { name: 'incoterm', kind: 'incoterm', operator: 'ord', label: 'Incoterm', hint: 'Incoterms 2020 term, e.g. "DDP site"' },
      { name: 'warranty_months', kind: 'months', operator: 'ge', label: 'Warranty months', hint: 'warranty / defect liability period, e.g. "24 months"', plausible: ['1', '120'] },
    ],
    'Delivery Incoterm and place, and the warranty or defect liability period in months.',
    [/\b(?:EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/, /ex[- ]works/i, /incoterm/i, /warranty/i, /defect liability/i, /guarantee/i]),
  P('PARAM-07', 'Rated Voltage (Ur)', 'Electrical Ratings (IEC 62271-200)', 'MANDATORY',
    [{ name: 'rated_voltage', kind: 'voltage', operator: 'ge', label: 'Ur', hint: 'rated voltage Ur, e.g. "36 kV"', plausible: ['1 kV', '52 kV'] }],
    'Rated voltage Ur of the switchgear.',
    [/rated voltage/i, /\bUr\b/]),
  P('PARAM-08', 'Max Ambient Temperature (No Derating)', 'Thermal & Environmental', 'MANDATORY',
    [{ name: 'max_ambient', kind: 'temperature', operator: 'ge', label: 'Tamb', hint: 'maximum ambient temperature without derating, e.g. "40 °C"', plausible: ['25 °C', '70 °C'] }],
    'Maximum ambient air temperature the equipment is rated for without derating.',
    [/ambient/i]),
];

export const EXTENDED_PARAMETERS: ParameterDef[] = [
  P('PARAM-09', 'Delivery Lead Time', 'Schedule & Delivery', 'HIGH',
    [{ name: 'lead_time', kind: 'lead_time', operator: 'le', label: 'Lead time', hint: 'delivery lead time, e.g. "26 weeks from PO"', plausible: ['1 weeks', '150 weeks'] }],
    'Delivery lead time in weeks and what it is counted from. Not the offer validity, the drawing submission time, the FAT date or the warranty period.',
    [/lead[- ]time/i, /deliver\w*[^.;]{0,30}\b(?:weeks?|months?|days?)\b/i]),
  P('PARAM-10', 'Delay Liquidated Damages', 'Commercial Risk (Liquidated Damages)', 'HIGH',
    [
      { name: 'ld_rate', kind: 'percent', operator: 'ge', label: 'LD rate', hint: 'delay LD rate per week as % of contract price, e.g. "0.5 %"', plausible: ['0 %', '10 %'] },
      { name: 'ld_cap', kind: 'percent', operator: 'ge', label: 'LD cap', hint: 'cap on delay LDs as % of contract price, e.g. "10 %"', plausible: ['0 %', '100 %'] },
    ],
    'Delay liquidated damages: the rate per week or per day of delay as a percentage of the contract price, and the maximum cap on them.',
    [/liquidated damages/i, /\bLDs?\b/, /delay damages/i, /penalt\w+/i]),
  P('PARAM-11', 'Limitation of Liability', 'Commercial Risk (Liability)', 'HIGH',
    [{ name: 'liability_cap', kind: 'percent', operator: 'ge', label: 'Liability cap', hint: "cap on the supplier's total liability as % of contract price", plausible: ['1 %', '1000 %'] }],
    "The limit on the supplier's total liability as a percentage of the contract price. Not the defect liability period and not liquidated damages.",
    [/liabilit\w+/i]),
  P('PARAM-12', 'Commissioning Spares', 'Scope Boundary & Site Interface', 'COMMERCIAL',
    [{ name: 'spares_included', kind: 'scope', operator: 'ge', label: 'Commissioning spares', hint: '"included", "excluded", "optional" or "quoted separately"' }],
    'Whether commissioning spare parts are included in the price, or quoted separately, optional or excluded.',
    [/spares?\b/i, /spare parts/i]),
  P('PARAM-13', 'Site Supervision', 'Scope Boundary & Site Interface', 'COMMERCIAL',
    [{ name: 'supervision_included', kind: 'scope', operator: 'ge', label: 'Site supervision', hint: '"included", "excluded", "optional" or "quoted separately"' }],
    'Whether supervision of erection and commissioning at site is included in the price, or quoted separately, optional or excluded.',
    [/supervis\w+/i, /commissioning engineer/i]),
  P('PARAM-14', 'Rated Altitude', 'Thermal & Environmental', 'MANDATORY',
    [{ name: 'site_altitude', kind: 'altitude', operator: 'ge', label: 'Altitude', hint: 'rated / installation altitude, e.g. "1000 m"', plausible: ['0 m', '4500 m'] }],
    'The altitude above sea level the equipment is rated for, or the installation altitude the MR requires, in metres or feet.',
    [/altitude/i, /elevation/i, /above sea level/i]),
  P('PARAM-15', 'Applicable Standards & Editions', 'Standards & Certification', 'HIGH',
    [{ name: 'standards', kind: 'standard', operator: 'all', label: 'Standards', hint: 'design/type-test standards with editions, e.g. "IEC 62271-200:2021, IEC 62271-1:2017"' }],
    'The standards (IEC, IEEE, EN, VDE, ISO) the equipment is designed and type-tested to, with the edition year where written. Not ISO 9001.',
    [/designed\s+(?:and\s+[\w-]+\s+)?(?:to|in accordance with|according to)/i, /type[- ]tested/i, /compl(?:y|ies|iant|iance)\s+with/i]),
];

export const DEFAULT_EQUIPMENT_CLASS = 'mv_gis_switchgear';
export const EXTENDED_EQUIPMENT_CLASS = 'mv_gis_switchgear_ext';

export const EQUIPMENT_CLASSES: Record<string, { parameters: ParameterDef[]; defaultRateTable: string }> = {
  [DEFAULT_EQUIPMENT_CLASS]: { parameters: PARAMETERS, defaultRateTable: 'mv_gis_switchgear_v2' },
  [EXTENDED_EQUIPMENT_CLASS]: { parameters: [...PARAMETERS, ...EXTENDED_PARAMETERS], defaultRateTable: 'mv_gis_switchgear_ext_v1' },
};

export const ORDINALS: Record<'incoterm' | 'iac', string[]> = {
  incoterm: ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'],
  iac: ['AF', 'AFL', 'AFLR'],
};

// --- Rate tables ------------------------------------------------------------------------------

export type Driver = 'fixed' | 'copper' | 'labour' | 'freight';

export interface RateLine {
  label: string;
  qty: string; // {X}: bay | lot | kg | h | day | month | load (per `unit`)
  unit: string;
  rate: string; // {EUR/X}; line cost {EUR} = qty{X} * rate{EUR/X}
  driver: Driver;
  low?: string; // {EUR/X}
  high?: string; // {EUR/X}
}

export interface RateTable {
  version: string;
  equipment_class?: string;
  effective_date: string;
  currency: string;
  base_labour_rate: string; // {EUR/h}
  unpriced_classes: string[];
  exposure_classes?: string[];
  deviation_rates: Record<string, RateLine[]>;
}

export const RATE_TABLES: Record<string, RateTable> = {
  mv_gis_switchgear_v2: rateV2 as RateTable,
  mv_gis_switchgear_ext_v1: rateExtV1 as RateTable,
};

const CLASS_SUFFIX: Record<string, string> = {
  'PARAM-02.material': 'material_al_for_cu',
  'PARAM-02.rated_current': 'current_short',
  'PARAM-03.ip': 'ip_below_ip54',
  'PARAM-03.iac_class': 'iac_not_aflr',
  'PARAM-04.protocol': 'no_prp',
  'PARAM-04.marshalling': 'marshalling_not_prewired',
  'PARAM-05.witnessed_fat_days_included': 'witnessed_fat_days_short',
  'PARAM-06.warranty_months': 'warranty_short',
  'PARAM-07.rated_voltage': 'voltage_short',
  'PARAM-08.max_ambient': 'ambient_short',
  'PARAM-09.lead_time': 'lead_time_long',
  'PARAM-10.ld_rate': 'ld_rate_short',
  'PARAM-10.ld_cap': 'ld_cap_short',
  'PARAM-11.liability_cap': 'liability_cap_short',
  'PARAM-12.spares_included': 'spares_missing',
  'PARAM-13.supervision_included': 'supervision_missing',
  'PARAM-14.site_altitude': 'altitude_short',
  'PARAM-15.standards': 'standard_not_met',
};

/** The rate-table class of each failing check, as costs.deviation_classes names them. */
export function deviationClasses(
  param: ParameterDef,
  failing: Set<string>,
  offered: Record<string, string>,
  required: Record<string, string>
): string[] {
  if (param.id === 'PARAM-01') {
    if (failing.has('ik')) return ['PARAM-01.ik_rating_short'];
    if (failing.has('ik_duration')) return ['PARAM-01.ik_duration_short'];
    return [];
  }
  const classes: string[] = [];
  for (const f of param.fields) {
    if (!failing.has(f.name)) continue;
    if (f.kind === 'incoterm') {
      classes.push(`${param.id}.incoterm_${(offered[f.name] || '').toLowerCase()}_to_${(required[f.name] || '').toLowerCase()}`);
    } else {
      classes.push(`${param.id}.${CLASS_SUFFIX[`${param.id}.${f.name}`] ?? `${f.name}_short`}`);
    }
  }
  return classes;
}
