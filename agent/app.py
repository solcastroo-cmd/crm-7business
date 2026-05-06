"""
app.py — Flask webhook para Z-API.
Recebe mensagens WhatsApp, processa com o agente Paulo e responde ao cliente.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone

from flask import Flask, jsonify, request

from crm import CRMClient, load_store, normalize_phone, _extract_data
from paulo import run_agent

logging.basicConfig(
    level   = logging.INFO,
    format  = "[%(asctime)s] %(levelname)s %(message)s",
    datefmt = "%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Deduplicação em memória (5 min TTL) ───────────────────────────────────────
_recent_ids: dict[str, float] = {}
_lock = threading.Lock()

def _is_dup(msg_id: str) -> bool:
    import time
    now = time.monotonic()
    with _lock:
        # Remove expirados
        expired = [k for k, ts in _recent_ids.items() if now - ts > 300]
        for k in expired:
            del _recent_ids[k]
        if msg_id in _recent_ids:
            return True
        _recent_ids[msg_id] = now
        return False


# ── Processamento em background ────────────────────────────────────────────────

def process_message(
    phone: str,
    message: str,
    sender_name: str,
    instance_id: str,
    msg_id: str,
) -> None:
    try:
        store = load_store(instance_id)
        if not store:
            logger.warning("[WEBHOOK] Store não encontrada para instance: %s", instance_id)
            return

        if not store.get("ai_enabled"):
            logger.info("[WEBHOOK] IA desativada globalmente")
            return

        if not all([store.get("zapi_instance"), store.get("zapi_token"), store.get("zapi_client_token")]):
            logger.warning("[WEBHOOK] Credenciais Z-API ausentes")
            return

        store_id = store["id"]
        from crm import _sb
        sb = _sb()

        # ── Busca ou cria lead ──────────────────────────────────────────────
        phones_to_try = [phone]
        if len(phone) == 11:
            phones_to_try.append(f"55{phone}")
        if phone.startswith("55") and len(phone) == 13:
            phones_to_try.append(phone[2:])

        lead = None
        for ph in phones_to_try:
            r    = sb.from_("leads").select("*").eq("phone", ph).eq("store_id", store_id).maybe_single().execute()
            data = _extract_data(r)
            if data:
                lead = data
                break

        if lead:
            lead_id = lead["id"]
            upd: dict = {}
            if not lead.get("name") and sender_name:
                upd["name"] = sender_name
            if upd:
                sb.from_("leads").update(upd).eq("id", lead_id).execute()
        else:
            r    = sb.from_("leads").insert({
                "phone":    phone,
                "name":     sender_name or None,
                "source":   "whatsapp",
                "stage":    "Novo Lead",
                "store_id": store_id,
            }).execute()
            rows    = getattr(r, "data", r) or []
            lead_id = rows[0]["id"] if rows else None

            if not lead_id:
                # Race condition: outro request criou o lead ao mesmo tempo
                err = str(getattr(r, "error", "") or "")
                if "duplicate" in err.lower() or "unique" in err.lower() or "23505" in err:
                    logger.warning("[WEBHOOK] Race condition — buscando lead existente: %s", phone)
                    for ph in phones_to_try:
                        r2   = sb.from_("leads").select("*").eq("phone", ph).eq("store_id", store_id).maybe_single().execute()
                        race = _extract_data(r2)
                        if race:
                            lead    = race
                            lead_id = race["id"]
                            break
                if not lead_id:
                    logger.error("[WEBHOOK] Falha ao criar lead para %s", phone)
                    return

            if not lead:
                r2   = sb.from_("leads").select("*").eq("id", lead_id).maybe_single().execute()
                lead = _extract_data(r2) or {}

        # ── Verifica handoff (vendedor assumiu) ────────────────────────────
        if lead.get("ai_enabled") is False:
            logger.info("[WEBHOOK] Lead %s com Paulo pausado — handoff ativo", lead_id)
            return

        # ── Dedup por external_id no banco ─────────────────────────────────
        crm = CRMClient(
            lead_id           = lead_id,
            phone             = phone,
            store_id          = store_id,
            zapi_instance     = store["zapi_instance"],
            zapi_token        = store["zapi_token"],
            zapi_client_token = store["zapi_client_token"],
        )
        if msg_id and crm.is_dup_external(msg_id):
            logger.info("[WEBHOOK] Dup external_id ignorada: %s", msg_id)
            return

        # ── Salva mensagem do cliente ──────────────────────────────────────
        crm.save_message(message, from_me=False, external_id=msg_id or None)

        # ── Roda o agente Paulo ────────────────────────────────────────────
        reply = run_agent(
            message            = message,
            crm                = crm,
            lead_record        = lead,
            custom_personality = store.get("ai_personality"),
            agent_name         = store.get("ai_name") or "Paulo",
        )

        if not reply:
            logger.warning("[WEBHOOK] Agente retornou resposta vazia")
            return

        # ── Envia e salva resposta ─────────────────────────────────────────
        sent_id = crm.send_text(reply)
        crm.save_message(reply, from_me=True, external_id=sent_id)

        logger.info("[WEBHOOK] %s: \"%s\" → \"%s\"", phone, message[:60], reply[:60])

    except Exception:
        logger.exception("[WEBHOOK] Erro ao processar mensagem de %s", phone)


# ── Handlers SentCallback (handoff pelo celular do vendedor) ──────────────────

def process_sent_by_seller(
    phone: str,
    message: str,
    instance_id: str,
    msg_id: str,
) -> None:
    try:
        store = load_store(instance_id)
        if not store:
            return

        from crm import _sb
        sb       = _sb()
        store_id = store["id"]

        phones_to_try = [phone]
        if len(phone) == 11:
            phones_to_try.append(f"55{phone}")

        for ph in phones_to_try:
            r    = sb.from_("leads").select("id,ai_enabled").eq("phone", ph).eq("store_id", store_id).maybe_single().execute()
            lead = _extract_data(r)
            if lead:
                # Salva msg do vendedor
                crm = CRMClient(lead_id=lead["id"], phone=ph, store_id=store_id,
                                 zapi_instance=store["zapi_instance"], zapi_token=store["zapi_token"],
                                 zapi_client_token=store["zapi_client_token"])

                # Se é SentCallback da própria IA, ignora
                if msg_id and crm.is_dup_external(msg_id):
                    logger.info("[WEBHOOK] SentCallback da IA ignorado: %s", msg_id)
                    return

                crm.save_message(message, from_me=True, external_id=msg_id or None)

                if lead.get("ai_enabled") is not False:
                    sb.from_("leads").update({"ai_enabled": False}).eq("id", lead["id"]).execute()
                    logger.info("[WEBHOOK] Handoff: Paulo pausado para lead %s", lead["id"])
                break

    except Exception:
        logger.exception("[WEBHOOK] Erro no handoff de %s", phone)


# ── Rotas ─────────────────────────────────────────────────────────────────────

@app.route("/webhook", methods=["POST"])
def webhook():
    body = request.get_json(silent=True) or {}

    ev_type  = body.get("type", "")
    is_group = body.get("isGroup", False)
    from_me  = body.get("fromMe", False)
    raw_phone = body.get("phone", "")
    message  = (body.get("text") or {}).get("message", "").strip()
    msg_id   = body.get("messageId", "")
    instance = body.get("instanceId", "")
    sender   = body.get("senderName", "")

    logger.info("[WEBHOOK] type=%s fromMe=%s phone=%s msg=%s", ev_type, from_me, raw_phone, message[:60])

    if ev_type not in ("ReceivedCallback", "SentCallback"):
        return jsonify({"ok": True, "skipped": "type"})

    if is_group:
        return jsonify({"ok": True, "skipped": "group"})

    if not message or not raw_phone:
        return jsonify({"ok": True, "skipped": "empty"})

    phone = normalize_phone(raw_phone)

    # Dedup em memória
    if msg_id and _is_dup(msg_id):
        return jsonify({"ok": True, "skipped": "dup_mem"})

    if from_me:
        # Vendedor enviou pelo celular → handoff
        t = threading.Thread(target=process_sent_by_seller, args=(phone, message, instance, msg_id), daemon=True)
        t.start()
        return jsonify({"ok": True, "handoff": "seller"})

    # Mensagem do cliente → agente Paulo
    t = threading.Thread(target=process_message, args=(phone, message, sender, instance, msg_id), daemon=True)
    t.start()
    return jsonify({"ok": True})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "agent":  "Paulo",
        "ts":     datetime.now(timezone.utc).isoformat(),
    })


@app.route("/", methods=["GET"])
def root():
    return jsonify({"service": "CRM 7Business — Agente Paulo", "version": "2.0"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info("Agente Paulo iniciando na porta %d", port)
    app.run(host="0.0.0.0", port=port, threaded=True)
