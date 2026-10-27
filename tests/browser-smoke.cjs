/* Browser smoke test: real interface, mocked Supabase session/ledger, no real credentials. */
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.join(process.cwd(),p==="/"?"/index.html":p);
 if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end("not found");return}
 res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});res.end(fs.readFileSync(file));
});
const mock=[
'(()=>{const user={id:"00000000-0000-4000-8000-000000000001",email:"teste@example.com"};',
'const key="mock_ledger",login="mock_login",session=()=>localStorage.getItem(login)==="yes"?{user}:null;',
'const get=()=>{const x=localStorage.getItem(key);return x?JSON.parse(x):null};',
'window.supabase={createClient:()=>({',
'auth:{getSession:async()=>({data:{session:session()},error:null}),',
'getUser:async()=>({data:{user:session()?.user||null},error:null}),',
'signInWithPassword:async()=>{localStorage.setItem(login,"yes");return{data:{session:session()},error:null}},',
'signOut:async()=>{localStorage.removeItem(login);return{error:null}},',
'onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},',
'from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{const x=get();return{data:x?{data:x.data,revision:x.rev,updated_at:x.saved}:null,error:null}}})})}),',
'rpc:async(name,args)=>{const old=get(),rev=old?.rev||0;if(name!=="save_driver_ledger"||args.expected_revision!==rev)return{data:null,error:{message:"Conflito de sincronização"}};',
'const saved={rev:rev+1,data:args.next_data,saved:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(saved));return{data:[{new_revision:saved.rev,saved_at:saved.saved}],error:null}},',
'storage:{from:()=>({upload:async()=>({error:null})})}})};',
'})();'
].join("\n");
async function run(){
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const bin=["/usr/bin/google-chrome","/usr/bin/chromium"].find(fs.existsSync);if(!bin)throw Error("Chrome runner absent");
 const browser=await chromium.launch({executablePath:bin,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",x=>errors.push(x.message));
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.js",route=>route.fulfill({status:200,contentType:"application/javascript",body:mock}));
  await page.goto("http://127.0.0.1:"+server.address().port+"/",{waitUntil:"load"});
  await page.locator("#authForm input[name=email]").fill("teste@example.com");
  await page.locator("#authForm input[name=password]").fill("pass12345678");
  await page.locator("#authForm button[type=submit]").click();
  await page.locator(".app-main h1").waitFor();
  assert.match(await page.locator(".app-main h1").innerText(),/Seu trabalho/);
  assert.match(await page.locator(".weekly-goal").innerText(),/600,00/);
  assert.match(await page.locator(".weekly-goal").innerText(),/600,00 para atingir a meta/);

  assert.match(await page.locator(".goal-panel").innerText(),/R\$\s?150,00/);
  assert.match(await page.locator(".goal-panel").innerText(),/5h/);
  await page.locator(".footnav [data-go=ajustes]").click();
  assert.equal(await page.locator('#settingsForm input[name="dailyGoal"]').inputValue(),"150.00");
  assert.equal(await page.locator('#settingsForm input[name="weeklyGoal"]').inputValue(),"600.00");
  assert.equal(await page.locator('#settingsForm input[name="maxHours"]').inputValue(),"5.0");
  await page.locator(".footnav [data-go=inicio]").click();
  await page.locator(".footnav [data-go=turno]").click();
  await page.locator("#startShiftForm input[name=startKm]").fill("43000");
  await page.locator("#startShiftForm button[type=submit]").click();
  await page.locator(".status-strip").waitFor();
  await page.reload({waitUntil:"load"});
  await page.locator(".status-strip").waitFor();
  await page.locator(".footnav [data-go=turno]").click();
  await page.locator("[data-open-ride]").click();
  await page.locator('#rideForm input[name="value"]').fill("20.50");
  await page.locator('#rideForm input[name="km"]').fill("9.4");
  await page.locator('#rideForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector(".live-hero .big")?.textContent?.includes("20,50"));
  assert.match(await page.locator(".goal-panel").innerText(),/129,50/);
  await page.locator("[data-close-panel]").click();
  await page.locator('#endShiftForm input[name="endKm"]').fill("43017.5");
  await page.locator('#endShiftForm button[type=submit]').click();
  await page.waitForFunction(()=>!!document.querySelector(".stat-section"));
  assert.match(await page.locator(".stat-section").innerText(),/17,5/);
  // A new shift with both 99 and Uber; charge 99 package only once.
  await page.locator(".footnav [data-go=turno]").click();
  await page.locator("#useMultiple").check();
  await page.locator('input[name="otherPlatform"][value="Uber"]').check();
  await page.locator('select[name="plan99"]').selectOption("99-200");
  assert.equal(await page.locator('input[name="plan99Price"]').inputValue(),"25.99");
  await page.locator("#startShiftForm input[name=startKm]").fill("43017.5");
  await page.locator("#startShiftForm button[type=submit]").click();
  await page.locator(".status-strip").waitFor();
  await page.locator("[data-open-ride]").click();
  await page.locator('#rideForm select[name="platform"]').selectOption("Uber");
  await page.locator('#rideForm input[name="value"]').fill("14.50");
  await page.locator('#rideForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector(".live-hero .big")?.textContent?.includes("14,50"));
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.deepEqual(Array.from(data.shifts[1].platforms),["99","Uber"]);
  assert.equal(data.shifts[1].rides[0].platform,"Uber");
  assert.equal(data.expenses.filter(x=>x.kind==="pacote"&&x.planCode==="99-200").length,1);
  assert.equal(data.expenses.find(x=>x.planCode==="99-200").amountC,2599);
  await page.locator("[data-open-ride]").click();
  await page.locator('#rideForm input[name="value"]').fill("140.50");
  await page.locator('#rideForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector(".goal-completed"));
  assert.match(await page.locator(".goal-panel").innerText(),/Meta alcançada/i);
  assert.match(await page.locator(".goal-panel").innerText(),/finalize a corrida/i);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data)).shifts[1].grossC,15500);

  // Real mobile UX: planned goals do not spend, paid purchase debits fund once.
  await page.locator(".footnav [data-go=metas]").click();
  await page.locator(".car-balance-value").waitFor();
  assert.match(await page.locator(".app-main h1").innerText(),/Projeto do Carro/);
  const projectBalance=()=>page.locator(".car-balance-value").innerText().then(x=>Math.round(Number(x.replace(/[^0-9,]/g,"").replace(",","."))*100));
  const balanceBefore=await projectBalance();
  assert.ok(balanceBefore>=2500,"Fund insufficient for test: "+balanceBefore);
  await page.locator("#carItemSection summary").click();
  await page.locator('#carItemForm input[name="name"]').fill("Peça teste");
  await page.locator('#carItemForm input[name="code"]').fill("TEST");
  await page.locator('#carItemForm input[name="target"]').fill("50.00");
  await page.locator('#carItemForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-item")?.textContent.includes("Peça teste"));
  assert.equal(await projectBalance(),balanceBefore);
  let db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.items.length,1);
  assert.equal(db.carProject.payments.length,0);
  assert.equal(db.expenses.length,1);
  assert.equal(await page.locator(".car-combo").count(),5);
  await page.locator('.car-item [data-project-action="edititem"]').click();
  await page.locator('#carItemForm input[name="target"]').fill("55.50");
  await page.locator('#carItemForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-price-history")?.textContent?.includes("Histórico de preços"));
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.items[0].targetC,5550);
  assert.equal(db.carProject.items[0].priceHistory.length,1);
  assert.equal(db.carProject.items[0].priceHistory[0].oldC,5000);
  assert.equal(db.carProject.items[0].priceHistory[0].newC,5550);
  assert.equal(await projectBalance(),balanceBefore);
  await page.locator('.car-item [data-project-action="addpay"]').click();
  await page.locator('#carPaymentForm input[name="amount"]').fill("20.00");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#carPaymentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-payment-history"));
  assert.equal(await projectBalance(),balanceBefore-2000);
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.payments.length,1);
  assert.equal(db.carProject.payments[0].amountC,2000);
  assert.equal(db.carProject.items[0].status,"reservando");
  assert.equal(db.expenses.length,1); // no duplicate operating expense
  // Edit paid amount and then reverse ONLY its bookkeeping entry.
  await page.locator('[data-project-action="editpay"]').click();
  await page.locator('#carPaymentForm input[name="amount"]').fill("25.00");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#carPaymentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-payment-history .row b:last-child")?.textContent?.includes("25,00"));
  assert.equal(await projectBalance(),balanceBefore-2500);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('[data-project-action="delpay"]').click();
  await page.waitForFunction(()=>!document.querySelector(".car-payment-history"));
  assert.equal(await projectBalance(),balanceBefore);
  // An operating expense already posted can be linked without a second debit.
  await page.locator(".footnav [data-go=gastos]").click();
  await page.locator('#expenseForm select[name="category"]').selectOption("Manutenção");
  await page.locator('#expenseForm input[name="amount"]').fill("4.30");
  await page.locator('#expenseForm button').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.expenses.length===2);
  await page.locator(".footnav [data-go=metas]").click();
  const afterExpenseBalance=await projectBalance();
  await page.locator('.car-item [data-project-action="addpay"]').click();
  await page.locator('#carPaymentForm select[name="source"]').selectOption("despesa");
  const opExpense=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.expenses.at(-1).id);
  await page.locator('#carPaymentForm select[name="expenseId"]').selectOption(opExpense);
  assert.equal(await page.locator('#carPaymentForm input[name="amount"]').inputValue(),"4.30");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#carPaymentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-payment-history"));
  assert.equal(await projectBalance(),afterExpenseBalance);
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.payments.length,1);
  assert.equal(db.carProject.payments[0].source,"despesa");
  assert.equal(db.expenses.length,2);
  // A goal with real payments cannot be destroyed before unlinking.
  await page.locator('.car-item [data-project-action="delitem"]').click();
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.items.length,1);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('[data-project-action="delpay"]').click();
  await page.waitForFunction(()=>!document.querySelector(".car-payment-history"));
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('.car-item [data-project-action="delitem"]').click();
  await page.waitForFunction(()=>!document.querySelector(".car-item"));
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.items.length,0);
  assert.equal(db.carProject.payments.length,0);
  assert.equal(db.expenses.length,2);

  // Conditional lighting/air-duct goals require compatibility check before recording purchase.
  await page.locator("#carItemSection summary").click();
  await page.locator('#carItemForm input[name="name"]').fill("Kit LED teste condicionado");
  await page.locator('#carItemForm input[name="target"]').fill("20.00");
  await page.locator('#carItemForm input[name="requiresVerification"]').check();
  await page.locator('#carItemForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-item")?.textContent.includes("Kit LED teste condicionado"));
  await page.locator('.car-item [data-project-action="addpay"]').click();
  await page.locator('#carPaymentForm input[name="amount"]').fill("3.00");
  await page.locator('#carPaymentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#toast")?.textContent?.includes("compatibilidade"));
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.payments.length,0);
  await page.locator('.car-item [data-project-action="edititem"]').click();
  await page.locator('#carItemForm input[name="verificationConfirmed"]').check();
  await page.locator('#carItemForm button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.carProject.items[0].verificationConfirmed===true);
  await page.locator('.car-item [data-project-action="addpay"]').click();
  await page.locator('#carPaymentForm input[name="amount"]').fill("3.00");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#carPaymentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".car-payment-history"));
  db=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(db.carProject.payments.length,1);
  assert.equal(db.carProject.items[0].verificationConfirmed,true);

  // Real iPhone UI: personal withdrawals are recorded from cash and do not alter operations.
  await page.locator(".footnav [data-go=gastos]").click();
  await page.locator("#personalForm").waitFor();
  const beforePersonal=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  const incomeBefore=beforePersonal.shifts.reduce((n,x)=>n+(x.grossC||0),0);
  const expensesBefore=beforePersonal.expenses.length;
  const projectPaidBefore=beforePersonal.carProject.payments.length;
  await page.locator('#personalForm input[name="description"]').fill("Plano TIM");
  await page.locator('#personalForm input[name="amount"]').fill("67.00");
  await page.locator('#personalForm select[name="category"]').selectOption("telefone");
  await page.locator('#personalForm button[type=submit]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.personalWithdrawals?.length===1);
  await page.locator('#personalForm input[name="description"]').fill("Alimentação e compras para casa");
  await page.locator('#personalForm input[name="amount"]').fill("28.00");
  await page.locator('#personalForm select[name="category"]').selectOption("alimentacao");
  await page.locator('#personalForm button[type=submit]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.personalWithdrawals?.length===2);
  let personalState=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(personalState.personalWithdrawals.reduce((n,x)=>n+x.amountC,0),9500);
  assert.equal(personalState.shifts.reduce((n,x)=>n+(x.grossC||0),0),incomeBefore);
  assert.equal(personalState.expenses.length,expensesBefore);
  assert.equal(personalState.carProject.payments.length,projectPaidBefore);
  assert.match(await page.locator("#personalSpending .personal-spent-total").innerText(),/95,00/);
  await page.locator('[data-personal-action="edit"]').first().click();
  await page.locator('#personalForm input[name="amount"]').fill("28.50");
  await page.locator('#personalForm button[type=submit]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.personalWithdrawals.some(x=>x.amountC===2850));
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('[data-personal-action="remove"]').first().click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.personalWithdrawals?.length===1);



  // Cash-paid fuel top-ups: create two receipts and keep them out of operational expenses.
  await page.locator("#fuelPurchaseForm").waitFor();
  const beforeFuel=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  const expenseCountBeforeFuel=beforeFuel.expenses.length;
  const carPurchasesBeforeFuel=beforeFuel.carProject.payments.length;
  await page.locator('#fuelPurchaseForm input[name="amount"]').fill("30.00");
  await page.locator('#fuelPurchaseForm button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.fuelPurchases?.length===1);
  await page.locator('#fuelPurchaseForm input[name="amount"]').fill("70.00");
  await page.locator('#fuelPurchaseForm button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.fuelPurchases?.length===2);
  const fuelState=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(fuelState.fuelPurchases.reduce((n,x)=>n+x.amountC,0),10000);
  assert.equal(fuelState.fuelPurchases.every(x=>x.fundingSource==="cash_99"),true);
  assert.equal(fuelState.expenses.length,expenseCountBeforeFuel);
  assert.equal(fuelState.carProject.payments.length,carPurchasesBeforeFuel);
  assert.match(await page.locator("#fuelTracker .personal-spent-total").innerText(),/100,00/);

  // The urgent goal is loaded from persisted ledger and cannot deduct the car reserve.
  await page.evaluate(()=>{
   const x=JSON.parse(localStorage.getItem("mock_ledger"));
   x.data.urgentGoal={id:"test-urgent",startDate:"2026-10-27",dueDate:"2026-11-03",
    bills:[{id:"a",label:"Conta fixa A",targetC:55000},{id:"b",label:"Conta fixa B",targetC:40000},
      {id:"c",label:"Conta fixa C",targetC:30000},{id:"d",label:"Conta fixa D",targetC:7000}],
    transfers:[],payments:[]};
   x.rev++;
   localStorage.setItem("mock_ledger",JSON.stringify(x));
  });
  await page.reload({waitUntil:"load"});
  await page.locator(".urgent-card").waitFor();
  assert.match(await page.locator(".urgent-card").innerText(),/1.320,00/);
  await page.locator('.urgent-card [data-go="urgente"]').click();
  await page.locator("#urgentReserveForm").waitFor();
  await page.locator('#urgentReserveForm input[name="amount"]').fill("20.00");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#urgentReserveForm button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.urgentGoal.transfers.length===1);
  await page.locator('#urgentPayForm input[name="amount"]').fill("10.00");
  await page.locator('#urgentPayForm select[name="source"]').selectOption("reservado");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('#urgentPayForm button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.urgentGoal.payments.length===1);
  const urg=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.urgentGoal);
  assert.equal(urg.transfers.reduce((n,v)=>n+v.amountC,0),2000);
  assert.equal(urg.payments.reduce((n,v)=>n+v.amountC,0),1000);
  // Batch text mode: paste a 99 history segment, review, import as real ride.
  await page.locator('.footnav [data-go="turno"]').click();
  await page.locator('[data-go="captura"]').click();
  await page.locator(".capture-paste summary").click();
  await page.locator("#capturePasteText").waitFor();
  const mostRecent=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.shifts.at(-1));
  const formattedDate=mostRecent.date.split("-").reverse().join("/");
  const sourceClock=mostRecent.start||"23:59";
  await page.locator("#capturePasteText").fill([formattedDate+" "+sourceClock,
   "Ganhos pagos no app","Pop R$12,34","Rua Um, Maceió - AL","Rua Dois, Maceió - AL","Pedido finalizado"].join("\n"));
  await page.locator("#captureReadText").click();
  await page.locator(".capture-row").waitFor();
  assert.equal(await page.locator(".capture-row").count(),1);
  assert.equal(await page.locator('.capture-row input[name="amount"]').inputValue(),"12.34");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#captureCommit").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.shifts.at(-1).rides.some(r=>r.source==="ocr99"));
  const afterBatch=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data);
  assert.equal(afterBatch.shifts.at(-1).rides.filter(r=>r.source==="ocr99").length,1);
  assert.equal(afterBatch.shifts.at(-1).rides.find(r=>r.source==="ocr99").valueC,1234);
  assert.equal(afterBatch.urgentGoal.transfers.length,1);
  assert.equal(afterBatch.personalWithdrawals.length,1);

  // Mock only the recognition engine: verify MULTIPLE iPhone images, duplicate filtering,
  // private receipt uploads and attachment references in a real browser form.
  await page.route("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",route=>
    route.fulfill({status:200,contentType:"application/javascript",
      body:"window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:window.__mockOcrText}})})};"}));
  await page.locator(".footnav [data-go=turno]").click();
  await page.locator('[data-go="captura"]').click();
  await page.evaluate(text=>{window.__mockOcrText=text},[
    formattedDate+" "+sourceClock,"Ganhos pagos no app","Pop Expresso R$4,32",
    "Rua Um, Maceió - AL","Rua Dois, Maceió - AL","Pedido finalizado"].join("\n"));
  await page.locator("#captureImages").setInputFiles([
   {name:"primeiro.png",mimeType:"image/png",buffer:Buffer.from("image-test-1")},
   {name:"segundo.png",mimeType:"image/png",buffer:Buffer.from("image-test-2")}
  ]);
  await page.locator("#captureReadImages").click();
  await page.waitForFunction(()=>document.querySelector(".capture-row"));
  assert.equal(await page.locator(".capture-row").count(),1); // overlapping screenshots deduped
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#captureCommit").click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.shifts.at(-1).screenshots?.length===2);
  const evidenceState=await page.evaluate(()=>JSON.parse(localStorage.getItem("mock_ledger")).data.shifts.at(-1));
  assert.equal(evidenceState.screenshots.length,2);
  assert.equal(await page.locator(".capture-gallery [data-capture-open]").count(),2);
  assert.equal(evidenceState.rides.filter(r=>r.source==="ocr99").length,2);
  assert.equal(evidenceState.rides.at(-1).valueC,432);
  assert.ok(evidenceState.rides.at(-1).evidence.path.includes("99-batch"));
  assert.equal(evidenceState.km,0); // estimates never change vehicle odometer


  assert.equal(errors.length,0,errors.join(" | "));
  console.log("PASS: mobile login, start, reload, ride, finish, financial dashboard");
 }finally{await browser.close()}
}
run().then(()=>server.close(),err=>{console.error(err);server.close();process.exitCode=1});
