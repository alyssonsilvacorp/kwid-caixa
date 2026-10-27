/* RodaCaixa 99 screenshot helper.
   OCR is performed locally in the browser (Tesseract.js), not by a hidden server.
   All recognized rows require explicit user review before entering the ledger. */
(function(root){
"use strict";
function parseMoney(m){
 if(!m)return null;
 const raw=String(m).replace(/[^\d,.\-]/g,"");
 const negative=/^-/.test(raw);
 const core=raw.replace(/^-/, "");
 const comma=core.lastIndexOf(",");
 const dot=core.lastIndexOf(".");
 const sep=Math.max(comma,dot);
 if(sep<0)return null;
 const integer=core.slice(0,sep).replace(/[^\d]/g,"");
 const decimal=core.slice(sep+1).replace(/[^\d]/g,"");
 if(decimal.length!==2||!integer)return null;
 return (negative?-1:1)*(Number(integer)*100+Number(decimal));
}
function clockNormal(clock){const m=String(clock||"").match(/(\d{1,2})[:h](\d{2})/);return m?m[1].padStart(2,"0")+":"+m[2]:null}
function kindFrom(block){
 if(/\brecompensa\b/i.test(block))return "recompensa";
 if(/\bentrega\b.*\bcarro\b/i.test(block))return "entrega";
 if(/\boutro\b/i.test(block))return "outro";
 if(/\bpop\s*expresso\b/i.test(block))return "pop-expresso";
 if(/\bnegocia\b/i.test(block))return "negocia";
 if(/\bpop\b/i.test(block))return "pop";
 return "desconhecido";
}
function readAddresses(block){
 // Addresses may wrap, be cropped or OCR may miss the route arrows.
 // Keep a best-effort suggestion; empty fields must be reviewed by the driver.
 const lines=block.split(/\n/).map(x=>x.trim()).filter(Boolean);
 const markers=/^(?:Rua|R[.] |R\.|Avenida|Av[.]?|Alameda|Travessa|Tv[.]?|Praça|Qd\b|Q\b|Estrada|Rodovia|[0-9]{2,4}\s*[-–]\s*|Km\s)/i;
 const candidates=lines.filter(l=>markers.test(l)&&!/\b(R\$|Taxa99|21\/10|Pedido)\b/i.test(l)).map(x=>x.replace(/^[↑↓↗↘•*]\s*/,"").trim());
 return {origin:candidates[0]||"",destination:candidates[1]||""};
}
function parse99(text,source){
 const out=[];
 const normalized=String(text||"").replace(/\r/g,"\n").replace(/[﹩＄]/g,"$");
 const re=/(\d{2})\s*\/\s*(\d{2})\s*\/\s*(20\d{2})\s+(\d{1,2})\s*[:h]\s*([0-5]\d)/g;
 const boundaries=[...normalized.matchAll(re)];
 for(let i=0;i<boundaries.length;i++){
  const b=boundaries[i],end=boundaries[i+1]?.index??normalized.length;
  const body=normalized.slice(b.index+b[0].length,end);
  const match=body.match(/(-\s*)?R\s*\$\s*([\d.]+[,.]\d{2})/i);
  if(!match)continue; // Cropped screenshot has no defensible earning value.
  const cents=parseMoney((match[1]?"-":"")+match[2]);if(cents===null||!Number.isFinite(cents)||Math.abs(cents)>500000)continue;
  const year=b[3],month=b[2],day=b[1];
  const date=year+"-"+month+"-"+day;
  const clock=b[4].padStart(2,"0")+":"+b[5];
  const kind=kindFrom(body);
  const negative=cents<0;
  const payment=/pago[s]?\s+em\s+dinheiro/i.test(body)?"cash":/pago[s]?\s+no\s+app/i.test(body)?"app":"unknown";
  const route=readAddresses(body);
  const processing=/processando pagamento/i.test(body);
  const status=/cancelad[ao]/i.test(body)?"cancelado":processing?"processando":"registrado";
  const uncertain=kind==="desconhecido"||status!=="registrado"||payment==="unknown";
  const fingerprint=[date,clock,kind,String(cents),route.origin.replace(/\W+/g,"").toLowerCase().slice(0,32)].join("|");
  out.push({id:"ocr-"+String(out.length+1),source:source||"print",date,clock,kind,valueC:cents,
    platform:"99",payment,origin:route.origin,destination:route.destination,km:null,kmSource:null,
    status,uncertain,kindNegative:negative,fingerprint});
 }
 return out;
}
function dedupe(rows,existingFingerprints=[]){
 const seen=new Set(existingFingerprints);
 return (rows||[]).map(r=>{
  const fp=r.fingerprint||[r.date,r.clock,r.kind,r.valueC].join("|");
  const duplicate=seen.has(fp);
  seen.add(fp);
  return {...r,fingerprint:fp,duplicate};
 });
}
function acceptedForShift(r,shift){
 if(!r||!shift||!r.date)return false;
 const start=shift.date;
 if(r.date<start)return false;
 if(r.date===start){return !shift.start||!r.clock||r.clock>=shift.start}
 const [yyyy,mm,dd]=start.split("-").map(Number);
 const next=new Date(yyyy,mm-1,dd+1,12);
 const nextDate=[next.getFullYear(),String(next.getMonth()+1).padStart(2,"0"),String(next.getDate()).padStart(2,"0")].join("-");
 return r.date===nextDate&&r.clock<=(shift.end||"10:00");
}
const api={parse99,parseMoney,dedupe,acceptedForShift,readAddresses,clockNormal};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.RodaOCR=api;
})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:{});
