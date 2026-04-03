/**
 * 📋 leads.ts — CRUD de leads no Supabase
 */

import { getSupabase } from "./supabaseClient";

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
  veiculo_interesse_id: string | null;
  created_at:           string;
  updated_at:           string;
};

const SELLERS = ["João", "Maria", "Carlos"];
let sellerIdx = -1;
function nextSeller() {
  sellerIdx = (sellerIdx + 1) % SELLERS.length;
  return SELLERS[sellerIdx];
}

/** Busca lead pelo telefone ou cria novo */
export async function upsertLead(
  phone: string,
  name: string | null,
  source: string,
  updates: Partial<Lead> = {}
): Promise<Lead> {
  const db = getSupabase();

  // Buscar existente
  const { data: existing } = await db
    .from("leads")
    .select("*")
    .eq("phone", phone)
    .single();

  if (existing) {
    // Atualizar campos se fornecidos
    const toUpdate: Partial<Lead> = { ...updates };
    if (name && !existing.name) toUpdate.name = name;

    if (Object.keys(toUpdate).length > 0) {
      const { data } = await db
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
  const { data, error } = await db
    .from("leads")
    .insert([{
      phone,
      name,
      stage:  "Novo Lead",
      source,
      seller: nextSeller(),
      ...updates,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
