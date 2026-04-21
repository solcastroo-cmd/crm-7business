"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Message = {
  id: string;
  lead_id: string;
  text: string;
  from_me: boolean;
  created_at: string;
};

type Contact = {
  lead_id: string;
  name: string | null;
  phone: string;
  last_msg: string;
  last_at: string;
  unread: number;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const uid = localStorage.getItem("crm_userId");
    if (!uid) { setLoading(false); return; }

    // Busca leads com mensagens, agrupando a última mensagem por lead
    supabase
      .from("leads")
      .select("id,name,phone")
      .eq("user_id", uid)
      .then(async ({ data: leads }) => {
        if (!leads?.length) { setLoading(false); return; }

        const { data: msgs } = await supabase
          .from("messages")
          .select("id,lead_id,text,from_me,created_at")
          .in("lead_id", leads.map(l => l.id))
          .order("created_at", { ascending: false });

        if (!msgs?.length) { setLoading(false); return; }

        // Agrupa última mensagem por lead
        const byLead: Record<string, Message> = {};
        for (const m of msgs) {
          if (!byLead[m.lead_id]) byLead[m.lead_id] = m;
        }

        const contactList: Contact[] = leads
          .filter(l => byLead[l.id])
          .map(l => ({
            lead_id: l.id,
            name:    l.name,
            phone:   l.phone,
            last_msg: byLead[l.id].text ?? "",
            last_at:  byLead[l.id].created_at,
            unread:   0,
          }))
          .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

        setContacts(contactList);
        setLoading(false);
      });
  }, []);

  async function selectContact(c: Contact) {
    setSelected(c);
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("messages")
      .select("id,lead_id,text,from_me,created_at")
      .eq("lead_id", c.lead_id)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) ?? []);
    setLoadingMsgs(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = contacts.filter(c =>
    !search.trim() ||
    (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a1a1a", fontFamily: "Segoe UI, sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar contatos ── */}
      <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        {/* Header */}
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

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <p style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "24px" }}>Carregando...</p>
          )}
          {!loading && filtered.length === 0 && (
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
              {messages.map(m => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: m.from_me ? "flex-end" : "flex-start",
                  }}
                >
                  <div style={{
                    maxWidth: "68%",
                    background: m.from_me ? "#005c4b" : "#232323",
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: m.from_me ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    wordBreak: "break-word",
                  }}>
                    <p style={{ margin: 0 }}>{m.text}</p>
                    <p style={{ margin: "4px 0 0", fontSize: "10px", color: m.from_me ? "#7ecbb5" : "#555", textAlign: "right" }}>
                      {fmtTime(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
