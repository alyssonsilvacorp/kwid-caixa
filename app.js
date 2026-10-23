/* RodaCaixa — app financeiro para motoristas. MVP 0.2 */
(function(){
"use strict";
const SUPA_URL="https://mdqdttqulwncbrnpbddh.supabase.co";
const SUPA_KEY="sb_publishable_G4fHYtKJ2JcWraKe4_fUNQ_pdwv2TMG";
const out=document.getElementById("app"), toast=document.getElementById("toast");
let client=null,account=null,finance=null,revision=0,screenName="inicio",editId="",authMode="login",saving=false,lastSaved=null;
const opt={fuelPriceC:665,kmPerL:13,wearPerKmC:15,driverPct:50,workDaysPerWeek:4,vehicleName:"Meu carro"};
const defaults=()=>({version:3,settings:{...opt},goals:[{id:"tires",name:"2 pneus",targetC:null,importance:"seguranca",status:"planejada"},{id:"part",name:"Peça do carro",targetC:20000,importance:"obrigatoria",status:"planejada"}],shifts:[],expenses:[]});
const $=sel=>document.querySelector(sel);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BRL=c=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(c)||0)/100);
const num=v=>Number(String(v??"").replace(",","."));const cent=v=>Math.round(num(v)*100);
const fval=(form,name)=>String(new FormData(form).get(name)??"").trim();
const today=()=>{const x=new Date();return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const when=x=>x?x.split("-").reverse().join("/"):"";
const rid=()=>crypto.randomUUID();
const inpt=(n,label,type="text",val="",extra="")=>'<label>'+esc(label)+'<input name="'+n+'" type="'+type+'" value="'+esc(val)+'" '+extra+'></label>';
const sel=(n,label,opts,v)=>'<label>'+esc(label)+'<select name="'+n+'">'+opts.map(o=>'<option value="'+esc(o[0])+'" '+(o[0]===v?"selected":"")+'>'+esc(o[1])+'</option>').join("")+'</select></label>';
const line=(a,b)=>'<div class="row"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>';
const title=(a,b)=>'<h1>'+esc(a)+'</h1><p class="desc">'+esc(b)+'</p>';
const daysUntil=date=>Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(today()+"T12:00:00Z"))/86400000);
const positive=v=>Number.isFinite(v)&&v>=0;
const notify=(msg,error=false)=>{toast.textContent=msg;toast.style.background=error?"#682e30":"#245445";toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),4300)};
function normalize(raw){
 if(!raw||![1,2,3].includes(raw.version)||!Array.isArray(raw.shifts)||!Array.isArray(raw.expenses))throw Error("Backup financeiro incompatível.");
 let goals=Array.isArray(raw.goals)?raw.goals:defaults().goals;
 return {version:3,settings:{...opt,...raw.settings},goals:goals.map(g=>({...g,importance:g.importance||(g.id==="tires"?"seguranca":g.id==="part"?"obrigatoria":"upgrade"),status:g.status||"planejada"})),shifts:raw.shifts,expenses:raw.expenses};
}
function compute(){
 const d=finance,a={gross:0,fuel:0,wear:0,extraShifts:0,packages:0,extra:0,km:0,mins:0,days:0};
 for(const x of d.shifts){
  const dist=Number(x.km)||0;a.km+=dist;a.gross+=Number(x.grossC)||0;
  a.fuel+=x.kmPerL>0?Math.round(dist/x.kmPerL*x.fuelPriceC):0;a.wear+=Math.round(dist*(Number(x.wearPerKmC)||0));a.extraShifts+=Number(x.otherC)||0;
  if(x.start&&x.end){const [h,m]=x.start.split(":").map(Number),[eh,em]=x.end.split(":").map(Number);let t=eh*60+em-h*60-m;a.mins+=t>0?t:t+1440;}
 }
 for(const ex of d.expenses){if(ex.kind==="pacote")a.packages+=Number(ex.amountC)||0;else a.extra+=Number(ex.amountC)||0}
 a.result=a.gross-a.fuel-a.wear-a.extraShifts-a.packages-a.extra;
 a.personal=a.result>0?Math.floor(a.result*d.settings.driverPct/100):0;a.car=a.result>0?a.result-a.personal:0;
 const spent=d.goals.reduce((sum,g)=>sum+(Number(g.purchase?.appliedC)||0),0);
 let unallocated=Math.max(0,a.car-spent);a.plans={};a.daily=0;
 for(const g of d.goals){
  const eligible=!g.purchase&&g.status!=="suspensa"&&g.status!=="concluida";
  const reserve=eligible&&g.targetC>0?Math.min(unallocated,g.targetC):0;
  unallocated-=reserve;
  const left=eligible?Math.max(0,(Number(g.targetC)||0)-reserve):0;
  const until=g.deadline?daysUntil(g.deadline):null;
  const shifts=until===null?null:Math.floor(Math.max(0,until)*Math.min(7,Math.max(1,d.settings.workDaysPerWeek))/7);
  const daily=eligible&&g.deadline&&g.targetC&&left>0?Math.ceil(left/Math.max(1,shifts)):0;
  a.daily+=daily;a.plans[g.id]={reserve,left,until,shifts,daily};
 }
 a.free=unallocated;return a;
}
function mount(page){
 out.innerHTML='<header class="top"><div class="brand"><img src="/icon.svg" alt=""><div><b>RodaCaixa</b><small>Seu financeiro na direção</small></div></div><div style="text-align:right"><div class="online">'+(saving?"Salvando…":!navigator.onLine?"Sem internet":lastSaved?"☁ Sincronizado":"☁ Conectado")+'</div><button class="linkbtn" data-action="signout">Sair</button></div></header><main>'+page+'</main><nav class="footnav">'+[["inicio","⌂","Início"],["turno","⊕","Turno"],["gastos","▣","Gastos"],["metas","◎","Metas"],["ajustes","⚙","Ajustes"]].map(x=>'<button data-go="'+x[0]+'" class="'+(screenName===x[0]?"active":"")+'"><strong>'+x[1]+'</strong>'+x[2]+'</button>').join("")+'</nav>';
 bind();
}
function loginScreen(){
 const h={login:"Entrar",signup:"Criar minha conta",reset:"Recuperar senha",newpass:"Definir nova senha"}[authMode];
 out.innerHTML='<div class="auth"><div class="center"><img src="/icon.svg" alt=""><h1>RodaCaixa</h1><p class="desc">Seu carro paga os custos. Você acompanha o lucro.</p></div><div class="card"><h2>'+h+'</h2><form id="authForm">'+(authMode==="newpass"?"":inpt("email","E-mail","email","","required autocomplete=email"))+(authMode==="reset"?"":inpt("password","Senha","password","","required minlength=8 autocomplete="+(authMode==="login"?"current-password":"new-password")))+'<button class="btn block">'+h+'</button></form><div class="authswitch"><button data-auth="login" class="linkbtn">Entrar</button><button data-auth="signup" class="linkbtn">Criar conta</button><button data-auth="reset" class="linkbtn">Esqueci a senha</button></div></div><p class="desc center">Dados protegidos por conta. Nunca informe senhas pelo chat.</p></div>';
 $("#authForm").addEventListener("submit",handleAuth);
 out.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>{authMode=b.dataset.auth;render()});
}
async function handleAuth(ev){
 ev.preventDefault();if(saving)return;const email=fval(ev.target,"email"),password=fval(ev.target,"password");saving=true;
 try{
  let r;
  if(authMode==="login")r=await client.auth.signInWithPassword({email,password});
  if(authMode==="signup")r=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
  if(authMode==="reset")r=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
  if(authMode==="newpass")r=await client.auth.updateUser({password});
  if(r.error)throw r.error;
  if(authMode==="signup"&&!r.data.session){notify("Verifique seu e-mail para confirmar a conta.");authMode="login"}
  if(authMode==="reset"){notify("Confira o e-mail para continuar.");authMode="login"}
  if(authMode==="newpass"){notify("Senha atualizada. Entre novamente.");authMode="login"}
  if(r.data.session)await loadAccount(r.data.session.user);
 }catch(err){notify(err.message||"Falha de autenticação",true)}finally{saving=false;render()}
}
async function loadAccount(user){
 if(account?.id===user.id&&finance)return;
 account=user;finance=null;render();
 try{
  const r=await client.from("driver_ledgers").select("data,revision,updated_at").eq("user_id",user.id).maybeSingle();
  if(r.error)throw r.error;
  finance=r.data?normalize(r.data.data):defaults();revision=r.data?Number(r.data.revision):0;lastSaved=r.data?.updated_at||null;
  editId="";screenName="inicio";render();
 }catch(err){account=null;finance=null;notify("Erro ao carregar: "+err.message,true);render()}
}
async function save(update){
 if(saving){notify("Aguarde a gravação atual",true);return false}
 if(!navigator.onLine){notify("Sem internet: lançamento não foi salvo.",true);return false}
 saving=true;
 try{
  const next=structuredClone(finance);update(next);
  if(next.version!==3)throw Error("Formato incompatível");
  const r=await client.rpc("save_driver_ledger",{expected_revision:revision,next_data:next});
  if(r.error)throw r.error;
  const result=Array.isArray(r.data)?r.data[0]:r.data;
  if(!result?.new_revision)throw Error("Banco não confirmou a gravação");
  finance=next;revision=result.new_revision;lastSaved=result.saved_at||new Date().toISOString();
  notify("Salvo no Supabase");render();return true;
 }catch(err){notify(err.message||"Erro ao salvar. Dados não alterados.",true);return false}
 finally{saving=false;if(account&&finance)render()}
}
function home(){
 const a=compute();
 return title("Visão geral","Faturamento, custos operacionais e dinheiro destinado ao carro.")+
 '<div class="hero"><div class="eyebrow">Resultado operacional acumulado</div><div class="big">'+BRL(a.result)+'</div><p class="muted">Estimativa após custos e provisão, não saldo em banco.</p>'+line("Corridas recebidas",BRL(a.gross))+line("Gasolina calculada","− "+BRL(a.fuel))+line("Pacotes e outros custos","− "+BRL(a.packages+a.extra+a.extraShifts))+line("Reserva para desgaste","− "+BRL(a.wear))+'</div>'+
 '<div class="grid"><div class="card"><span class="muted">Para mim</span><div class="number">'+BRL(a.personal)+'</div><span class="mini">Parcela prevista</span></div><div class="card"><span class="muted">Para o carro</span><div class="number">'+BRL(a.car)+'</div><span class="mini">Parcela prevista</span></div></div>'+
 '<div class="card"><div class="eyebrow">Meta de reserva por dia trabalhado</div><div class="big">'+BRL(a.daily)+'</div><p class="muted">Metas com valor e prazo definidos. Não é faturamento bruto necessário.</p>'+line("Turnos registrados",String(finance.shifts.length))+line("KM de trabalho",a.km.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km")+line("Receita por KM",a.km?BRL(a.gross/a.km):"—")+line("Resultado por hora",a.mins?BRL(a.result*60/a.mins):"—")+line("Fundo livre do carro",BRL(a.free))+'</div>'+
 '<button class="btn block" data-go="turno">+ Registrar turno</button><div class="help">Dica: confira os valores de combustível e consumo antes do primeiro turno. Para testar, crie um registro fictício e exclua em seguida.</div>';
}
function turns(){
 const old=finance.shifts.filter(x=>x.odoEnd!=null).slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
 const item=finance.shifts.find(x=>x.id===editId),s=finance.settings;
 return title(item?"Editar turno":"Novo turno","Odômetro final menos inicial = KM totais. Inclua a busca e retorno do trabalho.")+
 '<form id="turnForm" class="card">'+inpt("date","Data","date",item?.date||today(),"required")+
 sel("platform","Plataforma",[["99","99"],["Uber","Uber"],["inDrive","inDrive"],["Particular","Particular"],["Outros","Outros"]],item?.platform||"99")+
 '<div class="grid">'+inpt("start","Início (opcional)","time",item?.start||"")+inpt("end","Fim (opcional)","time",item?.end||"")+'</div>'+
 inpt("gross","Receita recebida (R$)","number",item?(item.grossC/100).toFixed(2):"","required min=0 step=0.01")+
 '<div class="grid">'+inpt("os","Odômetro inicial","number",item?.odoStart??old?.odoEnd??"","required min=0 step=0.1")+inpt("oe","Odômetro final","number",item?.odoEnd??"","required min=0 step=0.1")+'</div><div id="kmtext" class="help">KM total: preencha os dois odômetros.</div>'+
 '<div class="grid">'+inpt("fuel","Gasolina (R$/L)","number",((item?.fuelPriceC??s.fuelPriceC)/100).toFixed(2),"required min=0.01 step=0.01")+
 inpt("cons","Consumo (km/L)","number",item?.kmPerL??s.kmPerL,"required min=0.1 step=0.1")+'</div>'+
 '<div class="grid">'+inpt("wear","Desgaste (R$/km)","number",((item?.wearPerKmC??s.wearPerKmC)/100).toFixed(2),"required min=0 step=0.01")+
 inpt("other","Outros custos (R$)","number",((item?.otherC||0)/100).toFixed(2),"min=0 step=0.01")+'</div>'+
 '<label>Observação<textarea name="note">'+esc(item?.note||"")+'</textarea></label><button class="btn block">'+(item?"Salvar alterações":"Salvar turno")+'</button></form>'+
 '<h2>Histórico de turnos</h2><div class="list">'+(finance.shifts.length?finance.shifts.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>'<div class="entry"><div class="row"><b>'+when(x.date)+' · '+esc(x.platform||"99")+'</b><b>'+BRL(x.grossC)+'</b></div><p>'+Number(x.km).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km · Odômetro: '+esc(x.odoStart??"—")+' → '+esc(x.odoEnd??"—")+'</p><div class="actions"><button class="btn secondary tiny" data-editturn="'+esc(x.id)+'">Editar</button><button class="btn danger tiny" data-remturn="'+esc(x.id)+'">Excluir</button></div></div>').join(""):'<div class="help">Ainda não há turnos.</div>')+'</div>';
}
function expenses(){
 return title("Gastos","Pacotes, peças, manutenção e custos adicionais.")+
 '<form id="expenseForm" class="card">'+inpt("date","Data","date",today(),"required")+
 sel("kind","Tipo",[["pacote","Pacote de aplicativo"],["extra","Despesa operacional"]],"extra")+
 sel("category","Categoria",[["Pacote 99","Pacote 99"],["Manutenção","Manutenção"],["Pneus","Pneus"],["Peças","Peças"],["Documentação","Documentação"],["Seguro","Seguro"],["Limpeza","Limpeza"],["Estacionamento","Estacionamento"],["Outros","Outros"]],"Outros")+
 inpt("amount","Valor pago (R$)","number","","required min=0.01 step=0.01")+inpt("note","Descrição","text")+'<button class="btn block">Registrar gasto</button></form>'+
 '<div class="help">Pacote 99 é registrado uma só vez. Gasolina é calculada por quilômetro; não conte abastecimento novamente. Compras de metas devem ser lançadas na própria meta.</div>'+
 '<h2>Histórico de gastos</h2><div class="list">'+(finance.expenses.length?finance.expenses.slice().reverse().map(x=>'<div class="entry"><div class="row"><b>'+esc(x.category)+'</b><b>'+BRL(x.amountC)+'</b></div><p>'+when(x.date)+' · '+esc(x.note||"")+'</p><button class="btn danger tiny" data-remexpense="'+esc(x.id)+'">Excluir</button></div>').join(""):'<div class="help">Nenhum gasto ainda.</div>')+'</div>';
}
function goals(){
 const a=compute(),item=finance.goals.find(x=>x.id===editId);
 return title("Metas do carro","Planeje pneus, documentação, manutenção e upgrades.")+
 '<div class="hero"><div class="eyebrow">Reserva por dia trabalhado</div><div class="big">'+BRL(a.daily)+'</div><p class="muted">Considerando '+finance.settings.workDaysPerWeek+' dias de trabalho por semana. Estimativa, não obrigação de faturamento.</p></div>'+
 '<form id="goalForm" class="card"><h2>'+(item?"Editar meta":"Criar meta")+'</h2>'+
 inpt("name","Nome da meta","text",item?.name||"","required maxlength=90")+
 inpt("target","Valor-alvo (R$) — opcional","number",item?.targetC!=null?(item.targetC/100).toFixed(2):"","min=0.01 step=0.01")+
 inpt("deadline","Prazo (opcional)","date",item?.deadline||"")+
 sel("importance","Tipo",[["seguranca","Segurança"],["obrigatoria","Obrigatória"],["upgrade","Upgrade opcional"]],item?.importance||"seguranca")+
 sel("status","Situação",[["planejada","Planejada"],["andamento","Em andamento"],["suspensa","Suspensa"],["concluida","Concluída"]],item?.status||"planejada")+
 '<button class="btn block">'+(item?"Salvar meta":"Adicionar meta")+'</button></form>'+
 '<h2>Suas metas</h2><div class="list">'+finance.goals.map((g,i)=>{const p=a.plans[g.id],progress=g.targetC?Math.min(100,p.reserve/g.targetC*100):0;return '<div class="entry"><div class="row"><b>'+esc(g.name)+'</b><span class="pill">'+esc(g.importance)+'</span></div><p>'+esc(g.deadline?"Prazo: "+when(g.deadline):"Sem prazo")+' · '+esc(g.status)+'</p>'+line("Valor-alvo",g.targetC?BRL(g.targetC):"A definir")+line("Reserva prevista",BRL(p.reserve))+line("Ainda necessário",BRL(p.left))+'<div class="progress"><div style="width:'+progress+'%"></div></div><p>'+(p.daily?BRL(p.daily)+" por dia de trabalho":g.purchase?"Compra registrada: "+BRL(g.purchase.amountC):"")+'</p><div class="actions"><button class="btn secondary tiny" data-editgoal="'+esc(g.id)+'">Editar</button>'+(!g.purchase?'<button class="btn secondary tiny" data-buygoal="'+esc(g.id)+'">Registrar compra</button>':"")+(i?'<button class="btn secondary tiny" data-upgoal="'+esc(g.id)+'">↑ Prioridade</button>':"")+'<button class="btn danger tiny" data-remgoal="'+esc(g.id)+'">Excluir</button></div></div>'}).join("")+'</div>'+
 '<div class="help">A alocação prevista segue a ordem de prioridade. Não significa dinheiro depositado. Metas com prazo podem ficar em atraso sem rendimento suficiente.</div>';
}
function settings(){
 const s=finance.settings;
 return title("Configurações","Seu carro, custos padrão, dias rodados e controle de dados.")+
 '<form class="card" id="settingsForm">'+inpt("vehicle","Veículo","text",s.vehicleName||"Meu carro","required")+
 inpt("fuel","Gasolina R$/L","number",(s.fuelPriceC/100).toFixed(2),"required min=0.01 step=0.01")+
 inpt("cons","Consumo médio km/L","number",s.kmPerL,"required min=0.1 step=0.1")+
 inpt("wear","Provisão desgaste R$/km","number",(s.wearPerKmC/100).toFixed(2),"required min=0 step=0.01")+
 inpt("pct","Parcela pessoal do resultado (%)","number",s.driverPct,"required min=0 max=100 step=1")+
 inpt("days","Dias de trabalho por semana","number",s.workDaysPerWeek,"required min=1 max=7 step=1")+
 '<button class="btn block">Salvar configurações</button></form>'+
 '<div class="card"><h2>Backup e sincronização</h2>'+line("Conta",account.email||"—")+line("Revisão do banco",String(revision))+
 line("Última gravação",lastSaved?new Date(lastSaved).toLocaleString("pt-BR"):"Nenhuma")+
 '<button class="btn secondary block" data-action="backup">Exportar backup JSON</button><button class="btn secondary block" data-action="csv" style="margin-top:9px">Exportar CSV</button>'+
 '<label>Importar backup JSON<input id="backup" type="file" accept=".json,application/json"></label><button class="btn secondary block" data-action="reload">Recarregar da nuvem</button></div>'+
 '<div class="help">Para transferir do aplicativo antigo, exporte seu backup JSON no Lovable e importe aqui. A importação pede confirmação e substitui os lançamentos desta conta. Sem internet, nenhum lançamento é salvo.</div>';
}
function render(){
 if(!client){out.innerHTML='<div class="loading">RodaCaixa<small>Conectando…</small></div>';return}
 if(!account){loginScreen();return}
 if(!finance){out.innerHTML='<div class="loading">RodaCaixa<small>Carregando dados protegidos…</small></div>';return}
 const pages={inicio:home,turno:turns,gastos:expenses,metas:goals,ajustes:settings};
 mount(pages[screenName]());
}
function bind(){
 out.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>{screenName=x.dataset.go;editId="";render();window.scrollTo(0,0)});
 out.querySelectorAll("[data-action]").forEach(x=>x.onclick=()=>action(x.dataset.action));
 out.querySelectorAll("form").forEach(x=>x.addEventListener("submit",submit));
 for(const type of ["editturn","remturn","editgoal","remgoal","remexpense","buygoal","upgoal"]){
  out.querySelectorAll("[data-"+type+"]").forEach(x=>x.onclick=()=>action(type,x.dataset[type]));
 }
 const f=$("#turnForm");if(f){const u=()=>{const a=num(fval(f,"os")),b=num(fval(f,"oe"));$("#kmtext").textContent=fval(f,"oe")&&b>a?"KM total calculado: "+(b-a).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km":"Preencha início e fim do odômetro (fim maior que início)."};f.addEventListener("input",u);u()}
 const up=$("#backup");if(up)up.onchange=async()=>{const file=up.files?.[0];if(!file)return;try{const raw=normalize(JSON.parse(await file.text()));if(!confirm("Substituir os dados nesta conta por "+raw.shifts.length+" turnos, "+raw.expenses.length+" gastos e "+raw.goals.length+" metas? Exporte seu backup antes."))return;await save(d=>Object.assign(d,raw))}catch(err){notify(err.message,true)}finally{up.value=""}};
}
async function submit(ev){
 ev.preventDefault();const f=ev.currentTarget;
 try{
 if(f.id==="turnForm"){
  const initial=num(fval(f,"os")),final=num(fval(f,"oe"));
  if(!Number.isFinite(initial)||!Number.isFinite(final)||initial<0||final<=initial)throw Error("Odômetro final deve superar o inicial.");
  const start=fval(f,"start"),end=fval(f,"end");
  if(!!start!==!!end)throw Error("Preencha ambos horários ou deixe ambos vazios.");
  const sh={id:editId||rid(),date:fval(f,"date"),platform:fval(f,"platform"),start:start||undefined,end:end||undefined,odoStart:initial,odoEnd:final,km:Math.round((final-initial)*10)/10,grossC:cent(fval(f,"gross")),fuelPriceC:cent(fval(f,"fuel")),kmPerL:num(fval(f,"cons")),wearPerKmC:cent(fval(f,"wear")),otherC:cent(fval(f,"other")),note:fval(f,"note")};
  if(!positive(sh.grossC)||sh.fuelPriceC<=0||sh.kmPerL<=0||!positive(sh.otherC)||!positive(sh.wearPerKmC))throw Error("Valores do turno inválidos.");
  if(await save(d=>{const i=d.shifts.findIndex(x=>x.id===sh.id);if(i<0)d.shifts.push(sh);else d.shifts[i]=sh}))editId="";
 }
 if(f.id==="expenseForm"){
  const ex={id:rid(),date:fval(f,"date"),kind:fval(f,"kind"),category:fval(f,"category"),amountC:cent(fval(f,"amount")),note:fval(f,"note")};
  if(!Number.isFinite(ex.amountC)||ex.amountC<=0)throw Error("Valor do gasto inválido.");
  await save(d=>d.expenses.push(ex));
 }
 if(f.id==="goalForm"){
  const g={id:editId||rid(),name:fval(f,"name"),targetC:fval(f,"target")?cent(fval(f,"target")):null,deadline:fval(f,"deadline")||undefined,importance:fval(f,"importance"),status:fval(f,"status")};
  if(!g.name||(g.targetC!==null&&(!Number.isFinite(g.targetC)||g.targetC<=0)))throw Error("Meta inválida.");
  if(await save(d=>{const i=d.goals.findIndex(x=>x.id===g.id);if(i<0)d.goals.push(g);else d.goals[i]={...d.goals[i],...g}}))editId="";
 }
 if(f.id==="settingsForm"){
  const s={vehicleName:fval(f,"vehicle"),fuelPriceC:cent(fval(f,"fuel")),kmPerL:num(fval(f,"cons")),wearPerKmC:cent(fval(f,"wear")),driverPct:num(fval(f,"pct")),workDaysPerWeek:num(fval(f,"days"))};
  if(!s.vehicleName||!(s.fuelPriceC>0&&s.kmPerL>0&&positive(s.wearPerKmC)&&s.driverPct>=0&&s.driverPct<=100&&s.workDaysPerWeek>=1&&s.workDaysPerWeek<=7))throw Error("Configurações inválidas.");
  await save(d=>Object.assign(d.settings,s));
 }
 }catch(err){notify(err.message,true)}
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function action(name,id){
 if(name==="signout"){await client.auth.signOut();account=null;finance=null;revision=0;lastSaved=null;render();return}
 if(name==="reload"){account=null;finance=null;const r=await client.auth.getUser();if(r.data.user)await loadAccount(r.data.user);return}
 if(name==="editturn"||name==="editgoal"){editId=id;screenName=name==="editturn"?"turno":"metas";render();scrollTo(0,0);return}
 if(["remturn","remexpense","remgoal"].includes(name)){if(!confirm("Excluir este registro permanentemente?"))return;const key=name==="remturn"?"shifts":name==="remexpense"?"expenses":"goals";await save(d=>{d[key]=d[key].filter(x=>x.id!==id)});return}
 if(name==="upgoal"){await save(d=>{const i=d.goals.findIndex(x=>x.id===id);if(i>0)[d.goals[i-1],d.goals[i]]=[d.goals[i],d.goals[i-1]]});return}
 if(name==="buygoal"){
  const g=finance.goals.find(x=>x.id===id);if(!g||g.purchase)return;
  const typed=prompt("Quanto você pagou por "+g.name+"? (R$)",g.targetC?(g.targetC/100).toFixed(2):"");if(typed===null)return;
  const price=cent(typed);if(!Number.isFinite(price)||price<=0){notify("Valor inválido",true);return}
  const reserved=compute().plans[id].reserve,used=Math.min(price,reserved);
  if(!confirm("Registrar compra de "+BRL(price)+"? Reserva prevista utilizada: "+BRL(used)+". Não registre de novo como gasto."))return;
  await save(d=>{const item=d.goals.find(x=>x.id===id);item.purchase={date:today(),amountC:price,appliedC:used};item.status="concluida"});return;
 }
 if(name==="backup"){download("rodacaixa-"+today()+".json",JSON.stringify(finance,null,2),"application/json");return}
 if(name==="csv"){
  const rows=["tipo;data;plataforma;descricao;km;valor"];
  for(const s of finance.shifts)rows.push(["turno",s.date,s.platform||"99","Faturamento",String(s.km).replace(".",","),(s.grossC/100).toFixed(2).replace(".",",")].join(";"));
  for(const x of finance.expenses)rows.push(["gasto",x.date,"",'"'+String(x.category).replace(/"/g,'""')+'"',"",(x.amountC/100).toFixed(2).replace(".",",")].join(";"));
  download("rodacaixa-"+today()+".csv","\uFEFF"+rows.join("\r\n"),"text/csv;charset=utf-8");return;
 }
}
window.addEventListener("online",()=>{if(account)render()});window.addEventListener("offline",()=>{if(account)render()});
async function start(){
 if(!window.supabase?.createClient){out.innerHTML='<div class="loading">Erro de conexão<small>Não foi possível carregar a biblioteca Supabase. Confira a internet.</small></div>';return}
 client=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange((event,session)=>{if(event==="PASSWORD_RECOVERY"){authMode="newpass";account=null;finance=null;setTimeout(render,0)}
  else if(event==="SIGNED_OUT"){account=null;finance=null;revision=0;setTimeout(render,0)}
  else if(session?.user&&!account)setTimeout(()=>loadAccount(session.user),0);
 });
 try{const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session)await loadAccount(data.session.user);else render()}catch(err){notify(err.message,true);render()}
}

/* RodaCaixa UX mobile v0.3 — turnos ao vivo, corridas rápidas, comprovantes privados e marca premium. */
const legacyBind=bind,legacySubmit=submit,legacyHome=home,legacyMetrics=compute;
let proofFile=null,proofText="",fileWarning="",socialBusy=false;
const activeTurn=()=>finance?.shifts?.find(s=>s.status==="active");
const datetimeLocal=()=>{const d=new Date();return {at:d.toISOString(),date:today(),clock:String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"),zone:Intl.DateTimeFormat().resolvedOptions().timeZone||"dispositivo"}};
const shiftRides=s=>(Array.isArray(s?.rides)?s.rides:[]);
const kmRide=s=>shiftRides(s).reduce((sum,r)=>sum+(Number(r.km)||0),0);
const sumRide=s=>shiftRides(s).reduce((sum,r)=>sum+(Number(r.valueC)||0),0);
const shortClock=v=>v||"—";
const fmtMoneyInput=c=>((Number(c)||0)/100).toFixed(2);
const footer='<div class="auth-footer">Seus dados financeiros ficam protegidos e sincronizados na sua conta.</div>';
const userLegal='Acompanhe custos e resultados com clareza. Não representa saldo bancário ou garantia de lucro.';
const socialButton=(provider,label,letter)=>'<button type="button" class="social-btn" data-oauth="'+provider+'"><span class="social-symbol">'+letter+'</span>Continuar com '+label+'</button>';
loginScreen=function(){
 const modes={login:["Bem-vindo de volta","Acesse seu painel financeiro"],signup:["Comece a dirigir seus números","Crie sua conta gratuitamente"],reset:["Recupere seu acesso","Enviaremos um link de recuperação"],newpass:["Nova senha","Escolha uma nova senha segura"]};
 const [heading,help]=modes[authMode];
 out.innerHTML='<div class="login-ambient"></div><div class="auth auth-premium"><div class="center brand-lockup"><img src="/icon.svg" alt="Símbolo RodaCaixa" width="82" height="82"><div class="auth-kicker">FINANÇAS SOBRE RODAS</div><h1>Roda<span>Caixa</span></h1><p class="slogan">Transforme cada quilômetro em controle, lucro e decisão.</p></div>'+
 '<div class="card auth-card"><h2>'+heading+'</h2><p class="desc">'+help+'</p><form id="authForm">'+(authMode==="newpass"?"":inpt("email","E-mail","email","","required autocomplete=email"))+(authMode==="reset"?"":'<label>Senha<div class="password-wrap"><input name="password" type="password" minlength="8" required autocomplete="'+(authMode==="login"?"current-password":"new-password")+'" placeholder="Sua senha" id="passwordField"><button type="button" class="show-password" data-password-toggle aria-label="Mostrar ou ocultar senha">◉</button></div></label>')+
 '<button type="submit" class="btn block primary-action">'+(authMode==="login"?"Entrar na minha conta":authMode==="signup"?"Criar minha conta":authMode==="reset"?"Enviar link":"Atualizar senha")+' <span>→</span></button></form>'+
 (authMode==="login"||authMode==="signup"?'<div class="social-divider"><span>ou acesse com</span></div>'+socialButton("google","Google",'<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.7-.35-4H24v7.57h11a9.4 9.4 0 0 1-4.08 6.17v5.13h6.61c3.88-3.57 6.08-8.82 6.08-14.87Z"/><path fill="#34A853" d="M24 44c5.55 0 10.2-1.84 13.6-4.99l-6.6-5.13c-1.84 1.23-4.19 1.96-7 1.96-5.37 0-9.92-3.62-11.54-8.5H5.64v5.28A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.46 27.34a12 12 0 0 1 0-7.68v-5.28H5.64a20 20 0 0 0 0 17.24l6.82-5.28Z"/><path fill="#EA4335" d="M24 11.94c3.02 0 5.72 1.04 7.84 3.07l5.89-5.88C34.19 5.83 29.56 4 24 4A20 20 0 0 0 5.64 15.38l6.82 5.28C14.08 15.78 18.63 11.94 24 11.94Z"/></svg>')+socialButton("apple","Apple",'<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M17.05 12.536c-.031-3.202 2.609-4.74 2.727-4.812-1.5-2.197-3.828-2.494-4.652-2.518-1.96-.206-3.86 1.157-4.86 1.157-1.004 0-2.545-1.128-4.196-1.098-2.161.032-4.163 1.256-5.277 3.177-2.253 3.901-.577 9.677 1.62 12.843 1.076 1.548 2.356 3.284 4.041 3.22 1.624-.064 2.235-1.048 4.197-1.048 1.961 0 2.51 1.048 4.206 1.016 1.737-.031 2.835-1.578 3.9-3.129 1.24-1.802 1.751-3.548 1.78-3.637-.039-.014-3.409-1.305-3.448-5.189zM13.84 3.63c.934-1.129 1.566-2.699 1.394-4.27-1.347.054-2.977.897-3.942 2.031-.868 1.003-1.629 2.602-1.425 4.12 1.5.116 3.04-.764 3.974-1.881z" transform="translate(1.2 1.5) scale(.84)"/></svg>')+'<div class="social-note">Login Google/Apple disponível após habilitar os provedores.</div>':"")+
 '<div class="authswitch">'+(authMode!=="login"?'<button class="linkbtn" data-auth="login">Já tenho conta</button>':"")+(authMode!=="signup"?'<button class="linkbtn" data-auth="signup">Criar conta</button>':"")+(authMode!=="reset"?'<button class="linkbtn" data-auth="reset">Recuperar senha</button>':"")+'</div></div>'+footer+'</div>';
 $("#authForm").addEventListener("submit",handleAuth);
 out.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>{authMode=b.dataset.auth;render()});
 out.querySelector("[data-password-toggle]")?.addEventListener("click",()=>{const f=$("#passwordField");f.type=f.type==="password"?"text":"password"});
 out.querySelectorAll("[data-oauth]").forEach(b=>b.onclick=async()=>{if(socialBusy)return;socialBusy=true;const provider=b.dataset.oauth;
  try{const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:location.origin,skipBrowserRedirect:false}});
   if(error)throw error;}catch(err){notify("Login "+provider+": é necessário ativar/configurar este provedor no Supabase. "+err.message,true)}finally{socialBusy=false}});
};
mount=function(page){
 const active=activeTurn();
 out.innerHTML='<header class="top top-premium"><div class="brand"><img src="/icon.svg" alt="RodaCaixa" width="42" height="42"><div><b>RodaCaixa</b><small>Seu financeiro na direção</small></div></div><div class="user-connection"><div class="online">'+(saving?"● Salvando":!navigator.onLine?"● Sem internet":lastSaved?"● Sincronizado":"● Conectado")+'</div><button class="signout" data-action="signout" aria-label="Sair da conta">Sair</button></div></header>'+
 (active?'<div class="status-strip"><span class="pulse-dot"></span><b>Turno em andamento</b><span>'+esc(active.platform||"99")+' · Iniciado às '+esc(active.start||"—")+'</span></div>':"")+
 '<main class="app-main">'+page+'</main><nav class="footnav" aria-label="Navegação">'+[["inicio","⌂","Início"],["turno","◉",active?"Ao vivo":"Turno"],["gastos","▣","Gastos"],["metas","◎","Metas"],["ajustes","⚙","Ajustes"]].map(x=>'<button type="button" data-go="'+x[0]+'" class="'+(screenName===x[0]?"active":"")+'"><strong>'+x[1]+'</strong>'+x[2]+'</button>').join("")+'</nav>';
 bind();
};
const recentShifts=()=>finance.shifts.slice().reverse();
home=function(){
 const a=legacyMetrics(),active=activeTurn(),todayShifts=finance.shifts.filter(s=>s.date===today()),dailyGross=todayShifts.reduce((v,s)=>v+(s.grossC||0),0),rideCount=todayShifts.reduce((v,s)=>v+shiftRides(s).length,0);
 return '<div class="section-overline">SEU PAINEL FINANCEIRO</div><h1>Seu trabalho, <em>no controle.</em></h1><p class="desc">Acompanhe cada corrida e proteja o dinheiro que seu carro precisa.</p>'+
 '<div class="hero premium-hero"><div class="eyebrow">Resultado após custos · acumulado</div><div class="big">'+BRL(a.result)+'</div><p class="muted">Estimativa operacional, não saldo na conta</p><div class="mini-metrics">'+line("Faturamento bruto",BRL(a.gross))+line("Custos e provisões","− "+BRL(a.gross-a.result))+'</div></div>'+
 (active?'<button class="btn block bright-large" data-go="turno"><span class="pulse-dot dark-dot"></span> Continuar meu turno <b>→</b></button>':
 '<button class="btn block bright-large" data-go="turno">▶ Iniciar meu turno <b>→</b></button>')+
 '<div class="stat-section"><div class="stat-item"><div class="stat-name">Faturado hoje</div><div class="stat-number">'+BRL(dailyGross)+'</div><small>'+rideCount+' corrida(s) registrada(s)</small></div><div class="stat-item"><div class="stat-name">Para você</div><div class="stat-number">'+BRL(a.personal)+'</div><small>Disponível estimado</small></div><div class="stat-item"><div class="stat-name">Fundo do carro</div><div class="stat-number">'+BRL(a.car)+'</div><small>Provisão estimada</small></div><div class="stat-item"><div class="stat-name">Km trabalhados</div><div class="stat-number">'+a.km.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' <small>km</small></div><small>Inclui estimativas em turno ativo</small></div></div>'+
 '<div class="card soft-card"><div class="row"><span>Meta de reserva por dia</span><b class="mint-value">'+BRL(a.daily)+'</b></div><p class="muted">Valor planejado para metas com prazo. Ajuste em Metas.</p><button class="inline-link" data-go="metas">Ver minhas metas →</button></div>'+
 '<h2>Atividade recente</h2><div class="list">'+(recentShifts().length?recentShifts().slice(0,4).map(s=>'<div class="entry"><div class="row"><b>'+esc(when(s.date))+' · '+esc(s.platform||"99")+'</b><b>'+BRL(s.grossC)+'</b></div><p>'+esc(s.status==="active"?"Em andamento":"Encerrado")+' · '+shiftRides(s).length+' corrida(s) · '+(Number(s.km)||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km</p></div>').join(""):'<div class="help">Seu primeiro turno vai aparecer aqui. Nenhum registro fictício foi criado.</div>')+'</div>';
};
turns=function(){
 const active=activeTurn(),s=finance.settings,last=finance.shifts.filter(t=>t.odoEnd!=null).slice().reverse()[0];
 if(!active){
  return '<div class="section-overline">JORNADA DO MOTORISTA</div><h1>Pronto para rodar?</h1><p class="desc">Um toque para abrir o turno. O aplicativo registra a hora e a data do dispositivo automaticamente.</p>'+
  '<div class="hero start-hero"><div class="wheel-ambient"><img src="/icon.svg" alt=""></div><div class="eyebrow">SEU PRÓXIMO TURNO</div><div class="big">Boa viagem.</div><p class="muted">Você só precisa informar o odômetro de partida.</p></div>'+
  '<form class="card quick-form" id="startShiftForm"><div class="quick-head"><b>Começar agora</b><span class="pill">Horário automático</span></div>'+
  sel("platform","Aplicativo principal",[["99","99"],["Uber","Uber"],["inDrive","inDrive"],["Particular","Particular"],["Outro","Outro"]],"99")+
  inpt("startKm","KM atual no painel (odômetro)","number",last?.odoEnd??"","required min=0 step=0.1 inputmode=decimal placeholder=Ex: 45950")+
  '<div class="field-hint">Data e hora: <b id="clockPreview">'+new Date().toLocaleString("pt-BR")+'</b> · horário do aparelho</div><button class="btn block bright-large" type="submit">▶ Iniciar turno agora</button></form>'+
  '<div class="help">Ainda não sabe o odômetro? Consulte o painel antes de começar. O valor final será informado somente no encerramento.</div>'+
  '<h2>Últimos turnos</h2>'+historyCards();
 }
 const rides=shiftRides(active),startKm=Number(active.odoStart)||0,at=active.start||"—";
 return '<div class="section-overline"><span class="pulse-dot"></span> TURNO EM ANDAMENTO</div><h1>Boa rota!</h1><p class="desc">Iniciado às <b>'+esc(at)+'</b> em '+esc(when(active.date))+' · '+esc(active.platform||"99")+'. Registre cada corrida em segundos.</p>'+
 '<div class="hero live-hero"><div class="eyebrow">RECEITA DO TURNO</div><div class="big">'+BRL(active.grossC)+'</div><div class="live-metrics"><span>'+rides.length+' corrida(s)</span><span>'+kmRide(active).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km em corridas</span></div></div>'+
 '<div class="quick-actions"><button class="btn block bright-large" type="button" data-open-ride>＋ Registrar corrida</button><button class="btn secondary block" type="button" data-close-panel>Encerrar turno</button></div>'+
 '<div id="ridePanel" class="card quick-form '+(proofFile?"":"hidden-panel")+'"><div class="quick-head"><b>Nova corrida</b><button type="button" class="icon-close" data-close-ride aria-label="Fechar">✕</button></div>'+
 '<form id="rideForm">'+inpt("value","Valor recebido (R$)","number","","required min=0 step=0.01 inputmode=decimal placeholder=Ex: 12.50")+
 '<div class="grid">'+inpt("km","KM da corrida (opcional)","number","","min=0 step=0.1 inputmode=decimal placeholder=Ex: 6.4")+
 sel("platform","Plataforma",[["99","99"],["Uber","Uber"],["inDrive","inDrive"],["Particular","Particular"],["Outro","Outro"]],active.platform||"99")+'</div>'+
 '<div class="upload-area"><label for="proofUpload" class="upload-label">▤ Anexar print, foto, PDF, CSV ou Excel <span>Opcional · arquivo privado · até 10 MB</span></label><input id="proofUpload" type="file" accept="image/*,application/pdf,.csv,.xls,.xlsx,text/csv" style="max-width:100%;font-size:12px">'+
 '<div id="proofInfo" class="field-hint">'+(proofFile?esc(proofFile.name):"Você pode registrar só o valor e continuar rodando.")+'</div>'+
 '<button type="button" class="btn secondary tiny" data-read-proof>Tentar ler dados do arquivo (experimental)</button><div class="field-hint" id="extractInfo"></div></div>'+
 '<button type="submit" class="btn block bright-large">Salvar corrida na nuvem →</button></form></div>'+
 '<div id="endPanel" class="card quick-form hidden-panel"><div class="quick-head"><b>Finalizar expediente</b><button type="button" class="icon-close" data-close-end>✕</button></div>'+
 '<form id="endShiftForm"><p class="muted">Início: '+esc(startKm)+' km. O encerramento registra o horário automaticamente.</p>'+
 inpt("endKm","Odômetro atual (KM do painel)","number","","required min=0 step=0.1 inputmode=decimal placeholder=Ex: 46045")+
 '<div id="endKmInfo" class="field-hint">O total inclui busca, corridas e deslocamentos vazios.</div><button type="submit" class="btn block bright-large">✓ Encerrar meu turno</button></form></div>'+
 '<div class="sectiontop"><h2>Corridas registradas</h2><span class="pill">'+rides.length+' no turno</span></div>'+
 (rides.length?'<div class="list">'+rides.slice().reverse().map((r,i)=>'<div class="entry"><div class="row"><b>'+esc(r.platform||active.platform||"99")+' · '+esc(r.clock||"")+'</b><b>'+BRL(r.valueC)+'</b></div><p>'+esc(r.km==null?"KM não informado":Number(r.km).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km")+(r.evidence?.path?' · Comprovante privado salvo':"")+'</p><div class="actions">'+(r.evidence?.path?'<button type="button" class="btn secondary tiny" data-open-proof="'+esc(r.id)+'">Ver comprovante</button>':"")+'<button type="button" class="btn secondary tiny" data-edit-ride="'+esc(r.id)+'">Corrigir</button><button type="button" class="btn danger tiny" data-remove-ride="'+esc(r.id)+'">Excluir</button></div></div>').join("")+'</div>':
 '<div class="help">Nenhuma corrida registrada. Ao terminar uma viagem, toque em <b>Registrar corrida</b>, informe quanto recebeu e salve.</div>');
};
function historyCards(){
 const closed=finance.shifts.filter(s=>s.status!=="active").slice().reverse().slice(0,6);
 return closed.length?'<div class="list">'+closed.map(s=>'<div class="entry"><div class="row"><b>'+when(s.date)+' · '+esc(s.platform||"99")+'</b><b>'+BRL(s.grossC)+'</b></div><p>'+Number(s.km||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km · '+shiftRides(s).length+' corrida(s) · '+esc(s.start||"")+"–"+esc(s.end||"")+'</p><button class="btn danger tiny" type="button" data-delete-closed="'+esc(s.id)+'">Excluir turno</button></div>').join("")+'</div>':'<div class="help">Seu histórico de turnos aparecerá aqui.</div>';
}
const legacySettings=settings;
settings=function(){return legacySettings().replace('Backup e sincronização','Dados e backup').replace('Sem internet, nenhum lançamento é salvo.','Sem internet, nenhum lançamento é salvo. Prints e arquivos são enviados somente quando você os anexa.')};
bind=function(){
 legacyBind();
 const $a=sel=>out.querySelector(sel);
 const toggle=(s,hidden)=>{const x=$a(s);if(x)x.classList.toggle("hidden-panel",hidden)};
 $a("[data-open-ride]")?.addEventListener("click",()=>{toggle("#ridePanel",false);toggle("#endPanel",true);$a("#rideForm input[name=value]")?.focus()});
 $a("[data-close-ride]")?.addEventListener("click",()=>{toggle("#ridePanel",true);proofFile=null;proofText=""});
 $a("[data-close-panel]")?.addEventListener("click",()=>{toggle("#endPanel",false);toggle("#ridePanel",true)});
 $a("[data-close-end]")?.addEventListener("click",()=>toggle("#endPanel",true));
 $a("#endShiftForm")?.addEventListener("input",()=>{const shift=activeTurn(),input=$a("#endShiftForm input[name=endKm]"),n=num(input.value),diff=n-(Number(shift?.odoStart)||0);$a("#endKmInfo").textContent=Number.isFinite(diff)&&diff>0?"Total do trabalho: "+diff.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km (inclui km vazios).":"Odômetro final deve ser maior que o inicial."});
 $a("#proofUpload")?.addEventListener("change",ev=>{const file=ev.target.files?.[0];if(!file){proofFile=null;return}if(file.size>10*1024*1024){notify("Máximo permitido: 10 MB.",true);ev.target.value="";proofFile=null;return}proofFile=file;proofText="";$a("#proofInfo").textContent="Selecionado: "+file.name+" ("+Math.ceil(file.size/1024)+" KB). Será salvo após confirmar a corrida."});
 $a("[data-read-proof]")?.addEventListener("click",()=>previewExtraction($a("#rideForm")));
 $a("[data-delete-closed]")?.addEventListener("click",ev=>deleteClosed(ev.currentTarget.dataset.deleteClosed));
 $a("[data-remove-ride]");out.querySelectorAll("[data-remove-ride]").forEach(b=>b.addEventListener("click",()=>removeRide(b.dataset.removeRide)));
 out.querySelectorAll("[data-edit-ride]").forEach(b=>b.addEventListener("click",()=>editRide(b.dataset.editRide)));
 out.querySelectorAll("[data-open-proof]").forEach(b=>b.addEventListener("click",()=>openProof(b.dataset.openProof)));
 // Existing nav and buttons remain bound through legacyBind.
};
const previousSubmit=submit;
submit=async function(ev){
 if(!["startShiftForm","rideForm","endShiftForm"].includes(ev.currentTarget.id))return previousSubmit(ev);
 ev.preventDefault();const form=ev.currentTarget;
 try{
  if(form.id==="startShiftForm"){
   if(activeTurn())throw Error("Já existe um turno em andamento.");
   const od=num(fval(form,"startKm")),platform=fval(form,"platform");if(!Number.isFinite(od)||od<0)throw Error("Informe o KM inicial indicado no painel.");
   const dt=datetimeLocal();
   const shift={id:rid(),status:"active",date:dt.date,platform,start:dt.clock,startedAt:dt.at,startedTimezone:dt.zone,odoStart:od,odoEnd:null,end:null,rides:[],grossC:0,km:0,otherC:0,fuelPriceC:finance.settings.fuelPriceC,kmPerL:finance.settings.kmPerL,wearPerKmC:finance.settings.wearPerKmC,note:""};
   if(await save(d=>d.shifts.push(shift)))notify("Turno iniciado às "+dt.clock+". Boa viagem!");
   return;
  }
  if(form.id==="rideForm"){
   const shift=activeTurn();if(!shift)throw Error("Inicie o turno antes da corrida.");
   const price=cent(fval(form,"value")),kmText=fval(form,"km"),distance=kmText?num(kmText):null;
   if(!Number.isFinite(price)||price<0)throw Error("Informe o valor da corrida.");
   if(distance!==null&&(!Number.isFinite(distance)||distance<0))throw Error("KM da corrida inválido.");
   const dt=datetimeLocal(),ride={id:rid(),valueC:price,km:distance,platform:fval(form,"platform"),clock:dt.clock,at:dt.at,source:"manual"};
   const good=await save(d=>{const s=d.shifts.find(x=>x.id===shift.id);s.rides=s.rides||[];s.rides.push(ride);s.grossC=sumRide(s);s.km=kmRide(s)});
   if(!good)return;
   if(proofFile){const copy=proofFile;proofFile=null;await uploadReceipt(shift.id,ride.id,copy)}
   return;
  }
  if(form.id==="endShiftForm"){
   const shift=activeTurn();if(!shift)throw Error("Nenhum turno em andamento.");
   const endKm=num(fval(form,"endKm"));if(!Number.isFinite(endKm)||endKm<=Number(shift.odoStart))throw Error("Informe o odômetro final maior que o inicial.");
   const total=Math.round((endKm-Number(shift.odoStart))*10)/10;
   if(kmRide(shift)>total+0.5&&!confirm("O total de KM das corridas supera os KM do odômetro. Confirma os números?"))return;
   const dt=datetimeLocal();
   const ok=await save(d=>{const s=d.shifts.find(x=>x.id===shift.id);s.status="closed";s.odoEnd=endKm;s.end=dt.clock;s.endedAt=dt.at;s.km=total;s.grossC=sumRide(s)});
   if(ok){screenName="inicio";render();notify("Turno encerrado às "+dt.clock+" · "+total.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km.");}
   return;
  }
 }catch(err){notify(err.message,true)}
};
async function openProof(id){
 const s=activeTurn(),r=shiftRides(s).find(x=>x.id===id);if(!r?.evidence?.path)return;
 try{
  const {data,error}=await client.storage.from("driver-receipts").createSignedUrl(r.evidence.path,120);
  if(error)throw error;
  if(!data?.signedUrl)throw Error("Não foi gerado acesso ao arquivo.");
  window.location.assign(data.signedUrl);
 }catch(err){notify("Não foi possível abrir o comprovante: "+err.message,true)}
}
async function removeRide(id){
 const s=activeTurn();if(!s||!confirm("Excluir esta corrida do turno?"))return;
 const previous=shiftRides(s).find(r=>r.id===id);
 const ok=await save(d=>{const t=d.shifts.find(x=>x.id===s.id);t.rides=t.rides.filter(r=>r.id!==id);t.grossC=sumRide(t);t.km=kmRide(t)});
 if(ok&&previous?.evidence?.path){const {error}=await client.storage.from("driver-receipts").remove([previous.evidence.path]);if(error)notify("Registro excluído, mas o anexo precisa ser limpo: "+error.message,true)}
}
async function editRide(id){
 const s=activeTurn(),r=shiftRides(s).find(x=>x.id===id);if(!r)return;
 const val=prompt("Valor correto da corrida (R$):",fmtMoneyInput(r.valueC));if(val===null)return;
 const amt=cent(val);if(!Number.isFinite(amt)||amt<0){notify("Valor inválido",true);return}
 const km=prompt("KM da corrida (deixe vazio se desconhecido):",r.km==null?"":String(r.km));if(km===null)return;
 const dist=km.trim()?num(km):null;if(dist!==null&&(!Number.isFinite(dist)||dist<0)){notify("KM inválidos",true);return}
 await save(d=>{const t=d.shifts.find(x=>x.id===s.id),x=t.rides.find(r=>r.id===id);x.valueC=amt;x.km=dist;t.grossC=sumRide(t);t.km=kmRide(t)});
}
async function deleteClosed(id){
 if(!confirm("Excluir definitivamente este turno e todas as corridas associadas?"))return;
 await save(d=>{d.shifts=d.shifts.filter(x=>x.id!==id)});
}
async function uploadReceipt(shiftId,rideId,file){
 const extension=(file.name.split(".").pop()||"dat").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8);
 const type=(file.type||({"csv":"text/csv","jpg":"image/jpeg","png":"image/png","webp":"image/webp","pdf":"application/pdf","xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","xls":"application/vnd.ms-excel"}[extension])||"application/octet-stream");
 const path=account.id+"/"+shiftId+"/"+rideId+"-"+rid()+"."+extension;
 try{
  const {error}=await client.storage.from("driver-receipts").upload(path,file,{contentType:type,upsert:false});
  if(error)throw error;
  const ok=await save(d=>{const s=d.shifts.find(x=>x.id===shiftId);if(!s)throw Error("Turno removido durante upload");const r=shiftRides(s).find(x=>x.id===rideId);if(!r)throw Error("Corrida removida durante upload");r.evidence={path,name:file.name,mime:type,size:file.size}});
  if(ok)notify("Comprovante guardado em armazenamento privado.");
  else notify("A corrida foi salva, mas o anexo não foi vinculado; tente anexar novamente.",true);
 }catch(err){notify("Corrida salva, mas o anexo falhou: "+err.message,true)}
}
async function loadScript(url,check){
 if(check())return;
 await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=url;script.onload=resolve;script.onerror=()=>reject(new Error("Biblioteca de leitura indisponível"));document.head.appendChild(script)});
 if(!check())throw Error("Biblioteca não carregou");
}
async function fileText(file){
 const ext=(file.name.split(".").pop()||"").toLowerCase();
 if(["csv","txt"].includes(ext))return(await file.text()).slice(0,250000);
 if(["xlsx","xls"].includes(ext)){
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",()=>!!window.XLSX);
  const data=new Uint8Array(await file.arrayBuffer()),wb=window.XLSX.read(data,{type:"array"});
  return wb.SheetNames.slice(0,2).map(k=>window.XLSX.utils.sheet_to_csv(wb.Sheets[k])).join("\n").slice(0,250000);
 }
 if(["jpg","jpeg","png","webp"].includes(ext)||file.type.startsWith("image/")){
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",()=>!!window.Tesseract);
  const {data}=await window.Tesseract.recognize(file,"por+eng");return data.text.slice(0,50000);
 }
 if(ext==="pdf"||file.type==="application/pdf"){
  const lib=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs";
  const bytes=new Uint8Array(await file.arrayBuffer());
  const doc=await lib.getDocument({data:bytes}).promise;
  let text="";
  for(let i=1;i<=Math.min(doc.numPages,6);i++){
   const pg=await doc.getPage(i),body=await pg.getTextContent();
   text+="\n"+body.items.map(x=>x.str||"").join(" ");
  }
  if(!text.trim())throw Error("PDF digitalizado sem texto. Envie print da corrida ou registre manualmente.");
  return text.slice(0,100000);
 }
 throw Error("Formato sem leitor disponível. Ainda é possível salvar a corrida e anexar o arquivo.");
}
function guessAmounts(text){
 const normalized=text.replace(/\u00a0/g," ").replace(/(\\r\\n|\\r)/g,"\n");
 const currency=[...normalized.matchAll(/(?:R\$\s*)(\d{1,5}(?:[.,]\d{1,2})?)/gi)].map(m=>m[1]);
 const distance=[...normalized.matchAll(/(?:distância|distance|percurso|km percorridos|quilômetros)[^\d]{0,20}(\d{1,5}(?:[.,]\d{1,2})?)\s*km|(\d{1,5}(?:[.,]\d{1,2})?)\s*km\b/gi)].map(m=>m[1]||m[2]);
 return{money:currency.length===1?currency[0]:null,dist:distance.length===1?distance[0]:null,moneyCount:currency.length,distCount:distance.length};
}
async function previewExtraction(form){
 if(!proofFile){notify("Anexe um arquivo para tentar a leitura.",true);return}
 const btn=form?.querySelector("[data-read-proof]"),info=form?.querySelector("#extractInfo");
 if(!btn||!info)return;
 btn.disabled=true;btn.textContent="Lendo no aparelho…";
 try{
  const text=await fileText(proofFile);proofText=text;const g=guessAmounts(text);
  let msg="Leitura experimental: ";
  if(g.money){const field=form.querySelector('[name="value"]');if(field&&!field.value)field.value=g.money.replace(",",".");msg+="possível valor encontrado. "}
  if(g.dist){const field=form.querySelector('[name="km"]');if(field&&!field.value)field.value=g.dist.replace(",",".");msg+="possível KM encontrado. "}
  if(!g.money&&!g.dist)msg+="nenhum valor único identificado. Preencha manualmente.";
  msg+=" Confira os números antes de salvar. ";
  info.textContent=msg;
  notify("Confira o valor e os KM sugeridos. Nada foi salvo automaticamente.");
 }catch(err){info.textContent="Leitura automática indisponível: "+err.message+". Você ainda pode digitar os dados e anexar o arquivo.";notify(err.message,true)}
 finally{btn.disabled=false;btn.textContent="Tentar ler dados do arquivo (experimental)"}
}

start();
})();