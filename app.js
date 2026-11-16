import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDocs, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ahorroEn, proyectarAhorro, metaEstado, TIPOS_AHORRO, TIPOS_META, toDate, addMonths } from "./ahorros.js";
import { mIdx, idxKey, daysIn, FREQ, factor, tasaMes, cardState, creditState, consejos, ordenPago, CLASES_ROTATIVAS, TIPOS_CUOTAS } from "./engine.js";

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0});
const fmtN = new Intl.NumberFormat("es-CO",{maximumFractionDigits:0});
const money = v => fmt.format(Math.round(v||0)).replace(/\u00a0/g," ");
const numTxt = v => (v||v===0) ? fmtN.format(Math.round(v)) : "";
const parseMoney = s => { const d = String(s==null?"":s).replace(/[^\d-]/g,""); const n = parseInt(d,10); return isNaN(n)?0:n; };
const parseNum = s => { const n = parseFloat(String(s==null?"":s).replace(/\s/g,"").replace(",",".")); return isNaN(n)?0:n; };
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2,9);
const pad = n => String(n).padStart(2,"0");
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const thisMonth = () => todayISO().slice(0,7);
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const monthName = k => { const [y,m]=k.split("-").map(Number); return MESES[m-1]+" "+y; };
const monthShort = k => { const [y,m]=k.split("-").map(Number); return MESES[m-1].slice(0,3)+" "+String(y).slice(2); };
const nextMonth = k => { let [y,m]=k.split("-").map(Number); m++; if(m>12){m=1;y++;} return y+"-"+pad(m); };
const sum = (a,f) => a.reduce((s,x)=>s+(f?f(x):x),0);

const CAT_GASTO = ["Vivienda","Servicios","Mercado","Transporte","Educación","Salud","Personal","Ocio","Hogar","Familia","Otros"];
const CAT_MOV = ["Comida","Mercado","Transporte","Ocio","Personal","Salud","Hogar","Otros"];
const CAT_HORMIGA = ["Tinto o café","Gaseosa o jugo","Snack o dulce","Domicilio","Apps y suscripciones","Transporte corto","Cigarrillos","Antojo","Otro"];
const GOOGLE_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

// ---------- Firebase ----------
const configured = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("PEGA_AQUI");
let app, auth, db;
if(configured){
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try{ db = initializeFirestore(app,{ localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch(e){ db = getFirestore(app); }
}

// ---------- Estado ----------
const S = { user:null, months:{}, perfil:null, cur:null, tab:"hoy", movTipo:"gasto", undo:null, menu:false, confirmDel:false, confirmAll:false, installEvt:null };

function blankMonth(k){
  return { v:3, mes:k, metaAhorroPct:0, ingresos:[], gastos:[], ahorros:[], movs:[] };
}
function normalize(m){
  const b = blankMonth(m.mes);
  for(const k of Object.keys(b)) if(m[k]==null) m[k]=b[k];
  delete m.tarjetas; delete m.deudas;
  return m;
}
// Tarjetas, créditos y pagos viven en un documento aparte, porque duran varios meses.
function blankPerfil(){ return { v:4, inicio: thisMonth(), tarjetas:[], creditos:[], pagos:[], ahorros:[], metas:[] }; }
function normalizePerfil(p){
  const mig = p.ahorros==null;
  const b=blankPerfil(); for(const k of Object.keys(b)) if(p[k]==null) p[k]=b[k];
  if(mig){ migrarAhorros(p); S.migrado=true; }
  p.ahorros.forEach(a=>{ if(!Array.isArray(a.movs)) a.movs=[]; });
  p.tarjetas.forEach(t=>{ if(!Array.isArray(t.compras)) t.compras=[]; if(!t.minReal) t.minReal={}; });
  return p;
}
// Versión anterior: los ahorros vivían dentro de cada mes. Se pasan una sola vez a la lista nueva.
function migrarAhorros(p){
  const ks=Object.keys(S.months).sort(); const last=ks.length?S.months[ks[ks.length-1]]:null;
  if(!last || !Array.isArray(last.ahorros)) return;
  for(const a of last.ahorros){
    const acc={id:a.id||uid(),nombre:a.nombre||"",tipo:"Cuenta de ahorros",entidad:a.donde||"",apertura:last.mes+"-01",inicial:+a.saldo||0,tasa:a.tasa===""?"":(+a.tasa||0),aporte:+a.aporte||0,plazo:"",retencion:0,saldoReal:0,fechaReal:"",meta:"",movs:[]};
    if(+a.meta>0){ const mid=uid(); p.metas.push({id:mid,nombre:"Meta: "+(a.nombre||"ahorro"),tipo:"Otro",valor:+a.meta,porcentaje:100,fecha:"",extra:0}); acc.meta=mid; }
    p.ahorros.push(acc);
  }
}
const fcOf = k => k===thisMonth() ? toDate(todayISO()) : (k<thisMonth() ? toDate(idxKey(mIdx(k)+1)+"-01")-86400000 : toDate(idxKey(mIdx(k)+1)+"-01")-86400000);
const ctx = () => ({ months:S.months, pagos:S.perfil.pagos, start:mIdx(S.perfil.inicio), cur:mIdx(thisMonth()) });

// ---------- Guardado en Firebase ----------
const pending = new Map(); const chains = {};
function setStatus(t){ const el=$("#status"); if(el) el.textContent=t; }
const monthsCol = () => collection(db,"users",S.user.uid,"meses");
const monthDoc = k => k==="perfil" ? doc(db,"users",S.user.uid,"perfil","deudas") : doc(db,"users",S.user.uid,"meses",k);
function savePerfil(){ save("perfil"); }
function save(k){
  const key = k || S.cur;
  (key==="perfil" ? S.perfil : S.months[key]).actualizado = Date.now();
  clearTimeout(pending.get(key));
  setStatus("Guardando…");
  pending.set(key, setTimeout(()=>flush(key), 1200));
}
function flush(key){
  pending.delete(key);
  const src = key==="perfil" ? S.perfil : S.months[key];
  if(!src) return;
  const body = JSON.parse(JSON.stringify(src));
  if(!navigator.onLine) setStatus("Sin internet: guardado en este dispositivo, se sube al volver la conexión");
  chains[key] = (chains[key]||Promise.resolve()).then(()=> setDoc(monthDoc(key), body)
    .then(()=>{ if(!pending.size) setStatus("Guardado"); })
    .catch(e=>{ console.error(e); setStatus(e && e.code==="resource-exhausted" ? "La app llegó a su límite gratis de hoy; se guardará mañana" : "No se pudo guardar. Revisa tu conexión."); }));
}
function flushAll(){ for(const k of [...pending.keys()]){ clearTimeout(pending.get(k)); flush(k); } }
window.addEventListener("pagehide", flushAll);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flushAll(); });

async function loadMonths(){
  S.months = {};
  const snap = await getDocs(monthsCol());
  snap.forEach(d=>{ if(/^\d{4}-\d{2}$/.test(d.id)) S.months[d.id] = normalize(d.data()); });
  const p = await getDoc(monthDoc("perfil"));
  S.perfil = p.exists() ? normalizePerfil(p.data()) : null;
}

// ---------- Arranque ----------
if(!configured){
  $("#root").innerHTML = `<div class="screen"><div class="login">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Falta conectar Firebase</h1>
    <p>Abre el archivo <b>firebase-config.js</b> y pega la configuración de tu proyecto, como dice el Paso 6 de la guía. Después vuelve a subir los archivos.</p>
  </div></div>`;
}else{
  onAuthStateChanged(auth, async user=>{
    S.user = user;
    if(!user){ renderLogin(); return; }
    $("#root").innerHTML = `<div class="screen"><p class="status">Cargando tus meses…</p></div>`;
    try{ await loadMonths(); }
    catch(e){ console.error(e); $("#root").innerHTML = `<div class="screen"><div class="login"><h1>No se pudieron cargar tus datos</h1><p>Revisa tu conexión y recarga la página. Si eres quien publicó la app, revisa que las reglas de Firestore estén publicadas (Paso 3 de la guía).</p><button class="btn" onclick="location.reload()">Recargar</button></div></div>`; return; }
    if(!Object.keys(S.months).length){ const k=thisMonth(); S.months[k]=blankMonth(k); save(k); S.tab="ingresos"; S.firstTime=true; }
    if(!S.perfil){ S.perfil=blankPerfil(); const ks0=Object.keys(S.months).sort(); S.perfil.inicio=ks0[0]; savePerfil(); }
    if(!S.months[thisMonth()] && Object.keys(S.months).sort().pop() < thisMonth()){ newMonth(true); }
    const ks = Object.keys(S.months).sort();
    S.cur = S.months[thisMonth()] ? thisMonth() : ks[ks.length-1];
    if(!S.firstTime){ try{ const t=localStorage.getItem("pd:tab"); if(t) S.tab=t; }catch(e){} }
    renderShell(); render();
    if(S.migrado){ savePerfil(); S.migrado=false; }
    if(S.autoMes){ toast(`Empezó ${monthName(S.autoMes)}: copié tus ingresos y gastos fijos del mes anterior.`); S.autoMes=null; }
  });
}

function renderLogin(err){
  $("#root").innerHTML = `<div class="screen"><div class="login">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Pecuniae Ratio</h1>
    <p style="margin:-4px 0 14px;font-weight:600;color:var(--brand)">Tu presupuesto diario</p>
    <p>Sabe cada día cuánto puedes gastar, controla tus tarjetas y créditos, y mira cómo vas mes a mes.</p>
    <ul>
      <li>Ingresos y gastos diarios, semanales, quincenales, mensuales, semestrales y anuales</li>
      <li>Tarjetas con intereses, compras a cuotas y meses para salir de la deuda</li>
      <li>Gastos hormiga, ahorros y metas</li>
      <li>Tus datos en cualquier celular o computador</li>
    </ul>
    <button class="gbtn" id="gLogin">${GOOGLE_SVG} Entrar con Google</button>
    ${err?`<p class="alert bad" style="margin-top:14px">${esc(err)}</p>`:""}
    <p class="fine">Solo tú puedes ver tu información. Es gratis.</p>
  </div></div>`;
  $("#gLogin").onclick = async ()=>{
    try{ await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){
      console.error(e);
      const msg = e.code==="auth/popup-blocked" ? "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para esta página e inténtalo de nuevo."
        : e.code==="auth/unauthorized-domain" ? "Esta dirección no está autorizada en Firebase. Quien publicó la app debe agregarla en Authentication > Configuración > Dominios autorizados (Paso 8 de la guía)."
        : (e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request") ? null
        : "No se pudo entrar. Inténtalo de nuevo; si sigue fallando, abre la app en el navegador (Chrome o Safari) en lugar de la app instalada.";
      if(msg) renderLogin(msg);
    }
  };
}

function renderShell(){
  const u=S.user, ini=(u.displayName||u.email||"?").trim().charAt(0).toUpperCase();
  $("#root").innerHTML = `
  <div id="offline" class="offline" ${navigator.onLine?"hidden":""}>Sin internet. Puedes seguir anotando; se sincroniza al volver la conexión.</div>
  <header class="top">
    <div class="top-in">
      <h1>Pecuniae Ratio</h1>
      <div class="monthpick">
        <select id="monthSel" aria-label="Mes"></select>
        <button class="btn small" data-act="newMonth">Nuevo mes</button>
      </div>
      <button class="avatar" data-act="menu" aria-label="Tu cuenta">${u.photoURL?`<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`:esc(ini)}</button>
      <span class="status" id="status" style="flex-basis:100%"></span>
      <div id="menu"></div>
    </div>
    <nav class="tabs" role="tablist" id="tabs">
      <button role="tab" data-tab="hoy">Hoy</button>
      <button role="tab" data-tab="ingresos">Ingresos</button>
      <button role="tab" data-tab="gastos">Gastos</button>
      <button role="tab" data-tab="tarjetas">Tarjetas y cupos</button>
      <button role="tab" data-tab="creditos">Créditos</button>
      <button role="tab" data-tab="ahorros">Ahorros</button>
      <button role="tab" data-tab="metas">Metas</button>
      <button role="tab" data-tab="hormiga">Gastos hormiga</button>
      <button role="tab" data-tab="historial">Comparar meses</button>
    </nav>
  </header>
  <main id="app"></main>`;
  setStatus(navigator.onLine?"Guardado":"Sin internet");
}
window.addEventListener("online",()=>{ const o=$("#offline"); if(o) o.hidden=true; setStatus("Conectado"); });
window.addEventListener("offline",()=>{ const o=$("#offline"); if(o) o.hidden=false; });
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); S.installEvt=e; });

// ---------- Cálculos ----------
function ahorroCalc(a){
  const i = tasaMes(a.tasa,"EA"), saldo=+a.saldo||0, ap=+a.aporte||0, meta=+a.meta||0;
  let en12 = saldo; for(let k=0;k<12;k++) en12 = en12*(1+i)+ap;
  let meses = null;
  if(meta>0){ if(saldo>=meta) meses=0; else if(ap>0||i>0){ let s=saldo,n=0; while(s<meta && n<1200){ s=s*(1+i)+ap; n++; } meses = n<1200?n:null; } }
  return {i,en12,meses,falta:Math.max(0,meta-saldo),pct: meta>0?Math.min(1,saldo/meta):0};
}
function deudasMes(k){
  const cx=ctx(), M=mIdx(k);
  const tc = S.perfil.tarjetas.map(t=>cardState(t,cx,M));
  const cc = S.perfil.creditos.map(c=>creditState(c,cx,M));
  return {tc,cc,M,cx};
}
function calc(m){
  const k = m.mes, dim = daysIn(k);
  const ingPlan = sum(m.ingresos,x=>(+x.monto||0)*factor(x.frec,k));
  const ingExtra = sum(m.movs.filter(x=>x.tipo==="ingreso"),x=>+x.monto||0);
  const ingresos = ingPlan+ingExtra;
  const gasCash = sum(m.gastos.filter(g=>!g.medio||g.medio==="efectivo"),g=>(+g.monto||0)*factor(g.frec,k));
  const gasTotal = sum(m.gastos,g=>(+g.monto||0)*factor(g.frec,k));
  const {tc,cc} = deudasMes(k);
  const tarComp = sum(tc,x=>x.min), creComp = sum(cc,x=>x.min);
  const deudaPagado = sum(tc,x=>x.pagado+x.abonos)+sum(cc,x=>x.pagado+x.abonos);
  const deudaFalta = sum(tc,x=>x.falta)+sum(cc,x=>x.falta);
  const atrasos = [...tc.map((x,i)=>({x,n:S.perfil.tarjetas[i].nombre})),...cc.map((x,i)=>({x,n:S.perfil.creditos[i].nombre}))].filter(o=>o.x.estado==="atrasado"||o.x.estado==="mora"||o.x.mora>0.5);
  const fc = fcOf(k);
  const ahs = S.perfil.ahorros.map(a=>({a,e:ahorroEn(a,fc)}));
  const aportes = sum(ahs.filter(x=>x.e&&x.e.abierto&&!x.e.cdt),x=>+x.a.aporte||0);
  const compromisos = gasCash+tarComp+creComp+aportes;
  const metaAhorro = Math.max(0,ingresos)*((+m.metaAhorroPct||0)/100);
  const libre = ingresos-compromisos-metaAhorro;
  const gastosDia = m.movs.filter(x=>x.tipo!=="ingreso" && x.fecha && x.fecha.slice(0,7)===k);
  const gastado = sum(gastosDia,x=>+x.monto||0);
  const hormiga = sum(gastosDia.filter(x=>x.tipo==="hormiga"),x=>+x.monto||0);
  const porDia = {}; gastosDia.forEach(x=>{ porDia[x.fecha]=(porDia[x.fecha]||0)+(+x.monto||0); });
  const tm = thisMonth(), hoy = new Date().getDate();
  const estado = k===tm ? "actual" : (k<tm ? "pasado" : "futuro");
  const trans = estado==="actual" ? hoy : (estado==="pasado" ? dim : 0);
  const rest = estado==="actual" ? dim-hoy+1 : (estado==="futuro" ? dim : 0);
  const gastHoy = porDia[todayISO()]||0;
  const gastAntes = gastado - (estado==="actual"?gastHoy:0);
  const baseHoy = rest>0 ? (libre-gastAntes)/rest : 0;
  const quedaHoy = baseHoy - (estado==="actual"?gastHoy:0);
  const proyGasto = estado==="pasado" ? gastado : (trans>0 ? Math.max(gastado, gastado/trans*dim) : 0);
  const ahorroReal = ingresos-compromisos-gastado;
  const ahorroProy = ingresos-compromisos-proyGasto;
  const deudaTotal = sum(tc,x=>x.deuda)+sum(cc,x=>x.deuda);
  const interesesMes = sum(tc,x=>x.interes)+sum(cc,x=>x.interes);
  const ahorroTotal = sum(ahs.filter(x=>x.e),x=>x.e.neto);
  return {dim,ingPlan,ingExtra,ingresos,gasCash,gasTotal,tarComp,creComp,deudaPagado,deudaFalta,atrasos,aportes,tc,cc,compromisos,metaAhorro,libre,gastado,hormiga,porDia,
    estado,trans,rest,gastHoy,baseHoy,quedaHoy,proyGasto,ahorroReal,ahorroProy,deudaTotal,interesesMes,ahorroTotal,diaBase:libre/dim,
    nHormiga:gastosDia.filter(x=>x.tipo==="hormiga").length};
}

// ---------- Render ----------
const M = () => S.months[S.cur];
function render(){
  renderMonthSel();
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.tab===S.tab)));
  const m = M(), c = calc(m);
  const views = {hoy:vHoy, ingresos:vIngresos, gastos:vGastos, tarjetas:vTarjetas, creditos:vCreditos, ahorros:vAhorros, metas:vMetas, hormiga:vHormiga, historial:vHistorial};
  $("#app").innerHTML = (S.firstTime && S.tab==="ingresos" ? welcome() : "") + (views[S.tab]||vHoy)(m,c);
  renderMenu();
}
function welcome(){
  return `<section class="panel" style="border-color:var(--brand)"><h2>Bienvenido${S.user.displayName?", "+esc(S.user.displayName.split(" ")[0]):""}</h2>
  <p class="hint" style="margin:0">Empieza por tus ingresos, luego tus gastos fijos, tarjetas, créditos y ahorros. Cuando termines, ve a <b>Hoy</b>: ahí verás cuánto puedes gastar cada día.</p></section>`;
}
function renderMonthSel(){
  const ks = Object.keys(S.months).sort().reverse();
  $("#monthSel").innerHTML = ks.map(k=>`<option value="${k}" ${k===S.cur?"selected":""}>${monthName(k)}</option>`).join("");
}
function renderMenu(){
  const el=$("#menu"); if(!el) return;
  if(!S.menu){ el.innerHTML=""; return; }
  const u=S.user;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  el.innerHTML = `<div class="menu" role="menu">
    <div class="who">${esc(u.displayName||"Tu cuenta")}</div><div class="mail">${esc(u.email||"")}</div>
    ${S.installEvt?`<button class="btn" data-act="install">Instalar la app</button>`:""}
    ${ios?`<p class="subtle" style="margin:0 0 4px">Para instalarla en iPhone: toca Compartir y luego “Agregar a inicio”.</p>`:""}
    <button class="btn" data-act="export">Descargar mis datos (CSV)</button>
    <button class="btn" data-act="logout">Cerrar sesión</button>
    <button class="btn" data-act="delAll" style="color:var(--bad)">${S.confirmAll?"Toca otra vez: se borra todo":"Borrar todos mis datos"}</button>
  </div>`;
}
function medioOpts(m,sel,{efectivoLabel="Efectivo o débito"}={}){
  return `<option value="efectivo" ${(!sel||sel==="efectivo")?"selected":""}>${efectivoLabel}</option>` +
    S.perfil.tarjetas.map(t=>`<option value="${t.id}" ${sel===t.id?"selected":""}>Tarjeta ${esc(t.nombre||"sin nombre")}</option>`).join("");
}
const opts = (arr,sel) => arr.map(v=>`<option ${v===sel?"selected":""}>${esc(v)}</option>`).join("");
const freqOpts = sel => Object.entries(FREQ).map(([k,v])=>`<option value="${k}" ${k===sel?"selected":""}>${v.l}</option>`).join("");
const mIn = (coll,id,field,val,label) => `<label>${label}<input inputmode="numeric" data-b="${coll}|${id}|${field}|money" value="${numTxt(val)}" placeholder="0"></label>`;
const tIn = (coll,id,field,val,label,ph="") => `<label>${label}<input data-b="${coll}|${id}|${field}|text" value="${esc(val)}" placeholder="${esc(ph)}"></label>`;
const nIn = (coll,id,field,val,label,ph="") => `<label>${label}<input inputmode="decimal" data-b="${coll}|${id}|${field}|num" value="${val===undefined||val===""?"":esc(val)}" placeholder="${ph}"></label>`;
const sIn = (coll,id,field,inner,label) => `<label>${label}<select data-b="${coll}|${id}|${field}|text">${inner}</select></label>`;

function vHoy(m,c){
  let hero;
  if(c.estado==="actual"){
    hero = `<p class="lead">Hoy, ${new Date().getDate()} de ${MESES[new Date().getMonth()]}, puedes gastar</p>
      <div class="big num ${c.quedaHoy<0?"neg":""}">${money(c.quedaHoy)}</div>
      <p class="sub">${c.gastHoy>0?`Ya gastaste ${money(c.gastHoy)} hoy de ${money(c.baseHoy)}. `:""}Quedan ${c.rest} día${c.rest===1?"":"s"} y ${money(Math.max(0,c.libre-c.gastado))} libres para el resto del mes.</p>`;
  }else if(c.estado==="pasado"){
    hero = `<p class="lead">Así cerró ${monthName(m.mes)}</p>
      <div class="big num ${c.ahorroReal<0?"neg":""}">${money(c.ahorroReal)}</div>
      <p class="sub">${c.ahorroReal>=0?"Fue lo que te sobró después de compromisos y gastos del día.":"Gastaste más de lo que entró ese mes."}</p>`;
  }else{
    hero = `<p class="lead">Para ${monthName(m.mes)} tendrás por día</p>
      <div class="big num ${c.baseHoy<0?"neg":""}">${money(c.baseHoy)}</div>
      <p class="sub">Es lo libre del mes (${money(c.libre)}) dividido en ${c.dim} días.</p>`;
  }
  const hoyN = new Date().getDate();
  const logged = m.movs.map(x=>x.fecha).filter(Boolean).sort();
  const firstLog = logged.length ? logged[0] : "9999";
  let cells = "";
  for(let d=1; d<=c.dim; d++){
    const iso = m.mes+"-"+pad(d), g = c.porDia[iso]||0;
    const past = c.estado==="pasado" || (c.estado==="actual" && d<=hoyN);
    let cls = "";
    if(past && iso>=firstLog){ cls = g===0 ? "zero" : (g<=Math.max(0,c.diaBase) ? "ok" : "over"); }
    if(c.estado==="actual" && d===hoyN) cls += " today";
    cells += `<div class="day ${cls}" title="${d}: ${money(g)}">${d}</div>`;
  }
  let alerta = "";
  if(c.ingresos===0 && c.compromisos===0) alerta = `<div class="alert warn">Aún no tienes ingresos ni gastos. Llena las pestañas Ingresos y Gastos para calcular tu presupuesto.</div>`;
  if(c.atrasos.length) alerta += `<div class="alert bad">Tienes pagos atrasados en: ${c.atrasos.map(o=>esc(o.n||"sin nombre")).join(", ")}. Revisa las pestañas Tarjetas y Créditos.</div>`;
  if(c.ingresos===0 && c.compromisos===0){}
  else if(c.libre<0) alerta += `<div class="alert bad">Tus compromisos y tu meta de ahorro superan lo que entra este mes por ${money(-c.libre)}. Baja algún gasto, ajusta la meta de ahorro o anota un ingreso extra.</div>`;
  else if(c.estado==="actual" && c.proyGasto>c.libre+0.5) alerta += `<div class="alert warn">A este ritmo gastarías ${money(c.proyGasto)} en el mes, ${money(c.proyGasto-c.libre)} más de lo que tienes libre.</div>`;
  else if(c.estado==="actual" && c.gastado>0) alerta += `<div class="alert ok">Vas bien: a este ritmo terminas el mes con ${money(c.ahorroProy)} sin gastar.</div>`;
  const movsMes = [...m.movs].sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  return `
  <section class="panel hero">
    <div>${hero}</div>
    <div>
      <div class="days" aria-label="Gasto por día">${cells}</div>
      <div class="legend"><span><i style="background:var(--ok)"></i>Sin gastos</span><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Dentro del presupuesto</span><span><i style="background:var(--bad-soft);border:1px solid var(--bad)"></i>Te pasaste</span></div>
    </div>
    ${alerta}
  </section>
  ${hormigaRapida(m,c)}
  ${comoVaTodo(m,c)}
  <section class="panel">
    <h2>Anotar un movimiento</h2>
    <p class="hint">Lo que gastas día a día fuera de tus gastos fijos. Las compras con tarjeta también se suman a esa tarjeta y descuentan de tu presupuesto diario.</p>
    ${quickForm(m,"q")}
  </section>
  <section class="panel">
    <details><summary style="font-family:var(--num);font-size:1.05rem">Detalle de ${monthName(m.mes)}</summary>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="k">Entra en el mes</div><div class="v num ok">${money(c.ingresos)}</div><div class="s">${c.ingExtra>0?`incluye ${money(c.ingExtra)} extra`:"según tus ingresos"}</div></div>
      <div class="stat"><div class="k">Compromisos del mes</div><div class="v num">${money(c.compromisos)}</div><div class="s">gastos fijos ${money(c.gasCash)}, tarjetas ${money(c.tarComp)}, créditos ${money(c.creComp)}${c.aportes?`, ahorro ${money(c.aportes)}`:""}</div></div>
      <div class="stat"><div class="k">Ahorro extra</div><div class="v num">${money(c.metaAhorro)}</div><div class="s"><label>% de lo que entra <input style="width:60px;padding:3px 6px" inputmode="decimal" data-b="meta|-|metaAhorroPct|num" value="${esc(m.metaAhorroPct)}"></label></div></div>
      <div class="stat"><div class="k">Libre para gastar</div><div class="v num ${c.libre<0?"bad":""}">${money(c.libre)}</div><div class="s">${money(c.diaBase)} por día</div></div>
      <div class="stat"><div class="k">Gastado en el día a día</div><div class="v num">${money(c.gastado)}</div><div class="s">${c.hormiga>0?`${money(c.hormiga)} en hormiga`:"sin gastos hormiga"}</div></div>
      <div class="stat"><div class="k">${c.estado==="pasado"?"Te sobró":"Puedes ahorrar"}</div><div class="v num ${(c.estado==="pasado"?c.ahorroReal:c.ahorroProy)<0?"bad":"ok"}">${money(c.estado==="pasado"?c.ahorroReal:(c.estado==="futuro"?c.ingresos-c.compromisos:c.ahorroProy))}</div><div class="s">${c.estado==="actual"?"si sigues a este ritmo":(c.estado==="futuro"?"si no gastas nada extra":"al cierre")}</div></div>
      <div class="stat"><div class="k">Pagos de deudas este mes</div><div class="v num ${c.deudaFalta>0.5?"bad":"ok"}">${c.deudaFalta>0.5?"Faltan "+money(c.deudaFalta):"Al día"}</div><div class="s">pagaste ${money(c.deudaPagado)} de ${money(c.tarComp+c.creComp)}</div></div>
      <div class="stat"><div class="k">Deuda total</div><div class="v num">${money(c.deudaTotal)}</div><div class="s">tarjetas y créditos</div></div>
      <div class="stat"><div class="k">Intereses del mes (aprox.)</div><div class="v num bad">${money(c.interesesMes)}</div><div class="s">lo que te cuesta deber</div></div>
      <div class="stat"><div class="k">Ahorrado</div><div class="v num ok">${money(c.ahorroTotal)}</div><div class="s">${c.aportes>0?`apartas ${money(c.aportes)} al mes`:"en tus cuentas y metas"}</div></div>
    </div></details>
  </section>
  <section class="panel">
    <div class="listhead"><h2>Movimientos del mes</h2><span class="total num">${movsMes.length} registro${movsMes.length===1?"":"s"}</span></div>
    ${movList(m,movsMes)}
  </section>`;
}
// ---------- Gasto hormiga en un toque ----------
const H_ICON = {"Tinto o café":"☕","Gaseosa o jugo":"🥤","Snack o dulce":"🍫","Domicilio":"🛵","Apps y suscripciones":"📱","Transporte corto":"🚌","Cigarrillos":"🚬","Antojo":"🍦","Otro":"➕"};
function ultimoValor(cat){
  const ks=Object.keys(S.months).sort().reverse();
  for(const k of ks){ const l=S.months[k].movs.filter(x=>x.tipo==="hormiga"&&x.cat===cat).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")); if(l.length) return +l[0].monto||0; }
  return 0;
}
function hormigaRapida(m,c){
  const hoy=todayISO(), deHoy=sum(m.movs.filter(x=>x.tipo==="hormiga"&&x.fecha===hoy),x=>+x.monto||0);
  const sel=S.hcat||"";
  return `<section class="panel hq">
    <div class="listhead" style="margin-bottom:6px"><h2>¿Nuevo gasto hormiga?</h2>
      <span class="subtle">${m.mes===thisMonth()?`hoy ${money(deHoy)} · `:""}mes ${money(c.hormiga)}</span></div>
    <div class="hchips">${CAT_HORMIGA.map(x=>{ const u=ultimoValor(x); return `<button class="hchip ${sel===x?"on":""}" data-act="hchip" data-v="${esc(x)}" aria-pressed="${sel===x}"><span class="hi">${H_ICON[x]||"•"}</span><span>${esc(x)}</span>${u?`<span class="hv num">${money(u)}</span>`:""}</button>`; }).join("")}</div>
    <div class="hform" data-form="hq" data-tipo="hormiga">
      <input id="hq-monto" inputmode="numeric" placeholder="${sel?"Valor de "+esc(sel.toLowerCase()):"Elige qué fue y escribe el valor"}" aria-label="Valor" value="${S.hval?numTxt(S.hval):""}">
      <input type="hidden" id="hq-desc" value="${esc(sel)}"><input type="hidden" id="hq-cat" value="${esc(sel||"Otro")}">
      <input type="hidden" id="hq-fecha" value="${defDate(m)}">
      <select id="hq-medio" aria-label="Pagado con">${medioOpts(m,"efectivo",{efectivoLabel:"Efectivo"})}</select>
      <button class="btn primary" data-act="addMov" data-f="hq">Anotar</button>
    </div>
  </section>`;
}
// ---------- Cómo va todo ----------
function barra(p,cls=""){ return `<div class="bar"><span class="${cls}" style="width:${Math.max(0,Math.min(100,p*100)).toFixed(1)}%"></span></div>`; }
function comoVaTodo(m,c){
  const tiles=[];
  // Presupuesto
  if(c.libre>0 || c.gastado>0){
    const pG=c.libre>0?c.gastado/c.libre:1, pT=c.estado==="actual"?c.trans/c.dim:(c.estado==="pasado"?1:0);
    const ok=pG<=pT+0.02;
    tiles.push(`<button class="vt" data-act="goTab" data-v="hoy">
      <div class="vt-h"><span>Presupuesto del mes</span><b class="${ok?"okc":"badc"}">${ok?"Vas bien":"Vas rápido"}</b></div>
      <div class="vt-n num">${Math.round(pG*100)}% <small>gastado</small></div>
      ${barra(pG,ok?"":"bad")}
      <div class="vt-s">${money(c.gastado)} de ${money(Math.max(0,c.libre))}${c.estado==="actual"?` · va el ${Math.round(pT*100)}% del mes`:""}</div></button>`);
  }
  // Hormiga
  const pk=idxKey(mIdx(m.mes)-1), prev=S.months[pk]?calc(S.months[pk]).hormiga:null;
  const dias=c.estado==="pasado"?c.dim:Math.max(1,c.trans), anual=c.hormiga/dias*365;
  if(c.hormiga>0 || prev){
    const dif=prev!=null?c.hormiga-prev:null;
    tiles.push(`<button class="vt" data-act="goTab" data-v="hormiga">
      <div class="vt-h"><span>Gastos hormiga</span>${dif!=null?`<b class="${dif>0?"badc":"okc"}">${dif>0?"▲":"▼"} ${money(Math.abs(dif))} vs ${MESES[+pk.slice(5)-1].slice(0,3)}</b>`:""}</div>
      <div class="vt-n num ant">${money(c.hormiga)}</div>
      <div class="vt-s">${c.nHormiga} gasto${c.nHormiga===1?"":"s"} · a este ritmo ${money(anual)} al año</div></button>`);
  }
  // Deudas
  const total=c.tarComp+c.creComp;
  if(total>0.5 || c.deudaTotal>0.5){
    const lista=[...S.perfil.tarjetas.map((t,i)=>({n:t.nombre||"Tarjeta",st:c.tc[i]})),...S.perfil.creditos.map((x,i)=>({n:x.nombre||"Crédito",st:c.cc[i]}))];
    const cara=ordenPago(lista)[0];
    const p=total>0?Math.min(1,c.deudaPagado/total):1;
    tiles.push(`<button class="vt" data-act="goTab" data-v="${S.perfil.tarjetas.length?"tarjetas":"creditos"}">
      <div class="vt-h"><span>Deudas</span><b class="${c.atrasos.length?"badc":(c.deudaFalta>0.5?"warnc":"okc")}">${c.atrasos.length?`${c.atrasos.length} atrasada${c.atrasos.length===1?"":"s"}`:(c.deudaFalta>0.5?"Pagos pendientes":"Al día ✔")}</b></div>
      <div class="vt-n num">${money(c.deudaTotal)} <small>debes</small></div>
      ${barra(p,c.atrasos.length?"bad":"")}
      <div class="vt-s">Pagaste ${money(c.deudaPagado)} de ${money(total)} este mes${cara?` · abona primero a ${esc(cara.n)}`:""}</div></button>`);
  }
  // Ahorros
  const fc=fcOf(m.mes); let met=0,net=0,p12=0;
  for(const a of S.perfil.ahorros){ const e=ahorroEn(a,fc); if(!e) continue; met+=e.ingresado; net+=e.neto; const pr=proyectarAhorro(a,fc,12); p12+=pr.length?pr[11].neto:e.neto; }
  if(S.perfil.ahorros.length){
    tiles.push(`<button class="vt" data-act="goTab" data-v="ahorros">
      <div class="vt-h"><span>Ahorros</span>${net-met>0.5?`<b class="okc">+${money(net-met)} ganado</b>`:""}</div>
      <div class="vt-n num okc">${money(net)}</div>
      <div class="vt-s">En 12 meses tendrías ${money(p12)}</div></button>`);
  }
  // Metas
  if(S.perfil.metas.length){
    const fcm=fcOf(thisMonth());
    const ms=S.perfil.metas.map(mt=>({mt,e:metaEstado(mt,S.perfil.ahorros,fcm)})).filter(o=>o.e.objetivo>0);
    const lbl={cumplida:["okc","Cumplida"],atiempo:["okc","A tiempo"],atrasada:["badc","Atrasada"],sinfecha:["","Sin fecha"],sincuentas:["warnc","Sin cuentas"],sinaporte:["warnc","Sin aporte"]};
    if(ms.length) tiles.push(`<button class="vt vt-wide" data-act="goTab" data-v="metas">
      <div class="vt-h"><span>Metas</span></div>
      ${ms.slice(0,4).map(o=>{ const [cl,t]=lbl[o.e.estado]||["",""]; return `<div class="vt-meta"><div class="vt-h"><span>${esc(o.mt.nombre||o.mt.tipo)}</span><b class="${cl}">${Math.round(o.e.progreso*100)}%${t?" · "+t:""}</b></div>${barra(o.e.progreso,o.e.estado==="atrasada"?"warn":"")}</div>`; }).join("")}
      ${ms.length>4?`<div class="vt-s">y ${ms.length-4} más</div>`:""}</button>`);
  }
  if(!tiles.length) return "";
  return `<section class="panel"><h2>Cómo va todo</h2><p class="hint" style="margin-bottom:12px">Toca cualquier tarjeta para ver el detalle.</p><div class="vts">${tiles.join("")}</div></section>`;
}
function quickForm(m,pfx,{tipo}={}){
  const t = tipo || S.movTipo;
  const catList = t==="hormiga" ? CAT_HORMIGA : (t==="ingreso" ? ["Trabajo extra","Venta","Regalo","Reembolso","Otro"] : CAT_MOV);
  return `
    ${tipo?"":`<div class="seg" role="group" aria-label="Tipo">
      <button data-act="movTipo" data-v="gasto" aria-pressed="${t==="gasto"}">Gasto</button>
      <button data-act="movTipo" data-v="hormiga" aria-pressed="${t==="hormiga"}">Hormiga</button>
      <button data-act="movTipo" data-v="ingreso" aria-pressed="${t==="ingreso"}">Ingreso extra</button>
    </div>`}
    ${t==="hormiga"?`<div class="chips">${CAT_HORMIGA.slice(0,7).map(x=>`<button class="chip" data-act="chip" data-f="${pfx}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>`:""}
    <div class="quick" data-form="${pfx}" data-tipo="${t}">
      <label>Valor<input id="${pfx}-monto" inputmode="numeric" placeholder="0"></label>
      <label>Descripción<input id="${pfx}-desc" placeholder="${t==="ingreso"?"Ej: trabajo del sábado":"Ej: almuerzo"}"></label>
      <label>Categoría<select id="${pfx}-cat">${opts(catList)}</select></label>
      <label>${t==="ingreso"?"Fecha":"Pagado con"}${t==="ingreso"?`<input id="${pfx}-fecha" type="date" value="${defDate(m)}">`:`<select id="${pfx}-medio">${medioOpts(m,"efectivo")}</select>`}</label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
      ${t!=="ingreso"?`<label class="subtle">Fecha <input id="${pfx}-fecha" type="date" value="${defDate(m)}" style="padding:5px 8px"></label>`:""}
      <button class="btn primary" data-act="addMov" data-f="${pfx}">Anotar</button>
    </div>`;
}
function defDate(m){ return m.mes===thisMonth() ? todayISO() : m.mes+"-01"; }
function movList(m,list){
  if(!list.length) return `<div class="empty">Aún no anotas nada este mes. Empieza con tu primer gasto de hoy.</div>`;
  const tname = id => { const t=S.perfil.tarjetas.find(x=>x.id===id); return t?("Tarjeta "+(t.nombre||"")):""; };
  return `<div class="mov-list">${list.map(x=>`
    <div class="mov">
      <span class="tag ${x.tipo}">${x.tipo==="hormiga"?"Hormiga":(x.tipo==="ingreso"?"Ingreso":"Gasto")}</span>
      <div><div>${esc(x.desc||x.cat)}</div><div class="d">${esc(x.fecha||"")} · ${esc(x.cat||"")}${x.medio&&x.medio!=="efectivo"?" · "+esc(tname(x.medio)):""}</div></div>
      <span class="amt ${x.tipo}">${x.tipo==="ingreso"?"+":"−"}${money(x.monto)}</span>
      <button class="icon-btn" data-act="del" data-c="movs" data-id="${x.id}" aria-label="Borrar">✕</button>
    </div>`).join("")}</div>`;
}
function byGroup(arr,key,labels,val){
  const g = {}; arr.forEach(x=>{ const k=x[key]||Object.keys(labels)[0]; g[k]=(g[k]||0)+val(x); });
  const ks = Object.keys(g); if(ks.length<2) return "";
  return `<div class="stats" style="margin-top:14px">${ks.map(k=>`<div class="stat"><div class="k">${esc(labels[k]||k)}</div><div class="v num">${money(g[k])}</div></div>`).join("")}</div>`;
}
function vIngresos(m,c){
  return `<section class="panel">
    <div class="listhead"><h2>Ingresos</h2><span class="total num">${money(c.ingPlan)} al mes</span></div>
    <p class="hint">Sueldo, primas, trabajos extra, ventas, arriendos… Elige cada cuánto llega y si es fijo, variable o esporádico; la app lo convierte a valor mensual. Para un ingreso variable pon lo que esperas; lo que ganes de más anótalo en Hoy como ingreso extra.</p>
    <div class="rows">${m.ingresos.length?m.ingresos.map(x=>`
      <div class="row r-ing">
        ${tIn("ingresos",x.id,"nombre",x.nombre,"Nombre","Ej: sueldo")}
        ${mIn("ingresos",x.id,"monto",x.monto,"Valor")}
        ${sIn("ingresos",x.id,"frec",freqOpts(x.frec),"Cada cuánto")}
        ${sIn("ingresos",x.id,"tipo",`<option value="fijo" ${x.tipo==="fijo"?"selected":""}>Fijo</option><option value="variable" ${x.tipo==="variable"?"selected":""}>Variable</option><option value="esporadico" ${x.tipo==="esporadico"?"selected":""}>Esporádico</option>`,"Tipo")}
        <div class="calc">Al mes<br><b>${money((+x.monto||0)*factor(x.frec,m.mes))}</b></div>
        <button class="icon-btn" data-act="del" data-c="ingresos" data-id="${x.id}" aria-label="Borrar">✕</button>
      </div>`).join(""):`<div class="empty">Agrega tu primer ingreso, por ejemplo tu sueldo.</div>`}
    </div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="ingresos">Agregar ingreso</button></div>
    ${byGroup(m.ingresos,"tipo",{fijo:"Fijos",variable:"Variables",esporadico:"Esporádicos"},x=>(+x.monto||0)*factor(x.frec,m.mes))}
    ${c.ingExtra>0?`<p class="subtle" style="margin-top:10px">Además anotaste ${money(c.ingExtra)} de ingresos extra este mes en Hoy.</p>`:""}
  </section>`;
}
function vGastos(m,c){
  const reserva = m.gastos.filter(g=>["bimestral","trimestral","semestral","anual"].includes(g.frec));
  return `<section class="panel">
    <div class="listhead"><h2>Gastos planeados</h2><span class="total num">${money(c.gasTotal)} al mes</span></div>
    <p class="hint">Arriendo, servicios, mercado, transporte, matrícula, SOAT… Los gastos semestrales o anuales se reparten mes a mes para que vayas apartando. Si un gasto lo cargas a una tarjeta, elige la tarjeta: no sale de tu efectivo este mes, pero sube el saldo de esa tarjeta.</p>
    <div class="rows">${m.gastos.length?m.gastos.map(x=>`
      <div class="row r-gas">
        ${tIn("gastos",x.id,"nombre",x.nombre,"Nombre","Ej: arriendo")}
        ${mIn("gastos",x.id,"monto",x.monto,"Valor")}
        ${sIn("gastos",x.id,"frec",freqOpts(x.frec),"Cada cuánto")}
        ${sIn("gastos",x.id,"cat",opts(CAT_GASTO,x.cat),"Categoría")}
        ${sIn("gastos",x.id,"tipo",`<option value="fijo" ${x.tipo!=="variable"?"selected":""}>Fijo</option><option value="variable" ${x.tipo==="variable"?"selected":""}>Variable</option>`,"Tipo")}
        ${sIn("gastos",x.id,"medio",medioOpts(m,x.medio,{efectivoLabel:"Efectivo"}),"Se paga con")}
        <button class="icon-btn" data-act="del" data-c="gastos" data-id="${x.id}" aria-label="Borrar">✕</button>
        <div class="calc" style="grid-column:1/-1">Al mes: <b>${money((+x.monto||0)*factor(x.frec,m.mes))}</b>${["semestral","anual","bimestral","trimestral"].includes(x.frec)?" · aparta esto cada mes":""}</div>
      </div>`).join(""):`<div class="empty">Agrega tu primer gasto fijo, por ejemplo el arriendo.</div>`}
    </div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="gastos">Agregar gasto</button></div>
    ${byGroup(m.gastos,"cat",Object.fromEntries(CAT_GASTO.map(x=>[x,x])),x=>(+x.monto||0)*factor(x.frec,m.mes))}
    ${reserva.length?`<p class="subtle" style="margin-top:12px">Para tus gastos de varios meses (${reserva.map(r=>esc(r.nombre||"sin nombre")).join(", ")}) conviene apartar ${money(sum(reserva,r=>(+r.monto||0)*factor(r.frec,m.mes)))} cada mes.</p>`:""}
  </section>`;
}
const SIS_OPTS = sel => `<option value="capital" ${sel!=="fija"?"selected":""}>Capital fijo + intereses</option><option value="fija" ${sel==="fija"?"selected":""}>Cuota fija</option>`;
const ESTADO = {ok:["ok","Al día ✔"],pendiente:["warn","Pendiente"],mora:["bad","En mora"],atrasado:["bad","Atrasado"],futuro:["","Por pagar"],sin:["","Sin pago este mes"]};
const ESTADO_DEUDA = {uso:["","En uso"],aldia:["ok","Al día (la usaste y pagaste)"],sinuso:["muted","Al día, sin uso"],activo:["","Activo"],pagado:["ok","Pagado ✔"],cerrado:["muted","Cerrado"],noempieza:["muted","Aún no empieza"]};
function deudaBadge(st){ const [cls,t]=ESTADO_DEUDA[st.estadoDeuda]||["",""]; return t?`<span class="badge ${cls}">${t}</span>`:""; }
const monthLabel = i => monthName(idxKey(i));
const cap = t => t.charAt(0).toUpperCase()+t.slice(1);
function estadoBadge(st){ const [cls,t]=ESTADO[st.estado]||ESTADO.sin; return `<span class="badge ${cls}">${t}</span>`; }
function payBlock(id,st,m){
  const pagos = S.perfil.pagos.filter(p=>p.oblig===id && (p.fecha||"").slice(0,7)===m.mes).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
  return `<div class="paybox">
    <div class="payform">
      <label>Valor<input inputmode="numeric" id="pg-${id}-valor" value="${numTxt(st.falta>0.5?st.falta:0)}"></label>
      <label>Tipo<select id="pg-${id}-tipo"><option value="pago">Pago del mes</option><option value="abono">Abono extra a capital</option></select></label>
      <label>Fecha<input type="date" id="pg-${id}-fecha" value="${defDate(m)}"></label>
      <button class="btn primary" data-act="addPago" data-id="${id}">Registrar pago</button>
    </div>
    ${pagos.length?`<div class="chips" style="margin:8px 0 0">${pagos.map(p=>`<span class="chip" style="cursor:default">${esc(p.fecha.slice(8,10))}/${esc(p.fecha.slice(5,7))} · ${p.tipo==="abono"?"Abono":"Pago"} ${money(p.valor)} <button class="icon-btn" style="padding:0 3px" data-act="del" data-c="pagos" data-id="${p.id}" aria-label="Borrar pago">✕</button></span>`).join("")}</div>`:""}
    ${st.mora>0.5?`<p class="subtle" style="margin:8px 0 0;color:var(--bad)">Del mes anterior te faltó pagar ${money(st.mora)}; ya está sumado en lo que te toca pagar.</p>`:""}
    ${st.aFavor>0.5?`<p class="subtle" style="margin:8px 0 0;color:var(--ok)">Pagaste ${money(st.aFavor)} más de lo que debías: tienes saldo a favor.</p>`:""}
  </div>`;
}
function nextMonths(minOf,M){
  let out=""; for(let j=1;j<=6;j++){ out+=`<div class="nm"><span>${monthShort(idxKey(M+j))}</span><b class="num">${money(minOf(M+j))}</b></div>`; }
  return `<div class="nmrow" aria-label="Próximos meses">${out}</div>`;
}
function evalBox(st,nombre){
  const cs=consejos(nombre||"Esta deuda",st).sort((a,b)=>b.n-a.n);
  const e=st.eval, sin=e.sin, con=e.con;
  let proy="";
  if(st.deuda>0.5 || (st.r && st.r.B>0.5)){
    proy = sin.fin!==null ? `Pagando lo que te toca, terminas en <b>${monthName(idxKey(sin.fin))}</b> y pagarías <b>${money(sin.intereses)}</b> de intereses desde ahora.` : `Con lo que te toca pagar, esta deuda no se termina en los próximos 20 años: necesitas pagar más.`;
    if(con) proy += ` Con tu abono extra de ${money(st.plan)} al mes terminas en <b>${con.fin!==null?monthName(idxKey(con.fin)):"más de 20 años"}</b>${e.ahorro>1?` y te ahorras <b>${money(e.ahorro)}</b>`:""}.`;
  }
  if(!proy && !cs.length) return "";
  return `<div class="evalbox">${proy?`<p>${proy}</p>`:""}${cs.map(x=>`<p class="tip ${x.n>=3?"bad":x.n===2?"warn":""}">${esc(x.t)}</p>`).join("")}</div>`;
}
function resumenDeudas(c){
  const lista=[...S.perfil.tarjetas.map((t,i)=>({n:t.nombre||"Tarjeta",st:c.tc[i],tipo:t.clase||"Tarjeta de crédito"})),...S.perfil.creditos.map((x,i)=>({n:x.nombre||"Crédito",st:c.cc[i],tipo:x.tipo||"Crédito"}))];
  if(!lista.length) return "";
  const orden=ordenPago(lista);
  const sinUso=lista.filter(o=>o.st.clase==="rotativo"&&o.st.estadoDeuda==="sinuso");
  const cerrados=lista.filter(o=>o.st.estadoDeuda==="pagado"||o.st.estadoDeuda==="cerrado");
  const atras=lista.filter(o=>o.st.mora>0.5||o.st.estado==="atrasado"||o.st.estado==="mora");
  return `<section class="panel">
    <h2>Evaluación de tus deudas</h2>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="k">Activas</div><div class="v num">${orden.length}</div><div class="s">con saldo pendiente</div></div>
      <div class="stat"><div class="k">Atrasadas</div><div class="v num ${atras.length?"bad":"ok"}">${atras.length}</div><div class="s">${atras.length?esc(atras.map(o=>o.n).join(", ")):"todo al día"}</div></div>
      <div class="stat"><div class="k">Al día, sin uso</div><div class="v num">${sinUso.length}</div><div class="s">${sinUso.length?esc(sinUso.map(o=>o.n).join(", ")):"tarjetas o cupos sin usar"}</div></div>
      <div class="stat"><div class="k">Pagadas o cerradas</div><div class="v num ok">${cerrados.length}</div><div class="s">${cerrados.length?esc(cerrados.map(o=>o.n).join(", ")):"créditos terminados"}</div></div>
    </div>
    ${orden.length?`<p class="subtle" style="margin:14px 0 6px">Si te sobra plata, abona en este orden (primero la tasa más alta: así pagas menos intereses):</p>
    <ol class="orden">${orden.map(o=>`<li><b>${esc(o.n)}</b> <span class="subtle">${esc(o.tipo)} · ${(o.st.ea*100).toFixed(1).replace(".",",")}% E.A. · debes ${money(o.st.deuda)}</span></li>`).join("")}</ol>`:""}
  </section>`;
}
function vTarjetas(m,c){
  const M=mIdx(m.mes);
  const cards = S.perfil.tarjetas.map((t,ix)=>{
    const k = c.tc[ix];
    const uso = k.cupo>0 ? k.deuda/k.cupo : 0, usoPct=Math.min(100,Math.max(0,uso*100));
    const cls = usoPct>90?"bad":(usoPct>60?"warn":"");
    const itemsByRef = new Map(k.items.map(it=>[it.ref,it]));
    return `<div class="card">
      <div class="card-h">
        <input aria-label="Nombre de la tarjeta" data-b="tarjetas|${t.id}|nombre|text" value="${esc(t.nombre)}" placeholder="Nombre, ej: Banco 1234">
        <button class="icon-btn" data-act="del" data-c="tarjetas" data-id="${t.id}" aria-label="Borrar tarjeta">✕</button>
      </div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("tarjetas",t.id,"clase",opts(CLASES_ROTATIVAS,t.clase||"Tarjeta de crédito"),"Clase")}
        ${sIn("tarjetas",t.id,"franquicia",opts(["Visa","Mastercard","American Express","Diners","Otra"],t.franquicia),"Tipo")}
        ${mIn("tarjetas",t.id,"cupo",t.cupo,"Cupo total")}
        ${nIn("tarjetas",t.id,"tasa",t.tasa,"Tasa de interés %","28,5")}
        ${sIn("tarjetas",t.id,"tipoTasa",`<option value="EA" ${t.tipoTasa!=="MV"?"selected":""}>Efectiva anual (E.A.)</option><option value="MV" ${t.tipoTasa==="MV"?"selected":""}>Mes vencido (M.V.)</option>`,"La tasa es")}
        ${sIn("tarjetas",t.id,"sistema",SIS_OPTS(t.sistema),"Cómo cobra las cuotas")}
        ${mIn("tarjetas",t.id,"manejo",t.manejo,"Manejo y seguros al mes")}
        ${sIn("tarjetas",t.id,"cobraSiempre",`<option value="si" ${t.cobraSiempre!==false?"selected":""}>Sí, aunque no la use</option><option value="no" ${t.cobraSiempre===false?"selected":""}>Solo si la uso</option>`,"¿Cobra manejo sin uso?")}
        ${mIn("tarjetas",t.id,"planExtra",t.planExtra||"","Abono extra que planeas al mes")}
      </div>
      <h3 class="sub-h">${cap(monthName(m.mes))} ${estadoBadge(k)} ${deudaBadge(k)}</h3>
      <p class="subtle" style="margin:-4px 0 10px">${k.ultimoUso===null?"Aún no tiene compras registradas.":(k.mesesSinUso===0?"La usaste este mes.":`Último uso: ${monthName(idxKey(k.ultimoUso))} (hace ${k.mesesSinUso} mes${k.mesesSinUso===1?"":"es"}).`)}</p>
      <div class="stats">
        <div class="stat"><div class="k">Te toca pagar</div><div class="v num">${money(k.min)}</div><div class="s">${k.minReal!==undefined&&k.minReal!==""?"según tu extracto":(k.min<=0.5?"no debes nada":`capital ${money(k.capDue)} + intereses ${money(k.interes)}${k.manejo?` + manejo ${money(k.manejo)}`:""}${k.mora>0.5?` + atrasado ${money(k.mora)}`:""}`)}</div></div>
        <div class="stat"><div class="k">Pagaste</div><div class="v num ok">${money(k.pagado+k.abonos)}</div><div class="s">${k.abonos?`incluye ${money(k.abonos)} de abono extra`:"pago del mes"}</div></div>
        <div class="stat"><div class="k">Te falta pagar</div><div class="v num ${k.falta>0.5?"bad":"ok"}">${money(k.falta)}</div></div>
        <div class="stat"><div class="k">${M===mIdx(thisMonth())?"Debes hoy":(M<mIdx(thisMonth())?"Debías al final del mes":"Deberías al final del mes")}</div><div class="v num">${money(k.deuda)}</div><div class="s">incluye compras que aún no te cobran</div></div>
        <div class="stat"><div class="k">Cupo disponible</div>${k.cupo>0?`<div class="v num ${k.cupo-k.deuda<0?"bad":""}">${money(k.cupo-k.deuda)}</div><div class="bar" style="margin:6px 0 0"><span class="${cls}" style="width:${usoPct}%"></span></div><div class="s">usas ${Math.round(uso*100)}% del cupo</div>`:`<div class="v num">—</div><div class="s">escribe el cupo total</div>`}</div>
        <div class="stat"><div class="k">Intereses este mes</div><div class="v num bad">${money(k.interes)}</div><div class="s">${(tasaMes(t.tasa,t.tipoTasa)*100).toFixed(2).replace(".",",")}% mensual</div></div>
      </div>
      <div class="realmin">
        <label>Mínimo según tu extracto (opcional)<input inputmode="numeric" data-b="minReal|${t.id}|${m.mes}|money" value="${k.minReal!==undefined&&k.minReal!==""?numTxt(k.minReal):""}" placeholder="${numTxt(k.minCalc)}"></label>
        <p class="subtle">Calculado: ${money(k.minCalc)}. Si tu extracto dice otro valor, escríbelo y se usa ese. Déjalo vacío para usar el calculado.</p>
      </div>
      ${payBlock(t.id,k,m)}
      <details open>
        <summary>Compras (${t.compras.length})</summary>
        <div class="rows" style="margin-top:8px">${t.compras.map(x=>{ const it=itemsByRef.get(x); let info="Completa fecha y valor";
          if(it){ const kk=M-it.start; info = kk<0?`Primera cuota en ${monthLabel(it.start)}`:(kk>=it.n?"Plan de cuotas terminado":`Cuota ${kk+1} de ${it.n} del plan: <b>${money(it.cuota(M))}</b>`); info+=` · última cuota del plan ${monthShort(idxKey(it.fin))}${it.ie>0?` · intereses del plan ${money(it.interesTotal())}`:" · sin intereses"}`; }
          return `<div class="row r-cmp">
            <label>Fecha<input type="date" data-b="tcompra|${t.id}:${x.id}|fecha|text" value="${esc(x.fecha)}"></label>
            ${tIn("tcompra",t.id+":"+x.id,"desc",x.desc,"Descripción","Ej: nevera")}
            ${mIn("tcompra",t.id+":"+x.id,"valor",x.valor,"Valor")}
            ${nIn("tcompra",t.id+":"+x.id,"cuotas",x.cuotas,"Cuotas","1")}
            <label>Primera cuota<input type="month" data-b="tcompra|${t.id}:${x.id}|primerCobro|text" value="${esc(x.primerCobro||"")}"></label>
            <button class="icon-btn" data-act="del" data-c="tcompra" data-id="${t.id}:${x.id}" aria-label="Borrar compra">✕</button>
            <div class="calc" style="grid-column:1/-1">${info}</div>
          </div>`; }).join("")}
        </div>
        <div class="row r-cmp addrow">
          <label>Fecha<input type="date" id="nc-${t.id}-fecha" value="${defDate(m)}"></label>
          <label>Descripción<input id="nc-${t.id}-desc" placeholder="Ej: zapatos"></label>
          <label>Valor<input inputmode="numeric" id="nc-${t.id}-valor" placeholder="0"></label>
          <label>Cuotas<input inputmode="numeric" id="nc-${t.id}-cuotas" value="1"></label>
          <button class="btn" data-act="addCompra" data-id="${t.id}" style="align-self:end">Agregar compra</button>
        </div>
        <p class="subtle">La primera cuota se cobra el mes siguiente a la compra; si tu banco la cobra otro mes, cámbiala en "Primera cuota". ¿Ya debías algo en esta tarjeta? Agrégalo como compra "Saldo anterior" con las cuotas que te faltan.</p>
      </details>
      ${evalBox(k,t.nombre)}
      <p class="subtle" style="margin:12px 0 4px">Próximos meses, lo que te tocaría pagar:</p>
      ${nextMonths(k.minOf,M)}
    </div>`;
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Tarjetas y cupos rotativos</h2><span class="total num">${money(sum(c.tc,x=>x.deuda))} en total</span></div>
    <p class="hint"><b>Rotativo</b> = tienes un cupo: lo que pagas se libera y lo puedes volver a usar (tarjetas de crédito, créditos rotativos, cupos de almacén o apps como Sistecrédito). Escribe cada compra con sus cuotas y registra tus pagos: el pago mínimo, los intereses, lo que debes, el cupo y si está en uso o sin uso se calculan solos.</p>
    ${cards || `<div class="empty">No tienes tarjetas ni cupos registrados.</div>`}
    <button class="btn" data-act="add" data-c="tarjetas">Agregar tarjeta o cupo</button>
  </section>${resumenDeudas(c)}`;
}
function vCreditos(m,c){
  const M=mIdx(m.mes);
  const list = S.perfil.creditos.map((cr,ix)=>{
    const k=c.cc[ix], it=k.item, kk=M-it.start;
    const n = kk<0?`Primera cuota en ${monthLabel(it.start)}`:(kk>=it.n?"Plan de cuotas terminado":`Cuota ${kk+1} de ${it.n}`);
    return `<div class="card">
      <div class="card-h">
        <input aria-label="Nombre del crédito" data-b="creditos|${cr.id}|nombre|text" value="${esc(cr.nombre)}" placeholder="Acreedor, ej: crédito celular">
        <button class="icon-btn" data-act="del" data-c="creditos" data-id="${cr.id}" aria-label="Borrar crédito">✕</button>
      </div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("creditos",cr.id,"tipo",opts(TIPOS_CUOTAS,cr.tipo),"Tipo")}
        ${mIn("creditos",cr.id,"valor",cr.valor,"Valor prestado")}
        ${nIn("creditos",cr.id,"cuotas",cr.cuotas,"Número de cuotas","12")}
        ${nIn("creditos",cr.id,"tasa",cr.tasa,"Tasa de interés %","0")}
        ${sIn("creditos",cr.id,"tipoTasa",`<option value="EA" ${cr.tipoTasa!=="MV"?"selected":""}>Efectiva anual (E.A.)</option><option value="MV" ${cr.tipoTasa==="MV"?"selected":""}>Mes vencido (M.V.)</option>`,"La tasa es")}
        ${sIn("creditos",cr.id,"sistema",SIS_OPTS(cr.sistema),"Cómo se cobran las cuotas")}
        <label>Mes del primer pago<input type="month" data-b="creditos|${cr.id}|primerPago|text" value="${esc(cr.primerPago||"")}"></label>
        ${mIn("creditos",cr.id,"cuotaReal",cr.cuotaReal||"","Cuota según tu extracto (opcional)")}
        ${mIn("creditos",cr.id,"seguro",cr.seguro||"","Seguro u otros cargos al mes")}
        ${mIn("creditos",cr.id,"planExtra",cr.planExtra||"","Abono extra que planeas al mes")}
      </div>
      <h3 class="sub-h">${cap(monthName(m.mes))} ${estadoBadge(k)} ${deudaBadge(k)}${k.vencido?` <span class="badge bad">Plazo vencido</span>`:""}</h3>
      <div class="stats">
        <div class="stat"><div class="k">Te toca pagar</div><div class="v num">${money(k.min)}</div><div class="s">${k.min<=0.5?(k.estadoDeuda==="noempieza"?"aún no empieza":"no debes nada"):`${n}${(+cr.cuotaReal||0)>0?" · cuota de tu extracto":" · cuota calculada"}${k.mora>0.5?` + atrasado ${money(k.mora)}`:""}`}</div></div>
        <div class="stat"><div class="k">Pagaste</div><div class="v num ok">${money(k.pagado+k.abonos)}</div><div class="s">${k.abonos?`incluye ${money(k.abonos)} de abono extra`:"pago del mes"}</div></div>
        <div class="stat"><div class="k">Te falta pagar</div><div class="v num ${k.falta>0.5?"bad":"ok"}">${money(k.falta)}</div></div>
        <div class="stat"><div class="k">${M===mIdx(thisMonth())?"Debes hoy":(M<mIdx(thisMonth())?"Debías al final del mes":"Deberías al final del mes")}</div><div class="v num">${money(k.deuda)}</div></div>
        <div class="stat"><div class="k">Última cuota del plan</div><div class="v num">${it.V>0?monthShort(idxKey(it.fin)):"—"}</div><div class="s">${it.V>0?`${Math.max(0,it.fin-M)} mes(es) después de este`:""}</div></div>
        <div class="stat"><div class="k">Intereses</div><div class="v num bad">${money(k.interes)}</div><div class="s">este mes · ${money(it.interesTotal())} en todo el crédito</div></div>
      </div>
      ${payBlock(cr.id,k,m)}
      ${evalBox(k,cr.nombre)}
      <p class="subtle" style="margin:12px 0 4px">Próximos meses:</p>
      ${nextMonths(k.minOf,M)}
    </div>`;
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Créditos de cuotas</h2><span class="total num">${money(sum(c.cc,x=>x.deuda))} pendiente</span></div>
    <p class="hint"><b>No rotativo</b> = te prestan una sola vez y lo pagas en cuotas; lo que pagas no se vuelve a usar. Cuando el saldo llega a $0 queda <b>Pagado</b> y luego <b>Cerrado</b>. Créditos, compras a cuotas en almacenes o apps, celulares, estudio, préstamos. Escribe el valor que te prestaron, las cuotas, la tasa y el mes del primer pago: la cuota, en qué cuota vas y lo que debes se calculan solos. ¿Crédito viejo? Pon el valor original y el mes real del primer pago, o lo que debes hoy con las cuotas que faltan y este mes como primer pago. Si tu cuota real es distinta, escríbela.</p>
    ${list || `<div class="empty">No tienes créditos registrados.</div>`}
    <button class="btn" data-act="add" data-c="creditos">Agregar crédito</button>
  </section>${resumenDeudas(c)}`;
}
const fmtF = t => { const d=new Date(t); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };
const mesesEntre = (t1,t2) => { const a=new Date(t1), b=new Date(t2); return (b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()-(b.getUTCDate()<a.getUTCDate()?1:0); };
function sparkline(vals,target,marker){
  const W=300,H=90,p=4, max=Math.max(target||0,...vals,1), n=vals.length-1||1;
  const x=i=>p+(W-2*p)*i/n, y=v=>H-p-(H-2*p)*v/max;
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Proyección">
    ${target?`<line x1="${p}" x2="${W-p}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" class="tgt"/>`:""}
    ${marker!=null&&marker<=n?`<line x1="${x(marker).toFixed(1)}" x2="${x(marker).toFixed(1)}" y1="${p}" y2="${H-p}" class="mk"/>`:""}
    <polyline points="${pts}" class="ln"/></svg>`;
}
function vAhorros(m,c){
  const fc=fcOf(m.mes), hoyLbl = m.mes===thisMonth()?"hoy":`al cierre de ${monthName(m.mes)}`;
  let totIng=0, totNeto=0, tot12=0;
  const cards=S.perfil.ahorros.map(a=>{
    const e=ahorroEn(a,fc), pr=proyectarAhorro(a,fc,12), cdt=a.tipo==="CDT";
    if(e){ totIng+=e.ingresado; totNeto+=e.neto; tot12+= pr.length?pr[11].neto:e.neto; }
    const meses = a.apertura? mesesEntre(toDate(a.apertura),fc):null;
    const movs=[...a.movs].sort((x,y)=>(y.fecha||"").localeCompare(x.fecha||""));
    const metaOpts = `<option value="">Ninguna</option>`+S.perfil.metas.map(mt=>`<option value="${mt.id}" ${a.meta===mt.id?"selected":""}>${esc(mt.nombre||"Meta sin nombre")}</option>`).join("");
    return `<div class="card">
      <div class="card-h"><input aria-label="Nombre" data-b="ahorros|${a.id}|nombre|text" value="${esc(a.nombre)}" placeholder="Nombre, ej: Cajita viaje">
        <button class="icon-btn" data-act="del" data-c="ahorros" data-id="${a.id}" aria-label="Borrar">✕</button></div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("ahorros",a.id,"tipo",opts(TIPOS_AHORRO,a.tipo),"Tipo")}
        ${tIn("ahorros",a.id,"entidad",a.entidad,"Banco o app","Ej: Nu, Nequi, Bancolombia")}
        <label>Fecha de apertura<input type="date" data-b="ahorros|${a.id}|apertura|text" value="${esc(a.apertura||"")}"></label>
        ${mIn("ahorros",a.id,"inicial",a.inicial,cdt?"Valor del CDT":"Con cuánto la abriste")}
        ${nIn("ahorros",a.id,"tasa",a.tasa,"Rendimiento E.A. %","0")}
        ${cdt?nIn("ahorros",a.id,"plazo",a.plazo,"Plazo en meses","6"):mIn("ahorros",a.id,"aporte",a.aporte||"","Aporte que planeas al mes")}
        ${nIn("ahorros",a.id,"retencion",a.retencion||"","Retención en la fuente %",cdt?"4":"0")}
        ${sIn("ahorros",a.id,"meta",metaOpts,"Es para la meta")}
      </div>
      ${e&&e.abierto?`<div class="stats" style="margin-top:12px">
        <div class="stat"><div class="k">Tienes ${hoyLbl}</div><div class="v num ok">${money(e.neto)}</div><div class="s">${e.useReal?"desde el saldo que escribiste":"calculado con tus movimientos"}</div></div>
        <div class="stat"><div class="k">Has metido</div><div class="v num">${money(e.ingresado)}</div><div class="s">${e.useReal?`saldo real del ${fmtF(toDate(a.fechaReal))} + movimientos`:(meses!==null?`desde ${fmtF(toDate(a.apertura))}${meses>0?` (${meses} mes${meses===1?"":"es"})`:""}`:"")}</div></div>
        <div class="stat"><div class="k">Has ganado</div><div class="v num ok">${money(e.ganancia-e.retencion)}</div><div class="s">${e.retencion>0.5?`después de ${money(e.retencion)} de retención`:"en rendimientos"}</div></div>
        ${cdt&&e.venc?`<div class="stat"><div class="k">${e.vencido?"Venció":"Vence"}</div><div class="v num">${fmtF(e.venc)}</div><div class="s">${e.vencido?"renuévalo o retíralo":`recibirás ${money(e.alVencer.neto)}`}</div></div>`
          :`<div class="stat"><div class="k">En 12 meses tendrías</div><div class="v num">${money(pr.length?pr[11].neto:0)}</div><div class="s">${(+a.aporte||0)>0?`aportando ${money(a.aporte)} al mes`:"sin aportes nuevos"}</div></div>`}
      </div>
      <p class="subtle" style="margin:12px 0 4px">Proyección${cdt?" (el CDT deja de crecer al vencer)":""}:</p>
      <div class="nmrow">${[3,6,9,12].map(k=>`<div class="nm"><span>En ${k} meses</span><b class="num">${money(pr[k-1].neto)}</b></div>`).join("")}<div class="nm"><span>Ganarías</span><b class="num">${money(pr[11].neto-pr[11].ingresado)}</b></div><div class="nm"><span>Tasa</span><b class="num">${(+a.tasa||0).toString().replace(".",",")}% E.A.</b></div></div>`
      :`<p class="subtle" style="margin-top:10px">${a.apertura?`Se abre el ${fmtF(toDate(a.apertura))}.`:"Escribe la fecha de apertura para calcular."}</p>`}
      ${cdt?"":`<div class="paybox"><div class="payform">
        <label>Valor<input inputmode="numeric" id="am-${a.id}-valor" value="${numTxt((+a.aporte||0))}"></label>
        <label>Tipo<select id="am-${a.id}-tipo"><option value="aporte">Aporte (meto plata)</option><option value="retiro">Retiro (saco plata)</option></select></label>
        <label>Fecha<input type="date" id="am-${a.id}-fecha" value="${todayISO()}"></label>
        <button class="btn primary" data-act="addAmov" data-id="${a.id}">Registrar</button></div>
        ${movs.length?`<div class="chips" style="margin:8px 0 0">${movs.slice(0,12).map(x=>`<span class="chip" style="cursor:default">${esc(x.fecha.slice(8,10))}/${esc(x.fecha.slice(5,7))}/${esc(x.fecha.slice(2,4))} · ${x.tipo==="retiro"?"−":"+"}${money(x.valor)} <button class="icon-btn" style="padding:0 3px" data-act="del" data-c="amov" data-id="${a.id}:${x.id}" aria-label="Borrar">✕</button></span>`).join("")}${movs.length>12?`<span class="subtle">y ${movs.length-12} más</span>`:""}</div>`:""}</div>`}
      <details style="margin-top:10px"><summary>¿El saldo no coincide con tu banco?</summary>
        <div class="row" style="grid-template-columns:1fr 1fr;background:transparent;border:none;padding:8px 0 0">
          ${mIn("ahorros",a.id,"saldoReal",a.saldoReal||"","Saldo según tu banco o app")}
          <label>En la fecha<input type="date" data-b="ahorros|${a.id}|fechaReal|text" value="${esc(a.fechaReal||"")}"></label>
        </div><p class="subtle">Si lo escribes, la app parte de ese saldo real y desde ahí suma rendimientos y movimientos. Déjalo vacío para calcular solo con tus movimientos.</p></details>
    </div>`;
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Ahorros</h2><span class="total num">${money(totNeto)} ${hoyLbl}</span></div>
    <p class="hint">Cuentas de ahorro, cajitas o bolsillos (Nu, Nequi y similares), CDT, fondos. Escribe cuándo la abriste, con cuánto y el rendimiento E.A.; registra lo que metes o sacas. La app calcula cuánto tienes, cuánto has metido, cuánto has ganado y cuánto tendrías en 12 meses. Los CDT no reciben aportes y dejan de crecer al vencer; en Colombia les retienen en la fuente el 4% de los rendimientos.</p>
    ${S.perfil.ahorros.length?`<div class="stats" style="margin-bottom:14px">
      <div class="stat"><div class="k">Tienes ${hoyLbl}</div><div class="v num ok">${money(totNeto)}</div></div>
      <div class="stat"><div class="k">Has metido</div><div class="v num">${money(totIng)}</div></div>
      <div class="stat"><div class="k">Has ganado</div><div class="v num ok">${money(totNeto-totIng)}</div></div>
      <div class="stat"><div class="k">En 12 meses</div><div class="v num">${money(tot12)}</div><div class="s">con tus aportes planeados</div></div>
    </div>`:""}
    ${cards||`<div class="empty">Agrega una cuenta, cajita o CDT.</div>`}
    <button class="btn" data-act="add" data-c="ahorros">Agregar ahorro</button>
  </section>`;
}
const META_AYUDA = {"Carro o moto":"Si lo vas a financiar, pon en % la cuota inicial que te piden (suele ser 20% a 30%). Si lo pagas de contado, deja 100%.",
  "Cuota inicial de vivienda":"En Colombia la cuota inicial suele ser el 30% del valor de la vivienda (20% en vivienda de interés social). Sumar gastos de escrituración (unos 3%) es buena idea.",
  "Fondo de emergencia":"Lo recomendable es tener de 3 a 6 meses de tus gastos fijos guardados en una cuenta que puedas sacar rápido.",
  "Viaje":"","Estudio":"","Otro":""};
function vMetas(m,c){
  const fc=fcOf(thisMonth());
  const list=S.perfil.metas.map(mt=>{
    const e=metaEstado(mt,S.perfil.ahorros,fc);
    const fechaEst = e.mesesEstim!==null? monthName(idxKey(mIdx(thisMonth())+e.mesesEstim)) : null;
    const msg = {cumplida:["ok","¡Meta cumplida! 🎉"],sinvalor:["","Escribe cuánto cuesta lo que quieres."],sincuentas:["warn","Asigna una o más cuentas de ahorro a esta meta (abajo) para medir tu avance."],
      sinaporte:["warn","Con lo que aportas hoy no llegas: define un aporte mensual en las cuentas de esta meta."],
      sinfecha:["",`A este ritmo llegas en ${fechaEst}. Pon una fecha para saber si vas a tiempo.`],
      atiempo:["ok",`Vas a tiempo: a este ritmo llegas en ${fechaEst}.`],
      atrasada:["bad",`A este ritmo llegas en ${fechaEst||"más de 50 años"}, después de tu fecha. Para llegar a tiempo necesitas aportar ${money(e.necesario)} al mes.`]}[e.estado];
    const ayuda=META_AYUDA[mt.tipo]||"";
    return `<div class="card">
      <div class="card-h"><input aria-label="Nombre de la meta" data-b="metas|${mt.id}|nombre|text" value="${esc(mt.nombre)}" placeholder="Ej: Comprar carro">
        <button class="icon-btn" data-act="del" data-c="metas" data-id="${mt.id}" aria-label="Borrar meta">✕</button></div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("metas",mt.id,"tipo",opts(TIPOS_META,mt.tipo),"Tipo")}
        ${mIn("metas",mt.id,"valor",mt.valor,mt.tipo==="Cuota inicial de vivienda"?"Valor de la vivienda":(mt.tipo==="Carro o moto"?"Precio del vehículo":"Cuánto necesitas"))}
        ${nIn("metas",mt.id,"porcentaje",mt.porcentaje,"% que necesitas ahorrar","100")}
        <label>¿Para cuándo?<input type="month" data-b="metas|${mt.id}|fecha|text" value="${esc(mt.fecha||"")}"></label>
        ${mIn("metas",mt.id,"extra",mt.extra||"","Ya tienes guardado por fuera (opcional)")}
      </div>
      ${ayuda?`<p class="subtle" style="margin:6px 0 0">${ayuda}${mt.tipo==="Fondo de emergencia"?` <button class="btn small" data-act="sugerirEmergencia" data-id="${mt.id}">Calcular con mis gastos</button>`:""}</p>`:""}
      ${e.objetivo<=0?`<p class="alert warn" style="margin:12px 0 0">Escribe cuánto cuesta lo que quieres y el porcentaje que necesitas ahorrar para ver tu avance.</p>`:`<div class="goal">
        <div class="goal-top"><span class="num goal-pct">${Math.round(e.progreso*100)}%</span><span class="subtle">${money(e.ahorrado)} de ${money(e.objetivo)}</span></div>
        <div class="bar big"><span class="${e.estado==="atrasada"?"warn":""}" style="width:${(e.progreso*100).toFixed(1)}%"></span></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Te falta</div><div class="v num">${money(e.falta)}</div></div>
        <div class="stat"><div class="k">Aportas al mes</div><div class="v num">${money(e.aporte)}</div><div class="s">${e.ea>0?`rinde ${(e.ea*100).toFixed(1).replace(".",",")}% E.A.`:"sin rendimientos"}</div></div>
        <div class="stat"><div class="k">Necesitas al mes</div><div class="v num">${e.necesario!==null?money(e.necesario):"—"}</div><div class="s">${e.mesesRest!==null?`para llegar en ${e.mesesRest} mes${e.mesesRest===1?"":"es"}`:"pon una fecha"}</div></div>
        <div class="stat"><div class="k">Llegas en</div><div class="v num">${e.falta<=0.5?"¡Ya!":(fechaEst?monthShort(idxKey(mIdx(thisMonth())+e.mesesEstim)):"—")}</div><div class="s">a tu ritmo actual</div></div>
      </div>
      ${msg?`<p class="alert ${msg[0]}" style="margin:12px 0 0">${msg[1]}</p>`:""}
      <p class="subtle" style="margin:12px 0 2px">Cómo crecería tu ahorro (la línea punteada es la meta${e.mesesRest!==null?"; la vertical, tu fecha":""}):</p>${sparkline(e.serie,e.objetivo,e.mesesRest)}`}
      <p class="subtle" style="margin:12px 0 6px">Cuentas que suman para esta meta:</p>
      <div class="chips">${S.perfil.ahorros.length?S.perfil.ahorros.map(a=>{ const on=a.meta===mt.id; const ea=ahorroEn(a,fc); return `<button class="chip ${on?"on":""}" data-act="assign" data-meta="${mt.id}" data-acc="${a.id}" aria-pressed="${on}">${on?"✓ ":""}${esc(a.nombre||a.tipo)} · ${money(ea?ea.neto:0)}</button>`; }).join(""):`<span class="subtle">Primero crea tus cuentas en la pestaña Ahorros.</span>`}</div>
    </div>`;
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Metas</h2></div>
    <p class="hint">Comprar carro, la cuota inicial de una casa, un fondo de emergencia, un viaje… Escribe cuánto cuesta, qué porcentaje necesitas ahorrar y para cuándo. Luego elige qué cuentas de ahorro suman para esa meta: la app te muestra tu avance, cuánto te falta, cuánto debes ahorrar al mes y cuándo llegarías a tu ritmo actual.</p>
    ${list||`<div class="empty">Aún no tienes metas.</div>`}
    <button class="btn" data-act="add" data-c="metas">Agregar meta</button>
  </section>`;
}
function vHormiga(m,c){
  const list = m.movs.filter(x=>x.tipo==="hormiga").sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const dias = c.estado==="pasado" ? c.dim : Math.max(1,c.trans);
  const prom = c.hormiga/dias, anual = prom*365;
  const porCat = {}; list.forEach(x=>{ porCat[x.cat]=(porCat[x.cat]||0)+(+x.monto||0); });
  const cats = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  const maxC = cats.length?cats[0][1]:1;
  const pctLibre = c.libre>0 ? c.hormiga/c.libre*100 : 0;
  return `<section class="panel">
    <h2>Gastos hormiga</h2>
    <p class="hint">Esos gastos chiquitos que no se sienten: el tinto, la gaseosa, el domicilio. Anótalos aquí con un toque y mira cuánto suman en el año.</p>
    ${quickForm(m,"h",{tipo:"hormiga"})}
  </section>
  <section class="panel">
    <h2>Lo que te cuestan</h2>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="k">Este mes</div><div class="v num ant">${money(c.hormiga)}</div><div class="s">${c.nHormiga} gasto${c.nHormiga===1?"":"s"}</div></div>
      <div class="stat"><div class="k">Promedio por día</div><div class="v num">${money(prom)}</div></div>
      <div class="stat"><div class="k">Al año, a este ritmo</div><div class="v num bad">${money(anual)}</div></div>
      <div class="stat"><div class="k">Si los bajas a la mitad</div><div class="v num ok">${money(anual/2)}</div><div class="s">ahorras al año</div></div>
    </div>
    ${c.hormiga>0?`<p class="subtle" style="margin-top:10px">Los gastos hormiga se llevan el ${pctLibre.toFixed(0)}% de lo que tienes libre este mes.${c.deudaTotal>0?` Con la mitad de lo que gastas al año podrías abonar ${money(anual/2)} a tus deudas.`:""}</p>`:""}
    ${cats.length?`<div style="margin-top:14px;display:grid;gap:8px">${cats.map(([k,v])=>`<div><div style="display:flex;justify-content:space-between;font-size:.88rem"><span>${esc(k)}</span><span class="num">${money(v)}</span></div><div class="bar" style="margin:4px 0 0"><span style="width:${v/maxC*100}%;background:var(--ant)"></span></div></div>`).join("")}</div>`:""}
  </section>
  <section class="panel"><div class="listhead"><h2>Registro</h2></div>${list.length?movList(m,list):`<div class="empty">Sin gastos hormiga este mes. Toca una de las opciones de arriba cuando compres algo pequeño.</div>`}</section>`;
}
function vHistorial(m,c){
  const ks = Object.keys(S.months).sort();
  const rows = ks.map(k=>{ const x=calc(S.months[k]); return {k,ing:x.ingresos,comp:x.compromisos,gast:x.gastado,horm:x.hormiga,ahorro:x.ahorroReal,deuda:x.deudaTotal,int:x.interesesMes,aho:x.ahorroTotal}; });
  const last = rows.slice(-12);
  const series = [["ing","Ingresos","var(--ok)"],["comp","Compromisos","var(--brand)"],["gast","Gasto del día","var(--warn)"],["horm","Hormiga","var(--ant)"]];
  const max = Math.max(1,...last.flatMap(r=>series.map(s=>Math.max(0,r[s[0]]))));
  const W = Math.max(320,last.length*96), H=220, pb=28, pt=10, gw=W/last.length, bw=Math.min(16,(gw-20)/series.length);
  let bars = "";
  last.forEach((r,i)=>{
    series.forEach((s,j)=>{ const v=Math.max(0,r[s[0]]), h=(H-pb-pt)*v/max; const x=i*gw+(gw-bw*series.length)/2+j*bw;
      bars += `<rect x="${x.toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s[2]}"><title>${s[1]} ${monthShort(r.k)}: ${money(v)}</title></rect>`; });
    bars += `<text x="${(i*gw+gw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="Figtree,sans-serif">${monthShort(r.k)}</text>`;
  });
  const d = (cur,prev,goodDown) => { if(prev==null) return ""; const diff=cur-prev; if(Math.abs(diff)<1) return `<div class="subtle">igual</div>`; const up=diff>0; const cls = goodDown ? (up?"up":"down") : (up?"upg":"downg"); return `<div class="${cls}" style="font-size:.75rem">${up?"▲":"▼"} ${money(Math.abs(diff))}</div>`; };
  const tbl = rows.slice().reverse().map((r,ix,arr)=>{ const p=arr[ix+1]; return `<tr>
    <td><button class="btn ghost small" data-act="goMonth" data-v="${r.k}" style="padding:0;color:var(--ink)">${monthName(r.k)}</button></td>
    <td class="num">${money(r.ing)}${d(r.ing,p&&p.ing,false)}</td>
    <td class="num">${money(r.comp)}${d(r.comp,p&&p.comp,true)}</td>
    <td class="num">${money(r.gast)}${d(r.gast,p&&p.gast,true)}</td>
    <td class="num">${money(r.horm)}${d(r.horm,p&&p.horm,true)}</td>
    <td class="num">${money(r.ahorro)}${d(r.ahorro,p&&p.ahorro,false)}</td>
    <td class="num">${money(r.aho)}${d(r.aho,p&&p.aho,false)}</td>
    <td class="num">${money(r.deuda)}${d(r.deuda,p&&p.deuda,true)}</td>
    <td class="num">${money(r.int)}</td></tr>`; }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Mes a mes</h2><button class="btn small" data-act="export">Descargar historial (CSV)</button></div>
    <p class="hint">Cada mes queda guardado como un registro aparte. Usa “Nuevo mes” arriba para empezar el siguiente: se copian tus ingresos, gastos fijos y ahorros. Las tarjetas y créditos siguen solos con sus cuotas.</p>
    <div class="legend" style="margin-bottom:8px">${series.map(s=>`<span><i style="background:${s[2]}"></i>${s[1]}</span>`).join("")}</div>
    <div class="chart scroll"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W,last.length*96)}px" role="img" aria-label="Comparación de meses">${bars}</svg></div>
  </section>
  <section class="panel">
    <h2>Comparación</h2>
    <p class="hint">Las flechas comparan con el mes anterior: verde es mejora, rojo es empeora.</p>
    <div class="scroll"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Compromisos</th><th>Gasto del día</th><th>Hormiga</th><th>Te sobró</th><th>Ahorrado</th><th>Deuda total</th><th>Intereses</th></tr></thead><tbody>${tbl}</tbody></table></div>
  </section>
  <section class="panel">
    <h2>Desde cuándo revisas tus pagos</h2>
    <p class="hint">Desde este mes la app revisa si pagaste lo que te tocaba de cada tarjeta y crédito. Los meses anteriores se dan por pagados.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="month" id="inicioMes" value="${esc(S.perfil.inicio)}"><button class="btn" data-act="setInicio">Guardar</button></div>
  </section>
  <section class="panel">
    <h2>Este mes</h2>
    <p class="hint">Si creaste ${monthName(m.mes)} por error, puedes borrarlo. No se puede deshacer.</p>
    <button class="btn" data-act="delMonth" style="color:var(--bad)">${S.confirmDel?"Toca otra vez para borrar "+monthName(m.mes):"Borrar "+monthName(m.mes)}</button>
  </section>`;
}

// ---------- Acciones ----------
function toast(msg,undoFn){
  const el=$("#toast"); el.innerHTML = esc(msg)+(undoFn?` <button data-act="undo">Deshacer</button>`:""); el.hidden=false;
  S.undo = undoFn||null; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true;S.undo=null;},5000);
}
const PERFIL_COLLS = ["tarjetas","creditos","pagos","tcompra","minReal","ahorros","metas","amov"];
function findColl(m,coll,id){
  if(coll==="amov"){ const [aid,mid]=id.split(":"); const a=S.perfil.ahorros.find(x=>x.id===aid); return a?{arr:a.movs,obj:a.movs.find(x=>x.id===mid)}:{}; }
  if(coll==="tcompra"){ const [tid,cid]=id.split(":"); const t=S.perfil.tarjetas.find(x=>x.id===tid); return t?{arr:t.compras,obj:t.compras.find(x=>x.id===cid)}:{}; }
  const arr = PERFIL_COLLS.includes(coll) ? S.perfil[coll] : m[coll]; return {arr, obj: arr ? arr.find(x=>x.id===id) : null};
}
const saveFor = coll => PERFIL_COLLS.includes(coll) ? savePerfil() : save();
function newMonth(auto){
  const ks = Object.keys(S.months).sort(); const last = ks[ks.length-1];
  let k = nextMonth(last);
  if(!S.months[thisMonth()] && thisMonth()>last) k = thisMonth();
  const src = S.months[last];
  const n = blankMonth(k);
  n.metaAhorroPct = src.metaAhorroPct;
  n.ingresos = src.ingresos.filter(x=>x.frec!=="unico").map(x=>({...x}));
  n.gastos = src.gastos.filter(x=>x.frec!=="unico").map(x=>({...x}));
  S.months[k]=n; S.cur=k; save(k);
  if(auto){ S.autoMes=k; return; }
  render(); toast(`Creaste ${monthName(k)}. Tus tarjetas, créditos y ahorros siguen solos.`);
}
function exportCSV(){
  const ks=Object.keys(S.months).sort();
  const lines=[["Mes","Ingresos","Compromisos en efectivo","Gasto del día","Gastos hormiga","Te sobró","Ahorrado","Deuda total","Intereses del mes"].join(";")];
  ks.forEach(k=>{ const x=calc(S.months[k]); lines.push([monthName(k),x.ingresos,x.compromisos,x.gastado,x.hormiga,x.ahorroReal,x.ahorroTotal,x.deudaTotal,x.interesesMes].map(v=>typeof v==="number"?Math.round(v):v).join(";")); });
  lines.push(""); lines.push(["Mes","Fecha","Tipo","Descripción","Categoría","Valor"].join(";"));
  ks.forEach(k=>S.months[k].movs.forEach(x=>lines.push([monthName(k),x.fecha,x.tipo,(x.desc||"").replace(/;/g,","),x.cat,x.monto].join(";"))));
  const blob = new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="mi-presupuesto.csv"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

document.addEventListener("click",async e=>{
  if(!S.user) return;
  if(S.menu && !e.target.closest(".menu") && !e.target.closest('[data-act="menu"]')){ S.menu=false; S.confirmAll=false; renderMenu(); }
  const tabBtn = e.target.closest("#tabs button");
  if(tabBtn){ S.tab=tabBtn.dataset.tab; S.confirmDel=false; S.firstTime=false; try{localStorage.setItem("pd:tab",S.tab);}catch(_){} render(); window.scrollTo({top:0}); return; }
  const b = e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act, m=M();
  if(act==="menu"){ S.menu=!S.menu; S.confirmAll=false; renderMenu(); return; }
  if(act==="logout"){ flushAll(); S.menu=false; await signOut(auth); return; }
  if(act==="install"){ if(S.installEvt){ S.installEvt.prompt(); S.installEvt=null; S.menu=false; renderMenu(); } return; }
  if(act==="delAll"){
    if(!S.confirmAll){ S.confirmAll=true; renderMenu(); return; }
    for(const k of [...Object.keys(S.months),"perfil"]){ clearTimeout(pending.get(k)); pending.delete(k); try{ await deleteDoc(monthDoc(k)); }catch(err){ console.error(err); } }
    const k=thisMonth(); S.months={[k]:blankMonth(k)}; S.perfil=blankPerfil(); S.cur=k; S.menu=false; S.confirmAll=false; save(k); savePerfil(); S.tab="ingresos"; render(); toast("Borraste todos tus datos."); return;
  }
  if(act==="movTipo"){ S.movTipo=b.dataset.v; render(); return; }
  if(act==="hchip"){ const v=b.dataset.v; S.hcat = S.hcat===v ? "" : v; S.hval = S.hcat ? ultimoValor(v) : 0; render(); const i=$("#hq-monto"); if(i){ i.focus(); try{ i.select(); }catch(_){} } return; }
  if(act==="goTab"){ S.tab=b.dataset.v; try{localStorage.setItem("pd:tab",S.tab);}catch(_){} render(); window.scrollTo({top:0}); return; }
  if(act==="chip"){ const f=b.dataset.f; $("#"+f+"-desc").value=b.dataset.v; const sel=$("#"+f+"-cat"); if([...sel.options].some(o=>o.value===b.dataset.v)) sel.value=b.dataset.v; $("#"+f+"-monto").focus(); return; }
  if(act==="addMov"){
    const f=b.dataset.f, form=document.querySelector(`[data-form="${f}"]`), tipo=form.dataset.tipo;
    const monto=parseMoney($("#"+f+"-monto").value);
    if(!monto){ $("#"+f+"-monto").focus(); toast("Escribe el valor."); return; }
    const fecha = ($("#"+f+"-fecha")||{}).value || defDate(m);
    if(fecha.slice(0,7)!==m.mes){ toast(`La fecha debe ser de ${monthName(m.mes)}.`); return; }
    const medio = ($("#"+f+"-medio")||{}).value || "efectivo";
    m.movs.push({id:uid(),fecha,tipo,monto,desc:$("#"+f+"-desc").value.trim(),cat:$("#"+f+"-cat").value,medio});
    if(f==="hq"){ S.hcat=""; S.hval=0; }
    save(); render(); toast(`Anotaste ${money(monto)}${tipo==="hormiga"?" en gastos hormiga":""}.`);
    const nf=$("#"+f+"-monto"); if(nf) nf.focus();
    return;
  }
  if(act==="add"){
    const c=b.dataset.c, id=uid();
    const d = { ingresos:{id,nombre:"",monto:0,frec:"mensual",tipo:"fijo"},
      gastos:{id,nombre:"",monto:0,frec:"mensual",cat:"Vivienda",tipo:"fijo",medio:"efectivo"},
      tarjetas:{id,nombre:"",clase:"Tarjeta de crédito",franquicia:"Visa",cupo:0,tasa:"",tipoTasa:"EA",sistema:"capital",manejo:0,cobraSiempre:true,planExtra:0,compras:[],minReal:{}},
      creditos:{id,nombre:"",tipo:"Libre inversión",valor:0,cuotas:12,tasa:"",tipoTasa:"EA",sistema:"fija",primerPago:m.mes,cuotaReal:0,seguro:0,planExtra:0},
      ahorros:{id,nombre:"",tipo:"Cuenta de ahorros",entidad:"",apertura:todayISO(),inicial:0,tasa:"",aporte:0,plazo:"",retencion:0,saldoReal:0,fechaReal:"",meta:"",movs:[]},
      metas:{id,nombre:"",tipo:"Carro o moto",valor:0,porcentaje:100,fecha:"",extra:0} }[c];
    (PERFIL_COLLS.includes(c)?S.perfil:m)[c].push(d); saveFor(c); render();
    const inp=document.querySelector(`[data-b^="${c}|${id}|nombre"]`); if(inp) inp.focus();
    return;
  }
  if(act==="addCompra"){
    const id=b.dataset.id, t=S.perfil.tarjetas.find(x=>x.id===id); if(!t) return;
    const valor=parseMoney($(`#nc-${id}-valor`).value), fecha=$(`#nc-${id}-fecha`).value, cuotas=Math.max(1,Math.round(parseNum($(`#nc-${id}-cuotas`).value)||1));
    if(!valor){ $(`#nc-${id}-valor`).focus(); toast("Escribe el valor de la compra."); return; }
    if(!fecha){ toast("Escribe la fecha de la compra."); return; }
    t.compras.push({id:uid(),fecha,desc:$(`#nc-${id}-desc`).value.trim(),valor,cuotas,primerCobro:""}); savePerfil(); render();
    toast(`Compra de ${money(valor)} a ${cuotas} cuota${cuotas===1?"":"s"} agregada.`); return;
  }
  if(act==="del"){
    const {arr,obj}=findColl(m,b.dataset.c,b.dataset.id); if(!arr||!obj) return;
    const c=b.dataset.c, ix=arr.indexOf(obj); arr.splice(ix,1);
    let quitados=[];
    if(c==="tarjetas"||c==="creditos"){ quitados=S.perfil.pagos.filter(p=>p.oblig===obj.id); S.perfil.pagos=S.perfil.pagos.filter(p=>p.oblig!==obj.id); }
    if(c==="metas"){ quitados=S.perfil.ahorros.filter(a=>a.meta===obj.id); quitados.forEach(a=>a.meta=""); }
    saveFor(c); render();
    toast("Borrado.",()=>{ arr.splice(ix,0,obj); if(c==="metas") quitados.forEach(a=>a.meta=obj.id); else S.perfil.pagos.push(...quitados); saveFor(c); render(); });
    return;
  }
  if(act==="addPago"){
    const id=b.dataset.id, v=parseMoney($(`#pg-${id}-valor`).value), tipo=$(`#pg-${id}-tipo`).value, fecha=$(`#pg-${id}-fecha`).value||defDate(m);
    if(!v){ $(`#pg-${id}-valor`).focus(); toast("Escribe el valor del pago."); return; }
    S.perfil.pagos.push({id:uid(),oblig:id,tipo,fecha,valor:v}); savePerfil(); render();
    toast(`${tipo==="abono"?"Abono":"Pago"} de ${money(v)} registrado${fecha.slice(0,7)!==m.mes?` en ${monthName(fecha.slice(0,7))}`:""}.`); return;
  }
  if(act==="addAmov"){
    const id=b.dataset.id, a=S.perfil.ahorros.find(x=>x.id===id); if(!a) return;
    const v=parseMoney($(`#am-${id}-valor`).value), tipo=$(`#am-${id}-tipo`).value, fecha=$(`#am-${id}-fecha`).value||todayISO();
    if(!v){ $(`#am-${id}-valor`).focus(); toast("Escribe el valor."); return; }
    if(a.apertura && fecha<a.apertura){ toast("La fecha es anterior a la apertura de la cuenta."); return; }
    a.movs.push({id:uid(),fecha,tipo,valor:v}); savePerfil(); render(); toast(`${tipo==="retiro"?"Retiro":"Aporte"} de ${money(v)} registrado.`); return;
  }
  if(act==="assign"){
    const a=S.perfil.ahorros.find(x=>x.id===b.dataset.acc); if(!a) return;
    a.meta = a.meta===b.dataset.meta ? "" : b.dataset.meta; savePerfil(); render(); return;
  }
  if(act==="sugerirEmergencia"){
    const mt=S.perfil.metas.find(x=>x.id===b.dataset.id); if(!mt) return; const c=calc(M());
    mt.valor=Math.round((c.gasTotal+c.tarComp+c.creComp)*6/1000)*1000; mt.porcentaje=100; savePerfil(); render(); toast(`Meta: 6 meses de tus gastos fijos y deudas (${money(mt.valor)}).`); return;
  }
  if(act==="setInicio"){ const v=$("#inicioMes").value; if(/^\d{4}-\d{2}$/.test(v)){ S.perfil.inicio=v; savePerfil(); render(); toast(`Ahora se revisan tus pagos desde ${monthName(v)}.`); } return; }
  if(act==="undo"){ if(S.undo){ S.undo(); S.undo=null; } $("#toast").hidden=true; return; }
  if(act==="newMonth"){ newMonth(); return; }
  if(act==="goMonth"){ S.cur=b.dataset.v; S.tab="hoy"; render(); return; }
  if(act==="delMonth"){
    if(Object.keys(S.months).length<=1){ toast("Necesitas al menos un mes."); return; }
    if(!S.confirmDel){ S.confirmDel=true; render(); return; }
    const k=S.cur; clearTimeout(pending.get(k)); pending.delete(k); delete S.months[k];
    deleteDoc(monthDoc(k)).catch(()=>setStatus("No se pudo borrar el mes"));
    S.confirmDel=false; const ks=Object.keys(S.months).sort(); S.cur=ks[ks.length-1]; render(); toast(`Borraste ${monthName(k)}.`); return;
  }
  if(act==="export"){ exportCSV(); return; }
});
document.addEventListener("change",e=>{
  if(!S.user) return;
  if(e.target.id==="monthSel"){ S.cur=e.target.value; S.confirmDel=false; render(); return; }
  const bnd = e.target.dataset.b; if(!bnd) return;
  const [coll,id,field,type] = bnd.split("|"); const m=M();
  const val = type==="money" ? parseMoney(e.target.value) : (type==="num" ? (e.target.value.trim()===""?"":parseNum(e.target.value)) : e.target.value);
  if(coll==="meta"){ m[field]=val===""?0:val; save(); }
  else if(coll==="minReal"){ const t=S.perfil.tarjetas.find(x=>x.id===id); if(!t) return; if(!t.minReal) t.minReal={};
    if(e.target.value.trim()==="") delete t.minReal[field]; else t.minReal[field]=val; savePerfil(); }
  else { const {obj}=findColl(m,coll,id); if(!obj) return; obj[field]= field==="cobraSiempre" ? (val!=="no") : val;
    if(coll==="metas" && field==="tipo"){ if(val==="Cuota inicial de vivienda" && (+obj.porcentaje===100||obj.porcentaje==="")) obj.porcentaje=30; if(val!=="Cuota inicial de vivienda" && val!=="Carro o moto" && +obj.porcentaje===30) obj.porcentaje=100; if(!obj.nombre) obj.nombre=val; }
    if(coll==="ahorros" && field==="tipo" && val==="CDT" && !obj.retencion) obj.retencion=4;
    saveFor(coll); }
  scheduleRender();
});
// Redibuja después de que el foco ya pasó al siguiente campo, y nunca con el dedo/clic presionado,
// para no perder lo que la persona está escribiendo ni el toque en un botón.
let pointerDown=false, needRender=false;
document.addEventListener("pointerdown",()=>{ pointerDown=true; },true);
document.addEventListener("pointerup",()=>{ pointerDown=false; if(needRender) setTimeout(flushRender,0); },true);
document.addEventListener("pointercancel",()=>{ pointerDown=false; if(needRender) setTimeout(flushRender,0); },true);
function scheduleRender(){ needRender=true; if(!pointerDown) setTimeout(flushRender,0); }
function flushRender(){
  if(!needRender || pointerDown) return; needRender=false;
  const a=document.activeElement;
  const key = a && a!==document.body ? (a.dataset && a.dataset.b ? `[data-b="${CSS.escape(a.dataset.b)}"]` : (a.id ? "#"+CSS.escape(a.id) : null)) : null;
  const val = key && a.value!==undefined && a.value!==a.defaultValue ? a.value : null; // solo si la persona escribió algo
  render();
  if(key){ const el=document.querySelector(key); if(el){ if(val!==null && el.value!==val && !(el.dataset.b && el.dataset.b.includes("|money"))) el.value=val; el.focus(); try{ const l=el.value.length; el.setSelectionRange(l,l); }catch(e){} } }
}
document.addEventListener("keydown",e=>{
  if(e.key==="Enter" && e.target.closest("[data-form]")){ const f=e.target.closest("[data-form]").dataset.form; const btn=document.querySelector(`[data-act="addMov"][data-f="${f}"]`); if(btn) btn.click(); }
});

// ---------- App instalable (funciona sin internet) ----------
if("serviceWorker" in navigator){ window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{})); }
