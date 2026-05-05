"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? "";

type Message = {
  id: string;
  lead_id: string;
  text: string;
  from_me: boolean;
  sender: "client" | "ai" | "human" | null;
  created_at: string;
};

type Contact = {
  lead_id: string;
  name: string | null;
  phone: string;
  last_msg: string;
  last_at: string;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function AtendimentosPage() {
  const [contacts, setContacts]       = useState<Contact[]>([]);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [selected, setSelected]       = useState<Contact | null>(null);
  const [loading, setLoading]         = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch]           = useState("");
  const [inputText, setInputText]     = useState("");
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const storeId = STORE_ID || (await supabase.auth.getUser()).data?.user?.id;
    if (!storeId) {
      setError("Loja não identificada. Configure NEXT_PUBLIC_STORE_ID.");
      setLoading(false);
      return;
    }

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id,name,phone")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (leadsErr) {
      setError("Erro ao carregar contatos: " + leadsErr.message);
      setLoading(false);
      return;
    }

    if (!leads?.length) {
      setLoading(false);
      return;
    }

    // Busca última mensagem de cada lead (paginado em lotes para evitar URL longa)
    const BATCH = 50;
    const byLead: Record<string, Message> = {};

    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH).map(l => l.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id,lead_id,text,from_me,sender,created_at")
        .in("lead_id", batch)
        .order("created_at", { ascending: false });

      for (const m of msgs ?? []) {
        if (!byLead[m.lead_id]) byLead[m.lead_id] = m;
      }
    }

    const contactList: Contact[] = leads
      .filter(l => byLead[l.id])
      .map(l => ({
        lead_id:  l.id,
        name:     l.name,
        phone:    l.phone,
        last_msg: byLead[l.id].text ?? "",
        last_at:  byLead[l.id].created_at,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

    setContacts(contactList);
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  async function selectContact(c: Contact) {
    setSelected(c);
    setMessages([]);
    setLoadingMsgs(true);
    const { data, error: e } = await supabase
      .from("messages")
      .select("id,lead_id,text,from_me,sender,created_at")
      .eq("lead_id", c.lead_id)
      .order("created_at", { ascending: true });
    if (e) console.error("[Atendimentos] Erro msgs:", e.message);
    setMessages((data as Message[]) ?? []);
    setLoadingMsgs(false);
  }

  async function sendMessage() {
    if (!selected || !inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText("");

    // Otimista: adiciona mensagem localmente imediatamente
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      lead_id: selected.lead_id,
      text,
      from_me: true,
      sender: "human",
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await fetch("/api/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ leadId: selected.lead_id, text }),
      });
      const json = await res.json();
      if (res.ok && json.message) {
        // Substitui otimista pelo real
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...json.message, sender: "human" } : m));
        // Atualiza last_msg na sidebar
        setContacts(prev => prev.map(c =>
          c.lead_id === selected.lead_id
            ? { ...c, last_msg: text, last_at: optimistic.created_at }
            : c
        ));
      }
    } catch (e) {
      console.error("[Atendimentos] Erro envio:", e);
    }
    setSending(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: novas mensagens do lead selecionado
  useEffect(() => {
    if (!selected) return;
    const ch = supabase
      .channel(`msgs:${selected.lead_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lead_id=eq.${selected.lead_id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, m];
          });
          setContacts(prev => prev.map(c =>
            c.lead_id === m.lead_id
              ? { ...c, last_msg: m.text ?? "", last_at: m.created_at }
              : c
          ));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected?.lead_id]);

  const filtered = contacts.filter(c =>
    !search.trim() ||
    (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a1a1a", fontFamily: "Segoe UI, sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar contatos ── */}
      <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #2a2a2a" }}>
          <h1 style={{ color: "#fff", fontSize: "17px", fontWeight: 800, margin: "0 0 12px" }}>💬 Atendimentos</h1>
          <input
            type="text"
            placeholder="Buscar contato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", boxSizing: "border-box",
              background: "#232323", border: "1px solid #333", borderRadius: "8px",
              color: "#fff", fontSize: "13px", outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "24px" }}>Carregando...</p>
          )}
          {error && (
            <p style={{ color: "#e63946", fontSize: "12px", textAlign: "center", padding: "16px" }}>{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "24px" }}>
              {search ? "Nenhum contato encontrado." : "Nenhum atendimento registrado."}
            </p>
          )}
          {filtered.map(c => {
            const active = selected?.lead_id === c.lead_id;
            return (
              <div
                key={c.lead_id}
                onClick={() => selectContact(c)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #222",
                  cursor: "pointer",
                  background: active ? "#232323" : "transparent",
                  borderLeft: active ? "3px solid #e63946" : "3px solid transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#1e1e1e"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.phone}
                  </span>
                  <span style={{ color: "#555", fontSize: "10px", flexShrink: 0 }}>{fmtTime(c.last_at)}</span>
                </div>
                <p style={{ color: "#6b7280", fontSize: "12px", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.last_msg || "Sem mensagens"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chat ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#444", fontSize: "14px" }}>Selecione um atendimento</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #2a2a2a", background: "#1e1e1e", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%", background: "#e63946",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: "14px", flexShrink: 0,
              }}>
                {(selected.name ?? selected.phone)[0].toUpperCase()}
              </div>
              <div>
                <p style={{ color: "#fff", fontSize: "14px", fontWeight: 700, margin: 0 }}>{selected.name || "Sem nome"}</p>
                <p style={{ color: "#6b7280", fontSize: "12px", margin: 0 }}>{selected.phone}</p>
              </div>
              <a
                href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "auto", background: "#25d366", color: "#fff",
                  padding: "6px 14px", borderRadius: "8px", fontSize: "12px",
                  fontWeight: 700, textDecoration: "none",
                }}
              >
                Abrir no WhatsApp
              </a>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px", background: "#161616" }}>
              {loadingMsgs && <p style={{ color: "#555", fontSize: "13px", textAlign: "center" }}>Carregando mensagens...</p>}
              {!loadingMsgs && messages.length === 0 && (
                <p style={{ color: "#555", fontSize: "13px", textAlign: "center" }}>Nenhuma mensagem registrada.</p>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const isTransition =
                  i > 0 &&
                  prev?.from_me &&
                  m.from_me &&
                  prev?.sender === "ai" &&
                  m.sender === "human";

                const bubbleBg =
                  m.sender === "ai"    ? "#1a3a4a" :
                  m.sender === "human" ? "#005c4b" :
                  "#232323";

                const timeColor =
                  m.sender === "ai"    ? "#5ba8c4" :
                  m.sender === "human" ? "#7ecbb5" :
                  "#555";

                return (
                  <div key={m.id}>
                    {isTransition && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0" }}>
                        <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                        <span style={{ color: "#6b7280", fontSize: "11px", whiteSpace: "nowrap" }}>
                          👤 Vendedor assumiu — {fmtTime(m.created_at)}
                        </span>
                        <div style={{ flex: 1, height: "1px", background: "#2a2a2a" }} />
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: m.from_me ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "68%",
                        background: bubbleBg,
                        color: "#fff",
                        padding: "8px 12px",
                        borderRadius: m.from_me ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        wordBreak: "break-word",
                      }}>
                        {m.sender === "ai" && (
                          <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#5ba8c4", fontWeight: 700, letterSpacing: "0.5px" }}>
                            🤖 IA
                          </p>
                        )}
                        {m.sender === "human" && m.from_me && (
                          <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#7ecbb5", fontWeight: 700, letterSpacing: "0.5px" }}>
                            👤 Vendedor
                          </p>
                        )}
                        <p style={{ margin: 0 }}>{m.text}</p>
                        <p style={{ margin: "4px 0 0", fontSize: "10px", color: timeColor, textAlign: "right" }}>
                          {fmtTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input de envio */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #2a2a2a", background: "#1e1e1e", display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={sending}
                style={{
                  flex: 1, padding: "10px 14px",
                  background: "#232323", border: "1px solid #333", borderRadius: "8px",
                  color: "#fff", fontSize: "13px", outline: "none",
                  opacity: sending ? 0.6 : 1,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !inputText.trim()}
                style={{
                  background: "#e63946", color: "#fff",
                  border: "none", borderRadius: "8px",
                  padding: "10px 18px", fontSize: "13px", fontWeight: 700,
                  cursor: sending || !inputText.trim() ? "not-allowed" : "pointer",
                  opacity: sending || !inputText.trim() ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                {sending ? "..." : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
