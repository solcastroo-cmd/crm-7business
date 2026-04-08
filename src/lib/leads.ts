/**
 * 📋 leads.ts — CRUD de leads no Supabase (multi-tenant)
 *
 * Cada lead pertence a uma loja (store_id = userId).
 * upsertLead filtra por phone + store_id para isolamento total.
 */

import { supabaseAdmin } from "./supabaseAdmin";

export type Lead = {
  id:                   string;
  phone:                string;
  name:                 string | null;
  stage:                string;
  source:               string;
  budget:               string | null;
  type:                 string | null;
  payment:              string | null;
  seller:               string | null;
  store_id:             string | null;
  veiculo_interesse_id: string | null;
  qualification:        "quente" | "morno" | "frio" | null;
  created_at:           string;
  updated_at:           string;
};

/** Busca vendedores cadastrados na tabela users e distribui em round-robin */
async function getNextSeller(storeId?: string): Promise<string | null> {
  try {
    let query = supabaseAdmin
      .from("users")
      .select("sellers")
      .not("sellers", "is", null);

    if (storeId) query = (query as typeof query).eq("id", storeId);

    const { data } = await query.limit(1).maybeSingle();
    const sellers: string[] = data?.sellers ?? [];
    if (sellers.length === 0) return null;

    // Round-robin: conta leads por vendedor e atribui ao com menos leads
    const { data: counts } = await supabaseAdmin
      .from("leads")
      .select("seller")
      .in("seller", sellers);

    const tally: Record<string, number> = {};
    sellers.forEach(s => { tally[s] = 0; });
    (counts ?? []).forEach(r => { if (r.seller && tally[r.seller] !== undefined) tally[r.seller]++; });

    return sellers.reduce((a, b) => tally[a] <= tally[b] ? a : b);
  } catch {
    return null;
  }
}

/** Busca lead pelo telefone (+ loja) ou cria novo */
export async function upsertLead(
  phone:   string,
  name:    string | null,
  source:  string,
  updates: Partial<Lead> = {},
  storeId?: string
): Promise<Lead> {
  // Buscar existente — filtra por store_id quando disponível
  let query = supabaseAdmin
    .from("leads")
    .select("*")
    .eq("phone", phone);

  if (storeId) query = query.eq("store_id", storeId);

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const toUpdate: Partial<Lead> = { ...updates };
    if (name && !existing.name) toUpdate.name = name;

    if (Object.keys(toUpdate).length > 0) {
      const { data } = await supabaseAdmin
        .from("leads")
        .update(toUpdate)
        .eq("id", existing.id)
        .select()
        .single();
      return data ?? existing;
    }
    return existing;
  }

  // Criar novo — distribui vendedor automaticamente
  const seller = await getNextSeller(storeId);

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert([{
      phone,
      name,
      stage:    "Novo Lead",
      source,
      seller,
      store_id: storeId ?? null,
      ...updates,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
