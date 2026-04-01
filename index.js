require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const { nanoid } = require("nanoid");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Banco em memória ─────────────────────────────────────────────────────────
let leads = [];
const sellers = [
  { id: 1, name: "João" },
  { id: 2, name: "Maria" },
  { id: 3, name: "Carlos" },
];
let sellerIndex = -1;

function nextSeller() {
  sellerIndex = (sellerIndex + 1) % sellers.length;
  return sellers[sellerIndex];
}

function extractData(lead, msg) {
  const m = msg.toLowerCase();
  const budget = m.match(/\b\d{4,6}\b/);
  if (budget) lead.budget = budget[0];
  if (m.includes("hatch"))   lead.type = "Hatch";
  if (m.includes("sedan"))   lead.type = "Sedan";
  if (m.includes("suv"))     lead.type = "SUV";
  if (m.includes("pickup"))  lead.type = "Pickup";
  if (m.includes("financ"))  lead.payment = "Financiado";
  if (m.includes("à vista") || m.includes("avista")) lead.payment = "À Vista";
  const nameMatch = m.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([a-záéíóúãõ]+)/i);
  if (nameMatch && !lead.name) lead.name = nameMatch[1];
  return lead;
}

// ─── Ollama AI (local) ───────────────────────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

async function askGroq(lead, message) {
  const system = `Você é um vendedor profissional de automóveis da 7Business Pro.
Objetivo: qualificar o cliente descobrindo orçamento, tipo de veículo e forma de pagamento.
Seja breve, natural e persuasivo. Máximo 2 frases.`;

  const context = `Cliente: ${lead.name || "não informado"} | Orçamento: R$${lead.budget || "?"} | Tipo: ${lead.type || "?"} | Pagamento: ${lead.payment || "?"}`;

  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${context}\n\nCliente disse: "${message}"` }
        ],
      }
    );
    return res.data.message.content;
  } catch (e) {
    console.error("Ollama error:", e.message);
    return "Olá! Como posso te ajudar a encontrar o carro ideal?";
  }
}

// ─── Follow-ups automáticos ───────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  leads.forEach((l) => {
    if (l.stage !== "Fechado" && now - l.lastContact > 10 * 60 * 1000) {
      console.log(`[Follow-up] ${l.name || l.phone} — ${l.stage}`);
      l.lastContact = now;
    }
  });
}, 10 * 60 * 1000);

// ─── Métricas ─────────────────────────────────────────────────────────────────
function getMetrics() {
  const stages = ["Novo Lead", "Contato Inicial", "Interesse", "Proposta", "Negociação", "Fechado"];
  const byStage = {};
  const bySeller = {};
  stages.forEach((s) => (byStage[s] = 0));
  leads.forEach((l) => {
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    const sn = l.seller?.name || "Sem vendedor";
    bySeller[sn] = (bySeller[sn] || 0) + 1;
  });
  const closed = leads.filter((l) => l.stage === "Fechado").length;
  const rate = leads.length ? ((closed / leads.length) * 100).toFixed(1) : 0;
  return { totalLeads: leads.length, conversionRate: rate + "%", byStage, bySeller };
}

// ─── Rotas API ────────────────────────────────────────────────────────────────
// WhatsApp / Twilio webhook
app.post("/webhook", async (req, res) => {
  const phone = req.body.From || "test";
  const message = req.body.Body || "";

  let lead = leads.find((l) => l.phone === phone);
  if (!lead) {
    lead = {
      id: nanoid(),
      phone,
      name: null,
      type: null,
      budget: null,
      payment: null,
      stage: "Novo Lead",
      seller: nextSeller(),
      lastContact: Date.now(),
      createdAt: Date.now(),
      history: [],
    };
    leads.push(lead);
  }

  extractData(lead, message);
  lead.history.push({ from: "cliente", message, ts: Date.now() });
  lead.lastContact = Date.now();

  const reply = await askGroq(lead, message);
  lead.history.push({ from: "7business", message: reply, ts: Date.now() });

  res.set("Content-Type", "text/xml");
  res.send(`<Response><Message>${reply}</Message></Response>`);
});

// API CRUD
app.get("/api/leads", (req, res) => res.json(leads));
app.get("/api/metrics", (req, res) => res.json(getMetrics()));

app.patch("/api/leads/:id", (req, res) => {
  const lead = leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
  Object.assign(lead, req.body);
  res.json(lead);
});

app.delete("/api/leads/:id", (req, res) => {
  leads = leads.filter((l) => l.id !== req.params.id);
  res.json({ ok: true });
});

// Teste manual (sem Twilio)
app.post("/api/test", async (req, res) => {
  const { phone = "test123", message = "Olá", source = "whatsapp" } = req.body;
  let lead = leads.find((l) => l.phone === phone);
  if (!lead) {
    lead = { id: nanoid(), phone, name: null, type: null, budget: null, payment: null, stage: "Novo Lead", seller: nextSeller(), source, lastContact: Date.now(), createdAt: Date.now(), history: [] };
    leads.push(lead);
  }
  extractData(lead, message);
  lead.history.push({ from: "cliente", message, source, ts: Date.now() });
  const reply = await askGroq(lead, message);
  lead.history.push({ from: "7business", message: reply, ts: Date.now() });
  res.json({ lead, reply });
});

// ─── Instagram Webhook ────────────────────────────────────────────────────────
const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN || "7business_ig_token";

// Verificação Meta
app.get("/webhook/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === IG_VERIFY_TOKEN) {
    console.log("[Instagram] Webhook verificado!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receber mensagens Instagram DM
app.post("/webhook/instagram", async (req, res) => {
  res.sendStatus(200); // responder rápido
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (!event.message || event.message.is_echo) continue;
        const senderId = event.sender.id;
        const text = event.message.text || "[mídia]";
        const phone = `ig:${senderId}`;

        let lead = leads.find((l) => l.phone === phone);
        if (!lead) {
          lead = { id: nanoid(), phone, name: null, type: null, budget: null, payment: null, stage: "Novo Lead", seller: nextSeller(), source: "instagram", lastContact: Date.now(), createdAt: Date.now(), history: [] };
          leads.push(lead);
        }
        extractData(lead, text);
        lead.history.push({ from: "cliente", message: text, source: "instagram", ts: Date.now() });
        lead.lastContact = Date.now();

        const reply = await askGroq(lead, text);
        lead.history.push({ from: "7business", message: reply, ts: Date.now() });

        // Enviar resposta via Meta Graph API
        if (process.env.IG_PAGE_TOKEN) {
          await axios.post(
            `https://graph.facebook.com/v19.0/me/messages`,
            { recipient: { id: senderId }, message: { text: reply } },
            { params: { access_token: process.env.IG_PAGE_TOKEN } }
          ).catch(e => console.error("[Instagram] Erro envio:", e.message));
        }
        console.log(`[Instagram] ${senderId}: ${text} → ${reply}`);
      }
    }
  } catch (e) {
    console.error("[Instagram] Erro:", e.message);
  }
});

// ─── WhatsApp Webhook (Meta / WhatsApp Business API) ─────────────────────────
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "7business_wa_token";

app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook/whatsapp", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    if (!messages) return;

    for (const msg of messages) {
      if (msg.type !== "text") continue;
      const phone = `wa:${msg.from}`;
      const text = msg.text.body;

      let lead = leads.find((l) => l.phone === phone);
      if (!lead) {
        lead = { id: nanoid(), phone, name: value.contacts?.[0]?.profile?.name || null, type: null, budget: null, payment: null, stage: "Novo Lead", seller: nextSeller(), source: "whatsapp", lastContact: Date.now(), createdAt: Date.now(), history: [] };
        leads.push(lead);
      }
      extractData(lead, text);
      lead.history.push({ from: "cliente", message: text, source: "whatsapp", ts: Date.now() });
      lead.lastContact = Date.now();

      const reply = await askGroq(lead, text);
      lead.history.push({ from: "7business", message: reply, ts: Date.now() });

      // Enviar resposta via Meta WhatsApp API
      if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN) {
        await axios.post(
          `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          { messaging_product: "whatsapp", to: msg.from, type: "text", text: { body: reply } },
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
        ).catch(e => console.error("[WhatsApp] Erro envio:", e.message));
      }
      console.log(`[WhatsApp] ${msg.from}: ${text} → ${reply}`);
    }
  } catch (e) {
    console.error("[WhatsApp] Erro:", e.message);
  }
});

// ─── Status integrações ───────────────────────────────────────────────────────
app.get("/api/integrations", (req, res) => {
  res.json({
    whatsapp_twilio: { active: true, webhook: "/webhook", desc: "Twilio WhatsApp Sandbox" },
    whatsapp_meta:  { active: !!process.env.WHATSAPP_TOKEN, webhook: "/webhook/whatsapp", verify_token: WA_VERIFY_TOKEN, phone_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "pendente" },
    instagram:      { active: !!process.env.IG_PAGE_TOKEN, webhook: "/webhook/instagram", verify_token: IG_VERIFY_TOKEN },
    groq_ai:        { active: !!GROQ_API_KEY, model: "llama-3.3-70b-versatile" },
  });
});

app.listen(PORT, () => console.log(`[7Business Pro CRM] http://localhost:${PORT}`));
