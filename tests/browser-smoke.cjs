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
  await page.locator("[data-close-panel]").click();
  await page.locator('#endShiftForm input[name="endKm"]').fill("43017.5");
  await page.locator('#endShiftForm button[type=submit]').click();
  await page.waitForFunction(()=>!!document.querySelector(".stat-section"));
  assert.match(await page.locator(".stat-section").innerText(),/17,5/);
  assert.equal(errors.length,0,errors.join(" | "));
  console.log("PASS: mobile login, start, reload, ride, finish, financial dashboard");
 }finally{await browser.close()}
}
run().then(()=>server.close(),err=>{console.error(err);server.close();process.exitCode=1});
