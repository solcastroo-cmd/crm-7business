"use client";
import { useState } from "react";

export default function TestePage() {
  const [val, setVal] = useState("");
  return (
    <div style={{ padding: 40, maxWidth: 500 }}>
      <h2 style={{ color: "#fff", marginBottom: 20 }}>🧪 Teste de Input</h2>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{ width: "100%", padding: 12, fontSize: 18, background: "#111", color: "#fff", border: "1px solid #555", borderRadius: 8, outline: "none" }}
        placeholder="Digite aqui..."
      />
      <p style={{ color: "#9ca3af", marginTop: 16, fontSize: 14 }}>Valor atual: <strong style={{ color: "#fff" }}>"{val}"</strong></p>
      <p style={{ color: "#555", marginTop: 8, fontSize: 12 }}>Se conseguir digitar palavras completas aqui, o problema é específico da página consignação. Se falhar, é o layout global.</p>
    </div>
  );
}
