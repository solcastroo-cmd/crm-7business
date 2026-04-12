"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type US = {
  id:string;email:string;business_name:string|null;notify_phone:string|null;
  sellers:string[]|null;cnpj:string|null;address:string|null;store_phone:string|null;
  ai_enabled:boolean|null;ai_name:string|null;ai_personality:string|null;plan:string|null;
};
type IS = {ultramsg:boolean;instagram:boolean;evolution:boolean;meta:boolean};

function Section({title,icon,children}:{title:string;icon:string;children:React.ReactNode}){
  return(
    <div className="rounded-2xl p-6 mb-5" style={{background:"#232323",border:"1px solid #2e2e2e"}}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-white mb-5">
        <span className="text-base">{icon}</span>{title}
      </h2>
      {children}
    </div>
  );
}
function Dot({on}:{on:boolean}){return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${on?"bg-green-400":"bg-gray-600"}`}/>;}
const inp:React.CSSProperties={width:"100%",padding:"9px 12px",background:"#1a1a1a",border:"1px solid #3a3a3a",borderRadius:"8px",color:"#fff",fontSize:"14px",outline:"none",boxSizing:"border-box"};

export default function SettingsPage(){
  const[userId,setUserId]=useState<string|null>(null);
  const[settings,setSettings]=useState<US|null>(null);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[saved,setSaved]=useState(false);
  const[erro,setErro]=useState<string|null>(null);
  const[businessName,setBusinessName]=useState("");
  const[cnpj,setCnpj]=useState("");
  const[storePhone,setStorePhone]=useState("");
  const[address,setAddress]=useState("");
  const[notifyPhone,setNotifyPhone]=useState("");
  const[sellers,setSellers]=useState<string[]>([]);
  const[newSeller,setNewSeller]=useState("");
  const[aiEnabled,setAiEnabled]=useState(false);
  const[aiName,setAiName]=useState("Paulo");
  const[aiPersonality,setAiPersonality]=useState("");
  const[intSt,setIntSt]=useState<IS>({ultramsg:false,instagram:false,evolution:false,meta:false});

  const loadSettings=useCallback(async(uid:string)=>{
    const r=await fetch(`/api/settings?userId=${uid}`);
    if(!r.ok)return;
    const d:US=await r.json();
    setSettings(d);setBusinessName(d.business_name??"");setCnpj(d.cnpj??"");
    setStorePhone(d.store_phone??"");setAddress(d.address??"");setNotifyPhone(d.notify_phone??"");
    setSellers(d.sellers??[]);setAiEnabled(d.ai_enabled??false);setAiName(d.ai_name??"Paulo");setAiPersonality(d.ai_personality??"");
  },[]);

  const loadInt=useCallback(async(uid:string)=>{
    try{
      const[um,ig,ev]=await Promise.all([
        fetch(`/api/integrations/ultramsg?userId=${uid}`).then(r=>r.json()).catch(()=>null),
        fetch(`/api/integrations/instagram?userId=${uid}`).then(r=>r.json()).catch(()=>null),
        fetch("/api/evolution/qrcode").then(r=>r.json()).catch(()=>null),
      ]);
      const mi=await fetch(`/api/integrations?userId=${uid}`).then(r=>r.json()).catch(()=>null);
      setIntSt({ultramsg:!!um?.active,instagram:!!ig?.active,evolution:ev?.status==="connected",meta:!!mi?.whatsapp?.active});
    }catch{}
  },[]);

  useEffect(()=>{
    (async()=>{
      const{data:{user}}=await supabase.auth.getUser();
      if(!user){window.location.href="/login";return;}
      setUserId(user.id);
      await Promise.all([loadSettings(user.id),loadInt(user.id)]);
      setLoading(false);
    })();
  },[loadSettings,loadInt]);

  async function handleSave(e:React.FormEvent){
    e.preventDefault();if(!userId)return;
    setSaving(true);setErro(null);
    try{
      const r=await fetch("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,business_name:businessName||null,cnpj:cnpj||null,store_phone:storePhone||null,address:address||null,notify_phone:notifyPhone||null,sellers,ai_enabled:aiEnabled,ai_name:aiName||"Paulo",ai_personality:aiPersonality||null})});
      if(!r.ok){const d=await r.json();throw new Error(d.error);}
      await loadSettings(userId);
      setSaved(true);setTimeout(()=>setSaved(false),3000);
    }catch(err){setErro(err instanceof Error?err.message:"Erro ao salvar.");}
    finally{setSaving(false);}
  }

  function addSeller(){const n=newSeller.trim();if(!n||sellers.includes(n)||sellers.length>=15)return;setSellers(p=>[...p,n]);setNewSeller("");}
  async function handleLogout(){await supabase.auth.signOut();window.location.href="/login";}

  if(loading)return(
    <div className="flex items-center justify-center h-screen" style={{background:"#f0f2f5"}}>
      <div className="w-7 h-7 border-4 border-red-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return(
    <main className="min-h-screen p-6 max-w-2xl" style={{background:"#f0f2f5"}}>
      <header className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Configuracoes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gerencie sua loja, equipe e integracoes.</p>
      </header>
      {erro&&<div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl p-3">⚠️ {erro}</div>}
      {saved&&<div className="mb-4 text-sm text-green-400 bg-green-900/20 border border-green-500/30 rounded-xl p-3">Configuracoes salvas!</div>}
      <form onSubmit={handleSave}>
        <Section title="Dados da Loja" icon="🏪">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Nome da Loja</label>
                <input type="text" placeholder="Ex: PH Autoscar" value={businessName} onChange={e=>setBusinessName(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">CNPJ</label>
                <input type="text" placeholder="00.000.000/0001-00" value={cnpj} onChange={e=>setCnpj(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Telefone da Loja</label>
                <input type="text" placeholder="(85) 99999-8888" value={storePhone} onChange={e=>setStorePhone(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Tel. Alerta Lead Quente</label>
                <input type="text" placeholder="5585999998888" value={notifyPhone} onChange={e=>setNotifyPhone(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Endereco</label>
              <input type="text" placeholder="Rua das Flores, 123 - Fortaleza, CE" value={address} onChange={e=>setAddress(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
            </div>
            <div className="rounded-xl p-4" style={{background:"#1a1a1a",border:"1px solid #3a3a3a"}}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Plano atual</p>
                  <p className="text-sm font-bold mt-0.5" style={{color:"#e63946"}}>
                    {settings?.plan==="enterprise"?"Enterprise":settings?.plan==="pro"?"Pro":"Starter"}
                  </p>
                </div>
                <a href="mailto:vendas@7business.com.br" className="text-xs px-4 py-2 rounded-lg font-bold" style={{background:"#e63946",color:"#fff"}}>Upgrade</a>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Equipe de Vendas" icon="👥">
          <div className="space-y-3">
            {sellers.length>0?(
              <div className="flex flex-wrap gap-2 mb-3">
                {sellers.map(s=>(
                  <div key={s} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{background:"#2a2a2a",border:"1px solid #3a3a3a",color:"#ccc"}}>
                    <span>{s}</span>
                    <button type="button" onClick={()=>setSellers(p=>p.filter(x=>x!==s))} className="text-gray-600 hover:text-red-400 transition-colors ml-1 leading-none">x</button>
                  </div>
                ))}
              </div>
            ):<p className="text-xs text-gray-600 mb-3">Nenhum vendedor cadastrado.</p>}
            {sellers.length<15&&(
              <div className="flex gap-2">
                <input type="text" placeholder="Nome do vendedor" value={newSeller} onChange={e=>setNewSeller(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addSeller())} style={{...inp,flex:1}} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
                <button type="button" onClick={addSeller} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{background:"#e63946",flexShrink:0}}>+ Add</button>
              </div>
            )}
            <p className="text-xs text-gray-600">{sellers.length}/15 vendedores</p>
          </div>
        </Section>

        <Section title="Assistente IA" icon="🤖">
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative" onClick={()=>setAiEnabled(v=>!v)}>
                <div className="w-11 h-6 rounded-full transition-colors" style={{background:aiEnabled?"#e63946":"#3a3a3a"}}>
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{transform:aiEnabled?"translateX(20px)":"translateX(0)"}}/>
                </div>
              </div>
              <span className="text-sm text-white font-medium">Habilitar Assistente IA</span>
            </label>
            {aiEnabled&&(
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Nome do Assistente</label>
                  <input type="text" placeholder="Paulo" value={aiName} onChange={e=>setAiName(e.target.value)} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Personalidade / Instrucoes</label>
                  <textarea rows={4} placeholder="Voce e Paulo, consultor de vendas da PH Autoscar. Seja cordial e direto..." value={aiPersonality} onChange={e=>setAiPersonality(e.target.value)} style={{...inp,resize:"vertical"}} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
                </div>
              </>
            )}
          </div>
        </Section>

        <button type="submit" disabled={saving} className="w-full py-3 rounded-xl font-black text-sm text-white mb-5 transition-opacity hover:opacity-90" style={{background:saving?"#555":"#e63946"}}>
          {saving?"Salvando...":"Salvar Configuracoes"}
        </button>
      </form>

      <Section title="Integracoes Ativas" icon="⚡">
        <div className="space-y-3">
          {[
            {label:"WhatsApp UltraMsg",on:intSt.ultramsg},{label:"WhatsApp QR Code",on:intSt.evolution},
            {label:"WhatsApp Meta API",on:intSt.meta},{label:"Instagram DM",on:intSt.instagram},
          ].map(({label,on})=>(
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Dot on={on}/><span className="text-sm text-gray-300">{label}</span></div>
              {on?<span className="text-xs text-green-400 font-semibold">Ativo</span>:<a href="/integrations" className="text-xs px-3 py-1 rounded-lg font-semibold text-white" style={{background:"#25D366"}}>Conectar</a>}
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t" style={{borderColor:"#2e2e2e"}}>
          <a href="/integrations" className="text-xs text-gray-400 hover:text-red-400 transition-colors">Gerenciar integracoes →</a>
        </div>
      </Section>

      <Section title="Conta" icon="👤">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">E-mail</p>
            <p className="text-sm text-gray-300">{settings?.email??"—"}</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{background:"#2a2a2a",border:"1px solid #3a3a3a",color:"#888"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="#e63946";(e.currentTarget as HTMLElement).style.color="#e63946";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#3a3a3a";(e.currentTarget as HTMLElement).style.color="#888";}}>
            Sair
          </button>
        </div>
      </Section>
    </main>
  );
}
