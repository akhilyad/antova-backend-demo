// A stand-in OpenAI-compatible model for testing the built-in engine without an API key.
// It answers the engine's spec and bid prompts by keyword search over the page text it is sent, so
// the whole pipeline (upload, parse, locate, quote check, units, pricing, review) runs end to end.
// It is not a model: it knows only the sample tender's wording.
//
//   node scripts/mock-llm.mjs            # listens on 127.0.0.1:4010, key "mock-key", model "mock-model"
//   LLM_BASE_URL=http://127.0.0.1:4010/v1 LLM_API_KEY=mock-key LLM_MODEL_NAME=mock-model npm run dev
import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT || 4010);
const KEY = process.env.MOCK_LLM_KEY || 'mock-key';

// field: [line filter, value pattern]
const RULES = {
  'PARAM-01': {
    ik: [/withstand|\bIk\b|\d\s*kA\s*\d/i, /(\d+(?:[.,]\d+)?\s*kA)/i],
    ik_duration: [/withstand|\bIk\b|\d\s*kA\s*\d/i, /kA[^.]*?(\d+(?:[.,]\d+)?\s*s)\b/i],
  },
  'PARAM-02': {
    material: [/busbar/i, /(electrolytic copper Cu-ETP|Cu-ETP|copper|aluminium)/i],
    rated_current: [/busbar/i, /(\d[\d.,]*\s*k?A)\b/],
  },
  'PARAM-03': { ip: [/\bIP\s?\d/i, /(IP\s?\d[\dX])/i], iac_class: [/IAC/i, /IAC\s+(A-?F-?L?-?R?)\b/i] },
  'PARAM-04': {
    protocol: [/61850|modbus/i, /(IEC 61850[^;,]*|Modbus[^;,]*)/i],
    marshalling: [/marshal/i, /([^.]*marshal[^.]*)/i, 'window'],
  },
  'PARAM-05': { witnessed_fat_days_included: [/witness/i, /(\d+[- ]day|charged extra|excluded|not included)/i] },
  'PARAM-06': {
    incoterm: [/\b(EXW|DDP|DAP|FCA|CIP)\b/, /\b(EXW|DDP|DAP|FCA|CIP)\b[^.;]*/],
    warranty_months: [/warranty|defect liability/i, /(\d+\s*months)/i],
  },
  'PARAM-07': { rated_voltage: [/rated voltage/i, /(\d[\d.,]*\s*k?V)\b/] },
  'PARAM-08': { max_ambient: [/ambient/i, /([+-]?\d+\s*°\s*C(?:\s*to\s*[+-]?\d+\s*°\s*C)?)/] },
};

function pagesOf(text) {
  const out = [];
  const re = /\[page (\d+)\]\n([\s\S]*?)(?=\n\[page \d+\]\n|$)/g;
  let m;
  while ((m = re.exec(text))) out.push({ page: Number(m[1]), lines: m[2].split('\n').filter(Boolean) });
  return out;
}

/** Every [page, quote, value] for a field, a quote being the line plus the one before it. */
function candidates(pages, [filter, pattern, mode]) {
  const out = [];
  for (const p of pages) {
    p.lines.forEach((line, i) => {
      if (!filter.test(line)) return;
      const window = i > 0 ? `${p.lines[i - 1]} ${line}` : line;
      const fromLine = mode === 'window' ? null : line.match(pattern);
      const m = fromLine || window.match(pattern);
      if (m) out.push({ page: p.page, quote: fromLine ? line : window, value: (m[1] || m[0]).trim() });
    });
  }
  return out;
}

function answerSpec(text) {
  const pages = pagesOf(text);
  const parameters = {};
  for (const [id, fields] of Object.entries(RULES)) {
    const entry = { fields: {} };
    for (const [name, rule] of Object.entries(fields)) {
      const c = candidates(pages, rule)[0];
      entry.fields[name] = { value: c ? c.value : null };
      if (c && !entry.quote) Object.assign(entry, { quote: c.quote, page: c.page, requirement: c.quote });
    }
    if (entry.quote) parameters[id] = entry;
  }
  const bay = pages.flatMap((p) => p.lines.map((l) => ({ p: p.page, l, m: l.match(/(\d+)\s+bays/i) }))).find((x) => x.m);
  return {
    document_title: pages[0]?.lines[0] ?? null,
    bay_count: bay ? { value: Number(bay.m[1]), quote: bay.l, page: bay.p } : { value: null, quote: '', page: null },
    parameters,
  };
}

function answerBid(text) {
  const pages = pagesOf(text);
  const parameters = {};
  for (const [id, fields] of Object.entries(RULES)) {
    const entry = { fields: {}, conflict: null, confidence: 0.9 };
    for (const [name, rule] of Object.entries(fields)) {
      const all = candidates(pages, rule);
      // Documentary pages (after the cover letter and compliance table) first.
      const docs = all.filter((c) => c.page > 3);
      const main = docs[0] ?? all[0];
      entry.fields[name] = main ? { value: main.value, quote: main.quote, page: main.page, section: main.page > 3 ? 'datasheet' : 'cover_letter' } : { value: null };
      const other = all.find((c) => c.page <= 3 && main && c.page !== main.page && c.value.replace(/\s/g, '') !== main.value.replace(/\s/g, ''));
      if (other && !entry.conflict) {
        entry.conflict = { field: name, value: other.value, quote: other.quote, page: other.page, section: 'cover_letter', note: 'The cover letter and the datasheet differ.' };
      }
    }
    parameters[id] = entry;
  }
  let price = null;
  for (const p of pages) {
    for (const line of p.lines) {
      const m = line.match(/total[^€]*?(€\s?[\d,.]+|EUR\s?[\d,.]+)/i);
      if (m && !price) price = { amount: m[1], currency: 'EUR', quote: line, page: p.page };
    }
  }
  return { vendor_name: pages[0]?.lines[0] ?? null, cover_claim: pages.find((p) => p.page === 2)?.lines[0] ?? null, headline_price: price, parameters };
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    if ((req.headers.authorization || '') !== `Bearer ${KEY}`) return reply(res, 401, { error: { message: 'Incorrect API key provided.' } });
    if (req.method === 'GET' && req.url.endsWith('/models')) return reply(res, 200, { data: [{ id: 'mock-model' }] });
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) return reply(res, 404, { error: { message: 'not found' } });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
    let answer;
    if (user.includes('MR document "')) answer = answerSpec(user.slice(user.indexOf('MR document "')));
    else if (user.includes('Bid document "')) answer = answerBid(user.slice(user.indexOf('Bid document "')));
    else if (user.includes('Question:')) answer = { answer: 'Mock answer: the cited clause is shown in the context.' };
    else answer = { ok: true };
    const content = JSON.stringify(answer);
    reply(res, 200, {
      id: 'mock',
      object: 'chat.completion',
      model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: Math.round(user.length / 4), completion_tokens: Math.round(content.length / 4) },
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock LLM on http://127.0.0.1:${PORT}/v1`));
