"use client";
import { useState, useEffect, useRef } from "react";

export default function TestePage() {
  const [val, setVal] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [renders, setRenders] = useState(0);
  const [focusLog, setFocusLog] = useState<string[]>([]);
  const renderCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uncontrolledRef = useRef<HTMLInputElement>(null);

  renderCount.current += 1;

  useEffect(() => {
    setRenders(renderCount.current);
  });

  function addEvent(msg: string) {
    const t = new Date().toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setEvents(prev => [`${t} ${msg}`, ...prev].slice(0, 20));
  }

  function addFocus(msg: string) {
    const t = new Date().toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setFocusLog(prev => [`${t} ${msg}`, ...prev].slice(0, 10));
  }

  const box: React.CSSProperties = {
    background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: 16, marginBottom: 12,
  };
  const label: React.CSSProperties = { color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "block" };
  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 16, background: "#111827",
    color: "#fff", border: "1px solid #4b5563", borderRadius: 6, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, color: "#fff", fontFamily: "monospace" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Diagnóstico de Input</h2>
      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 20 }}>
        Renders do componente: <strong style={{ color: renders > 2 ? "#f59e0b" : "#34d399" }}>{renders}</strong>
        {renders > 10 && <span style={{ color: "#f87171", marginLeft: 8 }}> ← RE-RENDERIZANDO MUITO!</span>}
      </p>

      {/* Controlled input */}
      <div style={box}>
        <span style={label}>1. Input controlado (useState)</span>
        <input
          ref={inputRef}
          value={val}
          onChange={e => {
            addEvent(`onChange: "${e.target.value}"`);
            setVal(e.target.value);
          }}
          onKeyDown={e => addEvent(`keyDown: "${e.key}"`)}
          onFocus={() => addFocus("FOCO: input controlado")}
          onBlur={() => addFocus("PERDEU FOCO: input controlado")}
          style={inp}
          placeholder="Digite aqui..."
          autoComplete="off"
        />
        <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>
          Valor: <strong style={{ color: val ? "#34d399" : "#6b7280" }}>"{val}"</strong>
          {" "}<span style={{ color: "#6b7280" }}>({val.length} chars)</span>
        </p>
      </div>

      {/* Uncontrolled input */}
      <div style={box}>
        <span style={label}>2. Input NÃO controlado (defaultValue)</span>
        <input
          ref={uncontrolledRef}
          defaultValue=""
          onKeyDown={e => addEvent(`[uncontrolled] keyDown: "${e.key}"`)}
          onFocus={() => addFocus("FOCO: input não controlado")}
          onBlur={() => addFocus("PERDEU FOCO: input não controlado")}
          style={{ ...inp, borderColor: "#7c3aed" }}
          placeholder="Digite aqui (não controlado)..."
          autoComplete="off"
        />
        <button
          onClick={() => addEvent(`[uncontrolled] valor atual: "${uncontrolledRef.current?.value}"`)}
          style={{ marginTop: 8, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
        >
          Ver valor atual
        </button>
      </div>

      {/* Focus log */}
      <div style={box}>
        <span style={label}>Log de foco (quem está com foco)</span>
        {focusLog.length === 0
          ? <p style={{ color: "#4b5563", fontSize: 12 }}>Nenhum evento ainda — clique em um input</p>
          : focusLog.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: e.includes("PERDEU") ? "#f87171" : "#34d399", lineHeight: "1.6" }}>{e}</div>
          ))}
      </div>

      {/* Event log */}
      <div style={box}>
        <span style={label}>Log de eventos (últimos 20)</span>
        {events.length === 0
          ? <p style={{ color: "#4b5563", fontSize: 12 }}>Nenhum evento ainda — comece a digitar</p>
          : events.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: "#d1d5db", lineHeight: "1.6" }}>{e}</div>
          ))}
      </div>

      {/* Instructions */}
      <div style={{ background: "#1e3a5f", border: "1px solid #1d4ed8", borderRadius: 8, padding: 14, fontSize: 12, color: "#93c5fd" }}>
        <strong>Como usar:</strong>
        <ol style={{ marginTop: 6, paddingLeft: 16, lineHeight: "1.8" }}>
          <li>Digite uma palavra no input 1 → veja se o Log de foco perde foco entre letras</li>
          <li>Se perder foco → o problema é que algo está roubando o foco</li>
          <li>Se não perder foco mas valor não acumular → problema no React state</li>
          <li>Teste o input 2 (não controlado) → se funcionar, é um bug de state</li>
          <li>Observe o contador de Renders → se subir mais de 2x por letra, está remontando</li>
        </ol>
      </div>
    </div>
  );
}
