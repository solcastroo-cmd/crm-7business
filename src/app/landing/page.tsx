"use client";

import Link from "next/link";
import { useState } from "react";

const WHATSAPP = "5585992041818";
const WA_LINK  = `https://wa.me/${WHATSAPP}?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20CRM%207Business.`;

const FEATURES = [
  { icon: "🤖", title: "Agente IA 24/7",        desc: "Responde leads no WhatsApp automaticamente, qualifica e avisa você dos clientes quentes — mesmo de madrugada." },
  { icon: "⚡", title: "Funil Kanban",            desc: "Visualize todos os seus leads em tempo real. Arraste, organize e nunca perca um contato." },
  { icon: "🚗", title: "Estoque Integrado",       desc: "Cadastre seus veículos com fotos. O agente Paulo mostra o estoque direto no WhatsApp do cliente." },
  { icon: "📊", title: "Analytics em Tempo Real", desc: "Dashboard com métricas de atendimento, conversão e performance dos seus vendedores." },
  { icon: "🔁", title: "Follow-up Automático",    desc: "Sequência de mensagens 30min → 3h → 24h → 72h para não deixar nenhum lead esfriar." },
  { icon: "🔗", title: "Integração OLX & Facebook", desc: "Leads do Facebook Ads e OLX entram direto no funil automaticamente." },
];

const STEPS = [
  { n: "01", title: "Crie sua conta",       desc: "Cadastro em 30 segundos. Sem cartão de crédito para começar." },
  { n: "02", title: "Conecte o WhatsApp",   desc: "Escaneie um QR Code e seu número já está ativo no sistema." },
  { n: "03", title: "Comece a vender mais", desc: "O agente Paulo atende seus leads enquanto você foca no fechamento." },
];

const FAQS = [
  { q: "Preciso trocar meu número de WhatsApp?",       a: "Não. Você usa o mesmo número que já tem. O sistema se conecta via QR Code, como o WhatsApp Web." },
  { q: "Posso cancelar quando quiser?",                a: "Sim. Cancele com 1 clique a qualquer momento, sem multa e sem burocracia." },
  { q: "Funciona para loja com mais de 1 vendedor?",   a: "Sim! Você pode cadastrar vários vendedores e distribuir os leads entre eles." },
  { q: "O agente responde por mim sem eu ver?",        a: "Sim, mas você tem controle total. Basta enviar uma mensagem pelo celular que o agente para e você assume o atendimento." },
  { q: "Meus dados ficam seguros?",                    a: "Todos os dados ficam em servidores seguros (Supabase). Nenhuma informação é compartilhada com terceiros." },
  { q: "Tem suporte humano?",                          a: "Sim! Suporte via WhatsApp com tempo de resposta rápido durante horário comercial." },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", background: "#0f0f0f", color: "#fff", overflowX: "hidden" }}>

      {/* ── NAV ── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(15,15,15,0.95)",
        backdropFilter: "blur(10px)", borderBottom: "1px solid #1f2937",
        padding: "0 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "#e63946", borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#fff" }}>7</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>CRM 7Business</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/login" style={{ color: "#9ca3af", fontSize: 14, textDecoration: "none",
            fontWeight: 600, padding: "8px 16px" }}>
            Entrar
          </Link>
          <Link href="/login?tab=register" style={{
            background: "#e63946", color: "#fff", fontSize: 14, textDecoration: "none",
            fontWeight: 700, padding: "8px 18px", borderRadius: 8 }}>
            Testar grátis
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ textAlign: "center", padding: "80px 24px 60px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-block", background: "rgba(230,57,70,0.1)",
          border: "1px solid rgba(230,57,70,0.3)", borderRadius: 20, padding: "6px 16px",
          fontSize: 13, color: "#f87171", fontWeight: 600, marginBottom: 24 }}>
          🔥 Mais de 50 lojas já usam o 7Business
        </div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 52px)", fontWeight: 900, lineHeight: 1.15,
          margin: "0 0 20px", letterSpacing: "-1px" }}>
          Seu WhatsApp vendendo<br />
          <span style={{ color: "#e63946" }}>carros 24h por dia</span>
        </h1>
        <p style={{ color: "#9ca3af", fontSize: "clamp(15px, 2.5vw, 18px)", lineHeight: 1.6,
          margin: "0 0 36px", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          O CRM com agente de IA que responde leads no WhatsApp, qualifica clientes e
          envia fotos do estoque — tudo automático, enquanto você foca no fechamento.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login?tab=register" style={{
            background: "#e63946", color: "#fff", textDecoration: "none", fontWeight: 700,
            fontSize: 16, padding: "14px 32px", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(230,57,70,0.4)" }}>
            Começar 7 dias grátis →
          </Link>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{
            background: "transparent", color: "#25d366", textDecoration: "none", fontWeight: 600,
            fontSize: 15, padding: "14px 28px", borderRadius: 12,
            border: "1px solid #25d36633" }}>
            💬 Falar no WhatsApp
          </a>
        </div>
        <p style={{ color: "#4b5563", fontSize: 13, marginTop: 16 }}>
          Sem cartão de crédito · Cancele quando quiser · Setup em 5 min
        </p>
      </section>

      {/* ── DEMO MOCKUP ── */}
      <section style={{ padding: "0 24px 80px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 20,
          padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: "linear-gradient(90deg, #e63946, #6366f1, #10b981)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            {["#ff5f57","#ffbd2e","#28c840"].map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ color: "#4b5563", fontSize: 12, marginLeft: 8 }}>WhatsApp — Agente Paulo</span>
          </div>

          {[
            { from: "lead",   text: "Oi, vi o Civic no OLX. Ainda tá disponível?" },
            { from: "paulo",  text: "Olá! Sim, o Civic 2022 ainda está disponível 🚗 Posso te enviar as fotos e mais detalhes?" },
            { from: "lead",   text: "Sim por favor! Qual o valor?" },
            { from: "paulo",  text: "Civic EXL 2022, 32.000 km, único dono 📸 Valor: R$ 129.990. Posso agendar um test drive para você ainda essa semana?" },
            { from: "lead",   text: "Sim! Quero ver pessoalmente" },
            { from: "paulo",  text: "Ótimo! 🔥 Qual o melhor dia pra você? Temos horários disponíveis amanhã e quinta. Enquanto isso te mando as fotos completas 👇" },
          ].map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "paulo" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{
                maxWidth: "72%", padding: "10px 14px", borderRadius: m.from === "paulo" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.from === "paulo" ? "#dcf8c6" : "#fff",
                color: "#111", fontSize: 14, lineHeight: 1.5,
              }}>
                {m.from === "paulo" && <span style={{ fontSize: 10, color: "#25d366", fontWeight: 700, display: "block", marginBottom: 2 }}>Paulo IA</span>}
                {m.text}
              </div>
            </div>
          ))}

          <div style={{ background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.2)",
            borderRadius: 10, padding: "10px 14px", marginTop: 16, display: "flex",
            alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <span style={{ color: "#f87171", fontSize: 13, fontWeight: 600 }}>
              Lead quente detectado — vendedor notificado no WhatsApp
            </span>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section style={{ padding: "60px 24px", background: "#111" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <p style={{ color: "#e63946", fontSize: 13, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 2, marginBottom: 12 }}>Como funciona</p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, margin: "0 0 48px" }}>
            Em 3 passos, sua loja está vendendo mais
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ background: "#1a1a1a", border: "1px solid #2e2e2e",
                borderRadius: 16, padding: "28px 24px", textAlign: "left" }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: "#e6394620",
                  fontVariantNumeric: "tabular-nums", marginBottom: 12 }}>{s.n}</div>
                <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{s.title}</h3>
                <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ color: "#e63946", fontSize: 13, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 2, marginBottom: 12 }}>Funcionalidades</p>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, margin: 0 }}>
              Tudo que sua loja precisa em um só lugar
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: "#1a1a1a", border: "1px solid #2e2e2e",
                borderRadius: 16, padding: "24px", transition: "border-color .2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#e6394660"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#2e2e2e"}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{f.title}</h3>
                <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ padding: "80px 24px", background: "#111" }} id="pricing">
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <p style={{ color: "#e63946", fontSize: 13, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 2, marginBottom: 12 }}>Planos</p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, margin: "0 0 8px" }}>
            Preço simples, sem surpresas
          </h2>
          <p style={{ color: "#6b7280", fontSize: 15, margin: "0 0 48px" }}>
            7 dias de teste grátis. Cancele quando quiser.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>

            {/* Plano Mensal */}
            <div style={{ background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 20, padding: 32 }}>
              <p style={{ color: "#9ca3af", fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 1, marginBottom: 16 }}>Mensal</p>
              <div style={{ marginBottom: 24 }}>
                <span style={{ color: "#fff", fontSize: 44, fontWeight: 900 }}>R$&nbsp;197</span>
                <span style={{ color: "#6b7280", fontSize: 14 }}>/mês</span>
              </div>
              <Link href="/login?tab=register" style={{
                display: "block", background: "#2e2e2e", color: "#fff", textDecoration: "none",
                textAlign: "center", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 15,
                marginBottom: 24 }}>
                Começar grátis →
              </Link>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, textAlign: "left" }}>
                {["Todas as funcionalidades","Agente IA ilimitado","Suporte via WhatsApp","Até 5 vendedores"].map(f => (
                  <li key={f} style={{ color: "#d1d5db", fontSize: 14, padding: "6px 0",
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Plano Anual */}
            <div style={{ background: "#1a1a1a", border: "2px solid #e63946", borderRadius: 20,
              padding: 32, position: "relative" }}>
              <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: "#e63946", color: "#fff", fontSize: 11, fontWeight: 800,
                padding: "4px 16px", borderRadius: 20, whiteSpace: "nowrap" }}>
                MELHOR VALOR — 2 MESES GRÁTIS
              </div>
              <p style={{ color: "#f87171", fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 1, marginBottom: 16 }}>Anual</p>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#fff", fontSize: 44, fontWeight: 900 }}>R$&nbsp;1.697</span>
                <span style={{ color: "#6b7280", fontSize: 14 }}>/ano</span>
              </div>
              <p style={{ color: "#10b981", fontSize: 13, marginBottom: 24 }}>
                equivale a R$ 141/mês
              </p>
              <Link href="/login?tab=register" style={{
                display: "block", background: "#e63946", color: "#fff", textDecoration: "none",
                textAlign: "center", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 15,
                marginBottom: 24, boxShadow: "0 4px 20px rgba(230,57,70,0.4)" }}>
                Assinar plano anual →
              </Link>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, textAlign: "left" }}>
                {["Tudo do mensal","Economia de R$ 667/ano","Prioridade no suporte","Vendedores ilimitados"].map(f => (
                  <li key={f} style={{ color: "#d1d5db", fontSize: 14, padding: "6px 0",
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 800, margin: 0 }}>
              Perguntas frequentes
            </h2>
          </div>
          {FAQS.map((f, i) => (
            <div key={i} style={{ border: "1px solid #2e2e2e", borderRadius: 12,
              marginBottom: 8, overflow: "hidden" }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", background: openFaq === i ? "#1a1a1a" : "transparent",
                  border: "none", padding: "18px 20px", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer", color: "#fff", textAlign: "left" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{f.q}</span>
                <span style={{ color: "#e63946", fontSize: 20, fontWeight: 700,
                  transform: openFaq === i ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 20px 18px", color: "#9ca3af", fontSize: 14, lineHeight: 1.7 }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding: "80px 24px", background: "#111", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 900, margin: "0 0 16px" }}>
            Pronto para vender mais?
          </h2>
          <p style={{ color: "#6b7280", fontSize: 16, margin: "0 0 36px" }}>
            Comece grátis hoje. Sem cartão de crédito, sem compromisso.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login?tab=register" style={{
              background: "#e63946", color: "#fff", textDecoration: "none", fontWeight: 700,
              fontSize: 16, padding: "16px 36px", borderRadius: 12,
              boxShadow: "0 8px 32px rgba(230,57,70,0.4)" }}>
              Começar 7 dias grátis →
            </Link>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{
              background: "#25d36615", color: "#25d366", textDecoration: "none", fontWeight: 600,
              fontSize: 15, padding: "16px 28px", borderRadius: 12,
              border: "1px solid #25d36633" }}>
              💬 WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "32px 24px", borderTop: "1px solid #1f2937", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, background: "#e63946", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, color: "#fff" }}>7</div>
          <span style={{ fontWeight: 700, color: "#fff" }}>CRM 7Business</span>
        </div>
        <p style={{ color: "#4b5563", fontSize: 13, margin: "0 0 8px" }}>
          O CRM com IA para lojas de veículos
        </p>
        <p style={{ color: "#374151", fontSize: 12, margin: 0 }}>
          <a href="mailto:7businesscrm@gmail.com" style={{ color: "#e63946", textDecoration: "none" }}>
            7businesscrm@gmail.com
          </a>
          {" · "}
          <Link href="/login" style={{ color: "#4b5563", textDecoration: "none" }}>Acessar sistema</Link>
          {" · "}
          <Link href="/pricing" style={{ color: "#4b5563", textDecoration: "none" }}>Planos</Link>
        </p>
      </footer>
    </div>
  );
}
