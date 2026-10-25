/* RodaCaixa — app financeiro para motoristas. MVP 0.2 */
(function(){
"use strict";
const SUPA_URL="https://mdqdttqulwncbrnpbddh.supabase.co";
const SUPA_KEY="sb_publishable_G4fHYtKJ2JcWraKe4_fUNQ_pdwv2TMG";
const out=document.getElementById("app"), toast=document.getElementById("toast");
let client=null,account=null,finance=null,revision=0,screenName="inicio",editId="",authMode="login",saving=false,lastSaved=null;
const opt={fuelPriceC:665,kmPerL:13,wearPerKmC:15,driverPct:50,workDaysPerWeek:4,vehicleName:"Meu carro",dailyGoalC:15000,weeklyGoalC:60000,weeklyStartDate:null,maxShiftMinutes:300};
const defaults=()=>({version:3,settings:{...opt},goals:[{id:"tires",name:"2 pneus",targetC:null,importance:"seguranca",status:"planejada"},{id:"part",name:"Peça do carro",targetC:20000,importance:"obrigatoria",status:"planejada"}],carProject:{vehicle:{model:"Renault Kwid Zen 1.0 MT",manufactureYear:2021,modelYear:2022,color:"Branca",transmission:"Manual",wheels:"Aro 14, aço e calotas"},items:[],payments:[]},shifts:[],expenses:[]});
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
 return {version:3,settings:{...opt,...raw.settings},goals:goals.map(g=>({...g,importance:g.importance||(g.id==="tires"?"seguranca":g.id==="part"?"obrigatoria":"upgrade"),status:g.status||"planejada"})),shifts:raw.shifts,expenses:raw.expenses,carProject:raw.carProject&&Array.isArray(raw.carProject.items)&&Array.isArray(raw.carProject.payments)?raw.carProject:defaults().carProject};
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
 out.innerHTML='<header class="top"><div class="brand"><img src="/icon.svg" alt=""><div><b>RodaCaixa</b><small>Seu financeiro na direção</small></div></div><div style="text-align:right"><div class="online">'+(saving?"Salvando…":!navigator.onLine?"Sem internet":lastSaved?"☁ Sincronizado":"☁ Conectado")+'</div><button class="linkbtn" data-action="signout">Sair</button></div></header><main>'+page+'</main><nav class="footnav">'+[["inicio","⌂","Início"],["turno","⊕","Turno"],["gastos","▣","Gastos"],["metas","◎","Projeto"],["ajustes","⚙","Ajustes"]].map(x=>'<button data-go="'+x[0]+'" class="'+(screenName===x[0]?"active":"")+'"><strong>'+x[1]+'</strong>'+x[2]+'</button>').join("")+'</nav>';
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
 '<div class="daily-settings-head"><b>Planejamento de ganhos</b><p>A meta principal é semanal (segunda a domingo). O valor por turno é somente uma referência para distribuir os dias e descansar.</p></div>'+
 inpt("weeklyGoal","Meta semanal de faturamento (R$)","number",((s.weeklyGoalC??60000)/100).toFixed(2),"required min=1 step=0.01 inputmode=decimal")+
 inpt("weeklyStart","Primeira semana válida para a meta (opcional)","date",s.weeklyStartDate||"")+
 '<p class="field-hint">Use a data de início para não misturar a semana anterior. O turno que atravessa a meia-noite fica na semana em que começou.</p>'+
 inpt("dailyGoal","Referência de faturamento por turno (R$)","number",((s.dailyGoalC??15000)/100).toFixed(2),"required min=1 step=0.01 inputmode=decimal")+
 inpt("maxHours","Limite máximo de trabalho (horas)","number",((s.maxShiftMinutes??300)/60).toFixed(1),"required min=0.5 max=12 step=0.5 inputmode=decimal")+
 '<p class="field-hint">Encerre após a última corrida quando atingir a meta. Se o limite de horas chegar primeiro, priorize o descanso. O app não garante lucro.</p>'+
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
  const s={vehicleName:fval(f,"vehicle"),fuelPriceC:cent(fval(f,"fuel")),kmPerL:num(fval(f,"cons")),wearPerKmC:cent(fval(f,"wear")),driverPct:num(fval(f,"pct")),workDaysPerWeek:num(fval(f,"days")),dailyGoalC:cent(fval(f,"dailyGoal")),weeklyGoalC:cent(fval(f,"weeklyGoal")),weeklyStartDate:fval(f,"weeklyStart")||null,maxShiftMinutes:Math.round(num(fval(f,"maxHours"))*60)};
  if(!s.vehicleName||!(s.fuelPriceC>0&&s.kmPerL>0&&positive(s.wearPerKmC)&&s.driverPct>=0&&s.driverPct<=100&&s.workDaysPerWeek>=1&&s.workDaysPerWeek<=7&&Number.isFinite(s.dailyGoalC)&&s.dailyGoalC>=100&&Number.isFinite(s.weeklyGoalC)&&s.weeklyGoalC>=100&&(!s.weeklyStartDate||/^\d{4}-\d{2}-\d{2}$/.test(s.weeklyStartDate))&&Number.isFinite(s.maxShiftMinutes)&&s.maxShiftMinutes>=30&&s.maxShiftMinutes<=720))throw Error("Configurações inválidas.");
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
 out.innerHTML='<div class="login-ambient"></div><div class="auth auth-premium"><div class="center brand-lockup">'+integratedWheel()+'<div class="auth-kicker">FINANÇAS SOBRE RODAS</div><h1>Roda<span>Caixa</span></h1><p class="slogan">Transforme cada quilômetro em controle, lucro e decisão.</p></div>'+
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
 (active?'<div class="status-strip"><span class="pulse-dot"></span><b>Turno em andamento</b><span>'+esc(selectedPlatforms(active).join(" + "))+' · Iniciado às '+esc(active.start||"—")+'</span></div>':"")+
 '<main class="app-main">'+page+'</main><nav class="footnav" aria-label="Navegação">'+[["inicio","⌂","Início"],["turno","◉",active?"Ao vivo":"Turno"],["gastos","▣","Gastos"],["metas","◎","Projeto"],["ajustes","⚙","Ajustes"]].map(x=>'<button type="button" data-go="'+x[0]+'" class="'+(screenName===x[0]?"active":"")+'"><strong>'+x[1]+'</strong>'+x[2]+'</button>').join("")+'</nav>';
 bind();
};
const recentShifts=()=>finance.shifts.slice().reverse();
home=function(){
 const a=legacyMetrics(),active=activeTurn(),todayShifts=finance.shifts.filter(s=>s.date===today()),dailyGross=todayShifts.reduce((v,s)=>v+(s.grossC||0),0),rideCount=todayShifts.reduce((v,s)=>v+((Number(s.reportedTrips)||0)||shiftRides(s).length),0);
 return '<div class="section-overline">SEU PAINEL FINANCEIRO</div><h1>Seu trabalho, <em>no controle.</em></h1><p class="desc">Acompanhe cada corrida e proteja o dinheiro que seu carro precisa.</p>'+
 '<div class="hero premium-hero"><div class="eyebrow">Resultado após custos · acumulado</div><div class="big">'+BRL(a.result)+'</div><p class="muted">Estimativa operacional, não saldo na conta</p><div class="mini-metrics">'+line("Faturamento bruto",BRL(a.gross))+line("Custos e provisões","− "+BRL(a.gross-a.result))+'</div></div>'+
 (active?'<button class="btn block bright-large" data-go="turno"><span class="pulse-dot dark-dot"></span> Continuar meu turno <b>→</b></button>':
 '<button class="btn block bright-large" data-go="turno">▶ Iniciar meu turno <b>→</b></button>')+
 weeklyGoalCard()+
 dailyGoalCard(active)+
 '<div class="stat-section"><div class="stat-item"><div class="stat-name">Faturado hoje</div><div class="stat-number">'+BRL(dailyGross)+'</div><small>'+rideCount+' corrida(s) registrada(s)</small></div><div class="stat-item"><div class="stat-name">Para você</div><div class="stat-number">'+BRL(a.personal)+'</div><small>Disponível estimado</small></div><div class="stat-item"><div class="stat-name">Saldo do projeto</div><div class="stat-number">'+BRL(projectSummary().available)+'</div><small>Provisão estimada</small></div><div class="stat-item"><div class="stat-name">Km contabilizados</div><div class="stat-number">'+a.km.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' <small>km</small></div><small>Conferir odômetro quando disponível</small></div></div>'+
 '<div class="card soft-card"><div class="row"><span>Reserva de desgaste do carro</span><b class="mint-value">'+BRL(a.wear)+'</b></div><div class="row"><span>Reserva de metas do carro</span><b class="mint-value">'+BRL(a.car)+'</b></div><div class="row"><span>Saldo disponível após compras do projeto</span><b class="mint-value">'+BRL(projectSummary().available)+'</b></div><p class="muted">Estimativas; não representam valores efetivamente depositados. Combustível é provisionado à parte.</p></div>'+ '<div class="card soft-card"><div class="row"><span>Meta de reserva por dia</span><b class="mint-value">'+BRL(a.daily)+'</b></div><p class="muted">Valor planejado para metas com prazo. Ajuste em Metas.</p><button class="inline-link" data-go="metas">Ver minhas metas →</button></div>'+
 '<h2>Atividade recente</h2><div class="list">'+(recentShifts().length?recentShifts().slice(0,4).map(s=>'<div class="entry"><div class="row"><b>'+esc(when(s.date))+' · '+esc(s.platform||"99")+'</b><b>'+BRL(s.grossC)+'</b></div><p>'+esc(s.status==="active"?"Em andamento":"Encerrado")+' · '+(s.reportedTrips||shiftRides(s).length)+' corrida(s) · '+(Number(s.km)||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km'+(s.kmProvisional?' (99, provisório)':'')+'</p>'+(s.fuelPurchasedC?'<p>Abastecimento informado: '+BRL(s.fuelPurchasedC)+' (não descontado duas vezes)</p>':"")+'</div>').join(""):'<div class="help">Seu primeiro turno vai aparecer aqui. Nenhum registro fictício foi criado.</div>')+'</div>';
};
turns=function(){
 const active=activeTurn(),s=finance.settings,last=finance.shifts.filter(t=>t.odoEnd!=null).slice().reverse()[0];
 if(!active){
  return '<div class="section-overline">JORNADA DO MOTORISTA</div><h1>Pronto para rodar?</h1><p class="desc">Um toque para abrir o turno. O aplicativo registra a hora e a data do dispositivo automaticamente.</p>'+
  '<div class="hero start-hero"><div class="wheel-ambient"><img src="/icon.svg" alt=""></div><div class="eyebrow">SEU PRÓXIMO TURNO</div><div class="big">Boa viagem.</div><p class="muted">Você só precisa informar o odômetro de partida.</p></div>'+
  '<form class="card quick-form" id="startShiftForm"><div class="quick-head"><b>Começar agora</b><span class="pill">Horário automático</span></div>'+
  platformStartControls()+
  inpt("startKm","KM atual no painel (odômetro)","number",last?.odoEnd??"","required min=0 step=0.1 inputmode=decimal placeholder=Ex: 45950")+
  '<div class="field-hint">Data e hora: <b id="clockPreview">'+new Date().toLocaleString("pt-BR")+'</b> · horário do aparelho</div><button class="btn block bright-large" type="submit">▶ Iniciar turno agora</button></form>'+
  '<div class="help">Ainda não sabe o odômetro? Consulte o painel antes de começar. O valor final será informado somente no encerramento.</div>'+
  weeklyGoalCard()+
  '<h2>Últimos turnos</h2>'+historyCards();
 }
 const rides=shiftRides(active),startKm=Number(active.odoStart)||0,at=active.start||"—";
 return '<div class="section-overline"><span class="pulse-dot"></span> TURNO EM ANDAMENTO</div><h1>Boa rota!</h1><p class="desc">Iniciado às <b>'+esc(at)+'</b> em '+esc(when(active.date))+' · '+esc(selectedPlatforms(active).join(" + "))+'. Registre cada corrida em segundos.</p>'+
 '<div class="hero live-hero"><div class="eyebrow">RECEITA DO TURNO</div><div class="big">'+BRL(active.grossC)+'</div><div class="live-metrics"><span>'+rides.length+' corrida(s)</span><span>'+kmRide(active).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km em corridas</span></div></div>'+
 dailyGoalCard(active)+
 (Array.isArray(active.plans)&&active.plans.length?'<div class="active-plans">'+active.plans.map(p=>'<span>'+esc(p.label)+' · '+BRL(p.priceC)+' '+(p.paidNow?'(custo registrado)':'(já pago)')+'</span>').join("")+'</div>':"")+
 '<div class="quick-actions"><button class="btn block bright-large" type="button" data-open-ride>＋ Registrar corrida</button><button class="btn secondary block" type="button" data-close-panel>Encerrar turno</button></div>'+
 '<div id="ridePanel" class="card quick-form '+(proofFile?"":"hidden-panel")+'"><div class="quick-head"><b>Nova corrida</b><button type="button" class="icon-close" data-close-ride aria-label="Fechar">✕</button></div>'+
 '<form id="rideForm">'+inpt("value","Valor mostrado como ganho do motorista (R$)","number","","required min=0 step=0.01 inputmode=decimal placeholder=Ex: 12.50")+
 '<details class="fee-disclosure"><summary>Taxa da plataforma no recibo (opcional)</summary>'+
 inpt("feeShown","Taxa já descontada do ganho (R$)","number","","min=0 step=0.01 inputmode=decimal")+
 '<p class="field-hint">Valor de cima = quanto você recebeu/ganhou. A taxa do recibo é informativa: não será descontada duas vezes. Se a 99 devolver alguma taxa na segunda-feira, concilie o repasse quando ele realmente ocorrer.</p></details>'+
 '<div class="grid">'+inpt("km","KM da corrida (opcional)","number","","min=0 step=0.1 inputmode=decimal placeholder=Ex: 6.4")+
 sel("platform","Plataforma",selectedPlatforms(active).map(p=>[p,p]),active.platform||"99")+'</div>'+
 '<div class="upload-area"><label for="proofUpload" class="upload-label">▤ Anexar print, foto, PDF, CSV ou Excel <span>Opcional · arquivo privado · até 10 MB</span></label><input id="proofUpload" type="file" accept="image/*,application/pdf,.csv,.xls,.xlsx,text/csv" style="max-width:100%;font-size:12px">'+
 '<div id="proofInfo" class="field-hint">'+(proofFile?esc(proofFile.name):"Você pode registrar só o valor e continuar rodando.")+'</div>'+
 '<button type="button" class="btn secondary tiny" data-read-proof>Tentar ler dados do arquivo (experimental)</button><div class="field-hint" id="extractInfo"></div></div>'+
 '<button type="submit" class="btn block bright-large">Salvar corrida na nuvem →</button></form></div>'+
 '<div id="endPanel" class="card quick-form hidden-panel"><div class="quick-head"><b>Finalizar expediente</b><button type="button" class="icon-close" data-close-end>✕</button></div>'+
 '<form id="endShiftForm"><p class="muted">Início: '+esc(startKm)+' km. O encerramento registra o horário automaticamente.</p>'+
 inpt("endKm","Odômetro atual (KM do painel)","number","","required min=0 step=0.1 inputmode=decimal placeholder=Ex: 46045")+
 '<div id="endKmInfo" class="field-hint">O total inclui busca, corridas e deslocamentos vazios.</div><button type="submit" class="btn block bright-large">✓ Encerrar meu turno</button></form></div>'+
 '<div class="sectiontop"><h2>Corridas registradas</h2><span class="pill">'+rides.length+' no turno</span></div>'+
 (rides.length?'<div class="list">'+rides.slice().reverse().map((r,i)=>'<div class="entry"><div class="row"><b>'+esc(r.platform||active.platform||"99")+' · '+esc(r.clock||"")+'</b><b>'+BRL(r.valueC)+'</b></div><p>'+esc(r.km==null?"KM não informado":Number(r.km).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km")+(r.platformFeeC?' · Taxa no recibo: '+BRL(r.platformFeeC)+' (informativa)':"")+(r.evidence?.path?' · Comprovante privado salvo':"")+'</p><div class="actions">'+(r.evidence?.path?'<button type="button" class="btn secondary tiny" data-open-proof="'+esc(r.id)+'">Ver comprovante</button>':"")+'<button type="button" class="btn secondary tiny" data-edit-ride="'+esc(r.id)+'">Corrigir</button><button type="button" class="btn danger tiny" data-remove-ride="'+esc(r.id)+'">Excluir</button></div></div>').join("")+'</div>':
 '<div class="help">Nenhuma corrida registrada. Ao terminar uma viagem, toque em <b>Registrar corrida</b>, informe quanto recebeu e salve.</div>');
};
function historyCards(){
 const closed=finance.shifts.filter(s=>s.status!=="active").slice().reverse().slice(0,6);
 return closed.length?'<div class="list">'+closed.map(s=>'<div class="entry"><div class="row"><b>'+when(s.date)+' · '+esc(s.platform||"99")+'</b><b>'+BRL(s.grossC)+'</b></div><p>'+Number(s.km||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+' km'+(s.kmProvisional?' (99; odômetro não informado)':'')+' · '+(s.reportedTrips||shiftRides(s).length)+' corrida(s) · '+esc(s.start||"")+"–"+esc(s.end||"")+(s.fuelPurchasedC?' · Abastecido '+BRL(s.fuelPurchasedC):"")+'</p><button class="btn danger tiny" type="button" data-delete-closed="'+esc(s.id)+'">Excluir turno</button></div>').join("")+'</div>':'<div class="help">Seu histórico de turnos aparecerá aqui.</div>';
}
const legacySettings=settings;
settings=function(){return legacySettings().replace('Backup e sincronização','Dados e backup').replace('Sem internet, nenhum lançamento é salvo.','Sem internet, nenhum lançamento é salvo. Prints e arquivos são enviados somente quando você os anexa.')};
bind=function(){
 legacyBind();
 if(goalTimerId){clearInterval(goalTimerId);goalTimerId=null}
 if(activeTurn()&&out.querySelector(".goal-panel[data-live]")){
  goalTimerId=setInterval(()=>{
   const el=out.querySelector(".goal-panel[data-live]");
   const active=activeTurn();
   if(el&&active){el.outerHTML=dailyGoalCard(active)}
   else{clearInterval(goalTimerId);goalTimerId=null}
  },30000);
 }
 const $a=sel=>out.querySelector(sel);
 const setup=$a("#startShiftForm");
 if(setup){
  const primary=setup.querySelector('[name="platform"]');
  const multi=setup.querySelector('[name="useMultiple"]');
  const extras=setup.querySelector("#otherPlatforms");
  const rerenderExtras=()=>{
   const active=new Set([...extras.querySelectorAll('input[name="otherPlatform"]:checked')].map(x=>x.value));
   extras.innerHTML=availablePlatforms.filter(p=>p!==primary.value).map(p=>
    '<label class="platform-pill"><input type="checkbox" name="otherPlatform" value="'+esc(p)+'" '+(active.has(p)?"checked":"")+'><span>'+esc(p)+'</span></label>').join("");
  };
  const refresh=()=>{
   $a("#multiAppWrap").classList.toggle("hidden-panel",!multi.checked);
   const apps=platformSelection(setup);
   $a("#planBox99").classList.toggle("hidden-panel",!apps.includes("99"));
   $a("#planBoxUber").classList.toggle("hidden-panel",!apps.includes("Uber"));
   const p99=setup.querySelector('[name="plan99"]')?.value;
   $a("#plan99Details").classList.toggle("hidden-panel",p99==="none");
   const pu=setup.querySelector('[name="planUber"]')?.value;
   $a("#planUberDetails").classList.toggle("hidden-panel",pu==="variable");
  };
  rerenderExtras();refresh();
  primary.addEventListener("change",()=>{rerenderExtras();refresh()});
  multi.addEventListener("change",refresh);
  extras.addEventListener("change",refresh);
  setup.querySelector('[name="plan99"]').addEventListener("change",ev=>{
   const preset=tariffPlans99[ev.target.value];
   const price=setup.querySelector('[name="plan99Price"]');
   price.value=preset?(preset.priceC/100).toFixed(2):"";
   refresh();
  });
  setup.querySelector('[name="planUber"]').addEventListener("change",refresh);
 }
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
   const platforms=platformSelection(form),plans=planChoices(form,platforms);
   const dt=datetimeLocal();
   const shift={id:rid(),status:"active",date:dt.date,platform,platforms,plans,start:dt.clock,startedAt:dt.at,startedTimezone:dt.zone,odoStart:od,odoEnd:null,end:null,rides:[],grossC:0,km:0,otherC:0,fuelPriceC:finance.settings.fuelPriceC,kmPerL:finance.settings.kmPerL,wearPerKmC:finance.settings.wearPerKmC,dailyGoalC:finance.settings.dailyGoalC??15000,maxShiftMinutes:finance.settings.maxShiftMinutes??300,note:""};
   if(await save(d=>{
    d.shifts.push(shift);
    for(const plan of plans){if(!plan.paidNow)continue;
      d.expenses.push({id:rid(),date:dt.date,kind:"pacote",category:plan.label,amountC:plan.priceC,
        platform:plan.platform,planCode:plan.code,shiftId:shift.id,note:"Pacote informado no início do turno · cobrado uma vez"});
    }
   }))notify("Turno iniciado às "+dt.clock+". Boa viagem!");
   return;
  }
  if(form.id==="rideForm"){
   const shift=activeTurn();if(!shift)throw Error("Inicie o turno antes da corrida.");
   const price=cent(fval(form,"value")),kmText=fval(form,"km"),distance=kmText?num(kmText):null;
   if(!Number.isFinite(price)||price<0)throw Error("Informe o valor da corrida.");
   if(distance!==null&&(!Number.isFinite(distance)||distance<0))throw Error("KM da corrida inválido.");
   const feeValue=fval(form,"feeShown"),feeShownC=feeValue?cent(feeValue):0;
   if(!Number.isFinite(feeShownC)||feeShownC<0)throw Error("Taxa informada inválida.");
   const dt=datetimeLocal(),ride={id:rid(),valueC:price,platformFeeC:feeShownC,km:distance,platform:fval(form,"platform"),clock:dt.clock,at:dt.at,source:"manual"};
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


/* Hero with an integrated 3D-like SVG wheel: no square stock-image cutout. */
function integratedWheel(){
 return '<div class="hero-wheel" role="img" aria-label="Roda RodaCaixa com aro metálico tridimensional" tabindex="0">'+
 '<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>'+
 '<radialGradient id="rubber" cx=".33" cy=".27" r=".78"><stop stop-color="#39454b"/><stop offset=".39" stop-color="#111c24"/><stop offset=".79" stop-color="#02080d"/><stop offset="1" stop-color="#26343b"/></radialGradient>'+
 '<linearGradient id="alloy" x1=".05" y1="0" x2=".92" y2="1"><stop stop-color="#f4fff9"/><stop offset=".16" stop-color="#7ab39e"/><stop offset=".32" stop-color="#223e44"/><stop offset=".53" stop-color="#a7f9dc"/><stop offset=".75" stop-color="#152d36"/><stop offset="1" stop-color="#a3fce1"/></linearGradient>'+
 '<radialGradient id="well"><stop stop-color="#0d3031"/><stop offset=".78" stop-color="#051218"/><stop offset="1" stop-color="#0d1a21"/></radialGradient>'+
 '<linearGradient id="spoke" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#f0fff9"/><stop offset=".28" stop-color="#b5d2cb"/><stop offset=".53" stop-color="#395a5c"/><stop offset=".8" stop-color="#d3eee5"/><stop offset="1" stop-color="#34585a"/></linearGradient>'+
 '<filter id="wheelShadow"><feGaussianBlur stdDeviation="5"/></filter>'+
 '</defs><ellipse cx="112" cy="201" rx="81" ry="8" fill="#58eeb8" opacity=".13" filter="url(#wheelShadow)"/>'+
 '<g class="wheel-rotor" transform="translate(110 105) rotate(-14)"><circle r="95" fill="url(#rubber)" stroke="#496263" stroke-width="1.5"/>'+
 '<circle r="90" fill="none" stroke="#101c23" stroke-width="8" stroke-dasharray="1.2 3" opacity=".73"/>'+
 '<circle r="82" fill="#132629" stroke="#182e32" stroke-width="5"/>'+
 '<circle r="75" fill="url(#alloy)" stroke="#9be2cf" stroke-width="2"/>'+
 '<circle r="67" fill="url(#well)" stroke="#294d4a" stroke-width="4"/>'+
 '<g fill="url(#spoke)" stroke="#b5e7d4" stroke-width=".6">'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z"/>'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z" transform="rotate(60)"/>'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z" transform="rotate(120)"/>'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z" transform="rotate(180)"/>'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z" transform="rotate(240)"/>'+
 '<path d="M-9-15 -17-64 -5-72 8-61 9-16Z" transform="rotate(300)"/></g>'+
 '<circle r="21" fill="#132c2c" stroke="url(#alloy)" stroke-width="3"/><circle r="12" fill="url(#alloy)" stroke="#c1f1d8" stroke-width="1"/><circle r="6" fill="#24474b"/>'+
 '<g fill="#c7f3e4"><circle cx="0" cy="-29" r="2.6"/><circle cx="27.58" cy="-8.97" r="2.6"/><circle cx="17.04" cy="23.46" r="2.6"/><circle cx="-17.04" cy="23.46" r="2.6"/><circle cx="-27.58" cy="-8.97" r="2.6"/></g>'+
 '</g><path d="M54 38a94 94 0 0 1 112 3" fill="none" stroke="#b4ffdd" stroke-width="1" opacity=".55"/></svg>'+
 '</div>';
}


const availablePlatforms=["99","Uber","inDrive","Particular","Outro"];
function selectedPlatforms(s){return Array.isArray(s?.platforms)&&s.platforms.length?s.platforms:[s?.platform||"99"]}
function platformStartControls(){
 return sel("platform","Aplicativo principal",availablePlatforms.map(p=>[p,p]),"99")+
 '<label class="multi-app-switch"><input type="checkbox" name="useMultiple" id="useMultiple"><span>Vou usar mais de um aplicativo</span></label>'+
 '<div id="multiAppWrap" class="platform-addons hidden-panel"><span class="multi-title">Outros aplicativos deste turno</span><div id="otherPlatforms" class="platform-checks"></div></div>'+
 '<div class="plan-box" id="planBox99"><div class="plan-title">Pacote 99 Taxa Zero <span>Se você contratou</span></div>'+
 sel("plan99","Pacote mostrado no seu app",[["none","Ainda não comprei / não informado"],["99-1day","1 dia · referência R$ 26,99"],["99-3day","3 dias · referência R$ 67,99"],["99-200","Até R$ 200 em ganhos · referência R$ 25,99"],["99-600","Até R$ 600 em ganhos · referência R$ 62,99"],["99-custom","Outro pacote (valor manual)"]],"none")+
 '<div class="plan-details hidden-panel" id="plan99Details">'+inpt("plan99Price","Valor efetivamente pago (R$)","number","","min=0.01 step=0.01 inputmode=decimal")+
 sel("plan99Payment","Como registrar a compra?",[["new","Acabei de comprar: incluir custo uma vez"],["existing","Já paguei em outro turno: não cobrar de novo"]],"new")+
 '<p class="field-hint">Valores iniciais são os que você mostrou. Confira a oferta e a validade no aplicativo 99. Eventuais devoluções de taxas devem ser conferidas no acerto semanal.</p></div></div>'+
 '<div class="plan-box hidden-panel" id="planBoxUber"><div class="plan-title">Cobrança Uber <span>Conforme sua conta</span></div>'+
 sel("planUber","Como funciona sua cobrança?",[["variable","Taxa de serviço por corrida / desconhecida"],["pass","Passe para Motoristas (se aparecer no seu app)"],["uber-custom","Assinatura ou pacote informado manualmente"]],"variable")+
 '<div class="plan-details hidden-panel" id="planUberDetails">'+inpt("planUberPrice","Preço pago pelo Passe (R$)","number","","min=0.01 step=0.01 inputmode=decimal")+
 sel("planUberPayment","Registrar cobrança",[["new","Comprei agora: custo uma única vez"],["existing","Já estava pago: não cobrar novamente"]],"new")+'</div>'+
 '<p class="field-hint">Nem todos os motoristas têm acesso a Passe Uber. O RodaCaixa não pressupõe percentual fixo da plataforma.</p></div>'+
 '<div class="field-hint">Selecione somente aplicativos que realmente usará. Não é preciso preencher nenhum plano se você não comprou um.</div>';
}
function platformSelection(form){
 const main=fval(form,"platform");
 const additional=[...form.querySelectorAll('input[name="otherPlatform"]:checked')].map(x=>x.value);
 return [main,...(form.querySelector('[name="useMultiple"]')?.checked?additional:[])].filter((v,i,a)=>a.indexOf(v)===i);
}
const tariffPlans99={"99-1day":{priceC:2699,label:"Pacote 99 Taxa Zero · 1 dia",durationHours:24},
"99-3day":{priceC:6799,label:"Pacote 99 Taxa Zero · 3 dias",durationHours:72},
"99-200":{priceC:2599,label:"Pacote 99 Taxa Zero · limite R$ 200",earningCapC:20000},
"99-600":{priceC:6299,label:"Pacote 99 Taxa Zero · limite R$ 600",earningCapC:60000}};
function planChoices(form,platforms){
 const choices=[];
 if(platforms.includes("99")){
  const code=fval(form,"plan99");if(code&&code!=="none"){
   const template=tariffPlans99[code]||{label:"Pacote 99 Taxa Zero · outro",priceC:0};
   const price=cent(fval(form,"plan99Price"));if(!Number.isFinite(price)||price<=0)throw Error("Informe o valor pago pelo pacote 99.");
   choices.push({platform:"99",code,label:template.label,priceC:price,paidNow:fval(form,"plan99Payment")==="new",
     earningCapC:template.earningCapC||null,durationHours:template.durationHours||null,source:"informado pelo motorista"});
  }
 }
 if(platforms.includes("Uber")){
  const code=fval(form,"planUber");if(code&&code!=="variable"){
   const price=cent(fval(form,"planUberPrice"));if(!Number.isFinite(price)||price<=0)throw Error("Informe o valor do Passe Uber.");
   choices.push({platform:"Uber",code,label:code==="pass"?"Passe para Motoristas Uber":"Plano Uber personalizado",priceC:price,
     paidNow:fval(form,"planUberPayment")==="new",source:"informado pelo motorista"});
  }
 }
 return choices;
}


/* A daily driving goal is per shift, never reset at midnight. Safely advisory, not a guarantee of profit. */
let goalTimerId=null;
function dailyGoalState(shift){
 const settings=finance?.settings||opt;
 const target=Math.max(100,Math.round(Number(shift?.dailyGoalC??settings.dailyGoalC??15000)));
 const cap=Math.max(30,Math.round(Number(shift?.maxShiftMinutes??settings.maxShiftMinutes??300)));
 const gross=Math.max(0,Number(shift?.grossC)||0);
 const start=shift?.startedAt?Date.parse(shift.startedAt):NaN;
 const elapsed=shift?.status==="active"&&Number.isFinite(start)?Math.max(0,Math.floor((Date.now()-start)/60000)):null;
 return {target,cap,gross,pct:Math.min(100,Math.max(0,Math.round(gross*100/target))),remaining:Math.max(0,target-gross),met:gross>=target,elapsed,timeReached:elapsed!==null&&elapsed>=cap};
}
function readableMinutes(total){
 const n=Math.max(0,Math.floor(total)),h=Math.floor(n/60),m=n%60;
 return (h?String(h)+"h":"")+(m?String(m).padStart(h?2:1,"0")+"min":"");
}
function dailyGoalCard(shift){
 const t=dailyGoalState(shift),isLive=shift?.status==="active";
 let state="Comece um turno e acompanhe sua meta aqui.";
 if(isLive){state=t.met?"Meta alcançada! Finalize a corrida atual e considere encerrar para descansar.":t.timeReached?"Limite de tempo atingido. Priorize encerrar e descansar, mesmo sem a meta.":"Faltam "+BRL(t.remaining)+" para sua meta de faturamento.";}
 const timeMessage=isLive?(t.elapsed===null?"Tempo não disponível":readableMinutes(t.elapsed)+" rodando · máximo de "+readableMinutes(t.cap)):("Tempo máximo sugerido: "+readableMinutes(t.cap));
 const barLabel=t.met?"Meta alcançada":isLive?BRL(t.remaining)+" restantes":"Seu próximo turno";
 return '<section class="goal-panel '+(t.met?"goal-completed ":"")+(t.timeReached?"goal-time-up ":"")+'" '+(isLive?'data-live="1"':"")+' aria-label="Referência de faturamento por turno">'+
 '<div class="goal-head"><span><span class="goal-spark">◎</span> REFERÊNCIA POR TURNO</span><strong>'+BRL(t.target)+'</strong></div>'+
 '<div class="goal-main"><b>'+BRL(isLive?t.gross:0)+'</b><span>'+esc(barLabel)+'</span></div>'+
 '<div class="goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+t.pct+'"><div style="width:'+t.pct+'%"></div></div>'+
 '<div class="goal-foot"><small>'+esc(state)+'</small><small class="goal-clock" id="goalTimeText">'+esc(timeMessage)+'</small></div>'+
 '<p class="goal-caveat">Meta de faturamento bruto, não de lucro. Combustível e reserva do carro são calculados separadamente. Nunca continue dirigindo cansado para atingir um número.</p>'+
 '</section>';
}


/* Weekly goal: local Monday-Sunday, each shift counted once by its start date. */
function localDateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function weekBounds(anchor=today()){
 const [y,m,d]=anchor.split("-").map(Number);
 const dt=new Date(y,m-1,d,12);
 if(!Number.isFinite(dt.getTime()))throw Error("Data inválida para calcular a meta semanal.");
 const mondayOffset=(dt.getDay()+6)%7;
 dt.setDate(dt.getDate()-mondayOffset);
 const start=localDateKey(dt);
 dt.setDate(dt.getDate()+6);
 const end=localDateKey(dt);
 return {start,end};
}
function weeklyGoalState(anchor=today()){
 const startDate=finance?.settings?.weeklyStartDate||null;
 const actualWeek=weekBounds(anchor);
 const upcoming=Boolean(startDate&&actualWeek.end<startDate);
 const {start,end}=weekBounds(upcoming?startDate:anchor);
 const weeklyGoalC=Math.max(100,Number(finance?.settings?.weeklyGoalC??opt.weeklyGoalC));
 const entries=(finance?.shifts||[]).filter(s=>typeof s.date==="string"&&s.date>=start&&s.date<=end&&(!startDate||s.date>=startDate));
 const grossC=entries.reduce((n,s)=>n+(Number(s.grossC)||0),0);
 const remainingC=Math.max(0,weeklyGoalC-grossC);
 return {start,end,startDate,upcoming,target:weeklyGoalC,gross:grossC,remaining:remainingC,
  shifts:entries.length,percent:Math.min(100,Math.round(grossC*100/weeklyGoalC)),met:grossC>=weeklyGoalC};
}
function weeklyGoalCard(anchor=today()){
 const g=weeklyGoalState(anchor);
 const days=finance?.settings?.workDaysPerWeek??4;
 const daily=finance?.settings?.dailyGoalC??15000;
 return '<section class="weekly-goal '+(g.met?"weekly-success":"")+'" aria-label="Meta semanal de ganhos">'+
 '<div class="weekly-top"><span class="weekly-kicker">'+(g.upcoming?'PRÓXIMA META SEMANAL':'META SEMANAL')+'</span><span class="weekly-dates">'+esc(when(g.start))+' – '+esc(when(g.end))+'</span></div>'+
 '<div class="weekly-number">'+BRL(g.gross)+' <span>/ '+BRL(g.target)+'</span></div>'+
 '<div class="weekly-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+g.percent+'"><div style="width:'+g.percent+'%"></div></div>'+
 '<div class="weekly-bottom"><strong>'+(g.upcoming?'Começa em '+when(g.start):g.met?'Meta semanal alcançada!':BRL(g.remaining)+' para atingir a meta')+'</strong><small>'+g.shifts+' turno(s) '+(g.upcoming?'previstos':'nesta semana')+' · '+g.percent+'%</small></div>'+
 '<p class="weekly-help">'+(g.upcoming?'A próxima meta está agendada. O turno anterior continua no histórico, fora deste progresso.':
 g.met?'Você cumpriu a meta semanal. Não precisa ampliar a jornada por obrigação.':
 'Planejamento flexível: '+days+' turno(s)/semana · referência de '+BRL(daily)+' por turno. Comece conforme disponibilidade e movimento dos aplicativos; descanso primeiro.')+
 ' Valores brutos da operação, antes dos custos; turnos que atravessam a meia-noite contam pela data de início.</p></section>';
}


/* Project of the car — one source of reserve: existing compute().car + compute().wear.
   Purchases paid from this fund are debited here, NOT duplicated in operating expenses. */
let editCarItemId="",editCarPaymentId="",newPaymentItemId="";
const projectCategories=[["mecanica","Mecânica"],["pneus","Pneus"],["iluminacao","Iluminação"],["exterior","Exterior"],["interior","Interior"],["servicos","Serviços e instalação"]];
const projectStates=[["planejado","Planejado"],["reservando","Reservando"],["comprado","Comprado"],["instalado","Instalado"],["cancelado","Cancelado"]];
const projectSources=[["fundo","Fundo do carro"],["externo","Dinheiro de fora do fundo"],["despesa","Despesa operacional já lançada"]];
const projectTypes=[["compra","Compra"],["servico","Serviço ou instalação"]];
const projectItem=(id)=>finance?.carProject?.items?.find(x=>x.id===id);
const resolvedProjectPayment=(p,d=finance)=>{
 if(p.source!=="despesa")return {...p,amountC:Number(p.amountC)||0,invalid:false};
 const linked=(d.expenses||[]).find(ex=>ex.id===p.expenseId);
 return {...p,amountC:linked?(Number(linked.amountC)||0):0,invalid:!linked};
};
function projectSummary(){
 const a=compute(),d=finance||defaults(),p=d.carProject||defaults().carProject;
 const payments=(p.payments||[]).map(x=>resolvedProjectPayment(x,d));
 const legacySpent=(d.goals||[]).reduce((n,g)=>n+(Number(g.purchase?.appliedC)||0),0);
 const generated=Math.max(0,(Number(a.car)||0)+(Number(a.wear)||0));
 const fundPaid=payments.filter(x=>x.source==="fundo").reduce((n,x)=>n+x.amountC,0);
 const available=Math.max(0,generated-fundPaid-legacySpent);
 const deficit=Math.max(0,fundPaid+legacySpent-generated);
 const items=(p.items||[]).filter(x=>x.active!==false&&x.status!=="cancelado");
 const plannedC=items.reduce((n,x)=>n+(x.targetC===null||x.targetC===undefined?0:Number(x.targetC)||0),0);
 const pendingCount=items.filter(x=>x.targetC===null||x.targetC===undefined).length;
 const actualPaid=payments.filter(x=>!x.invalid).reduce((n,x)=>n+x.amountC,0);
 const paidProjectItems=payments.filter(x=>!x.invalid&&items.some(i=>i.id===x.itemId));
 const remainingByItem=items.reduce((n,item)=>{
  if(item.targetC===null||item.targetC===undefined)return n;
  const paid=paidProjectItems.filter(x=>x.itemId===item.id).reduce((sum,x)=>sum+x.amountC,0);
  return n+Math.max(0,(Number(item.targetC)||0)-paid);
 },0);
 return {generated,fundPaid,legacySpent,available,deficit,plannedC,pendingCount,actualPaid,
  remainingByItem,toFinance:Math.max(0,remainingByItem-available),payments,items};
}
function projectItemPaid(itemId,s){
 return s.payments.filter(p=>p.itemId===itemId&&!p.invalid).reduce((n,p)=>n+p.amountC,0);
}
function projectBadge(item){
 const known=projectStates.find(x=>x[0]===item.status)?.[1]||"Planejado";
 return '<span class="car-tag car-status-'+esc(item.status||"planejado")+'">'+esc(known)+'</span>';
}
function projectFormOptions(values,current){return values.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===current?"selected":"")+'>'+esc(x[1])+'</option>').join("")}
function carProjectPage(){
 const d=finance.carProject||defaults().carProject,s=projectSummary();
 const ordered=(d.items||[]).slice().sort((a,b)=>Number(a.priority||3)-Number(b.priority||3)||String(a.code||"").localeCompare(String(b.code||""),"pt-BR"));
 const item=projectItem(editCarItemId),payment=(d.payments||[]).find(x=>x.id===editCarPaymentId);
 const selectedItem=payment?.itemId||newPaymentItemId||ordered.find(x=>x.active!==false)?.id||"";
 const vehicle=d.vehicle||defaults().carProject.vehicle;
 const pack=ordered.filter(x=>x.bundle==="primeiro"&&x.active!==false);
 const packTotal=pack.reduce((n,x)=>n+(Number(x.targetC)||0),0);
 const paySelect=ordered.filter(x=>x.status!=="cancelado").map(x=>[x.id,(x.code?x.code+" · ":"")+x.name]);
 const paidItems=s.payments.slice().reverse();
 const recent=paidItems.length?paidItems.map(p=>{
  const g=projectItem(p.itemId),whenPaid=p.date?when(p.date):"Sem data";
  const category=projectCategories.find(c=>c[0]===g?.category)?.[1]||"Outros";
  return '<div class="car-payment-history"><div class="row"><b>'+esc(g?.name||"Item removido")+'</b><b>'+BRL(p.amountC)+'</b></div>'+
   '<p>'+whenPaid+' · '+esc(category)+' · '+esc(projectTypes.find(x=>x[0]===p.type)?.[1]||"Pagamento")+' · '+esc(projectSources.find(x=>x[0]===p.source)?.[1]||"Outro")+(p.invalid?' · VÍNCULO DA DESPESA EXCLUÍDO':'')+'</p>'+
   (p.note?'<p>'+esc(p.note)+'</p>':"")+
   '<div class="car-actions"><button type="button" data-project-action="editpay" data-project-id="'+esc(p.id)+'">Editar</button><button type="button" data-project-action="delpay" data-project-id="'+esc(p.id)+'">Excluir lançamento</button></div></div>';
 }).join(""):'<p class="muted">Nenhuma compra ou serviço pago foi lançado. Produtos planejados não debitam o fundo.</p>';
 const list=ordered.map(x=>{
  const spent=projectItemPaid(x.id,s),known=x.targetC!==null&&x.targetC!==undefined;
  const missing=known?Math.max(0,(Number(x.targetC)||0)-spent):null;
  const percent=known&&x.targetC>0?Math.min(100,Math.round(spent*100/x.targetC)):0;
  const inactive=x.active===false;
  return '<article class="car-item '+(inactive?'car-inactive':'')+'"><div class="car-item-top"><div class="car-item-title"><span class="car-code">'+esc(x.code||"")+'</span><b>'+esc(x.name)+'</b></div>'+projectBadge(x)+'</div>'+
   '<div class="car-labels"><span>'+esc(projectCategories.find(c=>c[0]===x.category)?.[1]||x.category||"Outros")+'</span><span>Prioridade '+esc(x.priority||3)+'</span><span>'+esc(x.quantity||1)+' un.</span>'+(inactive?'<span>Opcional / inativo</span>':"")+(x.bundle==="primeiro"?'<span>Primeiro pacote</span>':"")+'</div>'+
   '<div class="car-prices"><div><small>Preço de referência</small><b>'+(known?BRL(x.targetC):"A cotar")+'</b></div><div><small>Pago</small><b>'+BRL(spent)+'</b></div><div><small>Ainda falta</small><b>'+(known?BRL(missing):"Preço pendente")+'</b></div></div>'+
   '<div class="car-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><div style="width:'+percent+'%"></div></div>'+
   (x.notes?'<p class="car-note">'+esc(x.notes)+'</p>':"")+
   '<div class="car-actions"><button type="button" data-project-action="edititem" data-project-id="'+esc(x.id)+'">Editar</button>'+
   '<button type="button" data-project-action="addpay" data-project-id="'+esc(x.id)+'">Registrar pagamento</button>'+
   (x.status==="comprado"?'<button type="button" data-project-action="install" data-project-id="'+esc(x.id)+'">Instalado</button>':"")+
   '<button type="button" data-project-action="delitem" data-project-id="'+esc(x.id)+'">Excluir</button></div></article>';
 }).join("");
 return '<div class="section-overline">FINANÇAS DO VEÍCULO</div><h1>Projeto do Carro</h1>'+
 '<p class="desc">'+esc(vehicle.model||"Renault Kwid")+' · '+esc(String(vehicle.manufactureYear||2021))+'/'+esc(String(vehicle.modelYear||2022))+' · '+esc(vehicle.color||"Branco")+' · '+esc(vehicle.wheels||"Aro 14")+'</p>'+
 '<section class="car-balance"><span class="eyebrow">SALDO DISPONÍVEL DO FUNDO</span><div class="car-balance-value">'+BRL(s.available)+'</div>'+
 '<div class="car-balance-lines">'+line("Provisão acumulada calculada",BRL(s.generated))+line("Compras pagas pelo fundo","− "+BRL(s.fundPaid))+
 (s.legacySpent?line("Baixas antigas de metas","− "+BRL(s.legacySpent)):"")+
 (s.deficit?line("Diferença a regularizar",BRL(s.deficit)):"")+'</div>'+
 '<p>Saldo calculado com a reserva que o RodaCaixa já gera nos turnos, incluindo desgaste. Não representa saldo bancário confirmado. Nenhuma reserva adicional foi criada.</p></section>'+
 '<div class="car-summary-grid"><div><small>Itens com preço conhecido</small><b>'+BRL(s.plannedC)+'</b></div>'+
 '<div><small>Pago em compras/serviços</small><b>'+BRL(s.actualPaid)+'</b></div>'+
 '<div><small>Falta pagar nos itens cotados</small><b>'+BRL(s.remainingByItem)+'</b></div>'+
 '<div><small>Ainda falta financiar</small><b>'+BRL(s.toFinance)+'</b></div></div>'+
 '<div class="car-alert">Preços de anúncios são referências. Existem '+s.pendingCount+' metas ativas sem preço definido; o orçamento final será maior. O fundo não é comprometido por itens apenas planejados.</div>'+
 '<section class="car-bundle"><div class="row"><b>Primeiro Pacote — Kwid</b><strong>'+BRL(packTotal)+'</strong></div><small>'+pack.map(x=>esc(x.name)).join(" · ")+'</small><p>Itens independentes. Duto condicionado à avaliação mecânica; pneus e segurança têm preferência sobre estética.</p></section>'+
 '<div class="car-section-head"><h2>Metas e serviços</h2><span>'+ordered.length+' registros</span></div>'+
 '<div class="car-items">'+(list||'<p>Nenhuma meta cadastrada.</p>')+'</div>'+
 '<details class="car-form-section" '+(item?'open':"")+' id="carItemSection"><summary>'+(item?'Editar item: '+esc(item.name):'+ Adicionar meta ou serviço')+'</summary>'+
 '<form id="carItemForm">'+
 inpt("name","Nome","text",item?.name||"","required maxlength=120")+
 '<div class="grid">'+inpt("code","Código","text",item?.code||"","maxlength=25")+
 inpt("quantity","Quantidade","number",item?.quantity??1,"required min=1 max=99 step=1")+'</div>'+
 '<label>Categoria<select name="category">'+projectFormOptions(projectCategories,item?.category||"mecanica")+'</select></label>'+
 inpt("target","Preço TOTAL de referência (R$; deixe vazio se pendente)","number",item?.targetC!=null?fmtMoneyInput(item.targetC):"","min=0 step=0.01 inputmode=decimal")+
 '<div class="grid"><label>Prioridade (1 = mais urgente)<select name="priority">'+projectFormOptions([[1,"1 — Urgente"],[2,"2 — Alta"],[3,"3 — Média"],[4,"4 — Baixa"],[5,"5 — Opcional"]],item?.priority??3)+'</select></label>'+
 '<label>Status<select name="status">'+projectFormOptions(projectStates,item?.status||"planejado")+'</select></label></div>'+
 '<label>Grupo<select name="bundle">'+projectFormOptions([["","Sem grupo"],["primeiro","Primeiro Pacote — Kwid"]],item?.bundle||"")+'</select></label>'+
 '<label class="car-checkbox"><input type="checkbox" name="active" '+(item?.active===false?"":"checked")+'> Incluído no orçamento ativo</label>'+
 '<label>Observações<textarea name="notes" rows="3" maxlength="1000">'+esc(item?.notes||"")+'</textarea></label>'+
 '<button class="btn block" type="submit">'+(item?"Salvar alterações":"Adicionar meta planejada")+'</button>'+
 (item?'<button type="button" class="btn secondary block" data-project-action="clearitem">Cancelar edição</button>':"")+
 '</form></details>'+
 '<details class="car-form-section" '+(payment||newPaymentItemId?'open':"")+' id="carPaymentSection"><summary>'+(payment?"Editar pagamento":'+ Registrar compra, pagamento ou serviço')+'</summary>'+
 '<form id="carPaymentForm"><label>Meta / serviço<select name="itemId">'+projectFormOptions(paySelect,selectedItem)+'</select></label>'+
 '<div class="grid">'+inpt("date","Data real do pagamento","date",payment?.date||today(),"required")+
 inpt("amount","Valor efetivamente pago (R$)","number",payment?fmtMoneyInput(payment.amountC):"","required min=0.01 step=0.01 inputmode=decimal")+'</div>'+
 '<label>Tipo<select name="type">'+projectFormOptions(projectTypes,payment?.type||"compra")+'</select></label>'+
 '<label>Origem do dinheiro<select name="source">'+projectFormOptions(projectSources,payment?.source||"fundo")+'</select></label>'+
 '<label>Vincular despesa operacional (obrigatório só se escolher essa origem)<select name="expenseId"><option value="">Selecione a despesa registrada</option>'+
 (finance.expenses||[]).map(e=>'<option value="'+esc(e.id)+'" '+(payment?.expenseId===e.id?"selected":"")+'>'+esc(when(e.date))+' · '+esc(e.category)+' · '+BRL(e.amountC)+'</option>').join("")+'</select></label>'+
 '<p class="field-hint">Use Fundo do carro para compras pagas com a reserva calculada. Não lance novamente em Gastos. Se já lançou em Gastos, apenas vincule a despesa existente.</p>'+
 '<label>Comprovante/observações<textarea name="note" rows="2" maxlength="800">'+esc(payment?.note||"")+'</textarea></label>'+
 '<button class="btn block" type="submit">'+(payment?"Salvar alterações do pagamento":"Confirmar pagamento real")+'</button>'+
 (payment?'<button type="button" class="btn secondary block" data-project-action="clearpay">Cancelar edição</button>':"")+
 '</form></details>'+
 '<div class="car-section-head"><h2>Histórico de pagamentos</h2><span>'+s.payments.length+' lançamento(s)</span></div><div class="car-payments">'+recent+'</div>'+
 '<div class="help">Prioridade de segurança: inspeção da trepidação e estado dos pneus. LED externo, capas de banco e demais acessórios dependem de compatibilidade e, quando aplicável, regularidade legal. Instalação somente após avaliação.</div>';
}

start();
})();