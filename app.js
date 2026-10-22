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
 finally{saving=false}
}
function home(){
 const a=compute();
 return title("Visão geral","Faturamento, custos operacionais e dinheiro destinado ao carro.")+
 '<div class="hero"><div class="eyebrow">Resultado operacional acumulado</div><div class="big">'+BRL(a.result)+'</div><p class="muted">Estimativa após custos e provisão, não saldo em banco.</p>'+line("Corridas recebidas",BRL(a.gross))+line("Gasolina calculada","− "+BRL(a.fuel))+line("Pacotes e outros custos","− "+BRL(a.packages+a.extra+a.extraShifts))+line("Reserva para desgaste","− "+BRL(a.wear))+'</div>'+
 '<div class="grid"><div class="card"><span class="muted">Para mim</span><div class="number">'+BRL(a.personal)+'</div><span class="mini">Parcela prevista</span></div><div class="card"><span class="muted">Para o carro</span><div class="number">'+BRL(a.car)+'</div><span class="mini">Parcela prevista</span></div></div>'+
 '<div class="card"><div class="eyebrow">Meta de reserva por dia trabalhado</div><div class="big">'+BRL(a.daily)+'</div><p class="muted">Metas com valor e prazo definidos. Não é faturamento bruto necessário.</p>'+line("Turnos registrados",String(finance.shifts.length))+line("KM de trabalho",a.km.toFixed(1)+" km")+line("Receita por KM",a.km?BRL(a.gross/a.km):"—")+line("Resultado por hora",a.mins?BRL(a.result*60/a.mins):"—")+line("Fundo livre do carro",BRL(a.free))+'</div>'+
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
 '<h2>Histórico de turnos</h2><div class="list">'+(finance.shifts.length?finance.shifts.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>'<div class="entry"><div class="row"><b>'+when(x.date)+' · '+esc(x.platform||"99")+'</b><b>'+BRL(x.grossC)+'</b></div><p>'+Number(x.km).toFixed(1)+' km · Odômetro: '+esc(x.odoStart??"—")+' → '+esc(x.odoEnd??"—")+'</p><div class="actions"><button class="btn secondary tiny" data-editturn="'+esc(x.id)+'">Editar</button><button class="btn danger tiny" data-remturn="'+esc(x.id)+'">Excluir</button></div></div>').join(""):'<div class="help">Ainda não há turnos.</div>')+'</div>';
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
 const f=$("#turnForm");if(f){const u=()=>{const a=num(fval(f,"os")),b=num(fval(f,"oe"));$("#kmtext").textContent=fval(f,"oe")&&b>a?"KM total calculado: "+(b-a).toFixed(1)+" km":"Preencha início e fim do odômetro (fim maior que início)."};f.addEventListener("input",u);u()}
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
start();
})();