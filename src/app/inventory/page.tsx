"use client";

import { useEffect, useState, useCallback } from "react";

type Vehicle = {
  id: string; brand: string; model: string; year: string | null;
  plate: string | null; price: number | null; price_fipe: number | null;
  color: string | null; km: number | null; fuel: string | null;
  transmission: string | null; body_type: string | null; doors: number | null;
  end_plate: string | null; renavam: string | null; chassis: string | null;
  ipva_paid: boolean | null; single_owner: boolean | null;
  has_manual: boolean | null; has_key: boolean | null;
  optional_items: string[] | null; description: string | null;
  status: "disponivel" | "vendido" | "reservado"; created_at: string;
};

type VehicleForm = {
  brand: string; model: string; year: string; plate: string; price: string;
  price_fipe: string; color: string; km: string; fuel: string; transmission: string;
  body_type: string; doors: string; end_plate: string; renavam: string; chassis: string;
  ipva_paid: boolean; single_owner: boolean; has_manual: boolean; has_key: boolean;
  optional_items: string; description: string; status: "disponivel" | "vendido" | "reservado";
};

const EMPTY: VehicleForm = {
  brand:"",model:"",year:"",plate:"",price:"",price_fipe:"",color:"",km:"",
  fuel:"",transmission:"",body_type:"",doors:"",end_plate:"",renavam:"",chassis:"",
  ipva_paid:false,single_owner:false,has_manual:false,has_key:false,
  optional_items:"",description:"",status:"disponivel",
};

const ST: Record<string,{label:string;color:string;bg:string}> = {
  disponivel:{label:"Disponivel",color:"#16a34a",bg:"#dcfce7"},
  vendido:{label:"Vendido",color:"#6b7280",bg:"#f3f4f6"},
  reservado:{label:"Reservado",color:"#d97706",bg:"#fef3c7"},
};
const FUELS=["Flex","Gasolina","Diesel","Etanol","GNV","Eletrico","Hibrido"];
const TRANS=["Manual","Automatico","CVT","Semi-Automatico","Automatizado"];
const BODIES=["Sedan","Hatch","SUV","Pickup","Van","Minivan","Coupe","Conversivel","Wagon","Crossover"];
const OPTS=["Ar-condicionado","Direcao eletrica","Vidro eletrico","Trava eletrica","Sensor de re","Camera de re","Alarme","Rodas de liga leve","Teto solar","Couro","Multimidia","GPS","Bluetooth","Piloto automatico","Air bag","ABS","Bancos eletricos","Volante multifuncional"];

function fmt(n:number|null){return n?"R$ "+n.toLocaleString("pt-BR"):"—";}
function fmtKm(n:number|null){return n?n.toLocaleString("pt-BR")+" km":"—";}

const inp:React.CSSProperties={width:"100%",padding:"9px 12px",background:"#1a1a1a",border:"1px solid #3a3a3a",borderRadius:"8px",color:"#fff",fontSize:"13px",outline:"none",boxSizing:"border-box"};

export default function InventoryPage(){
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[storeId,setStoreId]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[showForm,setShowForm]=useState(false);
  const[editing,setEditing]=useState<Vehicle|null>(null);
  const[form,setForm]=useState<VehicleForm>(EMPTY);
  const[saving,setSaving]=useState(false);
  const[search,setSearch]=useState("");
  const[fSt,setFSt]=useState("todos");
  const[fBrand,setFBrand]=useState("Todos");
  const[erro,setErro]=useState<string|null>(null);
  const[confirmDel,setConfirmDel]=useState<string|null>(null);
  const[view,setView]=useState<"grid"|"list">("grid");

  const load=useCallback(async(sid:string)=>{
    setLoading(true);
    const r=await fetch(`/api/inventory?storeId=${sid}`);
    if(r.ok)setVehicles(await r.json());
    setLoading(false);
  },[]);

  useEffect(()=>{
    import("@supabase/supabase-js").then(({createClient})=>{
      const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      sb.auth.getUser().then(({data})=>{
        if(!data?.user){window.location.href="/login";return;}
        setStoreId(data.user.id);
        load(data.user.id);
      });
    });
  },[load]);

  function openNew(){setEditing(null);setForm(EMPTY);setErro(null);setShowForm(true);}
  function openEdit(v:Vehicle){
    setEditing(v);
    setForm({brand:v.brand,model:v.model,year:v.year??"",plate:v.plate??"",
      price:v.price?String(v.price):"",price_fipe:v.price_fipe?String(v.price_fipe):"",
      color:v.color??"",km:v.km?String(v.km):"",fuel:v.fuel??"",transmission:v.transmission??"",
      body_type:v.body_type??"",doors:v.doors?String(v.doors):"",end_plate:v.end_plate??"",
      renavam:v.renavam??"",chassis:v.chassis??"",ipva_paid:v.ipva_paid??false,
      single_owner:v.single_owner??false,has_manual:v.has_manual??false,
      has_key:v.has_key??false,optional_items:(v.optional_items??[]).join(", "),
      description:v.description??"",status:v.status});
    setErro(null);setShowForm(true);
  }

  async function handleSave(){
    if(!form.brand.trim()||!form.model.trim()){setErro("Marca e Modelo obrigatorios.");return;}
    setSaving(true);setErro(null);
    const p={brand:form.brand.trim(),model:form.model.trim(),year:form.year||null,
      plate:form.plate.toUpperCase()||null,
      price:form.price?Number(form.price.replace(/\D/g,""))||null:null,
      price_fipe:form.price_fipe?Number(form.price_fipe.replace(/\D/g,""))||null:null,
      color:form.color||null,km:form.km?Number(form.km.replace(/\D/g,""))||null:null,
      fuel:form.fuel||null,transmission:form.transmission||null,
      body_type:form.body_type||null,doors:form.doors?Number(form.doors):null,
      end_plate:form.end_plate||null,renavam:form.renavam||null,
      chassis:form.chassis.toUpperCase()||null,
      ipva_paid:form.ipva_paid,single_owner:form.single_owner,
      has_manual:form.has_manual,has_key:form.has_key,
      optional_items:form.optional_items?form.optional_items.split(",").map(s=>s.trim()).filter(Boolean):[],
      description:form.description||null,status:form.status};
    const url=editing?`/api/inventory?id=${editing.id}`:"/api/inventory";
    const body=editing?p:{...p,storeId};
    const r=await fetch(url,{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!r.ok){const d=await r.json();setErro(d.error??"Erro.");setSaving(false);return;}
    if(storeId)await load(storeId);setShowForm(false);setSaving(false);
  }

  async function handleDelete(id:string){
    await fetch(`/api/inventory?id=${id}`,{method:"DELETE"});
    setConfirmDel(null);if(storeId)await load(storeId);
  }
  async function qStatus(id:string,s:Vehicle["status"]){
    await fetch(`/api/inventory?id=${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:s})});
    setVehicles(p=>p.map(v=>v.id===id?{...v,status:s}:v));
  }

  const brands=["Todos",...Array.from(new Set(vehicles.map(v=>v.brand))).sort()];
  const filtered=vehicles.filter(v=>{
    const q=search.toLowerCase();
    const ms=!q||[v.brand,v.model,v.plate,v.year,v.color].some(f=>(f??"").toLowerCase().includes(q));
    return ms&&(fSt==="todos"||v.status===fSt)&&(fBrand==="Todos"||v.brand===fBrand);
  });
  const counts={d:vehicles.filter(v=>v.status==="disponivel").length,r:vehicles.filter(v=>v.status==="reservado").length,v:vehicles.filter(v=>v.status==="vendido").length};

  function Chk({label,field}:{label:string;field:"ipva_paid"|"single_owner"|"has_manual"|"has_key"}){
    return(
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={!!form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.checked}))} className="w-4 h-4 accent-red-500"/>
        <span className="text-xs text-gray-300">{label}</span>
      </label>
    );
  }

  return(
    <main style={{minHeight:"100vh",background:"#f0f2f5",padding:"24px"}}>
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">🚗 Estoque de Veiculos</h1>
          <p className="text-sm text-gray-500">{vehicles.length} veiculo{vehicles.length!==1?"s":""} cadastrado{vehicles.length!==1?"s":""}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{background:"#e63946",boxShadow:"0 2px 8px rgba(230,57,70,0.3)"}}>+ Novo Veiculo</button>
      </header>

      <div className="flex flex-wrap gap-3 mb-5">
        {[{k:"todos",l:`Todos (${vehicles.length})`,c:"#6b7280"},{k:"disponivel",l:`Disponiveis (${counts.d})`,c:"#16a34a"},{k:"reservado",l:`Reservados (${counts.r})`,c:"#d97706"},{k:"vendido",l:`Vendidos (${counts.v})`,c:"#6b7280"}].map(({k,l,c})=>(
          <button key={k} onClick={()=>setFSt(k)} className="px-4 py-1.5 rounded-full text-xs font-bold border transition-all"
            style={{background:fSt===k?c:"#fff",color:fSt===k?"#fff":c,borderColor:fSt===k?c:"#e5e7eb"}}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl p-4 mb-5 flex flex-wrap gap-3 items-center" style={{background:"#fff",border:"1px solid #e5e7eb"}}>
        <input type="text" placeholder="🔍 Buscar marca, modelo, placa..." value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-48 px-4 py-2 rounded-xl border text-sm outline-none focus:border-red-400" style={{borderColor:"#e5e7eb",background:"#f9fafb"}}/>
        <select value={fBrand} onChange={e=>setFBrand(e.target.value)} className="px-4 py-2 rounded-xl border text-sm outline-none cursor-pointer" style={{borderColor:"#e5e7eb",background:"#f9fafb"}}>
          {brands.map(b=><option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex gap-1 ml-auto">
          {(["grid","list"]as const).map(m=>(
            <button key={m} onClick={()=>setView(m)} className="px-3 py-2 rounded-lg text-xs font-bold transition-all" style={{background:view===m?"#e63946":"#f3f4f6",color:view===m?"#fff":"#6b7280"}}>
              {m==="grid"?"⊞":"☰"}
            </button>
          ))}
        </div>
      </div>

      {loading&&<p className="text-center text-sm text-gray-400 py-16">Carregando estoque...</p>}
      {!loading&&filtered.length===0&&(
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🚗</p>
          <p className="text-gray-500 font-medium">Nenhum veiculo encontrado</p>
          <button onClick={openNew} className="mt-4 px-6 py-2 rounded-xl text-sm font-bold text-white" style={{background:"#e63946"}}>+ Cadastrar Veiculo</button>
        </div>
      )}

      {!loading&&filtered.length>0&&view==="grid"&&(
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(v=>{
            const s=ST[v.status];
            return(
              <div key={v.id} className="rounded-2xl overflow-hidden transition-all hover:shadow-lg" style={{background:"#fff",border:"1px solid #e5e7eb",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                <div className="h-36 flex items-center justify-center relative" style={{background:"linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%)"}}>
                  <span className="text-5xl">🚗</span>
                  <span className="absolute top-2 right-2 text-xs font-bold px-2.5 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-black text-gray-900 text-sm">{v.brand} {v.model}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{v.year??"—"} • {v.color??"—"} • {v.fuel??"—"}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {v.km&&<span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{fmtKm(v.km)}</span>}
                    {v.transmission&&<span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{v.transmission}</span>}
                    {v.plate&&<span className="text-xs text-gray-700 font-bold bg-gray-100 px-2 py-0.5 rounded-full">{v.plate}</span>}
                  </div>
                  <p className="text-xl font-black mt-3" style={{color:"#e63946"}}>{fmt(v.price)}</p>
                  {v.price_fipe&&<p className="text-xs text-gray-400">FIPE: {fmt(v.price_fipe)}</p>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={()=>openEdit(v)} className="flex-1 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100" style={{background:"#f3f4f6",color:"#374151"}}>✏️ Editar</button>
                    {v.status==="disponivel"&&<button onClick={()=>qStatus(v.id,"reservado")} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{background:"#fef3c7",color:"#d97706"}}>Reservar</button>}
                    {v.status==="reservado"&&<button onClick={()=>qStatus(v.id,"vendido")} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{background:"#dcfce7",color:"#16a34a"}}>Marcar Vendido</button>}
                    {v.status==="vendido"&&<button onClick={()=>qStatus(v.id,"disponivel")} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{background:"#dbeafe",color:"#1d4ed8"}}>Reativar</button>}
                  </div>
                  <button onClick={()=>setConfirmDel(v.id)} className="w-full mt-2 py-1 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading&&filtered.length>0&&view==="list"&&(
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:"1px solid #e5e7eb"}}>
          <table className="w-full text-sm">
            <thead><tr style={{background:"#f9fafb",borderBottom:"1px solid #e5e7eb"}}>
              {["Veiculo","Ano","Placa","KM","Preco","Status","Acoes"].map(h=>(
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((v,i)=>{
                const s=ST[v.status];
                return(
                  <tr key={v.id} className="transition-colors hover:bg-gray-50" style={{borderBottom:i<filtered.length-1?"1px solid #f3f4f6":"none"}}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{v.brand} {v.model}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.year??"—"}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{v.plate??"—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtKm(v.km)}</td>
                    <td className="px-4 py-3 font-bold text-xs" style={{color:"#e63946"}}>{fmt(v.price)}</td>
                    <td className="px-4 py-3"><span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:s.bg,color:s.color}}>{s.label}</span></td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      <button onClick={()=>openEdit(v)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Editar</button>
                      <button onClick={()=>setConfirmDel(v.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Excluir</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm&&(
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={()=>setShowForm(false)}/>
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-3xl rounded-2xl shadow-2xl my-6" style={{background:"#232323",border:"1px solid #3a3a3a"}}>
              <div className="flex items-center justify-between p-6 border-b" style={{borderColor:"#3a3a3a"}}>
                <h2 className="text-lg font-black text-white">{editing?"✏️ Editar Veiculo":"🚗 Novo Veiculo"}</h2>
                <button onClick={()=>setShowForm(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
              </div>
              <div className="p-6 space-y-6">
                {erro&&<div className="text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl p-3">⚠️ {erro}</div>}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Identificacao *</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[{l:"Marca *",p:"Toyota, Honda...",k:"brand"},{l:"Modelo *",p:"Corolla, Civic...",k:"model"},{l:"Ano (Fab/Mod)",p:"2021/2022",k:"year"},{l:"Cor",p:"Branco, Prata...",k:"color"},{l:"Placa",p:"ABC-1234",k:"plate"},{l:"Final da Placa",p:"4",k:"end_plate"}].map(({l,p,k})=>(
                      <div key={k}>
                        <label className="text-xs text-gray-500 mb-1 block">{l}</label>
                        <input type="text" placeholder={p} value={form[k as keyof VehicleForm] as string}
                          onChange={e=>setForm(f=>({...f,[k]:k==="plate"||k==="chassis"?e.target.value.toUpperCase():e.target.value}))} style={inp}
                          onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Caracteristicas</p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div><label className="text-xs text-gray-500 mb-1 block">Quilometragem</label><input type="text" placeholder="45000" value={form.km} onChange={e=>setForm(f=>({...f,km:e.target.value}))} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Combustivel</label><select value={form.fuel} onChange={e=>setForm(f=>({...f,fuel:e.target.value}))} style={{...inp,cursor:"pointer"}}><option value="">Selecionar</option>{FUELS.map(f=><option key={f} value={f}>{f}</option>)}</select></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Cambio</label><select value={form.transmission} onChange={e=>setForm(f=>({...f,transmission:e.target.value}))} style={{...inp,cursor:"pointer"}}><option value="">Selecionar</option>{TRANS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Carroceria</label><select value={form.body_type} onChange={e=>setForm(f=>({...f,body_type:e.target.value}))} style={{...inp,cursor:"pointer"}}><option value="">Selecionar</option>{BODIES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Portas</label><select value={form.doors} onChange={e=>setForm(f=>({...f,doors:e.target.value}))} style={{...inp,cursor:"pointer"}}><option value="">Selecionar</option>{["2","3","4","5"].map(d=><option key={d} value={d}>{d} portas</option>)}</select></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as Vehicle["status"]}))} style={{...inp,cursor:"pointer"}}><option value="disponivel">Disponivel</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option></select></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Precos</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500 mb-1 block">Preco de Venda (R$)</label><input type="text" placeholder="45000" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Preco FIPE (R$)</label><input type="text" placeholder="48000" value={form.price_fipe} onChange={e=>setForm(f=>({...f,price_fipe:e.target.value}))} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Documentacao</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div><label className="text-xs text-gray-500 mb-1 block">RENAVAM</label><input type="text" placeholder="00000000000" value={form.renavam} onChange={e=>setForm(f=>({...f,renavam:e.target.value}))} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Chassi</label><input type="text" placeholder="9BWZZZ377VT004251" value={form.chassis} onChange={e=>setForm(f=>({...f,chassis:e.target.value.toUpperCase()}))} style={inp} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Chk label="IPVA pago" field="ipva_paid"/>
                    <Chk label="Unico dono" field="single_owner"/>
                    <Chk label="Com manual" field="has_manual"/>
                    <Chk label="Chave reserva" field="has_key"/>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Opcionais</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {OPTS.map(opt=>{
                      const cur=form.optional_items.split(",").map(s=>s.trim()).filter(Boolean);
                      const chk=cur.includes(opt);
                      return(
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={chk} onChange={e=>{const l=cur.filter(o=>o!==opt);if(e.target.checked)l.push(opt);setForm(f=>({...f,optional_items:l.join(", ")}));}} className="w-3.5 h-3.5 accent-red-500 flex-shrink-0"/>
                          <span className="text-xs text-gray-400">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Observacoes</p>
                  <textarea rows={3} placeholder="Informacoes adicionais, revisoes, historico..." value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{...inp,resize:"vertical"}} onFocus={e=>e.currentTarget.style.borderColor="#e63946"} onBlur={e=>e.currentTarget.style.borderColor="#3a3a3a"}/>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl font-black text-sm text-white transition-opacity hover:opacity-90" style={{background:saving?"#555":"#e63946"}}>
                    {saving?"Salvando...":editing?"💾 Salvar Alteracoes":"🚗 Cadastrar Veiculo"}
                  </button>
                  <button onClick={()=>setShowForm(false)} className="px-6 py-3 rounded-xl text-sm font-medium" style={{background:"#2a2a2a",color:"#888",border:"1px solid #3a3a3a"}}>Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmDel&&(
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={()=>setConfirmDel(null)}/>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl p-6 w-full max-w-sm" style={{background:"#232323",border:"1px solid #3a3a3a"}}>
              <p className="text-white font-bold mb-2">Excluir veiculo?</p>
              <p className="text-xs text-gray-400 mb-5">Esta acao nao pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={()=>handleDelete(confirmDel)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Excluir</button>
                <button onClick={()=>setConfirmDel(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{background:"#2a2a2a",color:"#888",border:"1px solid #3a3a3a"}}>Cancelar</button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
