/**
 * 🌱 seed.ts — Dados demo para visualização do CRM
 *
 * Popula: leads (todos os estágios/qualificações), veículos, mensagens
 * Uso: npx tsx scripts/seed.ts
 */

import { Client } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnv() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  readFileSync(path, "utf-8").split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const idx = clean.indexOf("=");
    if (idx === -1) return;
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  });
}
loadEnv();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LEADS = [
  { phone: "5585999110001", name: "Carlos Mendes",    stage: "Novo Lead",       source: "whatsapp_evolution", qualification: "quente", seller: "João",   budget: "80000", type: "SUV",   tags: ["interessado","urgente"] },
  { phone: "5585999110002", name: "Ana Paula Silva",  stage: "Contato Inicial", source: "whatsapp_evolution", qualification: "morno",  seller: "Maria",  budget: "45000", type: "Hatch", tags: ["financiamento"] },
  { phone: "5585999110003", name: "Roberto Costa",    stage: "Interesse",       source: "manual",             qualification: "quente", seller: "Carlos", budget: "120000",type: "Sedan", tags: ["à-vista","vip"] },
  { phone: "5585999110004", name: "Fernanda Lima",    stage: "Proposta",        source: "whatsapp_evolution", qualification: "morno",  seller: "João",   budget: "65000", type: "SUV",   tags: ["troca"] },
  { phone: "5585999110005", name: "Marcos Oliveira",  stage: "Negociação",      source: "manual",             qualification: "quente", seller: "Maria",  budget: "95000", type: "Pickup",tags: ["urgente","vip"] },
  { phone: "5585999110006", name: "Juliana Torres",   stage: "VENDIDO!",        source: "whatsapp_evolution", qualification: "quente", seller: "Carlos", budget: "75000", type: "Sedan", tags: ["fechado"] },
  { phone: "5585999110007", name: "Pedro Alves",      stage: "VENDIDO!",        source: "manual",             qualification: "quente", seller: "João",   budget: "110000",type: "SUV",   tags: ["fechado"] },
  { phone: "5585999110008", name: "Lucia Ferreira",   stage: "Perdido",         source: "whatsapp_evolution", qualification: "frio",   seller: "Maria",  budget: "30000", type: "Hatch", tags: ["perdido"] },
  { phone: "5585999110009", name: "Gabriel Santos",   stage: "Novo Lead",       source: "whatsapp_evolution", qualification: "frio",   seller: "Carlos", budget: null,    type: null,    tags: [] },
  { phone: "5585999110010", name: "Camila Rocha",     stage: "Contato Inicial", source: "manual",             qualification: "morno",  seller: "João",   budget: "55000", type: "Hatch", tags: ["financiamento"] },
  { phone: "5585999110011", name: "Diego Martins",    stage: "Interesse",       source: "whatsapp_evolution", qualification: "quente", seller: "Maria",  budget: "88000", type: "SUV",   tags: ["urgente"] },
  { phone: "5585999110012", name: "Priscila Souza",   stage: "Novo Lead",       source: "manual",             qualification: null,     seller: "Carlos", budget: null,    type: null,    tags: [] },
];

const VEHICLES = [
  { brand: "Toyota",   model: "Corolla",   year: "2022", plate: "ABC-1234", price: 120000, color: "Prata",    km: 28000,  fuel: "Flex",     transmission: "Automático", status: "disponivel", description: "Único dono, revisado, IPVA 2026 pago" },
  { brand: "Honda",    model: "HR-V",      year: "2023", plate: "DEF-5678", price: 145000, color: "Branco",   km: 15000,  fuel: "Flex",     transmission: "CVT",        status: "disponivel", description: "0km rodado, garantia de fábrica" },
  { brand: "Jeep",     model: "Renegade",  year: "2021", plate: "GHI-9012", price: 98000,  color: "Preto",    km: 42000,  fuel: "Flex",     transmission: "Automático", status: "disponivel", description: "Tramboline Edition, multimídia" },
  { brand: "Chevrolet","model": "Onix",    year: "2024", plate: "JKL-3456", price: 72000,  color: "Vermelho", km: 8000,   fuel: "Flex",     transmission: "Manual",     status: "disponivel", description: "Seminovo, IPVA incluso" },
  { brand: "Volkswagen","model":"T-Cross", year: "2022", plate: "MNO-7890", price: 115000, color: "Azul",     km: 31000,  fuel: "Flex",     transmission: "Automático", status: "reservado",  description: "Reservado para cliente" },
  { brand: "Fiat",     model: "Pulse",     year: "2023", plate: "PQR-1234", price: 95000,  color: "Prata",    km: 19000,  fuel: "Flex",     transmission: "Automático", status: "disponivel", description: "Imperdível, abaixo da tabela FIPE" },
  { brand: "Hyundai",  model: "Creta",     year: "2021", plate: "STU-5678", price: 105000, color: "Cinza",    km: 48000,  fuel: "Flex",     transmission: "Automático", status: "vendido",    description: "Vendido - 05/04/2026" },
  { brand: "Toyota",   model: "Hilux",     year: "2020", plate: "VWX-9012", price: 195000, color: "Branco",   km: 62000,  fuel: "Diesel",   transmission: "Automático", status: "disponivel", description: "4x4 SRX, único dono, bar" },
];

async function seed() {
  await client.connect();
  console.log("🌱 Iniciando seed...\n");

  // Limpa dados demo anteriores
  await client.query("DELETE FROM public.messages WHERE lead_id IN (SELECT id FROM public.leads WHERE phone LIKE '5585999110%')");
  await client.query("DELETE FROM public.leads WHERE phone LIKE '5585999110%'");
  await client.query("DELETE FROM public.vehicles WHERE plate IN ('ABC-1234','DEF-5678','GHI-9012','JKL-3456','MNO-7890','PQR-1234','STU-5678','VWX-9012')");

  // Insere leads
  const leadIds: string[] = [];
  for (const l of LEADS) {
    const res = await client.query(
      `INSERT INTO public.leads (phone, name, stage, source, qualification, seller, budget, type, tags, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING id`,
      [l.phone, l.name, l.stage, l.source, l.qualification, l.seller,
       l.budget, l.type, JSON.stringify(l.tags), leadIds.length * 1000]
    );
    leadIds.push(res.rows[0].id);
    process.stdout.write(`  ✅ Lead: ${l.name} [${l.stage}]\n`);
  }

  // Insere mensagens demo para os 3 primeiros leads
  const msgs = [
    ["Olá! Vi o anúncio do HR-V, ainda tá disponível?", false],
    ["Olá! Sim, temos o Honda HR-V 2023 disponível. Posso te enviar mais detalhes?", true],
    ["Quanto custa? Tem financiamento?", false],
    ["O HR-V está R$ 145.000. Sim, trabalhamos com financiamento em até 60x. Posso agendar uma visita?", true],
    ["Quero ver! Posso ir amanhã às 10h?", false],
    ["Perfeito! Amanhã às 10h está confirmado. Te aguardamos na loja!", true],
  ];
  for (const [text, from_me] of msgs) {
    await client.query(
      "INSERT INTO public.messages (lead_id, text, from_me) VALUES ($1,$2,$3)",
      [leadIds[0], text, from_me]
    );
  }
  console.log("  ✅ Mensagens demo inseridas\n");

  // Insere veículos
  for (const v of VEHICLES) {
    await client.query(
      `INSERT INTO public.vehicles (brand, model, year, plate, price, color, km, fuel, transmission, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [v.brand, v.model, v.year, v.plate, v.price, v.color, v.km, v.fuel, v.transmission, v.status, v.description]
    );
    process.stdout.write(`  🚗 Veículo: ${v.brand} ${v.model} (${v.status})\n`);
  }

  console.log("\n✅ Seed concluído!");
  console.log(`   ${LEADS.length} leads · ${VEHICLES.length} veículos · ${msgs.length} mensagens\n`);
  await client.end();
}

seed().catch((e) => { console.error("❌ Erro:", e.message); process.exit(1); });
