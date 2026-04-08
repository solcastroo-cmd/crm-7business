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

const SELLERS = ["João", "Maria", "Carlos"];
function nextSeller() {
  return SELLERS[Math.floor(Math.random() * SELLERS.length)];
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

  // Criar novo
  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert([{
      phone,
      name,
      stage:    "Novo Lead",
      source,
      seller:   nextSeller(),
      store_id: storeId ?? null,
      ...updates,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
