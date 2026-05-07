"""
paulo.py — Agente Paulo: loop agentico com tool calling.

Providers (em ordem de preferência):
  1. Groq  (GROQ_API_KEY)  → llama-3.3-70b-versatile — tool calling via OpenAI SDK
  2. Anthropic (ANTHROPIC_API_KEY) → claude-sonnet-4-6 — tool calling nativo

Fluxo por mensagem:
  1. Monta system prompt com estoque disponível + veículo de interesse do lead
  2. Carrega histórico da conversa (Supabase)
  3. Loop: LLM → tool_use → executa tool → devolve resultado → repete
  4. Retorna resposta final de texto para envio ao cliente
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from crm import CRMClient
from tools import TOOLS

logger  = logging.getLogger(__name__)
MAX_ITER = 10

PAULO_SYSTEM = """Você é Paulo, vendedor da PH Autoscar, atendendo pelo WhatsApp.

QUEM VOCÊ É:
- Vendedor humano, simpático, consultivo e objetivo
- NUNCA revele que é IA, robô ou assistente virtual
- Especialista em carros, financiamento, consórcio e troca
- Fala como brasileiro: frases curtas, diretas, com emojis moderados
- Sempre termina com uma pergunta para manter o diálogo
- Máximo 3-4 linhas por mensagem — nunca textos longos

PRIMEIRA MENSAGEM (sem histórico anterior):
Se o lead TEM veículo de interesse registrado → apresente o carro diretamente.
Se NÃO tem → use: "Olá! 😊 Aqui é o Paulo da PH Autoscar. Vi que você demonstrou interesse em um veículo. Me conta — você está buscando para uso próprio ou é presentear alguém?"

FLUXO DE ATENDIMENTO (SPIN Selling):
1. CONFIRMAR INTERESSE no veículo específico
2. USO: dia a dia, trabalho ou família?
3. FORMA DE PAGAMENTO: financiar, à vista ou consórcio?
4. ENTRADA: tem valor de entrada?
5. APRESENTAR VEÍCULO via buscar_estoque + enviar_fotos_veiculo
6. FECHAR: agendar visita ou resolver online?

VERIFICAÇÃO DE ESTOQUE OBRIGATÓRIA:
- ANTES de mencionar preço, quilometragem ou disponibilidade de qualquer veículo, SEMPRE use buscar_estoque para confirmar dados reais
- Se o veículo de interesse NÃO estiver disponível, informe o cliente e ofereça alternativas do estoque
- NUNCA invente ou cite valores sem ter chamado buscar_estoque nesta conversa

AÇÕES AUTOMÁTICAS (use as tools SEMPRE que aplicável):
- Ao iniciar atendimento → mover_lead("Em Atendimento") + classificar_lead
- Ao apresentar veículo → buscar_estoque(marca, modelo) PRIMEIRO, depois enviar_fotos_veiculo + registrar_interesse_veiculo
- Cliente quer simulação → mover_lead("Simulação")
- Cliente quer visitar → mover_lead("Visita")
- Negociando → mover_lead("Negociação")
- Fechou → mover_lead("Venda")
- CPF/CNH recebido → adicionar_nota com o dado
- Lead quente → classificar_lead("quente")

FINANCIAMENTO:
"Conseguimos simular rapidinho com os bancos parceiros 😊
Trabalhamos com BV, Santander, Itaú, Bradesco e mais.
Me passa seu CPF ou CNH para rodar a simulação?"

CONSÓRCIO:
"Trabalhamos com consórcio sim! Você já tem carta contemplada?"
- SIM: "Carta contemplada funciona como pagamento à vista!"
- NÃO: "Posso te indicar um consultor de consórcio 😊"

TROCA:
"Claro! Trabalhamos com troca. Qual é seu carro atual? Marca, modelo e ano?"

REGRAS ABSOLUTAS:
- NUNCA diga "sou IA", "sou robô", "sou assistente virtual"
- NUNCA escreva mais de 4 linhas seguidas
- NUNCA pressione o cliente de forma agressiva
- SEMPRE soar 100% humano
- Responda SEMPRE em português do Brasil
- NUNCA cite preço ou disponibilidade sem chamar buscar_estoque antes nesta conversa
- NUNCA mencione ao cliente que está classificando, movendo de stage, registrando interesse ou adicionando notas — essas ações são SEMPRE executadas em silêncio, invisíveis para o cliente
- Áudio recebido: "Recebi seu áudio! Prefiro responder por texto para ficar registrado 😊 Me conta o que precisa?"
- Imagem de carro: "Que modelo bacana! 👀 É exatamente esse que você procura?\""""


# ── Contexto do veículo de interesse ──────────────────────────────────────────

def _vehicle_interest_ctx(crm: CRMClient, vehicle_id: str) -> str:
    v = crm.buscar_veiculo(vehicle_id)
    if not v:
        return ""
    has_photos = bool(v.get("photos"))
    disponivel = v.get("status") == "disponivel"
    partes = " | ".join(filter(None, [
        f"{v['brand']} {v['model']}",
        str(v["year"]) if v.get("year") else None,
        v.get("color"),
        f"{int(v['km']):,}km".replace(",", ".") if v.get("km") else None,
        v.get("fuel"),
        v.get("transmission"),
        f"R${int(v['price']):,}".replace(",", ".") if v.get("price") else None,
        "DISPONÍVEL" if disponivel else (v.get("status") or "").upper(),
        f"{len(v['photos'])} foto(s)" if has_photos else "sem fotos",
    ]))
    ctx = (
        f"\n\n--- VEÍCULO DE INTERESSE DO LEAD ---\n"
        f"ATENÇÃO: Lead demonstrou interesse ESPECÍFICO. Na primeira mensagem (sem histórico), "
        f"apresente este carro diretamente — NÃO pergunte qual modelo o cliente procura.\n"
        f"{partes}\nID para fotos: {v['id']}"
    )
    if not disponivel:
        ctx += f"\n⚠️ Veículo {v.get('status','').upper()} — informe e ofereça alternativas."
    return ctx


def _inventory_ctx(crm: CRMClient) -> str:
    veiculos = crm.buscar_estoque()
    if not veiculos:
        return "\n\n--- ESTOQUE ---\nNenhum veículo disponível no momento."
    lines = []
    for v in veiculos:
        km    = f"{int(v['km']):,}km".replace(",", ".") if v.get("km") else "?"
        preco = f"R${int(v['price']):,}".replace(",", ".") if v.get("price") else "?"
        fotos = "[fotos]" if v.get("photos") else "[sem fotos]"
        lines.append(
            f"• ID:{v['id']} | {v['brand']} {v['model']} {v.get('year','')} | "
            f"{v.get('color','')} | {km} | {v.get('fuel','')} | {v.get('transmission','')} | "
            f"{preco} {fotos}"
        )
    return (
        f"\n\n--- ESTOQUE DISPONÍVEL ({len(veiculos)} veículos) ---\n"
        "Use buscar_estoque para filtrar e enviar_fotos_veiculo para enviar fotos.\n\n"
        + "\n".join(lines)
    )


# ── Execução das tools ─────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict[str, Any], crm: CRMClient) -> Any:
    logger.info("[TOOL] %s(%s)", name, json.dumps(inputs, ensure_ascii=False, default=str)[:120])

    if name == "buscar_estoque":
        veiculos = crm.buscar_estoque(
            marca=inputs.get("marca"), modelo=inputs.get("modelo"),
            preco_max=inputs.get("preco_max"), cambio=inputs.get("cambio"),
        )
        resumo = [{
            "id":          v["id"],
            "descricao":   f"{v['brand']} {v['model']} {v.get('year','')}",
            "cor":         v.get("color", ""),
            "km":          v.get("km"),
            "combustivel": v.get("fuel", ""),
            "cambio":      v.get("transmission", ""),
            "preco":       v.get("price"),
            "fotos":       bool(v.get("photos")),
        } for v in veiculos]
        return {"total": len(resumo), "veiculos": resumo}

    if name == "enviar_fotos_veiculo":
        ok = crm.enviar_fotos_veiculo(inputs["vehicle_id"])
        return {"enviado": ok}

    if name == "mover_lead":
        crm.mover_lead(inputs["stage"])
        return {"ok": True}

    if name == "classificar_lead":
        crm.classificar_lead(inputs["qualification"])
        return {"ok": True}

    if name == "registrar_interesse_veiculo":
        crm.registrar_interesse_veiculo(inputs["vehicle_id"])
        return {"ok": True}

    if name == "adicionar_nota":
        crm.adicionar_nota(inputs["nota"])
        return {"ok": True}

    return {"erro": f"Tool desconhecida: {name}"}


# ── Provider: Groq (OpenAI-compatible, tool calling nativo) ───────────────────

def _groq_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name":        t["name"],
                "description": t["description"],
                "parameters":  t["input_schema"],
            },
        }
        for t in TOOLS
    ]


def _run_groq(system: str, messages: list[dict], crm: CRMClient) -> str:
    from openai import OpenAI

    client  = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")
    history = [{"role": "system", "content": system}] + messages

    for iteration in range(MAX_ITER):
        response = client.chat.completions.create(
            model       = "llama-3.3-70b-versatile",
            max_tokens  = 1024,
            temperature = 0.65,
            tools       = _groq_tools(),
            tool_choice = "auto",
            messages    = history,
        )

        choice = response.choices[0]
        logger.info("[GROQ] iter=%d finish_reason=%s", iteration, choice.finish_reason)

        if choice.finish_reason == "stop":
            return (choice.message.content or "").strip()

        if choice.finish_reason == "tool_calls":
            history.append(choice.message)  # assistant message com tool_calls
            tool_msgs = []
            for tc in (choice.message.tool_calls or []):
                inputs = json.loads(tc.function.arguments)
                result = execute_tool(tc.function.name, inputs, crm)
                tool_msgs.append({
                    "role":         "tool",
                    "tool_call_id": tc.id,
                    "content":      json.dumps(result, ensure_ascii=False, default=str),
                })
            history.extend(tool_msgs)
            continue

        # fallback: retorna texto se houver
        return (choice.message.content or "").strip()

    return ""


# ── Provider: Anthropic (claude-sonnet-4-6, tool calling nativo) ──────────────

def _run_anthropic(system: str, messages: list[dict], crm: CRMClient) -> str:
    import anthropic as _anthropic

    client = _anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    for iteration in range(MAX_ITER):
        response = client.messages.create(
            model      = "claude-sonnet-4-6",
            max_tokens = 1024,
            system     = system,
            tools      = TOOLS,
            messages   = messages,
        )

        logger.info("[ANTHROPIC] iter=%d stop_reason=%s", iteration, response.stop_reason)

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    return block.text.strip()
            return ""

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = execute_tool(block.name, block.input, crm)
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": block.id,
                        "content":     json.dumps(result, ensure_ascii=False, default=str),
                    })
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user",      "content": tool_results})
            continue

        for block in response.content:
            if hasattr(block, "text"):
                return block.text.strip()
        break

    return ""


# ── Agente principal ───────────────────────────────────────────────────────────

def run_agent(
    message:            str,
    crm:                CRMClient,
    lead_record:        dict,
    custom_personality: str | None = None,
    agent_name:         str        = "Paulo",
) -> str:
    fallback = f"Olá! 😊 Aqui é o {agent_name} da PH Autoscar. Como posso ajudar você a encontrar o veículo ideal?"

    groq_key      = os.getenv("GROQ_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if not groq_key and not anthropic_key:
        logger.error("[PAULO] Nenhuma API key configurada (GROQ_API_KEY ou ANTHROPIC_API_KEY)")
        return fallback

    # System prompt
    base = (custom_personality or "").strip()
    if not base:
        base = PAULO_SYSTEM
    elif "paulo" not in base.lower() and "você é" not in base.lower():
        base = f"Você é {agent_name}, vendedor da PH Autoscar.\n\n{base}"

    system = base
    veiculo_id = lead_record.get("veiculo_interesse_id")
    if veiculo_id:
        system += _vehicle_interest_ctx(crm, veiculo_id)
    system += _inventory_ctx(crm)

    history  = crm.load_history()
    messages = history + [{"role": "user", "content": message}]

    provider = "groq" if groq_key else "anthropic"
    logger.info("[PAULO] lead:%s | history:%d | provider:%s", crm.lead_id, len(history), provider)

    try:
        if groq_key:
            reply = _run_groq(system, messages, crm)
            if reply:
                return reply
        if anthropic_key:
            reply = _run_anthropic(system, messages, crm)
            if reply:
                return reply
    except Exception:
        logger.exception("[PAULO] Erro no agente")
        # Tenta o outro provider
        try:
            if provider == "groq" and anthropic_key:
                return _run_anthropic(system, messages, crm)
            if provider == "anthropic" and groq_key:
                return _run_groq(system, messages, crm)
        except Exception:
            logger.exception("[PAULO] Fallback também falhou")

    return fallback
