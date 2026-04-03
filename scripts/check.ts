/**
 * 🔍 check.ts — Bruno QA
 * Helena roda: npm run check
 * Valida se o ambiente está 100% configurado antes do deploy.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

type CheckResult = { ok: boolean; label: string; detail?: string };

function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const vars: Record<string, string> = {};
  readFileSync(path, "utf-8").split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const idx = clean.indexOf("=");
    if (idx === -1) return;
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) vars[key] = val;
  });
  return vars;
}

async function checkURL(url: string, label: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok || res.status === 404, label, detail: `HTTP ${res.status}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, label, detail: msg };
  }
}

function icon(ok: boolean) { return ok ? "✅" : "❌"; }

async function run() {
  console.log("\n🔍 CRM 7Business — Health Check (Bruno QA)\n");

  const envLocal   = parseEnv(join(process.cwd(), ".env.local"));
  const envFallback = parseEnv(join(process.cwd(), ".env"));
  const env = { ...envFallback, ...envLocal };

  const results: CheckResult[] = [];

  // ── Variáveis críticas ──────────────────────────────────────────────
  console.log("📋 Variáveis de Ambiente:");
  const required = [
    ["NEXT_PUBLIC_SUPABASE_URL",    "Supabase URL"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY","Supabase Anon Key"],
    ["SUPABASE_SERVICE_KEY",        "Supabase Service Key"],
    ["WHATSAPP_TOKEN",              "WhatsApp Token Meta"],
    ["WHATSAPP_PHONE_NUMBER_ID",    "WhatsApp Phone ID"],
  ];

  for (const [key, label] of required) {
    const val = env[key];
    const ok  = !!val && !val.includes("SEU_") && !val.includes("_AQUI") && val.length > 10;
    results.push({ ok, label, detail: ok ? `${val.slice(0, 8)}...` : "não configurada" });
    console.log(`   ${icon(ok)} ${label}: ${ok ? `${val?.slice(0, 8)}...` : "❌ não configurada"}`);
  }

  // ── Arquivos críticos ───────────────────────────────────────────────
  console.log("\n📁 Arquivos:");
  const files = [
    ["src/app/page.tsx",            "Frontend Kanban"],
    ["src/app/api/leads/route.ts",  "API /leads"],
    ["src/lib/supabaseClient.ts",   "Supabase Client"],
    ["railway.json",                "Railway Config"],
    ["supabase/leads.sql",          "SQL Schema"],
    ["next.config.ts",              "Next.js Config"],
  ];

  for (const [file, label] of files) {
    const ok = existsSync(join(process.cwd(), file));
    results.push({ ok, label });
    console.log(`   ${icon(ok)} ${label} (${file})`);
  }

  // ── Conectividade ───────────────────────────────────────────────────
  console.log("\n🌐 Conectividade:");

  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    const r = await checkURL(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "Supabase API");
    results.push(r);
    console.log(`   ${icon(r.ok)} Supabase API: ${r.detail}`);
  } else {
    console.log("   ⏭️  Supabase API: pulado (sem URL)");
  }

  const railway = await checkURL("https://railway.app", "Railway");
  results.push(railway);
  console.log(`   ${icon(railway.ok)} Railway: ${railway.detail}`);

  // ── Sumário ─────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total  = results.length;
  const score  = Math.round((passed / total) * 100);

  console.log("\n" + "─".repeat(50));
  console.log(`📊 Resultado: ${passed}/${total} checks passaram (${score}%)`);

  if (score === 100) {
    console.log("🎉 TUDO OK — pode fazer deploy!\n");
  } else if (score >= 70) {
    console.log("⚠️  Quase lá — corrija os ❌ acima antes do deploy.\n");
  } else {
    console.log("🚨 Ambiente incompleto — configure as variáveis primeiro.\n");
    console.log("💡 Dica: rode  npm run setup:env  para criar o .env.local\n");
  }

  process.exit(score < 70 ? 1 : 0);
}

run().catch((e) => {
  console.error("❌ Erro no check:", e.message);
  process.exit(1);
});
