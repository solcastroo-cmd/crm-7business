"""
tools.py — Definição das ferramentas (tools) do agente Paulo para o Claude.
Cada tool mapeia uma ação de vendas que Paulo pode executar de forma autônoma.
"""

TOOLS: list[dict] = [
    {
        "name": "buscar_estoque",
        "description": (
            "Busca veículos disponíveis no estoque que combinem com o perfil e interesse do cliente. "
            "Use SEMPRE que precisar apresentar opções de carros ou verificar disponibilidade. "
            "Filtros são opcionais — sem filtro retorna os 15 mais recentes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "marca":     {"type": "string",  "description": "Marca do veículo (ex: Honda, Toyota, Chevrolet)"},
                "modelo":    {"type": "string",  "description": "Modelo do veículo (ex: Civic, Corolla, Onix)"},
                "preco_max": {"type": "number",  "description": "Preço máximo em reais (ex: 80000)"},
                "cambio":    {"type": "string",  "description": "Tipo de câmbio: automático ou manual"},
            },
        },
    },
    {
        "name": "enviar_fotos_veiculo",
        "description": (
            "Envia as fotos de um veículo específico para o cliente via WhatsApp. "
            "SEMPRE chamar esta tool quando o cliente pedir fotos ou quando apresentar um veículo. "
            "Requer o UUID do veículo obtido via buscar_estoque."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_id": {"type": "string", "description": "UUID do veículo no estoque (campo 'id')"},
            },
            "required": ["vehicle_id"],
        },
    },
    {
        "name": "mover_lead",
        "description": (
            "Move o lead para a etapa correta do funil de vendas conforme o progresso da conversa. "
            "Use proativamente: ao responder → 'Em Atendimento', ao falar de financiamento → 'Simulação', "
            "ao marcar visita → 'Visita', ao negociar → 'Negociação', ao fechar → 'Venda'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "stage": {
                    "type": "string",
                    "enum": ["Novo Lead", "Em Atendimento", "Simulação", "Visita", "Negociação", "Venda", "Perdido"],
                    "description": "Etapa do funil de vendas",
                },
            },
            "required": ["stage"],
        },
    },
    {
        "name": "classificar_lead",
        "description": (
            "Classifica o lead como quente, morno ou frio baseado na intenção demonstrada na conversa. "
            "QUENTE: quer comprar logo, pede simulação, CPF, visita, fecha negócio. "
            "MORNO: interesse mas pesquisando, pede fotos, compara. "
            "FRIO: só olhando, demora responder, mensagens curtas."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "qualification": {
                    "type": "string",
                    "enum": ["quente", "morno", "frio"],
                    "description": "Classificação do lead",
                },
            },
            "required": ["qualification"],
        },
    },
    {
        "name": "registrar_interesse_veiculo",
        "description": (
            "Registra qual veículo o lead está interessado no CRM. "
            "Use quando o cliente confirmar interesse em um modelo específico do estoque."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_id": {"type": "string", "description": "UUID do veículo de interesse"},
            },
            "required": ["vehicle_id"],
        },
    },
    {
        "name": "adicionar_nota",
        "description": (
            "Adiciona uma nota ao lead com informações importantes capturadas na conversa: "
            "CPF fornecido, valor de entrada mencionado, preferências específicas, objeções, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "nota": {"type": "string", "description": "Texto da nota a ser registrada no CRM"},
            },
            "required": ["nota"],
        },
    },
]
