import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RenaveStatus = "pendente" | "enviado" | "aprovado" | "rejeitado";

export const RENAVE_STATUSES: RenaveStatus[] = ["pendente", "enviado", "aprovado", "rejeitado"];

export interface RenaveStatusChange {
  vehicleId: string;
  status: RenaveStatus;
  notes?: string;
  changedBy?: string;
}

export interface RenaveHistoryEntry {
  id: string;
  vehicle_id: string;
  status: string;
  previous_status: string | null;
  notes: string | null;
  changed_by: string | null;
  created_at: string;
}

/**
 * Camada de acesso ao status RENAVE do veículo. Hoje só lê/escreve no Supabase
 * (operação manual). Quando a integração com a API do SERPRO/integradora do
 * DETRAN-CE existir, a chamada externa entra em `submitStatusChange`, antes da
 * escrita local — a assinatura pública do serviço não muda.
 */
export const renaveService = {
  async getStatus(vehicleId: string) {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select("id, renave_status, renave_gravame_number")
      .eq("id", vehicleId)
      .single();
    if (error) throw error;
    return data;
  },

  async getHistory(vehicleId: string): Promise<RenaveHistoryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from("renave_status_history")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async submitStatusChange({ vehicleId, status, notes, changedBy }: RenaveStatusChange) {
    if (!RENAVE_STATUSES.includes(status)) {
      throw new Error(`Status RENAVE inválido: ${status}`);
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("vehicles")
      .select("renave_status")
      .eq("id", vehicleId)
      .single();
    if (fetchErr) throw fetchErr;
    if (current?.renave_status === status) return { status };

    const { error: updateErr } = await supabaseAdmin
      .from("vehicles")
      .update({ renave_status: status })
      .eq("id", vehicleId);
    if (updateErr) throw updateErr;

    const { error: historyErr } = await supabaseAdmin
      .from("renave_status_history")
      .insert({
        vehicle_id: vehicleId,
        status,
        previous_status: current?.renave_status ?? null,
        notes: notes ?? null,
        changed_by: changedBy ?? null,
      });
    if (historyErr) throw historyErr;

    return { status };
  },

  async setGravameNumber(vehicleId: string, gravameNumber: string) {
    const { error } = await supabaseAdmin
      .from("vehicles")
      .update({ renave_gravame_number: gravameNumber || null })
      .eq("id", vehicleId);
    if (error) throw error;
  },
};
