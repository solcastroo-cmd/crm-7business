const express = require("express");
const router = express.Router();
const axios = require("axios");

// Twilio WhatsApp webhook
router.post("/whatsapp", async (req, res) => {
  const from = req.body.From;       // ex: whatsapp:+5585999999999
  const body = req.body.Body || ""; // mensagem recebida

  console.log(`📩 [${from}]: ${body}`);

  try {
    // Chama Claude para gerar resposta
    const reply = await askClaude(body, from);

    // Responde via Twilio TwiML
    res.set("Content-Type", "text/xml");
    res.send(`
      <Response>
        <Message>${reply}</Message>
      </Response>
    `);
  } catch (err) {
    console.error("Erro webhook:", err.message);
    res.status(500).send("Erro interno");
  }
});

// Status callback (entrega de mensagem)
router.post("/status", (req, res) => {
  console.log("Status:", req.body.MessageStatus, req.body.To);
  res.sendStatus(200);
});

// ── Claude API ────────────────────────────────────────────────────────────────
async function askClaude(userMessage, from) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "Você é um assistente de vendas da Audifort. Responda em português de forma curta e amigável. " +
        "Foco: tirar dúvidas sobre o produto, tinnitus, ingredientes, garantia e onde comprar.",
      messages: [{ role: "user", content: userMessage }],
    },
    {
      headers: {
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );
  return response.data.content[0].text;
}

module.exports = router;
