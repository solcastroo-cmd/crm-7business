"""
paulo.py — Agente Paulo: loop agentico com tool calling nativo do Claude.

Fluxo por mensagem:
  1. Monta system prompt com estoque disponível
  2. Carrega histórico da conversa (Supabase)
  3. Entra no loop: Claude → tool_use → executa → devolve resultado → repete
  4. Retorna resposta final de texto para envio ao cliente
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import anthropic

from crm import CRMClient
from tools import TOOLS

logger = logging.getLogger(__name__)

MODEL   = "claude-sonnet-4-6"
MAX_ITER = 10  # teto de segurança para o loop agentico

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
5. APRESENTAR VEÍCULO do estoque via buscar_estoque + enviar_fotos_veiculo
6. FECHAR: agendar visita ou resolver online?

AÇÕES AUTOMÁTICAS (use as tools SEMPRE que aplicável):
- Ao iniciar atendimento → mover_lead("Em Atendimento") + classificar_lead
- Ao apresentar veículo → buscar_estoque + enviar_fotos_veiculo + registrar_interesse_veiculo
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
- SIM: "Carta contemplada funciona como pagamento à vista — facilita muito!"
- NÃO: "Posso te indicar um consultor de consórcio 😊"

TROCA:
"Claro! Trabalhamos com troca sim. Qual é seu carro atual? Marca, modelo e ano?"

REGRAS ABSOLUTAS:
- NUNCA diga "sou IA", "sou robô", "sou assistente virtual"
- NUNCA escreva mais de 4 linhas seguidas
- NUNCA pressione o cliente de forma agressiva
- SEMPRE soar 100% humano
- Responda SEMPRE em português do Brasil
- Áudio recebido: "Recebi seu áudio! Prefiro responder por texto para ficar registrado 😊 Me conta o que precisa?"
- Imagem de carro: "Que modelo bacana! 👀 É exatamente esse que você procura?\""""


# ── Execução das tools ─────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict[str, Any], crm: CRMClient) -> Any:
    logger.info("[TOOL] %s(%s)", name, json.dumps(inputs, ensure_ascii=False)[:120])

    if name == "buscar_estoque":
        veiculos = crm.buscar_estoque(
            marca     = inputs.get("marca"),
            modelo    = inputs.get("modelo"),
            preco_max = inputs.get("preco_max"),
            cambio    = inputs.get("cambio"),
        )
        resumo = []
        for v in veiculos:
            has_photos = bool(v.get("photos"))
            resumo.append({
                "id":          v["id"],
                "descricao":   f"{v['brand']} {v['model']} {v.get('year','')}",
                "cor":         v.get("color", ""),
                "km":          v.get("km"),
                "combustivel": v.get("fuel", ""),
                "cambio":      v.get("transmission", ""),
                "preco":       v.get("price"),
                "fotos":       has_photos,
                "status":      v.get("status", ""),
            })
        return {"total": len(resumo), "veiculos": resumo}

    if name == "enviar_fotos_veiculo":
        ok = crm.enviar_fotos_veiculo(inputs["vehicle_id"])
        return {"enviado": ok, "vehicle_id": inputs["vehicle_id"]}

    if name == "mover_lead":
        crm.mover_lead(inputs["stage"])
        return {"ok": True, "stage": inputs["stage"]}

    if name == "classificar_lead":
        crm.classificar_lead(inputs["qualification"])
        return {"ok": True, "qualification": inputs["qualification"]}

    if name == "registrar_interesse_veiculo":
        crm.registrar_interesse_veiculo(inputs["vehicle_id"])
        return {"ok": True, "vehicle_id": inputs["vehicle_id"]}

    if name == "adicionar_nota":
        crm.adicionar_nota(inputs["nota"])
        return {"ok": True}

    return {"erro": f"Tool desconhecida: {name}"}


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
        f"ATENÇÃO: Este lead demonstrou interesse ESPECÍFICO neste veículo. "
        f"Na primeira mensagem (sem histórico), apresente-o diretamente — NÃO pergunte qual carro procura.\n"
        f"{partes}\n"
        f"ID para enviar fotos: {v['id']}"
    )
    if not disponivel:
        ctx += f"\n⚠️ Veículo {v.get('status','').upper()} — informe e ofereça alternativas."
    return ctx


# ── Inventário resumido ────────────────────────────────────────────────────────

def _inventory_ctx(crm: CRMClient) -> str:
    veiculos = crm.buscar_estoque()
    if not veiculos:
        return "\n\n--- ESTOQUE ---\nNenhum veículo disponível no momento."
    lines = []
    for v in veiculos:
        has_photos = bool(v.get("photos"))
        km  = f"{int(v['km']):,}km".replace(",", ".") if v.get("km") else "?"
        preco = f"R${int(v['price']):,}".replace(",", ".") if v.get("price") else "?"
        lines.append(
            f"• ID:{v['id']} | {v['brand']} {v['model']} {v.get('year','')} | "
            f"{v.get('color','')} | {km} | {v.get('fuel','')} | {v.get('transmission','')} | "
            f"{preco}" + (" [fotos]" if has_photos else " [sem fotos]")
        )
    return (
        f"\n\n--- ESTOQUE DISPONÍVEL ({len(veiculos)} veículos) ---\n"
        "Use buscar_estoque para filtrar e enviar_fotos_veiculo para enviar fotos ao cliente.\n\n"
        + "\n".join(lines)
    )


# ── Agente principal ───────────────────────────────────────────────────────────

def run_agent(
    message: str,
    crm: CRMClient,
    lead_record: dict,
    custom_personality: str | None = None,
    agent_name: str = "Paulo",
) -> str:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # System prompt
    base = custom_personality.strip() if custom_personality and custom_personality.strip() else PAULO_SYSTEM
    if custom_personality and "paulo" not in base.lower() and "você é" not in base.lower():
        base = f"Você é {agent_name}, vendedor da PH Autoscar.\n\n{base}"

    system = base

    # Contexto: veículo de interesse + estoque
    veiculo_id = lead_record.get("veiculo_interesse_id")
    if veiculo_id:
        system += _vehicle_interest_ctx(crm, veiculo_id)
    system += _inventory_ctx(crm)

    # Histórico da conversa + mensagem atual
    history  = crm.load_history()
    messages = history + [{"role": "user", "content": message}]

    provider = "anthropic" if os.getenv("ANTHROPIC_API_KEY") else "none"
    logger.info("[PAULO] lead:%s | history:%d | provider:%s", crm.lead_id, len(history), provider)

    if provider == "none":
        return f"Olá! 😊 Aqui é o {agent_name} da PH Autoscar. Como posso ajudar?"

    # ── Loop agentico ─────────────────────────────────────────────────────────
    for iteration in range(MAX_ITER):
        response = client.messages.create(
            model      = MODEL,
            max_tokens = 1024,
            system     = system,
            tools      = TOOLS,
            messages   = messages,
        )

        logger.info("[PAULO] iter=%d stop_reason=%s", iteration, response.stop_reason)

        # Resposta final de texto
        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    return block.text.strip()
            return ""

        # Executa tool_use
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

        # Qualquer outro stop_reason — extrai texto se houver
        for block in response.content:
            if hasattr(block, "text"):
                return block.text.strip()
        break

    logger.warning("[PAULO] Loop encerrado sem resposta final após %d iterações", MAX_ITER)
    return f"Olá! 😊 Aqui é o {agent_name} da PH Autoscar. Um momento, estou verificando as informações."
