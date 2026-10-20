"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  connected: boolean;
  connection: { ig_username: string | null; last_sync_at: string | null; last_error: string | null } | null;
  totals: { novas: number; quentes: number; convertidas: number; concorrentes: number };
};
type Opp = {
  id: string; source: "comentario" | "dm"; username: string; text: string; media_permalink: string | null;
  intent: string; score: number; temperature: "quente" | "morno" | "frio"; vehicle_hint: string | null;
  summary: string | null; next_step: string | null; status: string; lead_id: string | null;
  detected_at: string; replied_at: string | null;
};
type Comp = {
  id: string; username: string; followers_count: number | null; media_count: number | null;
  last_synced_at: string | null; last_error: string | null; avgEngagement: number | null;
  postsCount: number; topPost: { permalink: string; like_count: number; comments_count: number } | null;
};

const TEMP_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  quente: { bg: "rgba(230,57,70,0.15)", fg: "#f87171", label: "Quente" },
  morno:  { bg: "rgba(250,178,25,0.15)", fg: "#fbbf24", label: "Morno" },
  frio:   { bg: "rgba(107,114,128,0.2)", fg: "#9ca3af", label: "Frio" },
};
const INTENT_LABEL: Record<string, string> = {
  comprador: "Quer comprar", interessado: "Interessado", curioso: "Curioso", sem_interesse: "Sem interesse", outro: "Outro",
};

function ago(iso: string | null) {
  if (!iso) return "nunca";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} d`;
}
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));

const card = { background: "#232323", border: "1px solid #333", borderRadius: 14 } as const;

export default function RadarPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [tab, setTab] = useState<"oportunidades" | "concorrentes">("oportunidades");
  const [filter, setFilter] = useState("novo");
  const [temp, setTemp] = useState("todas");
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [replyFor, setReplyFor] = useState<Opp | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newComp, setNewComp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const r = await fetch("/api/radar/status");
    if (r.ok) setStatus(await r.json());
  }, []);
  const loadOpps = useCallback(async () => {
    const r = await fetch(`/api/radar/opportunities?status=${filter}`);
    if (r.ok) setOpps((await r.json()).opportunities);
  }, [filter]);
  const loadComps = useCallback(async () => {
    const r = await fetch("/api/radar/competitors");
    if (r.ok) setComps((await r.json()).competitors);
  }, []);

  const sync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const r = await fetch("/api/radar/sync", { method: "POST" });
      const d = await r.json();
      if (!silent) {
        setMsg(d.erros?.length
          ? { kind: "err", text: d.erros.join(" · ") }
          : { kind: "ok", text: d.skipped ? "Já atualizado há menos de 1 minuto." : `${d.novasOportunidades} nova(s) oportunidade(s).` });
      }
    } finally {
      setSyncing(false);
      await Promise.all([loadStatus(), loadOpps(), loadComps()]);
    }
  }, [loadStatus, loadOpps, loadComps]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) setMsg({ kind: "ok", text: "Instagram conectado com sucesso." });
    if (p.get("error")) setMsg({ kind: "err", text: p.get("error")! });
    (async () => {
      await Promise.all([loadStatus(), loadComps()]);
      const r = await fetch("/api/radar/status");
      const s: Status = await r.json();
      if (s.connected) {
        const old = !s.connection?.last_sync_at || Date.now() - new Date(s.connection.last_sync_at).getTime() > 15 * 60000;
        if (old) sync(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadOpps(); }, [loadOpps]);

  async function act(id: string, fn: () => Promise<Response>, okText: string) {
    setBusy(id);
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? { kind: "ok", text: okText } : { kind: "err", text: d.error ?? "Erro" });
    } finally {
      setBusy(null);
      await Promise.all([loadStatus(), loadOpps()]);
    }
  }
  const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const shown = opps.filter(o => temp === "todas" || o.temperature === temp);
  const t = status?.totals;

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>PHD Radar</h1>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>Quem comenta e escreve no Instagram da PHD Motors, classificado por chance de compra.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {status?.connected ? (
            <>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                <span style={{ color: "#34d399" }}>● </span>@{status.connection?.ig_username} · atualizado {ago(status.connection?.last_sync_at ?? null)}
              </span>
              <button onClick={() => sync(false)} disabled={syncing}
                style={{ background: "#e63946", color: "#fff", padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? "Atualizando…" : "Atualizar"}
              </button>
            </>
          ) : (
            <a href="/api/radar/connect" style={{ background: "#e63946", color: "#fff", padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 13 }}>
              Conectar Instagram
            </a>
          )}
        </div>
      </div>

      {msg && (
        <div onClick={() => setMsg(null)} style={{ cursor: "pointer", marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: msg.kind === "ok" ? "rgba(52,211,153,0.12)" : "rgba(230,57,70,0.12)", color: msg.kind === "ok" ? "#34d399" : "#f87171" }}>
          {msg.text}
        </div>
      )}
      {status?.connected && status.connection?.last_error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 12, background: "rgba(250,178,25,0.12)", color: "#fbbf24" }}>
          Última atualização com aviso: {status.connection.last_error}
        </div>
      )}

      {!status?.connected && status && (
        <div style={{ ...card, padding: 28, textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Conecte o Instagram da PHD Motors para começar</p>
          <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 16 }}>
            Na janela da Meta, mantenha todas as permissões marcadas e selecione a Página e o Instagram da PHD.
          </p>
          <a href="/api/radar/connect" style={{ background: "#e63946", color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13 }}>Conectar Instagram</a>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 22 }}>
        {[
          ["Oportunidades novas", t?.novas, "#fff"],
          ["Quentes", t?.quentes, "#f87171"],
          ["Convertidas em lead", t?.convertidas, "#34d399"],
          ["Concorrentes", t?.concorrentes, "#60a5fa"],
        ].map(([label, v, color]) => (
          <div key={label as string} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label as string}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: color as string }}>{(v as number | undefined) ?? "—"}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["oportunidades", "concorrentes"] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: tab === k ? "rgba(230,57,70,0.15)" : "#232323",
              color: tab === k ? "#f87171" : "#9ca3af", border: `1px solid ${tab === k ? "#e63946" : "#333"}` }}>
            {k === "oportunidades" ? "Oportunidades" : "Concorrentes"}
          </button>
        ))}
      </div>

      {tab === "oportunidades" && (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 14, borderBottom: "1px solid #333" }}>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 13 }}>
              <option value="novo">Novas</option><option value="em_revisao">Em revisão</option>
              <option value="convertido">Convertidas</option><option value="descartado">Descartadas</option><option value="todas">Todas</option>
            </select>
            {["todas", "quente", "morno", "frio"].map(k => (
              <button key={k} onClick={() => setTemp(k)}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: temp === k ? "#333" : "transparent", color: temp === k ? "#fff" : "#9ca3af", border: "1px solid #333" }}>
                {k === "todas" ? "Todas" : TEMP_STYLE[k].label}
              </button>
            ))}
          </div>
          {shown.length === 0 && (
            <p style={{ padding: 28, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              {status?.connected ? "Nenhuma oportunidade neste filtro ainda. Clique em Atualizar para buscar comentários e mensagens novas." : "Conecte o Instagram para ver as oportunidades."}
            </p>
          )}
          {shown.map(o => {
            const ts = TEMP_STYLE[o.temperature];
            return (
              <div key={o.id} style={{ padding: 16, borderBottom: "1px solid #2c2c2c", display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "space-between" }}>
                <div style={{ flex: "1 1 420px", minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>@{o.username}</b>
                    <span style={{ background: ts.bg, color: ts.fg, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{ts.label} · {o.score}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{INTENT_LABEL[o.intent] ?? o.intent}</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>{o.source === "dm" ? "DM" : "Comentário"} · {ago(o.detected_at)}</span>
                    {o.replied_at && <span style={{ fontSize: 11, color: "#34d399" }}>Respondido em privado</span>}
                  </div>
                  <p style={{ fontSize: 14, marginBottom: 4, wordBreak: "break-word" }}>“{o.text}”</p>
                  {o.vehicle_hint && <p style={{ fontSize: 12, color: "#9ca3af" }}>Carro citado: {o.vehicle_hint}</p>}
                  {o.summary && <p style={{ fontSize: 12, color: "#9ca3af" }}>{o.summary}</p>}
                  {o.next_step && <p style={{ fontSize: 12, color: "#60a5fa" }}>Próximo passo: {o.next_step}</p>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                  {o.media_permalink && <a href={o.media_permalink} target="_blank" rel="noreferrer" style={btn("#333", "#e5e7eb")}>Ver post</a>}
                  {o.status !== "convertido" && (
                    <button disabled={busy === o.id} style={btn("#e63946", "#fff")}
                      onClick={() => act(o.id, () => fetch("/api/radar/opportunities/convert", json({ id: o.id })), "Lead criado no CRM.")}>
                      Adicionar ao CRM
                    </button>
                  )}
                  {o.source === "comentario" && !o.replied_at && (
                    <button style={btn("#1d4ed8", "#fff")} onClick={() => {
                      setReplyFor(o);
                      setReplyText(`Oi @${o.username}! Vi seu comentário${o.vehicle_hint ? ` sobre o ${o.vehicle_hint}` : ""} e posso te passar valores e condições por aqui. Qual carro você procura? 😊 PHD Motors`);
                    }}>Responder em privado</button>
                  )}
                  {o.status !== "descartado" && o.status !== "convertido" && (
                    <button disabled={busy === o.id} style={btn("transparent", "#9ca3af", true)}
                      onClick={() => act(o.id, () => fetch("/api/radar/opportunities", { ...json({ id: o.id, status: "descartado" }), method: "PATCH" }), "Descartada.")}>
                      Descartar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "concorrentes" && (
        <div style={{ ...card, overflow: "hidden" }}>
          <form style={{ display: "flex", gap: 10, padding: 14, borderBottom: "1px solid #333", flexWrap: "wrap" }}
            onSubmit={async e => {
              e.preventDefault();
              if (!newComp.trim()) return;
              const r = await fetch("/api/radar/competitors", json({ username: newComp }));
              const d = await r.json();
              if (r.ok) { setNewComp(""); setMsg({ kind: "ok", text: "Concorrente adicionado. Clique em Atualizar para puxar as métricas." }); await loadComps(); await loadStatus(); }
              else setMsg({ kind: "err", text: d.error });
            }}>
            <input value={newComp} onChange={e => setNewComp(e.target.value)} placeholder="@usuario do concorrente"
              style={{ flex: "1 1 240px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }} />
            <button type="submit" style={btn("#e63946", "#fff")}>Adicionar concorrente</button>
          </form>
          <p style={{ padding: "10px 16px", fontSize: 12, color: "#6b7280" }}>
            A Meta só entrega números públicos de contas profissionais (seguidores, curtidas e comentários por post). Não mostra quem comentou nem quem segue.
          </p>
          {comps.length === 0 && <p style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Nenhum concorrente cadastrado.</p>}
          {comps.map(c => (
            <div key={c.id} style={{ padding: 16, borderTop: "1px solid #2c2c2c", display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 180 }}>
                <b style={{ fontSize: 14 }}>@{c.username}</b>
                <p style={{ fontSize: 12, color: c.last_error ? "#f87171" : "#6b7280" }}>
                  {c.last_error ? `Erro: ${c.last_error}` : `Atualizado ${ago(c.last_synced_at)}`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
                <Stat label="Seguidores" v={num(c.followers_count)} />
                <Stat label="Posts" v={num(c.media_count)} />
                <Stat label="Engajamento médio" v={num(c.avgEngagement)} />
                {c.topPost && <a href={c.topPost.permalink} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Post de maior engajamento ({c.topPost.like_count} curtidas · {c.topPost.comments_count} coment.)</a>}
              </div>
              <button style={btn("transparent", "#9ca3af", true)}
                onClick={async () => { await fetch(`/api/radar/competitors?id=${c.id}`, { method: "DELETE" }); await loadComps(); await loadStatus(); }}>Remover</button>
            </div>
          ))}
        </div>
      )}

      {replyFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div style={{ ...card, width: "100%", maxWidth: 520, padding: 20 }}>
            <b style={{ fontSize: 15 }}>Resposta privada para @{replyFor.username}</b>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 10px" }}>A Meta permite 1 mensagem por comentário, em até 7 dias. Revise antes de enviar.</p>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={5}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: 10, color: "#fff", fontSize: 13 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button style={btn("transparent", "#9ca3af", true)} onClick={() => setReplyFor(null)}>Cancelar</button>
              <button style={btn("#1d4ed8", "#fff")} disabled={busy === replyFor.id}
                onClick={async () => {
                  const id = replyFor.id;
                  setReplyFor(null);
                  await act(id, () => fetch("/api/radar/opportunities/reply", json({ id, message: replyText })), "Mensagem enviada.");
                }}>Enviar mensagem</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{v}</div>
    </div>
  );
}

function btn(bg: string, fg: string, outline = false) {
  return {
    background: bg, color: fg, padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 700,
    border: outline ? "1px solid #333" : "1px solid transparent", cursor: "pointer",
  } as const;
}
