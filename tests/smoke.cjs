/* Offline smoke tests for RodaCaixa business rules; no real Supabase traffic. */
const {readFileSync}=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
let code=readFileSync("app.js","utf8");
assert.match(code,/start\(\);\s*\}\)\(\);\s*$/);
code=code.replace(/start\(\);\s*\}\)\(\);\s*$/,'globalThis.__test={defaults,normalize,compute,activeTurn,shiftRides,kmRide,sumRide,guessAmounts,datetimeLocal,weekBounds,weeklyGoalState,weeklyGoalCard,projectSummary,projectItemPaid,projectComboSummaries,personalSummary,urgentState,fuelPurchaseSummary,pendingOdometerSummary,setFinance:(v)=>finance=v};})();');
const root={innerHTML:""},toast={classList:{add(){},remove(){}},style:{},textContent:""};
const sandbox={document:{getElementById:id=>id==="app"?root:toast},window:{addEventListener(){}},Intl,Date,Number,String,Object,Array,Math,crypto:{randomUUID:()=>"unit-test-id"},console,setTimeout,clearTimeout};
vm.runInNewContext(code,sandbox,{timeout:5000});
const t=sandbox.__test;
const d=t.defaults();
assert.equal(d.version,3);
assert.equal(d.shifts.length,0);
assert.equal(d.goals.length,2);
assert.equal(t.normalize(d).version,3);
assert.throws(()=>t.normalize({version:3,shifts:[]}),/Backup/);
const active={id:"turn1",status:"active",date:"2026-10-23",start:"15:00",odoStart:40000,km:8,grossC:1600,kmPerL:13,fuelPriceC:650,wearPerKmC:15,otherC:0,rides:[{id:"r1",valueC:1000,km:5},{id:"r2",valueC:600,km:3}]};
d.shifts.push(active);
t.setFinance(d);
assert.equal(t.activeTurn().id,"turn1");
assert.equal(t.shiftRides(active).length,2);
assert.equal(t.kmRide(active),8);
assert.equal(t.sumRide(active),1600);
const m=t.compute();
assert.equal(m.gross,1600);
assert.equal(m.km,8);
assert.ok(m.fuel>0);
assert.ok(m.wear>0);
assert.ok(Number.isFinite(m.result));
assert.ok(m.personal+m.car===Math.max(0,m.result));
active.status="closed";
active.odoEnd=40012;
active.km=12;
assert.equal(t.activeTurn(),undefined);
assert.equal(t.compute().km,12);
// Monday-Sunday grouping and an overnight shift counted once by its starting date.
assert.equal(t.weekBounds("2026-10-24").start,"2026-10-19");
assert.equal(t.weekBounds("2026-10-24").end,"2026-10-25");
assert.equal(t.weekBounds("2026-10-26").start,"2026-10-26");
d.settings.weeklyGoalC=60000;
active.date="2026-10-23";active.grossC=17594;
active.start="21:00";active.end="02:14";active.endedAt="2026-10-24T02:14:00-03:00";
let goal=t.weeklyGoalState("2026-10-24");
assert.equal(goal.gross,17594);
assert.equal(goal.remaining,42406);
assert.equal(goal.shifts,1);
assert.equal(goal.met,false);
assert.equal(t.weeklyGoalState("2026-10-26").gross,0);
d.shifts.push({id:"next-week",date:"2026-10-26",grossC:45000,km:0,rides:[],status:"closed"});
assert.equal(t.weeklyGoalState("2026-10-26").gross,45000);
d.shifts.push({id:"same-week",date:"2026-10-24",grossC:42406,km:0,rides:[],status:"closed"});
assert.equal(t.weeklyGoalState("2026-10-24").percent,100);
assert.equal(t.weeklyGoalState("2026-10-24").met,true);
assert.match(t.weeklyGoalCard("2026-10-24"),/Meta semanal alcançada!/);
// Starting next Monday excludes old paid trips from the new goal, but preserves the history.
const scheduled=JSON.parse(JSON.stringify(d));
scheduled.settings.weeklyStartDate="2026-10-26";
scheduled.shifts=scheduled.shifts.filter(s=>s.date<"2026-10-26");
t.setFinance(scheduled);
assert.equal(scheduled.shifts.length,2);
let upcoming=t.weeklyGoalState("2026-10-24");
assert.equal(upcoming.upcoming,true);
assert.equal(upcoming.start,"2026-10-26");
assert.equal(upcoming.end,"2026-11-01");
assert.equal(upcoming.gross,0);
assert.match(t.weeklyGoalCard("2026-10-24"),/Começa em 26\/10\/2026/);
assert.match(t.weeklyGoalCard("2026-10-24"),/R\$\s?600,00/);
assert.equal(t.weeklyGoalState("2026-10-26").gross,0);
scheduled.shifts.push({id:"new-shift",date:"2026-10-27",grossC:15000,km:0,rides:[],status:"closed"});
assert.equal(t.weeklyGoalState("2026-10-27").gross,15000);
assert.equal(t.weeklyGoalState("2026-11-02").gross,0);
t.setFinance(d);

// Car project reuses ONLY the financial engine's existing car+wear allocation.
const projectLedger=t.defaults();
projectLedger.goals=[];projectLedger.expenses=[];
projectLedger.shifts=[{id:"p-shift",status:"closed",date:"2026-10-23",start:"21:00",end:"02:14",km:95.8,grossC:17594,kmPerL:13,fuelPriceC:665,wearPerKmC:15,otherC:0}];
projectLedger.carProject.items=[
 {id:"p1",name:"Duto",category:"mecanica",targetC:22728,quantity:1,status:"planejado",active:true,priority:1},
 {id:"p2",name:"Pneus",category:"pneus",targetC:null,quantity:2,status:"planejado",active:true,priority:1},
 {id:"inactive",name:"Adesivo",category:"exterior",targetC:5771,status:"planejado",active:false,priority:5}
];
t.setFinance(projectLedger);
const operational=t.compute();
assert.equal(operational.gross,17594);
assert.equal(operational.fuel,4901);
assert.equal(operational.wear,1437);
assert.equal(operational.car,5628);
let budget=t.projectSummary();
assert.equal(budget.generated,7065);
assert.equal(budget.available,7065);
assert.equal(budget.plannedC,22728);
assert.equal(budget.pendingCount,1);
assert.equal(budget.remainingByItem,22728);
assert.equal(budget.toFinance,15663);
assert.equal(budget.actualPaid,0);
// A planned goal doesn't create another deposit or debit.
projectLedger.carProject.items[0].targetC=23000;
assert.equal(t.projectSummary().available,7065);
assert.equal(t.projectSummary().toFinance,15935);
// A real fund purchase is a debit ONCE, never an operating expense.
projectLedger.carProject.payments.push({id:"purchase1",itemId:"p1",source:"fundo",type:"compra",date:"2026-10-24",amountC:2000});
budget=t.projectSummary();
assert.equal(budget.available,5065);
assert.equal(budget.fundPaid,2000);
assert.equal(budget.actualPaid,2000);
assert.equal(budget.remainingByItem,21000);
assert.equal(t.compute().gross,operational.gross);
assert.equal(t.compute().result,operational.result);
assert.equal(projectLedger.expenses.length,0);
// Payment edits recompute the balance, without new deposits.
projectLedger.carProject.payments[0].amountC=3500;
assert.equal(t.projectSummary().available,3565);
projectLedger.carProject.payments=[];
assert.equal(t.projectSummary().available,7065);
// Existing operating expenses can be LINKED without charging the fund twice.
projectLedger.expenses.push({id:"oper1",date:"2026-10-24",kind:"extra",category:"Manutenção",amountC:1200});
const baseWithExpense=t.projectSummary();
projectLedger.carProject.payments.push({id:"link1",itemId:"p1",source:"despesa",expenseId:"oper1",amountC:1200,type:"servico",date:"2026-10-24"});
budget=t.projectSummary();
assert.equal(budget.generated,baseWithExpense.generated);
assert.equal(budget.available,baseWithExpense.available);
assert.equal(budget.actualPaid,1200);
// A removed existing expense invalidates the link rather than creating fictitious payment.
projectLedger.expenses=[];
assert.equal(t.projectSummary().payments[0].invalid,true);
assert.equal(t.projectSummary().actualPaid,0);
assert.equal(t.projectSummary().available,7065);
projectLedger.carProject.payments=[];
projectLedger.carProject.items.splice(0,1);
assert.equal(t.projectSummary().plannedC,0);
t.setFinance(d);

// 13 listed products, all bundled once; a bundle is a VIEW, not a duplicate goal.
const prices=[
 ["kwid-a1",22728,"seguranca"],["kwid-a2",90000,"seguranca"],
 ["kwid-b1",13576,"exterior"],["kwid-b2",2290,"exterior"],["kwid-b3",4590,"exterior"],
 ["kwid-c1",13752,"iluminacao"],["kwid-c2",9690,"iluminacao"],
 ["kwid-d1",51277,"praticidade"],["kwid-d2",50508,"interior"],
 ["kwid-d3",3490,"interior"],["kwid-d4",2099,"interior"],
 ["kwid-d5",9952,"praticidade"],["kwid-d6",4295,"praticidade"]
];
assert.equal(prices.reduce((sum,x)=>sum+x[1],0),278247);
const packageLedger=t.defaults();packageLedger.goals=[];
packageLedger.carProject.items=prices.map(([id,targetC,bundle])=>({id,targetC,bundle,
 name:id,category:bundle,status:"planejado",active:true,quantity:id==="kwid-a2"?2:1,priceHistory:[],
 priceProvisional:id==="kwid-a2",requiresVerification:["kwid-a1","kwid-c1","kwid-c2"].includes(id),verificationConfirmed:false}));
packageLedger.carProject.payments=[];
packageLedger.shifts=[{id:"done",date:"2026-10-23",status:"closed",km:95.8,grossC:17594,
 kmPerL:13,fuelPriceC:665,wearPerKmC:15,otherC:0}];
t.setFinance(packageLedger);
let combo=t.projectComboSummaries();
assert.equal(combo.length,5);
assert.deepEqual(Array.from(combo.map(x=>x.total)),[112728,65524,20456,56097,23442]);
assert.equal(combo.reduce((sum,x)=>sum+x.items.length,0),13);
assert.equal(combo.reduce((sum,x)=>sum+x.total,0),278247);
assert.equal(t.projectSummary().plannedC,278247);
const reservedBefore=t.projectSummary().available;
assert.equal(reservedBefore,7065);
assert.equal(t.projectSummary().actualPaid,0);
// Quotation update preserves historical value and doesn't touch money.
const tire=packageLedger.carProject.items.find(x=>x.id==="kwid-a2");
const prev=tire.targetC;
tire.targetC=92000;
tire.priceHistory.push({date:"2026-10-26",oldC:prev,newC:92000,reason:"Nova cotação"});
assert.equal(t.projectComboSummaries()[0].total,114728);
assert.equal(t.projectSummary().plannedC,280247);
assert.equal(t.projectSummary().available,reservedBefore);
assert.equal(tire.priceHistory[0].oldC,90000);
assert.equal(tire.priceHistory[0].newC,92000);
// Planned goals and prices do not create payments or recurring savings.
assert.equal(packageLedger.carProject.payments.length,0);
assert.equal(packageLedger.expenses.length,0);

// Personal uses of cash must be segregated from operations, VAT/fees, and car allocations.
const separate=t.defaults();separate.goals=[];separate.shifts=[{id:"shift",date:"2026-10-26",status:"closed",grossC:17594,km:95.8,kmPerL:13,fuelPriceC:665,wearPerKmC:15,otherC:0}];
t.setFinance(separate);
const beforeFinancial=t.compute();
const beforeFund=t.projectSummary().available;
separate.personalWithdrawals=[
 {id:"phone",date:"2026-10-26",category:"telefone",amountC:6700,description:"Plano TIM",source:"99_cash"},
 {id:"groceries",date:"2026-10-26",category:"alimentacao",amountC:2800,description:"Alimentação e casa",source:"99_cash"}
];
assert.equal(t.personalSummary().total,9500);
assert.equal(t.personalSummary().count,2);
assert.equal(t.compute().result,beforeFinancial.result);
assert.equal(t.compute().gross,beforeFinancial.gross);
assert.equal(t.compute().car,beforeFinancial.car);
assert.equal(t.projectSummary().available,beforeFund);
assert.equal(separate.expenses.length,0);
separate.personalWithdrawals[0].amountC=6900;
assert.equal(t.personalSummary().total,9700);
separate.personalWithdrawals.pop();
assert.equal(t.personalSummary().total,6900);
t.setFinance(d);

// Urgent R$1320 fixed-bills goal uses personal cash only; car allocation is unchanged.
const u=t.defaults();
u.goals=[];
u.urgentGoal={id:"urg",startDate:"2026-10-27",dueDate:"2026-11-03",
 bills:[{id:"a",label:"Conta 1",targetC:55000},{id:"b",label:"Conta 2",targetC:40000},{id:"c",label:"Conta 3",targetC:30000},{id:"d",label:"Conta 4",targetC:7000}],
 transfers:[],payments:[]};
u.shifts=[{id:"earn",date:"2026-10-27",status:"closed",grossC:17594,km:95.8,kmPerL:13,fuelPriceC:665,wearPerKmC:15,otherC:0}];
t.setFinance(u);
const originalCar=t.compute().car;
const originalPersonal=t.compute().personal;
assert.equal(t.urgentState().target,132000);
assert.equal(t.urgentState().covered,0);
assert.equal(t.urgentState().availableEstimate,originalPersonal);
u.urgentGoal.transfers.push({id:"res",amountC:20000,date:"2026-10-27"});
assert.equal(t.urgentState().balance,20000);
assert.equal(t.urgentState().remaining,112000);
u.urgentGoal.payments.push({id:"pa",billId:"a",amountC:5000,date:"2026-10-27",source:"reservado"});
assert.equal(t.urgentState().balance,15000);
assert.equal(t.urgentState().paid,5000);
assert.equal(t.urgentState().covered,20000);
u.urgentGoal.payments.push({id:"pb",billId:"b",amountC:4000,date:"2026-10-27",source:"direto"});
assert.equal(t.urgentState().covered,24000);
assert.equal(t.urgentState().remaining,108000);
assert.equal(t.compute().car,originalCar);
assert.equal(t.compute().personal,originalPersonal);
assert.equal(t.compute().gross,17594);
u.screenshotDrafts=[{id:"draft",date:"2026-10-26",valueC:18500}];
assert.equal(t.compute().gross,17594); // Unapproved OCR rows NEVER enter finances.
// Fuel purchases represent cash used at the station, NOT a second subtraction
// from kilometer-estimated fuel consumption, car reserve, or personal split.
const tank=t.defaults();
tank.goals=[];tank.settings.driverPct=50;
tank.shifts=[{id:"shift",date:"2026-10-27",status:"closed",km:100,grossC:19000,kmPerL:13,fuelPriceC:665,wearPerKmC:15,otherC:0}];
t.setFinance(tank);
const fuelBefore=t.compute();
const reserveBefore=t.projectSummary().available;
tank.fuelPurchases=[
 {id:"fill30",date:"2026-10-27",amountC:3000,fundingSource:"cash_99",liters:null,odometer:null},
 {id:"fill70",date:"2026-10-27",amountC:7000,fundingSource:"cash_99",liters:null,odometer:null}
];
assert.equal(t.fuelPurchaseSummary().totalC,10000);
assert.equal(t.fuelPurchaseSummary().count,2);
assert.equal(t.compute().gross,fuelBefore.gross);
assert.equal(t.compute().fuel,fuelBefore.fuel);
assert.equal(t.compute().result,fuelBefore.result);
assert.equal(t.compute().car,fuelBefore.car);
assert.equal(t.projectSummary().available,reserveBefore);
assert.equal(tank.expenses.length,0);
const preserved=t.normalize(tank);
assert.equal(preserved.fuelPurchases.length,2);
assert.equal(preserved.fuelPurchases.reduce((n,x)=>n+x.amountC,0),10000);
// Gains proven by screenshots stay visible but cannot generate imaginary car reserve
// when the driver has not supplied work odometer (personal travel is mixed in).
const undetermined=t.defaults();undetermined.goals=[];
undetermined.shifts=[
 {id:"morning",date:"2026-10-27",status:"closed",financialStatus:"pending_odometer",grossC:10522,km:null,reportedTrips:6},
 {id:"evening",date:"2026-10-27",status:"closed",financialStatus:"pending_odometer",grossC:10499,km:null,odoEnd:39988,reportedTrips:9}
];
t.setFinance(undetermined);
assert.equal(t.pendingOdometerSummary().total,21021);
assert.equal(t.pendingOdometerSummary().trips,15);
assert.equal(t.compute().gross,0);
assert.equal(t.compute().km,0);
assert.equal(t.compute().car,0);
assert.equal(t.projectSummary().available,0);
// Once actual work KM is confirmed, a shift can contribute to calculations.
undetermined.shifts[0].financialStatus="verified";
undetermined.shifts[0].km=42;
undetermined.shifts[0].kmPerL=13;undetermined.shifts[0].fuelPriceC=665;undetermined.shifts[0].wearPerKmC=15;
assert.equal(t.compute().gross,10522);
assert.equal(t.pendingOdometerSummary().total,10499);
t.setFinance(d);
const parsed=t.guessAmounts("Valor da corrida R$ 22,50 e percurso de 9,4 km");
assert.equal(parsed.money,"22,50");
assert.equal(parsed.dist,"9,4");
const multiple=t.guessAmounts("R$ 12,00 tarifa R$ 15,00 corrida");
assert.equal(multiple.money,null);
const dt=t.datetimeLocal();
assert.match(dt.clock,/^\d{2}:\d{2}$/);
assert.match(dt.date,/^\d{4}-\d{2}-\d{2}$/);
console.log("PASS: data migration, live shifts, ride totals, costs, extraction ambiguity, local timestamps");
