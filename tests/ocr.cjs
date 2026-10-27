/* Pure OCR parser tests; real image recognition still needs mobile device validation. */
const assert=require("node:assert/strict");
const ocr=require("../ocr-reader.js");
const sample=[
"Histórico de corridas","26/10/2026 23:49","Ganhos pagos no app","Pop Expresso R$11,34",
"334 - Santa Lúcia, Maceió - AL","Rua Recanto do Sol, Clima Bom, Maceió - AL","Processando pagamento",
"26/10/2026 23:23","Ganhos pagos em dinheiro","Pop R$10,80",
"Rua Maicon Junior, Maceió - AL","Benedito Bentes, Maceió - AL","Pedido finalizado",
"26/10/2026 21:52","Ganhos pagos no app","Outro -R$18,99","Pago",
"26/10/2026 21:06","Ganhos pagos no app","Recompensa R$10,51","Pago"
].join("\n");
const parsed=ocr.parse99(sample,"print01.png");
assert.equal(parsed.length,4);
assert.equal(parsed[0].valueC,1134);
assert.equal(parsed[0].kind,"pop-expresso");
assert.equal(parsed[0].status,"processando");
assert.equal(parsed[0].date,"2026-10-26");
assert.equal(parsed[0].clock,"23:49");
assert.equal(parsed[1].valueC,1080);
assert.equal(parsed[1].payment,"cash");
assert.equal(parsed[1].origin.includes("Maicon"),true);
assert.equal(parsed[2].valueC,-1899);
assert.equal(parsed[2].kind,"outro");
assert.equal(parsed[2].kindNegative,true);
assert.equal(parsed[3].valueC,1051);
assert.equal(parsed[3].kind,"recompensa");
const two=ocr.dedupe([...parsed,...ocr.parse99(sample,"repetido.png")]);
assert.equal(two.filter(x=>x.duplicate).length,4);
const shift={date:"2026-10-26",start:"17:37",end:"00:29"};
assert.equal(ocr.acceptedForShift(parsed[0],shift),true);
assert.equal(ocr.acceptedForShift({date:"2026-10-26",clock:"04:05"},shift),false);
assert.equal(ocr.acceptedForShift({date:"2026-10-27",clock:"00:15"},shift),true);
assert.equal(ocr.acceptedForShift({date:"2026-10-27",clock:"01:10"},shift),false);
assert.equal(ocr.parseMoney("R$ 1.320,00"),132000);
assert.equal(ocr.parseMoney("-R$18,99"),-1899);
console.log("PASS: 99 OCR text parsing, duplicate identification, negative packages and overnight shift boundary");
