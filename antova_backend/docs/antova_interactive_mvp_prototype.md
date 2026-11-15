import React, { useState, useMemo } from 'react';
import {
ShieldAlert,
CheckCircle2,
AlertTriangle,
FileText,
Cpu,
DollarSign,
Send,
UploadCloud,
Eye,
Lock,
RefreshCw,
ArrowRight,
Terminal,
Layers,
Award,
Sliders,
CheckSquare,
Mail,
ChevronRight,
Zap,
FileSearch
} from 'lucide-react';

// --- INITIAL DETERMINISTIC ENGINEERING & TENDER DATASET ---
const INITIAL_TENDER = {
id: 'TENDER-2026-402',
title: '350 MWp Solar + BESS Substation — 33kV GIS Switchgear & RTU Protection Package',
client: 'Vogt-Grid EPC Consortium GmbH (Berlin / Madrid)',
mrDoc: 'MR-33kV-GIS-Rev4.pdf (148 pages + 14 SLD Sheets)',
pagesParsed: 742,
latencySec: 142,
computeCogs: 4.65,
vendors: [
{
id: 'vendor-a',
name: 'Siemens Energy / Authorised Tier-1',
country: 'Germany',
headlinePrice: 452000,
docName: 'Offer_SIEMENS_8DJH36_Rev2.pdf (196 pages)',
coverClaim: 'Full compliance with MR-33kV-GIS-Rev4 except minor commercial notes.',
badge: 'Compliant Baseline'
},
{
id: 'vendor-b',
name: 'VoltSwitch Industrial / Regionale Partner',
country: 'Turkey / EU',
headlinePrice: 418000,
docName: 'Commercial_Tech_Bid_VoltSwitch_2026.pdf (184 pages)',
coverClaim: '100% Compliant with Material Requisition MR-33kV-GIS-Rev4.',
badge: 'Apparent Low Bidder (-€34k)'
},
{
id: 'vendor-c',
name: 'Powell / Eaton Skid Consortium',
country: 'Netherlands',
headlinePrice: 439000,
docName: 'Eaton_Powell_33kV_Tender_Pack.pdf (214 pages)',
coverClaim: 'Compliant per attached Schedule of Deviations.',
badge: 'Mid Bidder'
}
],
parameters: [
{
id: 'PARAM-01',
category: 'Electrical Ratings (IEC 62271-200)',
name: 'Rated Short-Time Withstand Current (Ik)',
mrRequirement: '50.0 kA RMS (3.0 s)',
pintRule: 'val_kA >= 50.0 and duration_s >= 3.0',
criticality: 'MANDATORY',
vendors: {
'vendor-a': {
extracted: '50.0 kA (3.0 s)',
status: 'COMPLIANT',
confidence: 0.99,
bbox: 'Page 44, BBox [118, 210, 490, 245]',
snippet: 'Rated short-time withstand current (main busbar & breaker): 50 kA / 3s per IEC 62271-100.',
costAdder: 0,
adderFormula: '0 (Meets 50 kA / 3s baseline)'
},
'vendor-b': {
extracted: '31.5 kA (1.0 s)',
status: 'CONFLICT_DOWNGRADE',
confidence: 0.97,
bbox: 'Page 64 (SLD Note 7), BBox [84, 512, 540, 568]',
conflictNote: 'Cover Letter Page 2 states "100% Compliant (50kA)", but SLD Drawing #33-04 Footnote 7 specifies 31.5 kA / 1s vacuum interrupter cells.',
snippet: 'NOTE 7: Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price.',
costAdder: 18500,
adderFormula: '11 Bays x €1,681.82 (Vacuum Breaker & CT Core Upgrade 31.5kA -> 50kA)'
},
'vendor-c': {
extracted: '50.0 kA (1.0 s)',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.96,
bbox: 'Page 51, BBox [140, 310, 480, 355]',
snippet: 'Short-time withstand capability tested for 50 kA RMS at 1.0 second thermal duration.',
costAdder: 6200,
adderFormula: 'Thermal derating & copper cross-section step-up for 3.0s fault clearing'
}
}
},
{
id: 'PARAM-02',
category: 'Primary Conductors & Materials',
name: 'Main Busbar Material & Continuous Current',
mrRequirement: 'Electrolytic Copper (Cu-ETP), 2500 A',
pintRule: 'material == "Cu-ETP" and current_A >= 2500',
criticality: 'MANDATORY',
vendors: {
'vendor-a': {
extracted: 'Electrolytic Copper (Cu-ETP), 2500 A',
status: 'COMPLIANT',
confidence: 0.98,
bbox: 'Page 47, BBox [102, 180, 460, 215]',
snippet: 'Main busbars: Silver-plated high-conductivity electrolytic copper Cu-ETP, 2500A continuous.',
costAdder: 0,
adderFormula: '0'
},
'vendor-b': {
extracted: 'Aluminum Alloy (AlMgSi), 2500 A',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.95,
bbox: 'Page 79, BBox [95, 420, 510, 470]',
snippet: 'Busbar system manufactured from tin-plated E-AlMgSi0.5 aluminum alloy profiles.',
costAdder: 14200,
adderFormula: 'LME Cu vs Al Spot Delta (1,480 kg Cu equivalent + bimetallic joint kit)'
},
'vendor-c': {
extracted: 'Electrolytic Copper (Cu-ETP), 2500 A',
status: 'COMPLIANT',
confidence: 0.99,
bbox: 'Page 58, BBox [110, 205, 495, 240]',
snippet: 'HDHC Electrolytic copper busbar system throughout all MV compartments.',
costAdder: 0,
adderFormula: '0'
}
}
},
{
id: 'PARAM-03',
category: 'Mechanical & Safety Protection',
name: 'Enclosure Ingress & Internal Arc Rating',
mrRequirement: 'IP54 / IAC AFLR 50 kA 1.0 s',
pintRule: 'ip_rating >= 54 and iac_class == "AFLR"',
criticality: 'HIGH',
vendors: {
'vendor-a': {
extracted: 'IP54 / IAC AFLR 50 kA 1.0 s',
status: 'COMPLIANT',
confidence: 0.99,
bbox: 'Page 39, BBox [120, 300, 510, 340]',
snippet: 'Enclosure protection IP54 with rear gas exhaust ducting IAC AFLR 50kA 1s.',
costAdder: 0,
adderFormula: '0'
},
'vendor-b': {
extracted: 'IP42 / IAC AFL (3 sides only) 31.5 kA',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.94,
bbox: 'Page 88, BBox [130, 610, 520, 665]',
snippet: 'Standard indoor IP42 ventilation louvers; arc classification AFL (front and lateral only).',
costAdder: 8900,
adderFormula: 'IP54 Gasket/Filter Kit + Rear Arc-Flash Plenum Ducting (AFL -> AFLR)'
},
'vendor-c': {
extracted: 'IP54 / IAC AFLR 50 kA 1.0 s',
status: 'COMPLIANT',
confidence: 0.97,
bbox: 'Page 63, BBox [115, 280, 490, 320]',
snippet: 'Full IP54 dust/splash sealing and 4-sided AFLR internal arc containment.',
costAdder: 0,
adderFormula: '0'
}
}
},
{
id: 'PARAM-04',
category: 'Control, SCADA & Protection Relays',
name: 'IED Protection & Redundant IEC 61850 PRP',
mrRequirement: 'Dual-Port Fiber IEC 61850 Ed.2 PRP + Pre-wired RTU Marshalling',
pintRule: 'protocol == "IEC61850_Ed2_PRP" and rtu_marshalling == "PREWIRED"',
criticality: 'HIGH',
vendors: {
'vendor-a': {
extracted: 'Siprotec 5 IEC 61850 Ed.2 PRP + Pre-wired Marshalling',
status: 'COMPLIANT',
confidence: 0.98,
bbox: 'Page 104, BBox [90, 150, 530, 210]',
snippet: 'Includes dual-homing fiber LC ports (PRP Protocol) wired to central X100 RTU terminal marshalling bay.',
costAdder: 0,
adderFormula: '0'
},
'vendor-b': {
extracted: 'Single RJ45 Modbus TCP + Loose Interposing Relays',
status: 'CONFLICT_DOWNGRADE',
confidence: 0.93,
bbox: 'Page 119, BBox [78, 390, 545, 455]',
conflictNote: 'Compliance table claims IEC 61850 support, but BOM Line 44 quotes basic RS485/RJ45 communication card and ships interposing terminal blocks loose for site wiring.',
snippet: 'BOM Pos 44: Standard comm port RJ45; SCADA marshalling terminals supplied loose for EPC field termination.',
costAdder: 7400,
adderFormula: '11x Dual-Fiber PRP Cards (€3,300) + 68 hrs Site Electrician Wiring (€4,100)'
},
'vendor-c': {
extracted: 'ABB Relion 615 IEC 61850 PRP (Marshalling Excluded)',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.95,
bbox: 'Page 112, BBox [100, 410, 505, 460]',
snippet: 'Relays include PRP fiber ports; customer SCADA wiring directly to individual bay LV compartments.',
costAdder: 4100,
adderFormula: '68 hrs Site Electrician Termination & Point-to-Point Ring-out'
}
}
},
{
id: 'PARAM-05',
category: 'Quality Assurance & Testing',
name: 'Witnessed Factory Acceptance Test (I-FAT)',
mrRequirement: '5-Day Witnessed Integrated FAT (I-FAT) Included',
pintRule: 'ifat_days >= 5 and witnessed == True',
criticality: 'COMMERCIAL',
vendors: {
'vendor-a': {
extracted: '5-Day Witnessed I-FAT Included',
status: 'COMPLIANT',
confidence: 0.99,
bbox: 'Page 162, BBox [110, 220, 480, 260]',
snippet: 'Price includes 5 days factory test bay allocation for client witnessed I-FAT with primary injection.',
costAdder: 0,
adderFormula: '0'
},
'vendor-b': {
extracted: 'Routine Unwitnessed Test Report Only',
status: 'OMITTED',
confidence: 0.98,
bbox: 'Page 171, BBox [88, 510, 520, 555]',
snippet: 'Standard routine test certificates provided. Witnessed FAT charged extra at €1,300/day + test bay setup.',
costAdder: 6500,
adderFormula: '5 Days Test Bay Allocation + Primary Injection Engineer Rate (5 x €1,300)'
},
'vendor-c': {
extracted: '3-Day Witnessed FAT Included',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.96,
bbox: 'Page 189, BBox [105, 330, 490, 370]',
snippet: 'Includes 3 days witnessed inspection; additional days billed per tariff.',
costAdder: 2600,
adderFormula: '2 Additional I-FAT Days for SCADA point-to-point verification'
}
}
},
{
id: 'PARAM-06',
category: 'Commercial & Logistics Terms',
name: 'Incoterms 2020 & Site Unloading',
mrRequirement: 'DDP Project Site (Brandenburg, DE) + Defect Liability 36 Mo',
pintRule: 'incoterm == "DDP" and warranty_months >= 36',
criticality: 'COMMERCIAL',
vendors: {
'vendor-a': {
extracted: 'DDP Brandenburg Site / 36 Months Warranty',
status: 'COMPLIANT',
confidence: 0.99,
bbox: 'Page 188, BBox [95, 190, 510, 235]',
snippet: 'Delivery DDP Solar Substation Site (Incoterms 2020), 36-month defect liability period.',
costAdder: 0,
adderFormula: '0'
},
'vendor-b': {
extracted: 'EXW Factory (Izmir) / 18 Months Warranty',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.99,
bbox: 'Page 181, BBox [102, 600, 535, 650]',
snippet: 'Prices quoted Ex-Works (EXW) factory loading dock; standard 18-month warranty from dispatch.',
costAdder: 9300,
adderFormula: '2x Low-Loader Heavy Freight + Transit Insurance (€6,100) + 18-Mo Warranty Bond (€3,200)'
},
'vendor-c': {
extracted: 'DAP Site / 24 Months Warranty',
status: 'DEVIATION_DOWNGRADE',
confidence: 0.97,
bbox: 'Page 204, BBox [112, 410, 495, 450]',
snippet: 'Delivered At Place (DAP); warranty 24 months from commissioning.',
costAdder: 2100,
adderFormula: '12-Month Extended Defect Liability Bond Adder'
}
}
}
]
};

export default function SpecClawMVP() {
const [activeTab, setActiveTab] = useState('tbe'); // 'dropzone' | 'tbe' | 'cbe' | 'negotiator'
const [selectedParamId, setSelectedParamId] = useState('PARAM-01');
const [selectedVendorFocus, setSelectedVendorFocus] = useState('vendor-b');

// Interactive Should-Cost Multiplier & Clawback Simulation State
const [copperIndexMultiplier, setCopperIndexMultiplier] = useState(1.0);
const [siteLaborRate, setSiteLaborRate] = useState(60); // EUR/hr
const [negotiationRound, setNegotiationRound] = useState(1);
const [approvalGateLocked, setApprovalGateLocked] = useState(true);
const [concededItems, setConcededItems] = useState([]);
const [pipelineRunning, setPipelineRunning] = useState(false);
const [pipelineStep, setPipelineStep] = useState(4);

// Trigger simulated ingestion pipeline
const handleRunPipeline = () => {
setPipelineRunning(true);
setPipelineStep(1);
setTimeout(() => setPipelineStep(2), 600);
setTimeout(() => setPipelineStep(3), 1200);
setTimeout(() => {
setPipelineStep(4);
setPipelineRunning(false);
}, 1800);
};

// Calculate dynamic adders based on interactive sliders and concessions
const vendorFinancials = useMemo(() => {
return INITIAL_TENDER.vendors.map((v) => {
let totalTechPenalty = 0;
let totalCommercialAdder = 0;
let clawedBackAmount = 0;

  INITIAL_TENDER.parameters.forEach((p) => {
    const vData = p.vendors[v.id];
    let rawAdder = vData.costAdder;

    // Adjust dynamically if user changes Copper index or Site Labor slider
    if (p.id === 'PARAM-02' && rawAdder > 0) {
      rawAdder = Math.round(rawAdder * copperIndexMultiplier);
    }
    if (p.id === 'PARAM-04' && rawAdder > 0) {
      const baseHardware = v.id === 'vendor-b' ? 3300 : 0;
      rawAdder = Math.round(baseHardware + 68 * siteLaborRate);
    }

    // Check if Vendor B conceded this item during autonomous negotiation rounds
    const isConceded = v.id === 'vendor-b' && concededItems.includes(p.id);
    if (isConceded) {
      clawedBackAmount += rawAdder;
    } else {
      if (p.criticality === 'COMMERCIAL') {
        totalCommercialAdder += rawAdder;
      } else {
        totalTechPenalty += rawAdder;
      }
    }
  });

  const trueEvaluatedPrice = v.headlinePrice + totalTechPenalty + totalCommercialAdder;

  return {
    ...v,
    totalTechPenalty,
    totalCommercialAdder,
    totalAdders: totalTechPenalty + totalCommercialAdder,
    clawedBackAmount,
    trueEvaluatedPrice
  };
});


}, [copperIndexMultiplier, siteLaborRate, concededItems]);

const activeParam = INITIAL_TENDER.parameters.find((p) => p.id === selectedParamId) || INITIAL_TENDER.parameters[0];
const vendorBStats = vendorFinancials.find((v) => v.id === 'vendor-b');
const specClawFee = Math.round(vendorBStats.clawedBackAmount * 0.15);
const netClientSavings = vendorBStats.clawedBackAmount - specClawFee;

// Simulate multi-turn vendor negotiation concession
const handleSimulateNegotiationTurn = () => {
if (negotiationRound === 1) {
setNegotiationRound(2);
setConcededItems(['PARAM-01', 'PARAM-03', 'PARAM-05']); // Vendor absorbs 50kA, IP54, and Witnessed FAT
} else if (negotiationRound === 2) {
setNegotiationRound(3);
setConcededItems(['PARAM-01', 'PARAM-02', 'PARAM-03', 'PARAM-05', 'PARAM-06']); // Vendor also absorbs Cu Busbar & DDP
} else {
setNegotiationRound(1);
setConcededItems([]);
}
};

  const getStatusBadge = (status, isConceded) => {
    if (isConceded) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> CLAWED BACK (€0 Extra)
        </span>
      );
    }
    switch (status) {
      case 'COMPLIANT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> COMPLIANT
          </span>
        );
      case 'CONFLICT_DOWNGRADE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50">
            <ShieldAlert className="w-3 h-3 text-rose-400" /> SLD CONFLICT TRAP
          </span>
        );
      case 'DEVIATION_DOWNGRADE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> SPEC DOWNGRADE
          </span>
        );
      case 'OMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
            <AlertTriangle className="w-3 h-3 text-purple-400" /> SCOPE EXCLUDED
          </span>
        );
      default:
        return null;
    }
  };
return (

 CLAWED BACK (€0 Extra)

);
}
switch (status) {
case 'COMPLIANT':
return (

 COMPLIANT

);
case 'CONFLICT_DOWNGRADE':
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* TOP NAVIGATION & TELEMETRY HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-lg shadow-cyan-500/30">
              SC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-white font-mono">SpecClaw</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  YC 2027 MVP • v1.0 Production
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Autonomous Technical Bid Evaluation (TBE) & Spec-Deviation Clawback Engine
              </p>
            </div>
          </div>
      {/* LIVE SYSTEM METRICS PILLS */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <div className="px-3 py-1.5 rounded-md bg-slate-800/90 border border-slate-700 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Docs:</span>
          <span className="text-white font-semibold">{INITIAL_TENDER.pagesParsed} pages</span>
        </div>
        <div className="px-3 py-1.5 rounded-md bg-slate-800/90 border border-slate-700 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Latency:</span>
          <span className="text-white font-semibold">{INITIAL_TENDER.latencySec}s</span>
        </div>
        <div className="px-3 py-1.5 rounded-md bg-slate-800/90 border border-slate-700 flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Compute COGS:</span>
          <span className="text-emerald-400 font-semibold">${INITIAL_TENDER.computeCogs}</span>
        </div>
        <div className="px-3 py-1.5 rounded-md bg-rose-950/70 border border-rose-700/60 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-rose-200">Hidden Traps Caught:</span>
          <span className="text-rose-400 font-bold">€64,800</span>
        </div>
      </div>
    </div>

    {/* ACTIVE TENDER SUB-BAR & MODULE TABS */}
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/60">
      <div className="flex items-center gap-2 text-xs text-slate-300 pb-2">
        <span className="font-mono text-cyan-400 font-semibold">{INITIAL_TENDER.id}:</span>
        <span className="font-medium truncate max-w-xl">{INITIAL_TENDER.title}</span>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'dropzone', label: '1. Tender Drop-Zone & Parser', icon: UploadCloud },
          { id: 'tbe', label: '2. Multimodal TBE Matrix & BBox', icon: Layers },
          { id: 'cbe', label: '3. Should-Cost Leveling (CBE)', icon: DollarSign },
          { id: 'negotiator', label: '4. Autonomous Clawback Agent', icon: Send }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  </header>

  {/* MAIN WORKSPACE CONTENT */}
  <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
    {/* ===================================================================
        TAB 1: ZERO-ERP TENDER DROP-ZONE & DETERMINISTIC PIPELINE
    =================================================================== */}
    {activeTab === 'dropzone' && (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-cyan-400" />
                Zero-Integration Tender Drop-Zone (24-Hour Shadow Audit Wedge)
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                No SAP, Coupa, or IT security onboarding required. Upload the Material Requisition (MR) + Competing Vendor PDFs to execute deterministic physics & cost verification.
              </p>
            </div>
            <button
              onClick={handleRunPipeline}
              disabled={pipelineRunning}
              className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${pipelineRunning ? 'animate-spin' : ''}`} />
              {pipelineRunning ? 'Running Pint & BBox Verification...' : 'Re-Run 742-Page Extraction Pipeline'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT: BUYER BASELINE SPEC UPLOAD */}
            <div className="border-2 border-dashed border-cyan-500/40 bg-cyan-950/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  Step A: Buyer Baseline Requirement Graph
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  SHA-256 Verified
                </span>
              </div>
              <div className="space-y-2.5">
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">MR-33kV-GIS-Rev4_Specification.pdf</div>
                      <div className="text-xs text-slate-400">134 Pages • IEC 62271-200 Mandatory Rules Extracted</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">142 Requirements</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">Substation_SLD_33kV_SingleLine.dwg.pdf</div>
                      <div className="text-xs text-slate-400">14 Vector CAD Sheets • CT/VT Ratios, 50kA 3s Busbar</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">11 Switchgear Bays</span>
                </div>
              </div>
            </div>

            {/* RIGHT: COMPETING OEM VENDOR PACKAGES */}
            <div className="border-2 border-dashed border-slate-700 bg-slate-900/40 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold">
                  Step B: Competing OEM Vendor Bid Packages (3 Uploaded)
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  594 Vendor Pages
                </span>
              </div>
              <div className="space-y-2.5">
                {INITIAL_TENDER.vendors.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        {v.name}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                          Quote: €{v.headlinePrice.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{v.docName}</div>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Indexed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4-STAGE ARCHITECTURE PIPELINE STATUS */}
          <div className="mt-6 pt-6 border-t border-slate-800">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-4">
              Deterministic vs. Probabilistic Execution Architecture (Strict Hallucination Guardrail)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                {
                  step: 1,
                  title: '1. PyMuPDF + VLM Parser',
                  type: 'HYBRID EXTRACTION',
                  desc: 'Extracts text tables & SLD symbols with mandatory [page, x0, y0, x1, y1] bounding boxes.'
                },
                {
                  step: 2,
                  title: '2. Pint SI Unit Solver',
                  type: '100% DETERMINISTIC',
                  desc: 'Normalizes units (50,000 A -> 50.0 kA) and runs hard Python boolean inequalities.'
                },
                {
                  step: 3,
                  title: '3. Hierarchy Conflict Check',
                  type: '100% DETERMINISTIC',
                  desc: 'Overrides "100% Compliant" cover letters when SLD footnotes or BOM lines conflict.'
                },
                {
                  step: 4,
                  title: '4. Parametric Cost Engine',
                  type: '100% DETERMINISTIC',
                  desc: 'Maps spec downgrades to LME Cu/Al indices, freight lanes, and site labor adders.'
                }
              ].map((item) => (
                <div
                  key={item.step}
                  className={`p-3.5 rounded-lg border transition-all ${
                    pipelineStep >= item.step
                      ? 'bg-slate-950 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900/40 border-slate-800 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white">{item.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                      {item.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ===================================================================
        TAB 2: MULTIMODAL TBE MATRIX & BOUNDING-BOX CITATION INSPECTOR
    =================================================================== */}
    {activeTab === 'tbe' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 8 COLS: INTERACTIVE TBE COMPARISON MATRIX */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Automated Technical Bid Evaluation (TBE) Matrix
              </h2>
              <p className="text-xs text-slate-400">
                Click any engineering parameter row to inspect the exact PDF/SLD bounding-box citation & Pint rule check.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-cyan-300 border border-slate-700">
              6 Critical Parameters Shown (of 142)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-mono uppercase text-slate-400">
                  <th className="py-3 px-4">Engineering Parameter & MR Baseline</th>
                  <th className="py-3 px-3">Siemens Energy (€452k)</th>
                  <th className="py-3 px-3 bg-rose-950/20 border-x border-rose-900/30 text-rose-300">
                    VoltSwitch (€418k Low Bid)
                  </th>
                  <th className="py-3 px-3">Powell / Eaton (€439k)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {INITIAL_TENDER.parameters.map((param) => {
                  const isSelected = param.id === selectedParamId;
                  const isConceded = concededItems.includes(param.id);
                  return (
                    <tr
                      key={param.id}
                      onClick={() => setSelectedParamId(param.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-cyan-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400">
                            {param.id}
                          </span>
                          <span className="font-bold text-white">{param.name}</span>
                        </div>
                        <div className="text-slate-400 mt-1 font-mono text-[11px]">
                          Req: <span className="text-slate-200">{param.mrRequirement}</span>
                        </div>
                      </td>

                      {/* VENDOR A */}
                      <td className="py-3.5 px-3 align-top">
                        {getStatusBadge(param.vendors['vendor-a'].status, false)}
                        <div className="text-slate-300 mt-1.5 font-medium">
                          {param.vendors['vendor-a'].extracted}
                        </div>
                      </td>

                      {/* VENDOR B (FOCUS) */}
                      <td className="py-3.5 px-3 align-top bg-rose-950/10 border-x border-rose-900/20">
                        {getStatusBadge(param.vendors['vendor-b'].status, isConceded)}
                        <div className="text-slate-200 mt-1.5 font-medium">
                          {param.vendors['vendor-b'].extracted}
                        </div>
                        {param.vendors['vendor-b'].costAdder > 0 && (
                          <div
                            className={`mt-1 font-mono text-[11px] font-bold ${
                              isConceded ? 'line-through text-slate-500' : 'text-rose-400'
                            }`}
                          >
                            Penalty Adder: +€{param.vendors['vendor-b'].costAdder.toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* VENDOR C */}
                      <td className="py-3.5 px-3 align-top">
                        {getStatusBadge(param.vendors['vendor-c'].status, false)}
                        <div className="text-slate-300 mt-1.5 font-medium">
                          {param.vendors['vendor-c'].extracted}
                        </div>
                        {param.vendors['vendor-c'].costAdder > 0 && (
                          <div className="mt-1 font-mono text-[11px] text-amber-400">
                            Adder: +€{param.vendors['vendor-c'].costAdder.toLocaleString()}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT 4 COLS: BOUNDING-BOX CITATION & DETERMINISTIC PINT INSPECTOR */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sticky top-28">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Citation & Conflict Inspector</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                {activeParam.id}
              </span>
            </div>

            {/* VENDOR SELECTOR INSIDE INSPECTOR */}
            <div className="grid grid-cols-3 gap-1.5 mb-4 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {INITIAL_TENDER.vendors.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVendorFocus(v.id)}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold truncate transition cursor-pointer ${
                    selectedVendorFocus === v.id
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {v.name.split(' ')[0]}
                </button>
              ))}
            </div>

            {(() => {
              const vDetail = activeParam.vendors[selectedVendorFocus];
              return (
                <div className="space-y-4 text-xs">
                  {/* HIERARCHY CONFLICT ALERT IF PRESENT */}
                  {vDetail.conflictNote && (
                    <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-600/70 text-rose-200">
                      <div className="font-bold text-rose-300 flex items-center gap-1.5 mb-1">
                        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                        Hierarchy Override: Cover Letter vs. Drawing Trap!
                      </div>
                      <p className="leading-relaxed text-[11px]">{vDetail.conflictNote}</p>
                    </div>
                  )}

                  {/* DETERMINISTIC PINT RULE CHECK */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono">
                    <div className="text-[10px] uppercase text-slate-400 mb-1 flex items-center justify-between">
                      <span>Deterministic Pint / SymPy Rule</span>
                      <span className="text-emerald-400">Confidence: {(vDetail.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-cyan-300 text-[11px] break-all">
                      assert {activeParam.pintRule}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800 text-slate-300">
                      Extracted Value: <span className="text-white font-bold">{vDetail.extracted}</span>
                    </div>
                  </div>

                  {/* VERIFIED BOUNDING BOX COORDINATE CITATION */}
                  <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 mb-2">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Source Bounding Box
                      </span>
                      <span>{vDetail.bbox}</span>
                    </div>
                    <div className="p-3 rounded bg-slate-900 border-l-4 border-amber-400 text-slate-200 font-mono text-[11px] italic">
                      "{vDetail.snippet}"
                    </div>
                  </div>

                  {/* PARAMETRIC SHOULD-COST ADDER */}
                  <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Parametric Should-Cost Penalty Calculation
                    </div>
                    <div className="text-sm font-bold text-rose-400 font-mono">
                      +€{vDetail.costAdder.toLocaleString()} Risk-Adjusted Adder
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{vDetail.adderFormula}</div>
                  </div>

                  <button
                    onClick={() => setActiveTab('negotiator')}
                    className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
                  >
                    Send to Autonomous Clawback Negotiator <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    )}

    {/* ===================================================================
        TAB 3: COMMERCIAL BID LEVELING (CBE) & SHOULD-COST ENGINE
    =================================================================== */}
    {activeTab === 'cbe' && (
      <div className="space-y-6">
        {/* INTERACTIVE PARAMETRIC SENSITIVITY CONTROLS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Live Parametric Should-Cost Sensitivity Controls
            </h2>
            <p className="text-xs text-slate-400">
              Adjust live LME Copper/Aluminum commodity indices and German EPC site electrician labor rates to dynamically recalculate True Evaluated Price.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between gap-4 text-xs mb-1">
                <span className="text-slate-400">LME Copper Spot Multiplier:</span>
                <span className="font-mono font-bold text-cyan-400">{copperIndexMultiplier.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={copperIndexMultiplier}
                onChange={(e) => setCopperIndexMultiplier(parseFloat(e.target.value))}
                className="w-44 accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between gap-4 text-xs mb-1">
                <span className="text-slate-400">Site Field Wiring Labor Rate:</span>
                <span className="font-mono font-bold text-cyan-400">€{siteLaborRate}/hr</span>
              </div>
              <input
                type="range"
                min="45"
                max="95"
                step="5"
                value={siteLaborRate}
                onChange={(e) => setSiteLaborRate(parseInt(e.target.value, 10))}
                className="w-44 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 3-VENDOR SIDE-BY-SIDE COMMERCIAL WATERFALL CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {vendorFinancials.map((v) => {
            const isLowHeadline = v.id === 'vendor-b';
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-5 flex flex-col justify-between ${
                  isLowHeadline
                    ? 'bg-slate-900/95 border-cyan-500/60 shadow-xl shadow-cyan-500/5'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {v.country}
                    </span>
                    <span
                      className={`text-[11px] font-mono px-2.5 py-0.5 rounded font-semibold ${
                        isLowHeadline
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {v.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">{v.name}</h3>

                  <div className="mt-4 space-y-2.5 text-xs border-t border-slate-800 pt-4 font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>1. Vendor Headline Quote:</span>
                      <span className="font-bold text-white">€{v.headlinePrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>2. Technical Deviation Penalties:</span>
                      <span>+€{v.totalTechPenalty.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>3. Commercial Exclusion Adders:</span>
                      <span>+€{v.totalCommercialAdder.toLocaleString()}</span>
                    </div>
                    {v.clawedBackAmount > 0 && (
                      <div className="flex justify-between text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-700/50">
                        <span>4. SpecClaw Negotiated Clawback:</span>
                        <span className="font-bold">-€{v.clawedBackAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase font-mono text-slate-400">True Risk-Adjusted Cost:</span>
                    <span
                      className={`text-xl font-bold font-mono ${
                        v.trueEvaluatedPrice <= 440000 ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      €{v.trueEvaluatedPrice.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {v.id === 'vendor-b' && v.clawedBackAmount === 0 && (
                      <span className="text-rose-300">
                        Trap Exposed: Looks €34k cheaper on paper, actually costs €30.8k MORE than Siemens unless clawed back!
                      </span>
                    )}
                    {v.id === 'vendor-b' && v.clawedBackAmount > 0 && (
                      <span className="text-emerald-300 font-medium">
                        Clawback Active: Vendor B forced to absorb €{v.clawedBackAmount.toLocaleString()} in spec upgrades at €418k base price!
                      </span>
                    )}
                    {v.id !== 'vendor-b' && (
                      <span>Used as anonymized compliance benchmark to pressure Vendor B.</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* SPECCLAW 15% PERFORMANCE FEE & ROI SUMMARY BOX */}
        <div className="bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-cyan-500/40 rounded-xl p-5 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <Award className="w-8 h-8 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Trojan Horse Monetization: "Split-the-Clawback" Unit Economics
              </h3>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                By forcing Vendor B to absorb technical deviations (50 kA rating, Copper Busbars, IP54, Witnessed FAT, DDP Freight) without raising their €418,000 headline price, the EPC unlocks immediate hard-dollar CAPEX savings.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            <div className="px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Clawed-Back Value</div>
              <div className="text-base font-bold text-emerald-400">
                €{vendorBStats.clawedBackAmount.toLocaleString()}
              </div>
            </div>
            <div className="px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">SpecClaw 15% Fee</div>
              <div className="text-base font-bold text-cyan-400">€{specClawFee.toLocaleString()}</div>
            </div>
            <div className="px-4 py-2.5 rounded-lg bg-emerald-950/60 border border-emerald-600/50">
              <div className="text-emerald-200 text-[10px] uppercase">Net EPC Savings</div>
              <div className="text-base font-bold text-emerald-300">€{netClientSavings.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ===================================================================
        TAB 4: AUTONOMOUS TQ & SPEC-DEVIATION CLAWBACK NEGOTIATOR
    =================================================================== */}
    {activeTab === 'negotiator' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 5 COLS: STATE MACHINE, GUARDRAILS & ROUND SIMULATOR */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-cyan-400" />
              Autonomous TQ & Clawback State Machine
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Generates engineering-backed Technical Queries (TQs) & commercial counter-offers citing exact page coordinates and LME indices.
            </p>

            {/* SAFETY & IDEMPOTENCY GUARDRAILS */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono mb-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Idempotency-Key:</span>
                <span className="text-cyan-400">sha256:402-vb-r{negotiationRound}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Citation Schema Check:</span>
                <span className="text-emerald-400">6/6 BBox Verified</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Dispatch Mode:</span>
                <button
                  onClick={() => setApprovalGateLocked(!approvalGateLocked)}
                  className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                    approvalGateLocked
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  {approvalGateLocked ? '1-Click Human Approval Gate' : 'Auto-Send Enabled'}
                </button>
              </div>
            </div>

            {/* NEGOTIATION ROUND TRACKER */}
            <div className="space-y-2.5 mb-5">
              <div className="text-xs font-mono uppercase text-slate-400">
                Multi-Turn Concession Tracker (Vendor B: VoltSwitch)
              </div>
              {[
                {
                  r: 1,
                  title: 'Round 1: Initial TQ & Deviation Penalty Notice',
                  detail: 'Exposes €64,800 in SLD/BOM downgrades vs Cover Letter claim.'
                },
                {
                  r: 2,
                  title: 'Round 2: Vendor Concedes 50kA, IP54 & Witnessed FAT',
                  detail: '€33,900 clawed back at zero price increase.'
                },
                {
                  r: 3,
                  title: 'Round 3: Final Closure (Cu Busbar + DDP Absorbed)',
                  detail: '€57,400 total spec value clawed back at €418,000 base quote.'
                }
              ].map((step) => (
                <div
                  key={step.r}
                  className={`p-3 rounded-lg border text-xs transition ${
                    negotiationRound === step.r
                      ? 'bg-cyan-950/30 border-cyan-500/60 text-white'
                      : negotiationRound > step.r
                      ? 'bg-emerald-950/20 border-emerald-700/40 text-emerald-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{step.title}</span>
                    {negotiationRound >= step.r && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">{step.detail}</div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSimulateNegotiationTurn}
              className="w-full py-3 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              {negotiationRound < 3
                ? `Simulate Vendor Reply & Advance to Round ${negotiationRound + 1}`
                : 'Reset Negotiation Simulation to Round 1'}
            </button>
          </div>
        </div>

        {/* RIGHT 7 COLS: GENERATED TECHNICAL QUERY & CLAWBACK EMAIL PREVIEW */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Mail className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300">OUTBOUND DISPATCH PREVIEW • ROUND {negotiationRound} OF 3</span>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Clawed Back So Far: €{vendorBStats.clawedBackAmount.toLocaleString()}
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs leading-relaxed font-mono text-slate-200 flex-1">
            <div className="space-y-1 pb-3 border-b border-slate-800 text-slate-400">
              <div>
                <span className="text-slate-500">To:</span> m.yilmaz@voltswitch-industrial.com (Lead Tendering Engineer)
              </div>
              <div>
                <span className="text-slate-500">Cc:</span> strategic-procurement@vogt-grid-epc.de
              </div>
              <div>
                <span className="text-slate-500">Subject:</span> [ACTION REQUIRED] Technical Query Register & Commercial Leveling — {INITIAL_TENDER.id} (Round {negotiationRound})
              </div>
            </div>

            {negotiationRound === 1 && (
              <div className="space-y-3 text-slate-200 font-sans text-xs">
                <p>Dear VoltSwitch Tendering Team,</p>
                <p>
                  Thank you for submitting Offer <strong>Commercial_Tech_Bid_VoltSwitch_2026.pdf</strong> (€418,000). While your cover letter (Page 2) states 100% compliance with Material Requisition <strong>MR-33kV-GIS-Rev4</strong>, our automated engineering audit identified <strong>6 critical technical deviations and scope exclusions</strong> totaling <strong>€64,800</strong> in commercial risk adjustment:
                </p>
                <ul className="space-y-2 pl-4 list-disc text-slate-300">
                  <li>
                    <strong>TQ-01 (Short-Circuit Rating Conflict — Page 64, SLD Note 7):</strong> You quoted 31.5 kA (1.0s) vacuum interrupters instead of the mandatory 50.0 kA (3.0s) rating. <em>(Evaluated Penalty: +€18,500)</em>
                  </li>
                  <li>
                    <strong>TQ-02 (Busbar Material — Page 79):</strong> E-AlMgSi0.5 Aluminum quoted instead of Electrolytic Copper Cu-ETP 2500A. <em>(Evaluated Penalty per LME Cu/Al delta: +€14,200)</em>
                  </li>
                  <li>
                    <strong>TQ-03 (Enclosure & Arc Rating — Page 88):</strong> IP42 / IAC AFL (3-sided) quoted instead of IP54 / IAC AFLR 50kA rear ducting. <em>(Evaluated Penalty: +€8,900)</em>
                  </li>
                  <li>
                    <strong>TQ-04 (SCADA PRP & Marshalling — Page 119, BOM Pos 44):</strong> Single RJ45 Modbus card & loose terminal blocks quoted instead of Dual-Fiber IEC 61850 Ed.2 PRP pre-wired to RTU marshalling bay. <em>(Evaluated Penalty: +€7,400)</em>
                  </li>
                  <li>
                    <strong>TQ-05 & TQ-06 (Witnessed I-FAT & EXW Incoterms — Pages 171 & 181):</strong> Excluded 5-day witnessed I-FAT and quoted EXW Izmir instead of DDP Brandenburg Site. <em>(Evaluated Penalty: +€15,800)</em>
                  </li>
                </ul>
                <p className="p-3 rounded bg-amber-950/40 border border-amber-700/50 text-amber-200">
                  <strong>Commercial Award Condition:</strong> Two competing Tier-1 bidders have confirmed full compliance on 50 kA (3s), Cu-ETP busbars, IP54 AFLR, and DDP Brandenburg delivery. To remain in first position for PO award this Friday, please sign and return the attached Deviation Closure Sheet confirming absorption of TQ-01 through TQ-06 within your €418,000 base price.
                </p>
              </div>
            )}

            {negotiationRound === 2 && (
              <div className="space-y-3 text-slate-200 font-sans text-xs">
                <div className="p-3 rounded bg-emerald-950/40 border border-emerald-700/50 text-emerald-200">
                  <strong>Vendor Reply Ingested (Round 1 -> Round 2):</strong> VoltSwitch agreed to upgrade all 11 bays to <strong>50.0 kA (3s)</strong>, include <strong>IP54 + Rear AFLR Ducting</strong>, and include the <strong>5-Day Witnessed I-FAT</strong> at zero extra cost (€33,900 clawed back). They requested a €19,000 adder for Copper Busbars and DDP freight.
                </div>
                <p>Dear VoltSwitch Tendering Team,</p>
                <p>
                  We acknowledge and lock in your written confirmation closing <strong>TQ-01 (50kA 3s)</strong>, <strong>TQ-03 (IP54 AFLR)</strong>, and <strong>TQ-05 (5-Day Witnessed I-FAT)</strong> at no cost impact.
                </p>
                <p>
                  Regarding your requested €19,000 adder for <strong>TQ-02 (Cu-ETP 2500A Busbars)</strong> and <strong>TQ-06 (DDP Brandenburg Delivery)</strong>: based on current LME Grade-A Copper settlement indices and dual low-loader transit rates from Izmir to Brandenburg, the net factory delta is €11,400—and our competing compliant bidder is within 2.1% of your adjusted total.
                </p>
                <p className="font-semibold text-cyan-300">
                  Final Counter-Offer for Immediate PO Release: Absorb Cu-ETP busbars (TQ-02) and DDP Brandenburg freight (TQ-06) at your €418,000 contract price, in exchange for moving milestone payment #2 (30%) from Site Delivery to successful I-FAT sign-off.
                </p>
              </div>
            )}

            {negotiationRound === 3 && (
              <div className="space-y-3 text-slate-200 font-sans text-xs">
                <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-500/60 text-emerald-200">
                  <div className="font-bold text-sm text-emerald-300 flex items-center gap-2 mb-1">
                    <CheckSquare className="w-4 h-4" />
                    DEVIATION CLOSURE SIGNED — €57,400 CLAWED BACK!
                  </div>
                  <p>
                    VoltSwitch signed Revision 3 Deviation Closure Sheet absorbing <strong>50kA (3s) breakers, Electrolytic Copper 2500A busbars, IP54 AFLR arc ducting, 5-Day Witnessed I-FAT, and DDP Brandenburg delivery</strong> at their original <strong>€418,000</strong> headline price.
                  </p>
                </div>
                <div className="p-3.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs space-y-1.5">
                  <div className="text-cyan-400 font-bold">FINAL AUDIT PACKET READY FOR PO ATTACHMENT:</div>
                  <div>• Initial Headline Quote: €418,000</div>
                  <div>• Uncovered Hidden Deviation Risk: €64,800</div>
                  <div>• SpecClaw Verified Clawback Concessions: €57,400 (Absorbed Free by Vendor)</div>
                  <div>• SpecClaw 15% Performance Fee: €8,610</div>
                  <div className="text-emerald-400 font-bold">• Net Verified EPC Savings Unlocked: €48,790</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </main>
</div>


);
}