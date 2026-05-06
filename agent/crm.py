"""
crm.py — Operações com Supabase e Z-API para o agente Paulo.
Cada instância é criada por requisição (lead + credenciais da loja).
"""

from __future__ import annotations

import os
import logging
from datetime import datetime
from typing import Any

import requests
from supabase import create_client, Client

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
STORE_ID     = os.getenv("STORE_ID", "")

ZAPI_BASE = "https://api.z-api.io/instances"


def _sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def normalize_phone(raw: str) -> str:
    digits = "".join(c for c in raw if c.isdigit())
    if len(digits) == 13 and digits.startswith("55"):
        return digits[2:]
    return digits


def fmt_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    return f"55{digits}" if len(digits) <= 11 else digits


# ── Store settings ─────────────────────────────────────────────────────────────

def load_store(instance_id: str | None = None) -> dict | None:
    sb   = _sb()
    cols = "id,ai_enabled,ai_name,ai_personality,zapi_instance,zapi_token,zapi_client_token,notify_phone"

    if instance_id:
        try:
            r = sb.from_("users").select(cols).eq("zapi_instance", instance_id).maybe_single().execute()
            if r and r.data:
                return r.data
        except Exception as e:
            logger.warning("[CRM] load_store instance_id error: %s", e)

    if STORE_ID:
        try:
            r = sb.from_("users").select(cols).eq("id", STORE_ID).maybe_single().execute()
            if r and r.data:
                return r.data
        except Exception as e:
            logger.error("[CRM] load_store STORE_ID error: %s", e)

    return None


# ── CRMClient ──────────────────────────────────────────────────────────────────

class CRMClient:
    """Encapsula todas as operações de CRM para um lead específico."""

    def __init__(
        self,
        lead_id: str,
        phone: str,
        store_id: str,
        zapi_instance: str,
        zapi_token: str,
        zapi_client_token: str,
    ):
        self.lead_id           = lead_id
        self.phone             = phone
        self.store_id          = store_id
        self.zapi_instance     = zapi_instance
        self.zapi_token        = zapi_token
        self.zapi_client_token = zapi_client_token
        self._sb               = _sb()

    # ── Estoque ──────────────────────────────────────────────────────────────

    def buscar_estoque(
        self,
        marca: str | None = None,
        modelo: str | None = None,
        preco_max: float | None = None,
        cambio: str | None = None,
    ) -> list[dict]:
        q = (
            self._sb.from_("vehicles")
            .select("id,brand,model,year,price,color,km,fuel,transmission,photos,status,description")
            .eq("status", "disponivel")
            .eq("store_id", self.store_id)
        )
        if marca:
            q = q.ilike("brand", f"%{marca}%")
        if modelo:
            q = q.ilike("model", f"%{modelo}%")
        if preco_max:
            q = q.lte("price", preco_max)
        if cambio:
            q = q.ilike("transmission", f"%{cambio}%")

        r = q.order("created_at", desc=True).limit(15).execute()
        return r.data or []

    def buscar_veiculo(self, vehicle_id: str) -> dict | None:
        r = (
            self._sb.from_("vehicles")
            .select("id,brand,model,year,price,color,km,fuel,transmission,photos,status,description")
            .eq("id", vehicle_id)
            .maybe_single()
            .execute()
        )
        return r.data

    # ── Lead ──────────────────────────────────────────────────────────────────

    def mover_lead(self, stage: str) -> None:
        self._sb.from_("leads").update({"stage": stage}).eq("id", self.lead_id).execute()
        logger.info("[CRM] Lead %s → %s", self.lead_id, stage)

    def classificar_lead(self, qualification: str) -> None:
        self._sb.from_("leads").update({"qualification": qualification}).eq("id", self.lead_id).execute()
        logger.info("[CRM] Lead %s qualificado: %s", self.lead_id, qualification)

    def registrar_interesse_veiculo(self, vehicle_id: str) -> None:
        self._sb.from_("leads").update({"veiculo_interesse_id": vehicle_id}).eq("id", self.lead_id).execute()

    def adicionar_nota(self, nota: str) -> None:
        r = self._sb.from_("leads").select("notes").eq("id", self.lead_id).maybe_single().execute()
        existing = (r.data or {}).get("notes") or ""
        ts       = datetime.now().strftime("%d/%m %H:%M")
        new_notes = f"{existing}\n[{ts}] {nota}".strip()
        self._sb.from_("leads").update({"notes": new_notes}).eq("id", self.lead_id).execute()

    # ── Mensagens ─────────────────────────────────────────────────────────────

    def load_history(self, limit: int = 40) -> list[dict]:
        r = (
            self._sb.from_("messages")
            .select("text,from_me,created_at")
            .eq("lead_id", self.lead_id)
            .order("created_at")
            .limit(limit)
            .execute()
        )
        msgs = []
        for m in (r.data or []):
            text = (m.get("text") or "").strip()
            if text:
                msgs.append({"role": "assistant" if m["from_me"] else "user", "content": text})
        return msgs

    def save_message(self, text: str, from_me: bool, external_id: str | None = None) -> None:
        row: dict[str, Any] = {"lead_id": self.lead_id, "text": text, "from_me": from_me}
        if external_id:
            row["external_id"] = external_id
        r = self._sb.from_("messages").insert(row).execute()
        if hasattr(r, "error") and r.error:
            err = str(r.error)
            if "duplicate" not in err and "unique" not in err:
                logger.error("[CRM] Erro salvar msg: %s", err)

    def is_dup_external(self, external_id: str) -> bool:
        r = (
            self._sb.from_("messages")
            .select("id", count="exact", head=True)
            .eq("external_id", external_id)
            .execute()
        )
        return (r.count or 0) > 0

    # ── Z-API envios ──────────────────────────────────────────────────────────

    def _zapi_headers(self) -> dict:
        return {"Content-Type": "application/json", "Client-Token": self.zapi_client_token}

    def send_text(self, message: str) -> str | None:
        try:
            r = requests.post(
                f"{ZAPI_BASE}/{self.zapi_instance}/token/{self.zapi_token}/send-text",
                json={"phone": fmt_phone(self.phone), "message": message},
                headers=self._zapi_headers(),
                timeout=10,
            )
            return r.json().get("messageId")
        except Exception as e:
            logger.error("[ZAPI] Erro texto: %s", e)
            return None

    def send_image(self, image_url: str, caption: str = "") -> None:
        try:
            requests.post(
                f"{ZAPI_BASE}/{self.zapi_instance}/token/{self.zapi_token}/send-image",
                json={"phone": fmt_phone(self.phone), "image": image_url, "caption": caption},
                headers=self._zapi_headers(),
                timeout=15,
            )
        except Exception as e:
            logger.error("[ZAPI] Erro imagem: %s", e)

    def enviar_fotos_veiculo(self, vehicle_id: str) -> bool:
        v = self.buscar_veiculo(vehicle_id)
        if not v or not v.get("photos"):
            return False

        photos  = v["photos"][:5]
        preco   = f"R$ {int(v['price']):,}".replace(",", ".") if v.get("price") else ""
        caption = f"{v['brand']} {v['model']} {v.get('year', '')} {preco}".strip()

        import time
        for i, url in enumerate(photos):
            self.send_image(url, caption if i == 0 else "")
            if i < len(photos) - 1:
                time.sleep(0.7)

        logger.info("[ZAPI] %d foto(s) enviadas — %s", len(photos), caption)
        return True

    def notify_seller(self, notify_phone: str, sender_name: str, message: str) -> None:
        alerta = (
            f"🔥 *LEAD QUENTE!*\n"
            f"👤 {sender_name or self.phone}\n"
            f"📱 {self.phone}\n"
            f"💬 \"{message[:100]}\"\n\n"
            f"⚡ Acesse o CRM agora!"
        )
        try:
            requests.post(
                f"{ZAPI_BASE}/{self.zapi_instance}/token/{self.zapi_token}/send-text",
                json={"phone": fmt_phone(notify_phone), "message": alerta},
                headers=self._zapi_headers(),
                timeout=10,
            )
        except Exception as e:
            logger.error("[ZAPI] Erro notificar vendedor: %s", e)
