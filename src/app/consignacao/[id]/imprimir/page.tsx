"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Photo = { id: string; url: string; label: string };
type Contract = Record<string, string | number | null> & { consignment_photos?: Photo[] };

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "___/___/______";
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
};
const fmtMoney = (v: string | number | null | undefined) => {
  if (!v) return "R$ ___________";
  const n = typeof v === "string" ? parseFloat(v.replace(/\./g,"").replace(",",".")) : Number(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const val = (v: string | number | null | undefined) => (v != null && v !== "" ? String(v) : "___________________________");

export default function ImprimirPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Contract | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    fetch(`/api/consignacao/${id}`)
      .then(r => r.json())
      .then(d => {
        const { consignment_photos, ...rest } = d;
        setC(rest);
        setPhotos(Array.isArray(consignment_photos) ? consignment_photos : []);
      });
  }, [id]);

  useEffect(() => {
    if (c) setTimeout(() => window.print(), 800);
  }, [c]);

  if (!c) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", color: "#555" }}>
      Carregando contrato...
    </div>
  );

  const printStyle = `
    @page { size: A4; margin: 20mm 15mm; }
    @media print {
      .no-print { display: none !important; }
      body { margin: 0; }
      .page-break { page-break-before: always; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
    h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #000; padding-bottom: 4px; margin: 18px 0 10px; }
    .subtitle { text-align: center; font-size: 9pt; color: #444; margin-bottom: 16px; }
    .row { display: flex; gap: 16px; margin-bottom: 8px; }
    .field { flex: 1; }
    .field-label { font-size: 8pt; color: #555; margin-bottom: 2px; font-weight: bold; text-transform: uppercase; }
    .field-value { border-bottom: 1px solid #999; padding: 3px 0; min-height: 22px; font-size: 10pt; }
    .field-value-box { border: 1px solid #999; padding: 4px 8px; min-height: 22px; font-size: 10pt; border-radius: 3px; }
    .w33 { flex: 0 0 33%; }
    .w50 { flex: 0 0 50%; }
    .w66 { flex: 0 0 66%; }
    .w25 { flex: 0 0 25%; }
    .w75 { flex: 0 0 75%; }
    .sign-area { display: flex; gap: 40px; margin-top: 40px; }
    .sign-box { flex: 1; border-top: 1px solid #000; padding-top: 6px; text-align: center; font-size: 9pt; color: #555; }
    .logo-area { text-align: center; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 9pt; font-weight: bold; }
    .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .photo-item img { width: 100%; height: 140px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
    .photo-label { font-size: 8pt; color: #555; text-align: center; margin-top: 3px; }
    .divider { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
    .obs-box { border: 1px solid #999; padding: 8px; min-height: 60px; font-size: 10pt; border-radius: 3px; margin-top: 4px; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #dc2626; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; z-index: 999; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyle }} />
      <button className="no-print print-btn" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 0" }}>

        {/* Cabeçalho */}
        <div className="logo-area">
          <h1>Contrato de Consignação de Veículo</h1>
          <p className="subtitle">
            {val(c.loja_razao_social)} — CNPJ: {val(c.loja_cnpj)}<br />
            Av. Desembargador Gonzaga, 1328 — Cidade dos Funcionários — Fortaleza/CE
          </p>
          <hr className="divider" />
        </div>

        {/* 1. Consignante */}
        <h2>1. Consignante (Proprietário do Veículo)</h2>
        <div className="row">
          <div className="field w66">
            <div className="field-label">Nome / Razão Social</div>
            <div className="field-value">{val(c.proprietario_nome)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Telefone</div>
            <div className="field-value">{val(c.proprietario_telefone)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w33">
            <div className="field-label">Nacionalidade</div>
            <div className="field-value">{val(c.proprietario_nacionalidade)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Estado Civil</div>
            <div className="field-value">{val(c.proprietario_estado_civil)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Profissão</div>
            <div className="field-value">{val(c.proprietario_profissao)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w33">
            <div className="field-label">RG</div>
            <div className="field-value">{val(c.proprietario_rg)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">CPF / CNPJ</div>
            <div className="field-value">{val(c.proprietario_cpf_cnpj)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">E-mail</div>
            <div className="field-value">{val(c.proprietario_email)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <div className="field-label">Endereço Completo</div>
            <div className="field-value">{val(c.proprietario_endereco)}</div>
          </div>
        </div>

        {/* 2. Consignatária */}
        <h2>2. Consignatária (Loja)</h2>
        <div className="row">
          <div className="field w50">
            <div className="field-label">Razão Social</div>
            <div className="field-value">{val(c.loja_razao_social)}</div>
          </div>
          <div className="field w50">
            <div className="field-label">Nome Fantasia</div>
            <div className="field-value">{val(c.loja_nome_fantasia)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w50">
            <div className="field-label">CNPJ</div>
            <div className="field-value">{val(c.loja_cnpj)}</div>
          </div>
          <div className="field w50">
            <div className="field-label">Representante Legal</div>
            <div className="field-value">{val(c.loja_responsavel)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <div className="field-label">Endereço</div>
            <div className="field-value">{val(c.loja_endereco)}</div>
          </div>
        </div>

        {/* 3. Veículo */}
        <h2>3. Dados do Veículo</h2>
        <div className="row">
          <div className="field w33">
            <div className="field-label">Marca</div>
            <div className="field-value">{val(c.veiculo_marca)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Modelo</div>
            <div className="field-value">{val(c.veiculo_modelo)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Versão</div>
            <div className="field-value">{val(c.veiculo_versao)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w25">
            <div className="field-label">Ano Fab.</div>
            <div className="field-value">{val(c.veiculo_ano_fabricacao)}</div>
          </div>
          <div className="field w25">
            <div className="field-label">Ano Modelo</div>
            <div className="field-value">{val(c.veiculo_ano_modelo)}</div>
          </div>
          <div className="field w25">
            <div className="field-label">Placa</div>
            <div className="field-value">{val(c.veiculo_placa)}</div>
          </div>
          <div className="field w25">
            <div className="field-label">Cor</div>
            <div className="field-value">{val(c.veiculo_cor)}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w33">
            <div className="field-label">Chassi</div>
            <div className="field-value">{val(c.veiculo_chassi)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Renavam</div>
            <div className="field-value">{val(c.veiculo_renavam)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Quilometragem</div>
            <div className="field-value">{c.veiculo_km_atual ? `${Number(c.veiculo_km_atual).toLocaleString("pt-BR")} km` : "___________"}</div>
          </div>
        </div>
        <div className="row">
          <div className="field w50">
            <div className="field-label">Combustível</div>
            <div className="field-value">{val(c.veiculo_combustivel)}</div>
          </div>
        </div>

        {/* 4. Valor */}
        <h2>4. Valor e Comissão</h2>
        <div className="row">
          <div className="field w50">
            <div className="field-label">Valor Mínimo de Venda</div>
            <div className="field-value" style={{ fontWeight: "bold", fontSize: "12pt" }}>{fmtMoney(c.valor_minimo_venda)}</div>
          </div>
          <div className="field w25">
            <div className="field-label">Comissão da Loja</div>
            <div className="field-value">{c.percentual_comissao ? `${c.percentual_comissao}%` : "_____%"}</div>
          </div>
          <div className="field w25">
            <div className="field-label">Valor da Comissão</div>
            <div className="field-value">
              {c.valor_minimo_venda && c.percentual_comissao
                ? (Number(c.valor_minimo_venda) * Number(c.percentual_comissao) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "___________"}
            </div>
          </div>
        </div>

        {/* 5. Prazo */}
        <h2>5. Prazo do Contrato</h2>
        <div className="row">
          <div className="field w33">
            <div className="field-label">Data de Início</div>
            <div className="field-value">{fmtDate(c.data_inicio as string)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Data Final</div>
            <div className="field-value">{fmtDate(c.data_final as string)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Taxa de Retirada Antecipada</div>
            <div className="field-value">{fmtMoney(c.taxa_retirada)}</div>
          </div>
        </div>

        {/* 6. Vistoria */}
        <h2>6. Laudo de Vistoria</h2>
        <div className="row">
          <div className="field w33">
            <div className="field-label">Pintura</div>
            <div className="field-value-box">{val(c.vistoria_pintura)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Pneus</div>
            <div className="field-value-box">{val(c.vistoria_pneus)}</div>
          </div>
          <div className="field w33">
            <div className="field-label">Interior</div>
            <div className="field-value-box">{val(c.vistoria_interior)}</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="field-label">Observações</div>
          <div className="obs-box">{c.observacoes_vistoria || ""}</div>
        </div>

        {/* Fotos de vistoria */}
        {photos.length > 0 && (
          <>
            <div style={{ marginTop: 14 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>Fotos de Vistoria</div>
              <div className="photo-grid">
                {photos.map(ph => (
                  <div key={ph.id} className="photo-item">
                    <img src={ph.url} alt={ph.label} />
                    <div className="photo-label">{ph.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 7. Cláusulas */}
        <h2>7. Cláusulas e Condições</h2>
        <div style={{ fontSize: "9pt", lineHeight: 1.6, color: "#222" }}>
          <p><strong>Cláusula 1ª — OBJETO:</strong> O(A) CONSIGNANTE entrega à CONSIGNATÁRIA o veículo descrito na Seção 3 para que esta o ofereça à venda pelo valor mínimo estipulado na Seção 4, pelo prazo definido na Seção 5.</p>
          <p><strong>Cláusula 2ª — COMISSÃO:</strong> Sobre o valor da venda, a CONSIGNATÁRIA receberá a comissão indicada na Seção 4. O saldo remanescente será repassado ao CONSIGNANTE em até 3 (três) dias úteis após a conclusão da venda.</p>
          <p><strong>Cláusula 3ª — PRAZO:</strong> O presente contrato vigorará pelo prazo estipulado na Seção 5. O CONSIGNANTE poderá retirar o veículo antes do prazo mediante pagamento da taxa prevista na Seção 5.</p>
          <p><strong>Cláusula 4ª — RESPONSABILIDADE:</strong> O veículo permanecerá sob a guarda da CONSIGNATÁRIA, que responderá pelos danos decorrentes de negligência ou imprudência durante o período de consignação.</p>
          <p><strong>Cláusula 5ª — DOCUMENTAÇÃO:</strong> O CONSIGNANTE declara que o veículo está livre de ônus, dívidas, multas ou restrições que impeçam sua transferência, responsabilizando-se civil e criminalmente por declaração falsa.</p>
          <p><strong>Cláusula 6ª — FORO:</strong> As partes elegem o Foro da Comarca de {val(c.cidade_foro)} para dirimir quaisquer controvérsias oriundas deste contrato, renunciando a qualquer outro por mais privilegiado que seja.</p>
        </div>

        {/* Assinaturas */}
        <div style={{ marginTop: 12 }}>
          <div className="field-label">Data de Assinatura: {fmtDate(c.data_assinatura as string)}</div>
        </div>
        <div className="sign-area">
          <div className="sign-box">
            <p style={{ margin: "0 0 4px" }}>{val(c.proprietario_nome)}</p>
            <p style={{ margin: 0 }}>CPF/CNPJ: {val(c.proprietario_cpf_cnpj)}</p>
            <p style={{ margin: "4px 0 0", color: "#777" }}>CONSIGNANTE</p>
          </div>
          <div className="sign-box">
            <p style={{ margin: "0 0 4px" }}>{val(c.loja_responsavel)}</p>
            <p style={{ margin: 0 }}>{val(c.loja_razao_social)}</p>
            <p style={{ margin: "4px 0 0", color: "#777" }}>CONSIGNATÁRIA</p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: "8pt", color: "#999" }}>
          Documento gerado pelo sistema CRM 7Business · {new Date().toLocaleDateString("pt-BR")}
        </div>
      </div>
    </>
  );
}
