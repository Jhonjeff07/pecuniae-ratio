import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDocs, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ahorroEn, proyectarAhorro, metaEstado, TIPOS_AHORRO, TIPOS_META, toDate, addMonths } from "./ahorros.js";
import { abrirTeclado, cerrarTeclado, crearPin, pinCorrecto, tecladoAbierto, limpiarFallos, mensajeTeclado } from "./clave.js";
import { prestamoEstado, venceEnMes, iso2t } from "./prestamos.js";
import { mIdx, idxKey, daysIn, FREQ, factor, tasaMes, cardState, creditState, consejos, ordenPago, CLASES_ROTATIVAS, TIPOS_CUOTAS, cuotaNeta, tasaDesdeCuota } from "./engine.js";

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
// La hormiga que camina mientras carga (viene en index.html)
const LOADER = (document.querySelector("#root")||{}).innerHTML || "";
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
const LOGO = "icons/logo.svg";
const MIN_FUERA = 5;   // minutos en segundo plano antes de volver a pedir la clave
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
const S = { user:null, months:{}, perfil:null, cur:null, open:new Set(), guia:null, help:null, dlg:null, tab:"hoy", movTipo:"gasto", undo:null, menu:false, confirmDel:false, confirmAll:false, installEvt:null };

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
function blankPerfil(){ return { v:5, inicio: thisMonth(), tarjetas:[], creditos:[], pagos:[], ahorros:[], metas:[], prestamos:[], guia:null, topes:{}, privacidad:null, pin:null }; }
function normalizePerfil(p){
  const mig = p.ahorros==null;
  const b=blankPerfil(); for(const k of Object.keys(b)) if(p[k]==null) p[k]=b[k];
  if(mig){ migrarAhorros(p); S.migrado=true; }
  p.ahorros.forEach(a=>{ if(!Array.isArray(a.movs)) a.movs=[]; });
  if(!Array.isArray(p.prestamos)) p.prestamos=[];
  p.prestamos.forEach(x=>{ if(!Array.isArray(x.pagos)) x.pagos=[]; });
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
function setStatus(t){
  const el=$("#status"); if(!el) return;
  const ok = t==="Guardado"||t==="Conectado", saving = t.startsWith("Guardando"), bad = /No se pudo|límite/.test(t);
  el.textContent = ok ? "✓ Todo guardado en tu cuenta" : (saving ? "Guardando…" : t);
  el.className = "status " + (ok?"st-ok":saving?"st-saving":bad?"st-bad":"st-warn");
}
// Guarda ya y confirma con un mensaje cuando la nube responde
function confirmSaved(msg, extra=""){
  flushAll();
  const x = extra ? " "+extra : "";
  if(!navigator.onLine){ toast(`${msg} en este dispositivo. Se sube a tu cuenta cuando vuelva el internet.${x}`); return; }
  Promise.all(Object.values(chains)).then(()=>{ const el=$("#status"); toast(el && el.classList.contains("st-bad") ? "No se pudo guardar. Revisa tu conexión." : `✓ ${msg} en tu cuenta.${x}`); });
}
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
    <img class="logo" src="icons/logo.svg" alt="">
    <h1>Falta conectar Firebase</h1>
    <p>Abre el archivo <b>firebase-config.js</b> y pega la configuración de tu proyecto, como dice el Paso 6 de la guía. Después vuelve a subir los archivos.</p>
  </div></div>`;
}else{
  onAuthStateChanged(auth, async user=>{
    S.user = user; cerrarTeclado(true);
    if(!user){ renderLogin(); return; }
    // Si la hormiga ya está caminando, solo cambia el texto (así la animación no se reinicia)
    const lt=$(".loader .ltxt");
    if(lt && lt.firstChild) lt.firstChild.nodeValue="Abriendo tus cuentas";
    else $("#root").innerHTML = LOADER.replace(">Cargando<",">Abriendo tus cuentas<");
    try{ await loadMonths(); }
    catch(e){ console.error(e); $("#root").innerHTML = `<div class="screen"><div class="login"><h1>No se pudieron cargar tus datos</h1><p>Revisa tu conexión y recarga la página. Si eres quien publicó la app, revisa que las reglas de Firestore estén publicadas (Paso 3 de la guía).</p><button class="btn" onclick="location.reload()">Recargar</button></div></div>`; return; }
    if(!Object.keys(S.months).length){ const k=thisMonth(); S.months[k]=blankMonth(k); save(k); }
    if(!S.perfil){ S.perfil=blankPerfil(); const ks0=Object.keys(S.months).sort(); S.perfil.inicio=ks0[0];
      // Cuenta nueva: aceptó el aviso al entrar con Google en la pantalla de inicio
      if(sinDatos()){ S.perfil.privacidad={acepto:true,fecha:todayISO(),version:1,como:"registro"}; S.perfil.novedades=NOVEDADES_ID; }
      savePerfil(); }
    if(!S.months[thisMonth()] && Object.keys(S.months).sort().pop() < thisMonth()){ newMonth(true); }
    const ks = Object.keys(S.months).sort();
    S.cur = S.months[thisMonth()] ? thisMonth() : ks[ks.length-1];
    try{ const t=localStorage.getItem("pd:tab"); if(t) S.tab=t; }catch(e){}
    if(!S.perfil.guia && sinDatos()){ S.guia={paso:0,form:null,done:false,tmp:{}}; }
    if(S.perfil.pin) pedirClave();
    renderShell(); render();
    if(S.migrado){ savePerfil(); S.migrado=false; }
    if(S.autoMes){ toast(`Empezó ${monthName(S.autoMes)}: copié tus ingresos y gastos fijos del mes anterior.`); S.autoMes=null; }
  });
}

function renderLogin(err){
  $("#root").innerHTML = `<div class="screen"><div class="login">
    <img class="logo" src="icons/logo.svg" alt="">
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
    <p class="fine">Solo tú puedes ver tu información. Es gratis. Al entrar aceptas el <button class="linkbtn" id="vPriv">aviso de privacidad</button>.</p>
  </div></div><div id="modal"></div>`;
  $("#vPriv").onclick = ()=>{ S.dlg={kind:"privacidad"}; renderModal(); };
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
      <h1><img class="hlogo" src="icons/logo.svg" alt="">Pecuniae Ratio</h1>
      <div class="monthpick">
        <select id="monthSel" aria-label="Mes"></select>
        <button class="btn small" data-act="newMonth">Nuevo mes</button>
      </div>
      <button class="btn small guiabtn" data-act="gAbrir">🧭 Guía</button>
      <button class="avatar helpbtn" data-act="help" aria-label="Ayuda">?</button>
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
      <button role="tab" data-tab="prestamos">Préstamos</button>
      <button role="tab" data-tab="ahorros">Ahorros</button>
      <button role="tab" data-tab="metas">Metas</button>
      <button role="tab" data-tab="hormiga">Gastos hormiga</button>
      <button role="tab" data-tab="historial">Comparar meses</button>
    </nav>
  </header>
  <main id="app"></main>
  <div id="modal"></div>`;
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
  const hoyI = todayISO(), refI = k<thisMonth() ? k+"-"+pad(dim) : hoyI;
  const prs = (S.perfil.prestamos||[]).map(p=>({p,e:prestamoEstado(p,refI)}));
  const prestComp = sum(prs.filter(o=>o.p.dir==="debo"),o=>venceEnMes(o.p,k,hoyI));
  const lesDebo = sum(prs.filter(o=>o.p.dir==="debo"),o=>o.e.saldo), teDeben = sum(prs.filter(o=>o.p.dir==="medeben"),o=>o.e.saldo);
  prs.filter(o=>o.p.dir==="debo" && o.e.estado==="atrasado").forEach(o=>atrasos.push({x:o.e,n:"préstamo de "+(o.p.persona||"alguien")}));
  const compromisos = gasCash+tarComp+creComp+aportes+prestComp;
  const metaAhorro = Math.max(0,ingresos)*((+m.metaAhorroPct||0)/100);
  const libre = ingresos-compromisos-metaAhorro;
  const gastosDia = m.movs.filter(x=>x.tipo!=="ingreso" && !(+x.cuotas>1) && x.fecha && x.fecha.slice(0,7)===k);
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
  const deudaTotal = sum(tc,x=>x.deuda)+sum(cc,x=>x.deuda)+lesDebo;
  const interesesMes = sum(tc,x=>x.interes)+sum(cc,x=>x.interes);
  const ahorroTotal = sum(ahs.filter(x=>x.e),x=>x.e.neto);
  return {prs,prestComp,lesDebo,teDeben,dim,ingPlan,ingExtra,ingresos,gasCash,gasTotal,tarComp,creComp,deudaPagado,deudaFalta,atrasos,aportes,tc,cc,compromisos,metaAhorro,libre,gastado,hormiga,porDia,
    estado,trans,rest,gastHoy,baseHoy,quedaHoy,proyGasto,ahorroReal,ahorroProy,deudaTotal,interesesMes,ahorroTotal,diaBase:libre/dim,
    nHormiga:gastosDia.filter(x=>x.tipo==="hormiga").length};
}

// ---------- Render ----------
const M = () => S.months[S.cur];
function render(){
  document.body.classList.toggle("en-guia", !!S.guia);
  if(S.guia){ S.cur=thisMonth(); renderMonthSel(); $("#app").innerHTML=vGuia(); renderMenu(); renderModal(); return; }
  renderMonthSel();
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.tab===S.tab)));
  const m = M(), c = calc(m);
  const views = {hoy:vHoy, ingresos:vIngresos, gastos:vGastos, tarjetas:vTarjetas, creditos:vCreditos, prestamos:vPrestamos, ahorros:vAhorros, metas:vMetas, hormiga:vHormiga, historial:vHistorial};
  $("#app").innerHTML = (S.tab==="hoy" ? novedadesCard() + guiaBanner() : "") + (views[S.tab]||vHoy)(m,c);
  renderMenu(); renderModal();
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
    ${S.perfil.ultimaCopia?"":`<p class="subtle" style="margin:0 0 6px">Consejo: descarga de vez en cuando una copia de seguridad.</p>`}
    ${S.installEvt?`<button class="btn" data-act="install">Instalar la app</button>`:""}
    ${ios?`<p class="subtle" style="margin:0 0 4px">Para instalarla en iPhone: toca Compartir y luego “Agregar a inicio”.</p>`:""}
    <button class="btn" data-act="novVer">✨ Novedades</button>
    <button class="btn" data-act="cal">📅 Pagos a mi calendario</button>
    <button class="btn" data-act="clave">🔒 Clave de acceso${S.perfil.pin?` <small class="subtle">· activada</small>`:""}</button>
    <div class="msep">Tus datos</div>
    <button class="btn" data-act="copiaDescargar">Descargar copia de seguridad</button>
    <button class="btn" data-act="copiaElegir">Restaurar una copia</button>
    <input type="file" id="copiaFile" accept=".json,application/json" hidden>
    <button class="btn" data-act="export">Descargar tabla para Excel (CSV)</button>
    <button class="btn ghost" data-act="privacidad">Aviso de privacidad</button>
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
  if(c.atrasos.length) alerta += `<div class="alert bad">Tienes pagos atrasados en: ${c.atrasos.map(o=>esc(o.n||"sin nombre")).join(", ")}. Revisa las pestañas Tarjetas, Créditos y Préstamos.</div>`;
  if(c.ingresos===0 && c.compromisos===0){}
  else if(c.libre<0) alerta += `<div class="alert bad">Tus compromisos y tu meta de ahorro superan lo que entra este mes por ${money(-c.libre)}. Baja algún gasto, ajusta la meta de ahorro o anota un ingreso extra.</div>`;
  else if(c.estado==="actual" && c.proyGasto>c.libre+0.5) alerta += `<div class="alert warn">A este ritmo gastarías ${money(c.proyGasto)} en el mes, ${money(c.proyGasto-c.libre)} más de lo que tienes libre.</div>`;
  else if(c.estado==="actual" && c.gastado>0) alerta += `<div class="alert ok">Vas bien: a este ritmo terminas el mes con ${money(c.ahorroProy)} sin gastar.</div>`;
  for(const a of alertasTopes(m)) alerta += a.nivel==="bad"
    ? `<div class="alert bad">Te pasaste del tope de <b>${esc(a.cat)}</b>: llevas ${money(a.v)} de ${money(a.t)}. <button class="linkbtn" data-act="goTab" data-v="gastos">Ver topes</button></div>`
    : `<div class="alert warn">Vas en el ${Math.round(a.v/a.t*100)}% del tope de <b>${esc(a.cat)}</b>: te quedan ${money(a.t-a.v)} este mes.</div>`;
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
  ${proximosPagos(m,c)}
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
      <div class="stat"><div class="k">Compromisos del mes</div><div class="v num">${money(c.compromisos)}</div><div class="s">gastos fijos ${money(c.gasCash)}, tarjetas ${money(c.tarComp)}, créditos ${money(c.creComp)}${c.prestComp?`, préstamos ${money(c.prestComp)}`:""}${c.aportes?`, ahorro ${money(c.aportes)}`:""}</div></div>
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
    <div class="listhead" style="margin-bottom:6px"><h2>¿Nuevo gasto hormiga? ${hb("hormiga")}</h2>
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
  const tp=tilePrestamos(c); if(tp) tiles.splice(Math.min(3,tiles.length),0,tp);
  if(!tiles.length) return "";
  return `<section class="panel"><h2>Cómo va todo ${hb("hoy")}</h2><p class="hint" style="margin-bottom:12px">Toca cualquier tarjeta para ver el detalle.</p><div class="vts">${tiles.join("")}</div></section>`;
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
      ${t==="gasto"&&S.perfil.tarjetas.length?`<label class="subtle" id="${pfx}-cuotasWrap" hidden>Cuotas <input id="${pfx}-cuotas" inputmode="numeric" value="1" style="width:56px;padding:5px 8px"></label>`:""}
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
      <span class="tag ${x.tipo}">${x.tipo==="hormiga"?"Hormiga":(x.tipo==="ingreso"?"Ingreso":(+x.cuotas>1?"A cuotas":"Gasto"))}</span>
      <div><div>${esc(x.desc||x.cat)}</div><div class="d">${esc(x.fecha||"")} · ${esc(x.cat||"")}${x.medio&&x.medio!=="efectivo"?" · "+esc(tname(x.medio)):""}${+x.cuotas>1?` · ${x.cuotas} cuotas, se cobra en la tarjeta`:""}</div></div>
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
    <div class="listhead"><h2>Ingresos ${hb("ingresos")}</h2><span class="total num">${money(c.ingPlan)} al mes</span></div>
    <p class="hint">Sueldo, primas, trabajos extra, ventas, arriendos… Elige cada cuánto llega y si es fijo, variable o esporádico; la app lo convierte a valor mensual. Para un ingreso variable pon lo que esperas; lo que ganes de más anótalo en Hoy como ingreso extra.</p>
    <div class="rows">${m.ingresos.length?m.ingresos.map(x=>fold("i:"+x.id, sumRow(esc(x.nombre||"Ingreso sin nombre"), `${money(x.monto)} ${FREQ_TXT(x.frec)} · ${x.tipo==="variable"?"variable":x.tipo==="esporadico"?"esporádico":"fijo"}`, `${money((+x.monto||0)*factor(x.frec,m.mes))}<small>al mes</small>`), `
      <div class="row r-ing">
        ${tIn("ingresos",x.id,"nombre",x.nombre,"Nombre","Ej: sueldo")}
        ${mIn("ingresos",x.id,"monto",x.monto,"Valor")}
        ${sIn("ingresos",x.id,"frec",freqOpts(x.frec),"Cada cuánto")}
        ${sIn("ingresos",x.id,"tipo",`<option value="fijo" ${x.tipo==="fijo"?"selected":""}>Fijo</option><option value="variable" ${x.tipo==="variable"?"selected":""}>Variable</option><option value="esporadico" ${x.tipo==="esporadico"?"selected":""}>Esporádico</option>`,"Tipo")}
        <div class="calc">Al mes<br><b>${money((+x.monto||0)*factor(x.frec,m.mes))}</b></div>
        <button class="icon-btn" data-act="del" data-c="ingresos" data-id="${x.id}" aria-label="Borrar">✕</button>
      </div>`,"Ingreso guardado")).join(""):`<div class="empty">Agrega tu primer ingreso, por ejemplo tu sueldo.</div>`}
    </div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="ingresos">Agregar ingreso</button></div>
    ${byGroup(m.ingresos,"tipo",{fijo:"Fijos",variable:"Variables",esporadico:"Esporádicos"},x=>(+x.monto||0)*factor(x.frec,m.mes))}
    ${c.ingExtra>0?`<p class="subtle" style="margin-top:10px">Además anotaste ${money(c.ingExtra)} de ingresos extra este mes en Hoy.</p>`:""}
  </section>`;
}
function vGastos(m,c){
  const reserva = m.gastos.filter(g=>["bimestral","trimestral","semestral","anual"].includes(g.frec));
  return `<section class="panel">
    <div class="listhead"><h2>Gastos planeados ${hb("gastos")}</h2><span class="total num">${money(c.gasTotal)} al mes</span></div>
    <p class="hint">Arriendo, servicios, mercado, transporte, matrícula, SOAT… Los gastos semestrales o anuales se reparten mes a mes para que vayas apartando. Si un gasto lo cargas a una tarjeta, elige la tarjeta: no sale de tu efectivo este mes, pero sube el saldo de esa tarjeta.</p>
    <div class="rows">${m.gastos.length?m.gastos.map(x=>fold("g:"+x.id, sumRow(esc(x.nombre||"Gasto sin nombre"), `${money(x.monto)} ${FREQ_TXT(x.frec)} · ${esc(x.cat||"")}${x.medio&&x.medio!=="efectivo"?" · con tarjeta":""}`, `${money((+x.monto||0)*factor(x.frec,m.mes))}<small>al mes</small>`), `
      <div class="row r-gas">
        ${tIn("gastos",x.id,"nombre",x.nombre,"Nombre","Ej: arriendo")}
        ${mIn("gastos",x.id,"monto",x.monto,"Valor")}
        ${sIn("gastos",x.id,"frec",freqOpts(x.frec),"Cada cuánto")}
        ${sIn("gastos",x.id,"cat",opts(CAT_GASTO,x.cat),"Categoría")}
        ${sIn("gastos",x.id,"tipo",`<option value="fijo" ${x.tipo!=="variable"?"selected":""}>Fijo</option><option value="variable" ${x.tipo==="variable"?"selected":""}>Variable</option>`,"Tipo")}
        ${sIn("gastos",x.id,"medio",medioOpts(m,x.medio,{efectivoLabel:"Efectivo"}),"Se paga con")}
        <button class="icon-btn" data-act="del" data-c="gastos" data-id="${x.id}" aria-label="Borrar">✕</button>
        <div class="calc" style="grid-column:1/-1">Al mes: <b>${money((+x.monto||0)*factor(x.frec,m.mes))}</b>${["semestral","anual","bimestral","trimestral"].includes(x.frec)?" · aparta esto cada mes":""}</div>
      </div>`,"Gasto guardado")).join(""):`<div class="empty">Agrega tu primer gasto fijo, por ejemplo el arriendo.</div>`}
    </div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="gastos">Agregar gasto</button></div>
    ${byGroup(m.gastos,"cat",Object.fromEntries(CAT_GASTO.map(x=>[x,x])),x=>(+x.monto||0)*factor(x.frec,m.mes))}
    ${reserva.length?`<p class="subtle" style="margin-top:12px">Para tus gastos de varios meses (${reserva.map(r=>esc(r.nombre||"sin nombre")).join(", ")}) conviene apartar ${money(sum(reserva,r=>(+r.monto||0)*factor(r.frec,m.mes)))} cada mes.</p>`:""}
  </section>
  ${enQueSeVa(m,c)}`;
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
    return fold("t:"+t.id, sumRow(esc(t.nombre||"Tarjeta sin nombre"), `${esc(t.clase||"Tarjeta de crédito")} · te toca ${money(k.min)}${+t.diaPago?` el día ${+t.diaPago}`:""}`, `${money(k.deuda)}<small>debes</small>`, estadoBadge(k)), `<div class="card">
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
        ${nIn("tarjetas",t.id,"diaPago",t.diaPago,"Día del mes en que pagas","Ej: 15")}
        ${sIn("tarjetas",t.id,"cobraSiempre",`<option value="si" ${t.cobraSiempre!==false?"selected":""}>Sí, aunque no la use</option><option value="no" ${t.cobraSiempre===false?"selected":""}>Solo si la uso</option>`,"¿Cobra manejo sin uso?")}
        ${mIn("tarjetas",t.id,"planExtra",t.planExtra||"","Abono extra que planeas al mes")}
      </div>
      <h3 class="sub-h">${cap(monthName(m.mes))} ${estadoBadge(k)} ${deudaBadge(k)}</h3>
      <p class="subtle" style="margin:-4px 0 10px">${k.ultimoUso===null?"Aún no tiene compras registradas.":(k.mesesSinUso===0?"La usaste este mes.":`Último uso: ${monthName(idxKey(k.ultimoUso))} (hace ${k.mesesSinUso} mes${k.mesesSinUso===1?"":"es"}).`)}</p>
      <div class="stats">
        <div class="stat"><div class="k">Te toca pagar</div><div class="v num">${money(k.min)}</div><div class="s">${k.minReal!==undefined&&k.minReal!==""?"según tu extracto":(k.min<=0.5?"no debes nada":`capital ${money(k.capDue)} + intereses ${money(k.interes)}${k.manejo?` + manejo ${money(k.manejo)}`:""}${k.mora>0.5?` + atrasado ${money(k.mora)}`:""}`)}</div></div>
        <div class="stat"><div class="k">Pagaste</div><div class="v num ok">${money(k.pagado+k.abonos)}</div><div class="s">${k.pagado+k.abonos>0.5?`a capital ${money(k.pagoCapital)} · intereses ${money(k.pagoInteres)}${k.pagoCargos>0.5?` · manejo ${money(k.pagoCargos)}`:""}`:"pago del mes"}</div></div>
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
    </div>`,"Tarjeta guardada");
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Tarjetas y cupos rotativos ${hb("tarjetas")}</h2><span class="total num">${money(sum(c.tc,x=>x.deuda))} en total</span></div>
    <p class="hint"><b>Rotativo</b> = tienes un cupo: lo que pagas se libera y lo puedes volver a usar (tarjetas de crédito, créditos rotativos, cupos de almacén o apps como Sistecrédito). Escribe cada compra con sus cuotas y registra tus pagos: el pago mínimo, los intereses, lo que debes, el cupo y si está en uso o sin uso se calculan solos.</p>
    ${cards || `<div class="empty">No tienes tarjetas ni cupos registrados.</div>`}
    <button class="btn" data-act="add" data-c="tarjetas">Agregar tarjeta o cupo</button>
  </section>${resumenDeudas(c)}`;
}
const fechaCompleta = (p, dia) => !p ? "" : (p.length>=10 ? p.slice(0,10) : `${p}-${pad(Math.min(Math.max(1,+dia||1),daysIn(p)))}`);
const pctTxt = x => String(Math.round(x*100)/100).replace(".",",");
function notaCredito(cr,k){
  const it=k.item, out=[];
  if(!cr.primerPago) out.push(`<p class="alert warn" style="margin:12px 0 0">Falta la <b>fecha de la primera cuota</b>. Sin ella la app supone que empezaste a pagar este mes. La encuentras en tu contrato o en tu primer extracto.</p>`);
  if(it.inferida) out.push(`<p class="alert ok" style="margin:12px 0 0">Calculé la tasa con lo que pagas: <b>${pctTxt(it.eaUsada)}% E.A.</b> (${pctTxt(it.ie*100)}% mensual). Si tu extracto dice otra, escríbela arriba.</p>`);
  else if(it.eaSegunCuota && Math.abs(it.eaSegunCuota-it.eaUsada)>1) out.push(`<p class="alert warn" style="margin:12px 0 0">Ojo: con la cuota que escribiste, la tasa real sería de unos <b>${pctTxt(it.eaSegunCuota)}% E.A.</b>, no ${pctTxt(it.eaUsada)}%. Revisa si el seguro u otros cargos están incluidos en lo que pagas, o si la tasa es distinta.</p>`);
  if(it.nCalc) out.push(`<p class="alert ok" style="margin:12px 0 0">Con tu tasa y tu cuota, te faltan unas <b>${it.n} cuotas</b>: terminas en ${monthName(idxKey(it.fin))}.</p>`);
  if(k.cuotaNeta>0 && k.cargos>0) out.push(`<p class="subtle" style="margin:10px 0 0">Tu pago de ${money(k.cuotaNeta+k.cargos)} = capital e intereses ${money(k.cuotaNeta)}${+cr.seguro?` + seguro ${money(cr.seguro)}`:""}${+cr.otros?` + otros cargos ${money(cr.otros)}`:""}. Si tienes varios créditos con el mismo banco y el seguro se cobra en uno solo, escríbelo solo en ese.</p>`);
  return out.join("");
}
function vCreditos(m,c){
  const M=mIdx(m.mes);
  const list = S.perfil.creditos.map((cr,ix)=>{
    const k=c.cc[ix], it=k.item, kk=M-it.start;
    const n = kk<0?`Primera cuota en ${monthLabel(it.start)}`:(kk>=it.n?"Plan de cuotas terminado":`Cuota ${kk+1} de ${it.n}`);
    return fold("c:"+cr.id, sumRow(esc(cr.nombre||"Crédito sin nombre"), `${esc(cr.tipo||"Crédito")} · cuota ${money(k.min)}${+cr.diaPago?` el día ${+cr.diaPago}`:""}`, `${money(k.deuda)}<small>debes</small>`, estadoBadge(k)), `<div class="card">
      <div class="card-h">
        <input aria-label="Nombre del crédito" data-b="creditos|${cr.id}|nombre|text" value="${esc(cr.nombre)}" placeholder="Acreedor, ej: crédito celular">
        <button class="icon-btn" data-act="del" data-c="creditos" data-id="${cr.id}" aria-label="Borrar crédito">✕</button>
      </div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("creditos",cr.id,"tipo",opts(TIPOS_CUOTAS,cr.tipo),"Tipo")}
        ${mIn("creditos",cr.id,"valor",cr.valor,"Valor prestado")}
        ${nIn("creditos",cr.id,"cuotas",cr.cuotas,"Número de cuotas","12")}
        ${nIn("creditos",cr.id,"tasa",cr.tasa,"Tasa de interés %",(+cr.cuotaReal||0)>0?"Vacía: la calculo":"Ej: 26,5")}
        ${sIn("creditos",cr.id,"tipoTasa",`<option value="EA" ${cr.tipoTasa!=="MV"?"selected":""}>Efectiva anual (E.A.)</option><option value="MV" ${cr.tipoTasa==="MV"?"selected":""}>Mes vencido (M.V.)</option>`,"La tasa es")}
        ${sIn("creditos",cr.id,"sistema",SIS_OPTS(cr.sistema),"Cómo se cobran las cuotas")}
        <label>Fecha de la primera cuota<input type="date" data-b="creditos|${cr.id}|primerPago|text" value="${esc(fechaCompleta(cr.primerPago,cr.diaPago))}"></label>
        ${mIn("creditos",cr.id,"cuotaReal",cr.cuotaReal||"","Lo que pagas cada mes (según tu extracto)")}
        ${mIn("creditos",cr.id,"seguro",cr.seguro||"","Seguro al mes")}
        ${mIn("creditos",cr.id,"otros",cr.otros||"","Otros cargos al mes (comisión, administración…)")}
        ${sIn("creditos",cr.id,"segIncl",`<option value="si" ${cr.segIncl?"selected":""}>Sí, ya están dentro de lo que pago</option><option value="no" ${!cr.segIncl?"selected":""}>No, se cobran aparte</option>`,"¿El seguro y los cargos están incluidos en lo que pagas?")}
        ${nIn("creditos",cr.id,"diaPago",cr.diaPago,"Día del mes en que pagas","Ej: 5")}
        ${mIn("creditos",cr.id,"planExtra",cr.planExtra||"","Abono extra que planeas al mes")}
      </div>
      ${notaCredito(cr,k)}
      <h3 class="sub-h">${cap(monthName(m.mes))} ${estadoBadge(k)} ${deudaBadge(k)}${k.vencido?` <span class="badge bad">Plazo vencido</span>`:""}</h3>
      <div class="stats">
        <div class="stat"><div class="k">Te toca pagar</div><div class="v num">${money(k.min)}</div><div class="s">${k.min<=0.5?(k.estadoDeuda==="noempieza"?"aún no empieza":"no debes nada"):`${n}${(+cr.cuotaReal||0)>0?" · según tu extracto":" · cuota calculada"}${k.cargos>0.5?` (incluye ${money(k.cargos)} de seguro y cargos)`:""}${k.mora>0.5?` + atrasado ${money(k.mora)}`:""}`}</div></div>
        <div class="stat"><div class="k">Pagaste</div><div class="v num ok">${money(k.pagado+k.abonos)}</div><div class="s">${k.abonoExtra>0.5?`incluye ${money(k.abonoExtra)} de más`:"pago del mes"}</div></div>
        <div class="stat"><div class="k">Abonaste a capital</div><div class="v num ok">${money(k.pagoCapital)}</div><div class="s">${k.pagado+k.abonos>0.5?`intereses ${money(k.pagoInteres)}${k.pagoCargos>0.5?` · seguro y cargos ${money(k.pagoCargos)}`:""}`:"cuando pagues, verás cuánto bajó tu deuda"}</div></div>
        <div class="stat"><div class="k">Te falta pagar</div><div class="v num ${k.falta>0.5?"bad":"ok"}">${money(k.falta)}</div></div>
        <div class="stat"><div class="k">${M===mIdx(thisMonth())?"Debes hoy":(M<mIdx(thisMonth())?"Debías al final del mes":"Deberías al final del mes")}</div><div class="v num">${money(k.deuda)}</div><div class="s">${k.capitalTotal>0.5?`has abonado ${money(k.capitalTotal)} a capital desde ${monthName(S.perfil.inicio)}`:""}</div></div>
        <div class="stat"><div class="k">Última cuota del plan</div><div class="v num">${it.V>0?monthShort(idxKey(it.fin)):"—"}</div><div class="s">${it.V>0?`${Math.max(0,it.fin-M)} mes(es) después de este`:""}</div></div>
        <div class="stat"><div class="k">Intereses</div><div class="v num bad">${money(k.interes)}</div><div class="s">este mes · ${money(k.cuotaNeta>0&&it.n>1?Math.max(0,k.cuotaNeta*it.n-it.V):it.interesTotal())} en todo el crédito</div></div>
      </div>
      ${payBlock(cr.id,k,m)}
      ${evalBox(k,cr.nombre)}
      <p class="subtle" style="margin:12px 0 4px">Próximos meses:</p>
      ${nextMonths(k.minOf,M)}
    </div>`,"Crédito guardado");
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Créditos de cuotas ${hb("creditos")}</h2><span class="total num">${money(sum(c.cc,x=>x.deuda))} pendiente</span></div>
    <p class="hint"><b>No rotativo</b> = te prestan una sola vez y lo pagas en cuotas; lo que pagas no se vuelve a usar. Escribe cuánto te prestaron, en cuántas cuotas, la fecha de la primera cuota y lo que pagas cada mes. Si no sabes la tasa, déjala vacía y la calculo. Cuando el saldo llega a $0 queda <b>Pagado</b>.</p>
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
    return fold("a:"+a.id, sumRow(esc(a.nombre||"Ahorro sin nombre"), `${esc(a.tipo||"")}${a.entidad?" · "+esc(a.entidad):""}${cdt&&e&&e.venc?` · vence ${fmtF(e.venc)}`:""}`, `${money(e?e.neto:0)}<small>tienes</small>`), `<div class="card">
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
    </div>`,"Ahorro guardado");
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Ahorros ${hb("ahorros")}</h2><span class="total num">${money(totNeto)} ${hoyLbl}</span></div>
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
    return fold("m:"+mt.id, sumRow(esc(mt.nombre||"Meta sin nombre"), e.objetivo>0?`${money(e.ahorrado)} de ${money(e.objetivo)}${e.estado==="atiempo"?" · vas a tiempo":e.estado==="atrasada"?" · atrasada":""}`:"falta escribir cuánto cuesta", `${Math.round(e.progreso*100)}%<small>avance</small>`), `<div class="card">
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
    </div>`,"Meta guardada");
  }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>Metas ${hb("metas")}</h2></div>
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
    <h2>Gastos hormiga ${hb("hormiga")}</h2>
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

// ---------- Tarjetas que se compactan ----------
const FREQ_TXT = f => f==="unico" ? "una vez" : (FREQ[f]||FREQ.mensual).l.toLowerCase();
function sumRow(title, sub, right, badge=""){ return `<span class="fs-t"><b>${title}</b><small>${sub}</small>${badge?`<span class="fs-b">${badge}</span>`:""}</span><span class="fs-r num">${right}</span>`; }
function fold(id, summary, html, label){
  if(!S.open.has(id)) return `<button class="fold" data-act="unfold" data-id="${id}">${summary}<span class="fs-e">Editar ›</span></button>`;
  let inner = html.trim();
  if(inner.startsWith('<div class="card">')) inner = inner.slice('<div class="card">'.length, inner.lastIndexOf("</div>"));
  return `<div class="card open" data-fold="${id}">
    <div class="foldbar">${summary}<button class="btn small ghost" data-act="fold" data-id="${id}" data-l="${label}">Cerrar ▴</button></div>
    ${inner}
    <div class="foldfoot"><span class="subtle">Todo lo que escribes se guarda solo.</span><button class="btn primary" data-act="fold" data-id="${id}" data-l="${label}">Listo ✓</button></div>
  </div>`;
}
const hb = t => `<button class="hb" data-act="help" data-v="${t}" aria-label="Ayuda sobre esta sección">?</button>`;
const fechaCorta = s => { const [y,m,d]=s.split("-").map(Number); return `${d} de ${MESES[m-1]}`; };
function sinDatos(){
  return !Object.values(S.months).some(x=>x.ingresos.length||x.gastos.length||x.movs.length)
    && !S.perfil.tarjetas.length && !S.perfil.creditos.length && !S.perfil.ahorros.length && !(S.perfil.prestamos||[]).length;
}
function quitarMov(movId){
  for(const [k,md] of Object.entries(S.months)){ const i=md.movs.findIndex(x=>x.id===movId); if(i>=0){ md.movs.splice(i,1); save(k); return; } }
}

// ---------- Próximos pagos y cobros (pantalla Hoy) ----------
function proximosPagos(m,c){
  if(m.mes!==thisMonth()) return "";
  const hoy=todayISO(), dim=daysIn(thisMonth()), out=[];
  for(const p of S.perfil.prestamos||[]){
    const e=prestamoEstado(p,hoy); if(e.estado==="pagado"||!e.proxima) continue;
    const debo=p.dir==="debo";
    out.push({fecha:e.proxima.fecha, txt:`${debo?"Pagarle a":"Cobrarle a"} <b>${esc(p.persona||"alguien")}</b>`, monto: e.vencido>0.5?e.vencido:e.proxima.falta, tab:"prestamos", cobro:!debo});
  }
  const dia = d => `${thisMonth()}-${pad(Math.min(Math.max(1,Math.round(d)),dim))}`;
  S.perfil.tarjetas.forEach((t,i)=>{ const st=c.tc[i]; if(+t.diaPago>0 && st && st.falta>0.5) out.push({fecha:dia(+t.diaPago), txt:`Pagar <b>${esc(t.nombre||"tarjeta")}</b>`, monto:st.falta, tab:"tarjetas"}); });
  S.perfil.creditos.forEach((x,i)=>{ const st=c.cc[i]; if(+x.diaPago>0 && st && st.falta>0.5) out.push({fecha:dia(+x.diaPago), txt:`Cuota de <b>${esc(x.nombre||"crédito")}</b>`, monto:st.falta, tab:"creditos"}); });
  const list=out.map(o=>({...o,d:Math.round((iso2t(o.fecha)-iso2t(hoy))/86400000)})).filter(o=>o.d<=15).sort((a,b)=>a.d-b.d);
  if(!list.length) return "";
  const when = d => d<0?[`Vencido hace ${-d} día${d===-1?"":"s"}`,"bad"]:d===0?["Hoy","warn"]:d===1?["Mañana","warn"]:[`En ${d} días`,d<=3?"warn":""];
  return `<section class="panel"><div class="listhead"><h2>Próximos pagos y cobros ${hb("fechas")}</h2><button class="btn small" data-act="cal">📅 A mi calendario</button></div>
    <div class="plist">${list.map(o=>{ const [w,cl]=when(o.d); return `<button class="pitem" data-act="goTab" data-v="${o.tab}"><span class="badge ${cl}">${w}</span><span class="ptxt"><span>${o.txt}</span><small>${fechaCorta(o.fecha)}</small></span><b class="num ${o.cobro?"okc":""}">${o.cobro?"+ ":""}${money(o.monto)}</b></button>`; }).join("")}</div></section>`;
}

// ---------- Préstamos personales ----------
const P_ESTADO = {aldia:["ok","Al día"],atrasado:["bad","Atrasado"],pagado:["ok","Pagado ✔"],sinfecha:["muted","Sin fecha fija"],sinvalor:["muted","Falta el valor"]};
function vPrestamos(m,c){
  const hoy=todayISO();
  const card = p => {
    const e=prestamoEstado(p,hoy), debo=p.dir==="debo", [cl,lb]=P_ESTADO[e.estado]||["",""];
    const badge=`<span class="badge ${cl}">${lb}${e.estado==="atrasado"?" "+money(e.vencido):""}</span>`;
    const sub = `${debo?"Le debes":"Te debe"}${e.proxima&&e.estado!=="pagado"?` · próximo ${fechaCorta(e.proxima.fecha)}`:(p.forma==="libre"&&e.estado!=="pagado"?" · sin fecha":"")}`;
    const pagos=[...(p.pagos||[])].sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
    const pide = (p.dir==="medeben" || p.forma==="libre");
    return fold("p:"+p.id, sumRow(esc(p.persona||"Sin nombre"), sub, `${money(e.saldo)}<small>${debo?"debes":"te debe"}</small>`, badge), `<div class="card">
      <div class="card-h"><input aria-label="Persona" data-b="prestamos|${p.id}|persona|text" value="${esc(p.persona)}" placeholder="${debo?"¿A quién le debes?":"¿Quién te debe?"}">
        <button class="icon-btn" data-act="del" data-c="prestamos" data-id="${p.id}" aria-label="Borrar préstamo">✕</button></div>
      <div class="row r-tar" style="background:transparent;border:none;padding:0">
        ${sIn("prestamos",p.id,"dir",`<option value="debo" ${debo?"selected":""}>Yo le debo</option><option value="medeben" ${!debo?"selected":""}>Me debe a mí</option>`,"¿Quién debe?")}
        ${mIn("prestamos",p.id,"valor",p.valor,"Valor prestado")}
        <label>¿Cuándo se prestó?<input type="date" data-b="prestamos|${p.id}|fecha|text" value="${esc(p.fecha||"")}"></label>
        ${tIn("prestamos",p.id,"motivo",p.motivo,"Para qué (opcional)","Ej: arreglo de la moto")}
        ${sIn("prestamos",p.id,"forma",`<option value="unico" ${p.forma==="unico"?"selected":""}>Todo en una fecha</option><option value="cuotas" ${p.forma==="cuotas"?"selected":""}>En cuotas mensuales</option><option value="libre" ${p.forma==="libre"?"selected":""}>Sin fecha fija</option>`,"¿Cómo se paga?")}
        ${p.forma==="cuotas"?nIn("prestamos",p.id,"cuotas",p.cuotas,"Número de cuotas","3"):""}
        ${p.forma!=="libre"?`<label>${p.forma==="cuotas"?"Fecha de la primera cuota":"Fecha de pago"}<input type="date" data-b="prestamos|${p.id}|fechaPago|text" value="${esc(p.fechaPago||"")}"></label>`:""}
        ${sIn("prestamos",p.id,"cargoTipo",`<option value="no" ${p.cargoTipo!=="fijo"&&p.cargoTipo!=="pct"?"selected":""}>No cobra nada extra</option><option value="fijo" ${p.cargoTipo==="fijo"?"selected":""}>Un valor fijo adicional</option><option value="pct" ${p.cargoTipo==="pct"?"selected":""}>Un % cada mes</option>`,"¿Cobra algo adicional?")}
        ${p.cargoTipo==="fijo"?mIn("prestamos",p.id,"cargo",p.cargo,"Valor adicional"):p.cargoTipo==="pct"?nIn("prestamos",p.id,"cargo",p.cargo,"% al mes","Ej: 5"):""}
      </div>
      ${p.cargoTipo==="pct"?`<p class="subtle" style="margin:8px 0 0">El % se cobra como interés simple sobre lo prestado, por cada mes.</p>`:""}
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="k">Total a devolver</div><div class="v num">${money(e.total)}</div><div class="s">${e.cargo>0.5?`incluye ${money(e.cargo)} adicionales`:"sin cargos extra"}</div></div>
        <div class="stat"><div class="k">${debo?"Has pagado":"Te han pagado"}</div><div class="v num ok">${money(e.pagado)}</div></div>
        <div class="stat"><div class="k">${debo?"Te falta pagar":"Te falta cobrar"}</div><div class="v num ${e.estado==="atrasado"?"bad":""}">${money(e.saldo)}</div>${e.vencido>0.5?`<div class="s" style="color:var(--bad)">${money(e.vencido)} ya ${debo?"debías haberlo pagado":"debió pagarte"}</div>`:""}</div>
        <div class="stat"><div class="k">${e.estado==="pagado"?"Estado":"Próxima fecha"}</div><div class="v num">${e.estado==="pagado"?"¡Listo!":(e.proxima?fechaCorta(e.proxima.fecha):"—")}</div><div class="s">${e.estado==="pagado"?"ya no hay deuda":(e.proxima?`${money(e.proxima.falta)}${e.cal.length>1?` · cuota ${e.proxima.n} de ${e.proxima.de}`:""}`:"sin fecha acordada")}</div></div>
      </div>
      ${e.cal.length>1?`<div class="chips" style="margin-top:10px">${e.cal.map((q,i)=>`<span class="chip ${i<e.cuotasPagadas?"on":""}" style="cursor:default">${i<e.cuotasPagadas?"✓ ":""}${fechaCorta(q.fecha)} · ${money(q.valor)}</span>`).join("")}</div>`:""}
      ${e.aFavor>0.5?`<p class="alert ok" style="margin:10px 0 0">Se pagó ${money(e.aFavor)} de más.</p>`:""}
      ${e.estado!=="pagado"?`<div class="paybox"><div class="payform">
        <label>Valor<input inputmode="numeric" id="pp-${p.id}-valor" value="${numTxt(e.vencido>0.5?e.vencido:(e.proxima?e.proxima.falta:e.saldo))}"></label>
        <label>Fecha<input type="date" id="pp-${p.id}-fecha" value="${todayISO()}"></label>
        ${pide?`<label class="gcheck" style="align-self:end"><input type="checkbox" id="pp-${p.id}-presu" checked> ${debo?"Descontar de mi presupuesto":"Sumar a lo que me entra"}</label>`:"<span></span>"}
        <button class="btn primary" data-act="addPPago" data-id="${p.id}">${debo?"Registrar pago":"Registrar cobro"}</button></div></div>`:""}
      ${pagos.length?`<div class="chips" style="margin:8px 0 0">${pagos.map(x=>`<span class="chip" style="cursor:default">${esc(fechaCorta(x.fecha))} · ${money(x.valor)} <button class="icon-btn" style="padding:0 3px" data-act="del" data-c="ppago" data-id="${p.id}:${x.id}" aria-label="Borrar pago">✕</button></span>`).join("")}</div>`:""}
    </div>`, "Préstamo guardado");
  };
  const debo=(S.perfil.prestamos||[]).filter(p=>p.dir==="debo"), deben=(S.perfil.prestamos||[]).filter(p=>p.dir!=="debo");
  return `<section class="panel">
    <div class="listhead"><h2>Le debo a… ${hb("prestamos")}</h2><span class="total num">${money(c.lesDebo)}</span></div>
    <p class="hint">Plata que te prestó un amigo, un familiar o cualquier persona. Lo que vence cada mes se aparta de tu presupuesto.</p>
    <div class="rows">${debo.map(card).join("")||`<div class="empty">No le debes plata a nadie.</div>`}</div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="prestamos" data-v="debo">+ Le debo a alguien</button></div>
  </section>
  <section class="panel">
    <div class="listhead"><h2>Me deben…</h2><span class="total num okc">${money(c.teDeben)}</span></div>
    <p class="hint">Plata que tú prestaste, para que no se te olvide cobrarla.</p>
    <div class="rows">${deben.map(card).join("")||`<div class="empty">Nadie te debe plata.</div>`}</div>
    <div style="margin-top:12px"><button class="btn" data-act="add" data-c="prestamos" data-v="medeben">+ Alguien me debe</button></div>
  </section>`;
}
function tilePrestamos(c){
  if(!(S.perfil.prestamos||[]).length) return "";
  const atr=c.prs.filter(o=>o.e.estado==="atrasado");
  return `<button class="vt" data-act="goTab" data-v="prestamos">
    <div class="vt-h"><span>Préstamos con personas</span>${atr.length?`<b class="badc">${atr.length} atrasado${atr.length===1?"":"s"}</b>`:`<b class="okc">Al día</b>`}</div>
    <div class="vt-n num">${money(c.lesDebo)} <small>debes</small></div>
    <div class="vt-s">Te deben ${money(c.teDeben)}${c.prestComp>0.5?` · este mes pagas ${money(c.prestComp)}`:""}</div></button>`;
}

// ---------- Ayuda ----------
const AYUDA = [
 {id:"inicio", t:"¿Por dónde empiezo?", h:`<p>Lo más fácil es usar la <b>🧭 Guía</b> (el botón de arriba, junto al ?): te pregunto todo en orden. Dentro de la guía puedes tocar cualquier paso para volver a él. Si la dejas a medias, te espero en Hoy con un aviso para <b>seguir donde ibas</b>.</p><p>Si prefieres hacerlo tú:</p><ol><li><b>Ingresos:</b> lo que te entra (sueldo, trabajos extra…).</li><li><b>Gastos:</b> lo que pagas siempre (arriendo, servicios, mercado…).</li><li><b>Tarjetas, Créditos y Préstamos:</b> lo que debes.</li><li><b>Ahorros y Metas:</b> lo que tienes guardado y para qué.</li></ol><p>Después, cada día, solo anotas lo que gastas en <b>Hoy</b>.</p>`},
 {id:"guardar", t:"¿Cómo sé que se guardó?", h:`<p>Todo se guarda solo, en el momento en que escribes. Arriba siempre ves el estado:</p><ul><li><b class="okc">✓ Todo guardado en tu cuenta</b>: listo.</li><li><b>Guardando…</b>: espera un segundo.</li><li><b>Sin internet</b>: se guarda en el celular y se sube cuando vuelva la conexión.</li></ul><p>Cuando terminas de llenar algo y tocas <b>Listo ✓</b>, el cuadro se cierra y te muestra un resumen con la confirmación.</p><p>Tus datos quedan en tu cuenta de Google: si entras desde otro celular o computador, ahí están.</p>`},
 {id:"hoy", t:"¿Qué significa “Hoy puedes gastar”?", h:`<p>Es lo que puedes gastar hoy sin pasarte del mes:</p><p><b>(lo que entra − gastos fijos − pagos de deudas − ahorro) ÷ días que faltan</b>, menos lo que ya gastaste hoy.</p><p>Si un día gastas menos, los días siguientes tienes un poco más. Si gastas de más, baja. Los cuadritos de los días se ponen verdes cuando no te pasas y rojos cuando sí.</p><p>En <b>Cómo va todo</b> ves un resumen de tu presupuesto, gastos hormiga, deudas, préstamos, ahorros y metas. Toca cualquiera para ver el detalle.</p>`},
 {id:"ingresos", t:"Ingresos", h:`<p>Anota lo que te entra y <b>cada cuánto</b>: la app lo convierte a valor mensual (por ejemplo, 500.000 quincenal = 1.000.000 al mes).</p><ul><li><b>Fijo:</b> siempre es el mismo valor.</li><li><b>Variable:</b> cambia. Pon lo que esperas; lo que te entre de más anótalo en Hoy como <b>Ingreso extra</b>.</li><li><b>Una sola vez:</b> solo cuenta en el mes en que llega (una prima, por ejemplo).</li></ul>`},
 {id:"gastos", t:"Gastos fijos", h:`<p>Lo que pagas siempre: arriendo, servicios, mercado, transporte, estudio…</p><p>Los gastos que pagas cada 6 meses o una vez al año (como el SOAT o una matrícula) se reparten mes a mes, para que vayas apartando un poco cada mes.</p><p>Si un gasto lo pagas con tarjeta de crédito, elige la tarjeta en “Se paga con”: no sale de tu efectivo ese mes, pero se suma a lo que debes en la tarjeta.</p>`},
 {id:"hormiga", t:"Gastos hormiga", h:`<p>Son los gastos pequeños que no se sienten: el tinto, la gaseosa, el domicilio, el snack. Uno solo no es nada, pero juntos suman mucho al año.</p><p>En Hoy toca el botón de lo que compraste; la app pone el último valor que pagaste por eso. Toca <b>Anotar</b> y listo.</p>`},
 {id:"tarjetas", t:"Tarjetas y cupos (rotativos)", h:`<p><b>Rotativo</b> quiere decir que tienes un <b>cupo</b>: lo que pagas se libera y lo puedes volver a usar. Aquí van las tarjetas de crédito, los créditos rotativos y los cupos de almacén o apps.</p><p><b>Lo mínimo que necesitas:</b> el nombre, la tasa de interés (está en tu extracto) y lo que debes.</p><ul><li>¿Ya debías plata en la tarjeta? Agrégalo como una compra “Saldo anterior” con las cuotas que te faltan.</li><li>Cada compra nueva se anota con su número de cuotas.</li><li>El <b>pago mínimo</b> se calcula solo. Si tu extracto dice otro valor, escríbelo.</li><li>Si pones el <b>día de pago</b>, te lo recordamos en Hoy.</li></ul>`},
 {id:"creditos", t:"Créditos de cuotas", h:`<p>Te prestan una sola vez y lo pagas en cuotas; lo que pagas no se vuelve a usar. Libre inversión, libranza, carro, vivienda, estudio, celular financiado…</p><p>Escribe cuánto te prestaron, en cuántas cuotas y la <b>fecha de la primera cuota</b>: con eso la app sabe en qué cuota vas y cuánto debes.</p><ul><li><b>Lo que pagas cada mes:</b> el valor de tu extracto. Si no sabes la tasa, déjala vacía: la app la calcula con lo que pagas.</li><li><b>Seguro y otros cargos:</b> escríbelos y di si ya están dentro de lo que pagas. Así no se suman dos veces y la tasa sale bien. Si tienes varios créditos con el mismo banco y el seguro se cobra en uno solo, ponlo solo en ese.</li><li>Si no sabes cuántas cuotas faltan, deja ese campo vacío: con la tasa y la cuota se calcula.</li></ul><p>Cuando llega a $0 queda <b>Pagado</b>.</p>`},
 {id:"prestamos", t:"Préstamos con amigos o familia", h:`<p>En la pestaña <b>Préstamos</b> anotas:</p><ul><li><b>Le debo a…</b>: plata que te prestaron.</li><li><b>Me deben…</b>: plata que tú prestaste.</li></ul><p>Para cada uno eliges cómo se paga: <b>todo en una fecha</b>, <b>en cuotas mensuales</b> o <b>sin fecha fija</b>. Si cobran algo adicional, puede ser un valor fijo (por ejemplo, $50.000 más) o un % al mes.</p><p>Lo que vence cada mes de lo que debes se aparta de tu presupuesto. Cuando pagas o te pagan, toca <b>Registrar pago</b> o <b>Registrar cobro</b>.</p>`},
 {id:"fechas", t:"Fechas de pago y recordatorios", h:`<p>En Hoy aparecen los pagos y cobros de los próximos 15 días: préstamos con fecha, y tarjetas o créditos que tengan <b>día de pago</b>. Si algo ya pasó y no lo has pagado, sale en rojo como <b>Vencido</b>.</p><p>Para que una tarjeta o crédito aparezca, abre su cuadro y escribe el “Día del mes en que pagas”.</p>`},
 {id:"pagos", t:"Pago del mes y abono extra", h:`<ul><li><b>Pago del mes:</b> lo que te tocaba pagar (la cuota o el mínimo).</li><li><b>Abono extra a capital:</b> plata de más para salir antes de la deuda. Así pagas menos intereses.</li></ul><p>De cada pago, primero se cubren los intereses y el seguro o los cargos; lo que queda es <b>abono a capital</b>, lo único que de verdad baja tu deuda. En cada crédito verás cuánto fue a capital este mes y cuánto llevas en total.</p><p>Si pagas menos de lo que te tocaba, lo que falta pasa al mes siguiente como <b>atrasado</b>.</p>`},
 {id:"ahorros", t:"Ahorros, cajitas y CDT", h:`<p>Anota cada cuenta, cajita o bolsillo, CDT o fondo: cuándo lo abriste, con cuánto y cuánto rinde al año (% E.A.). Lo que metes o sacas lo registras en su cuadro.</p><p>La app te dice cuánto tienes, cuánto has ganado y cuánto tendrías en 12 meses. Los CDT no reciben aportes y dejan de crecer al vencer.</p><p>Si el saldo no coincide con tu banco, escribe el saldo real y la fecha: se parte de ahí.</p>`},
 {id:"metas", t:"Metas: carro, casa, viaje…", h:`<p>Escribe cuánto cuesta lo que quieres, qué % necesitas ahorrar (por ejemplo, 30% para la cuota inicial de una vivienda) y para cuándo. Luego elige qué ahorros suman para esa meta.</p><p>Verás tu avance, cuánto te falta, cuánto debes ahorrar al mes para llegar a tiempo y en qué mes llegarías a tu ritmo actual.</p>`},
 {id:"meses", t:"¿Qué pasa cuando cambia el mes?", h:`<p>Cuando abres la app en un mes nuevo, se crea sola: copia tus ingresos y gastos fijos del mes anterior. Los meses pasados quedan guardados y los comparas en <b>Comparar meses</b>.</p><p>Tarjetas, créditos, préstamos, ahorros y metas no son de un mes: siguen solos con sus cuotas y rendimientos.</p>`},
 {id:"glosario", t:"Palabras que pueden confundir", h:`<dl class="glos"><dt>Tasa E.A.</dt><dd>Efectiva anual: cuánto te cobran (o te pagan) en un año. Es la que suele salir en los extractos.</dd><dt>Tasa M.V.</dt><dd>Mes vencido: cuánto te cobran cada mes. 2% M.V. es mucho más que 2% E.A.</dd><dt>Cuota</dt><dd>Cada pago en que divides una deuda.</dd><dt>Pago mínimo</dt><dd>Lo menos que debes pagar en el mes para no quedar atrasado.</dd><dt>Capital</dt><dd>La plata que te prestaron, sin intereses.</dd><dt>Cupo</dt><dd>Lo máximo que puedes deber en una tarjeta.</dd><dt>Cuota de manejo</dt><dd>Lo que te cobra el banco cada mes por tener la tarjeta.</dd><dt>Abono a capital</dt><dd>Pago extra que baja directamente lo que debes.</dd><dt>Retención en la fuente</dt><dd>Lo que el gobierno descuenta de las ganancias de un CDT (suele ser 4%).</dd></dl>`},
 {id:"instalar", t:"Instalarla en el celular", h:`<ul><li><b>Android (Chrome):</b> menú ⋮ → <b>Instalar app</b> o “Agregar a la pantalla principal”.</li><li><b>iPhone (Safari):</b> botón Compartir → <b>Agregar a inicio</b>.</li><li><b>Computador:</b> ícono de instalar en la barra de direcciones de Chrome o Edge.</li></ul>`},
 {id:"compracuotas", t:"Compras a cuotas desde Hoy", h:`<p>Si pagas algo con tarjeta de crédito en Hoy, elige la tarjeta en “Pagado con” y aparece el campo <b>Cuotas</b>.</p><ul><li><b>1 cuota:</b> se descuenta de lo que puedes gastar hoy y se suma a la tarjeta.</li><li><b>2 o más cuotas:</b> no se descuenta hoy completo. Queda como compra en la tarjeta y cada mes se aparta solo la cuota, con sus intereses.</li></ul><p>Si borras el movimiento, también se quita la compra de la tarjeta.</p>`},
 {id:"topes", t:"¿En qué se va tu plata? y topes", h:`<p>En la pestaña <b>Gastos</b>, abajo, ves en qué se va tu plata este mes: gastos fijos por categoría, lo del día a día, los pagos de deudas y el ahorro.</p><p>En <b>Topes del día a día</b> le pones un máximo al mes a una categoría, por ejemplo $300.000 en comida. Cuando llegas al 80% te aviso en Hoy, y si te pasas sale en rojo. Para quitar un tope, borra el valor.</p>`},
 {id:"calendario", t:"Pagos en tu calendario", h:`<p>En Hoy, en <b>Próximos pagos</b>, o en el menú de tu foto, toca <b>📅 A mi calendario</b>.</p><ul><li><b>Descargar todos:</b> baja un archivo con todas tus fechas. En iPhone se abre en Calendario; en Android o computador ábrelo con tu calendario.</li><li><b>Google Calendar:</b> agrega una fecha a la vez.</li></ul><p>Las tarjetas y créditos se repiten cada mes y te avisan el día anterior. Si cambias una fecha en la app, vuelve a agregarla.</p>`},
 {id:"clave", t:"Clave de acceso", h:`<p>Es opcional. En el menú de tu foto toca <b>🔒 Clave de acceso</b>, elige si la quieres de 4 o de 6 números y escríbela dos veces.</p><ul><li>Te la pido cada vez que abres la app y si la dejas más de ${MIN_FUERA} minutos sin usar.</li><li>Si te equivocas 5 veces seguidas, toca esperar un momento antes de intentar otra vez.</li><li><b>¿La olvidaste?</b> Tócalo en el teclado, confirma con tu cuenta de Google y creas una nueva. Tus datos no se tocan.</li></ul><p>La clave protege la app si alguien toma tu celular. No se guarda tal cual: solo un código cifrado que nadie puede leer, ni siquiera quien administra la app.</p>`},
 {id:"copia", t:"Copia de seguridad", h:`<p>Tus datos ya están guardados en tu cuenta. La copia es por si borras algo sin querer.</p><ul><li>En el menú de tu foto toca <b>Descargar copia de seguridad</b>. Guarda el archivo en tu Drive, correo o computador.</li><li>Para volver a esa copia toca <b>Restaurar una copia</b> y elige el archivo. Antes de reemplazar te muestro qué tiene.</li></ul><p>La tabla para Excel (CSV) es otra cosa: sirve para ver tus números en Excel, no para restaurar.</p>`},
 {id:"privacidad", t:"Privacidad y tus datos", h:`<p>Entras con tu cuenta de Google y nadie más que use la app puede ver tu información.</p><p>Desde tu foto, arriba a la derecha, puedes <b>descargar una copia</b> o <b>borrar todos tus datos</b>. Si prefieres, puedes usar números aproximados: la app funciona igual.</p><p><button class="btn small" data-act="privacidad">Leer el aviso de privacidad completo</button></p>`},
];
const renderHelp = () => renderModal();
function renderHelpSheet(el){
  el.innerHTML = `<div class="modal"><div class="sheet" role="dialog" aria-modal="true" aria-label="Ayuda">
    <div class="sheet-h"><h2>Ayuda</h2><button class="icon-btn" data-act="helpClose" aria-label="Cerrar ayuda">✕</button></div>
    <div class="sheet-b">
      ${pasoGuardado() ? `<button class="btn primary big" data-act="gSeguir">🧭 Seguir la guía (vas en ${PASO_L[PASOS[pasoGuardado()]]})</button>
      <p class="subtle" style="margin:6px 0 0"><button class="linkbtn" data-act="gStart">Empezar la guía de nuevo</button></p>` : `<button class="btn primary big" data-act="gStart">🧭 Hacer la guía paso a paso</button>`}
      <p class="subtle" style="margin:14px 0 6px">O toca un tema:</p>
      ${AYUDA.map(a=>`<details class="hq-item" id="h-${a.id}" ${a.id===S.help?"open":""}><summary>${a.t}</summary><div class="hq-b">${a.h}</div></details>`).join("")}
      <div class="gbtns" style="margin:18px 0 0;flex-wrap:wrap"><button class="btn ghost" data-act="privacidad">Aviso de privacidad</button></div>
    </div></div></div>`;
  if(S.help!=="inicio") setTimeout(()=>{ const d=$("#h-"+S.help); if(d) d.scrollIntoView({block:"start"}); },0);
}

// ---------- Ventanas (privacidad, copia, calendario) ----------
function renderModal(){
  const el=$("#modal"); if(!el) return;
  if(S.user && S.perfil && !S.perfil.privacidad){ S.help=null; S.dlg={kind:"privAcepta"}; }
  const abierto = !!(S.help || S.dlg);
  document.body.classList.toggle("modal-open", abierto);
  if(!abierto){ el.innerHTML=""; return; }
  if(S.help){ renderHelpSheet(el); return; }
  const d=S.dlg, titulo={novedades:"✨ Novedades",clave:"Clave de acceso",privAcepta:"Antes de seguir: tu privacidad",privacidad:"Aviso de privacidad",restaurar:"Restaurar una copia",calendario:"Agregar a mi calendario"}[d.kind]||"";
  const cuerpo={novedades:()=>`<div class="nov-list">${filasNovedades()}</div>`,clave:dlgClave,privAcepta:dlgPrivAcepta,privacidad:()=>PRIVACIDAD_HTML,restaurar:dlgRestaurar,calendario:dlgCalendario}[d.kind];
  el.innerHTML = `<div class="modal"><div class="sheet" role="dialog" aria-modal="true" aria-label="${titulo}">
    <div class="sheet-h"><h2>${titulo}</h2>${d.kind==="privAcepta"?"":`<button class="icon-btn" data-act="helpClose" aria-label="Cerrar">✕</button>`}</div>
    <div class="sheet-b">${cuerpo?cuerpo(d):""}</div></div></div>`;
}

// Aviso de privacidad (Ley 1581 de 2012)
const PRIVACIDAD_HTML = `<div class="hq-b">
  <p><b>Qué datos se guardan.</b> Tu nombre, correo y foto de tu cuenta de Google (para que entres) y la información que tú escribes en la app: ingresos, gastos, deudas, préstamos, ahorros y metas.</p>
  <p><b>Para qué.</b> Solo para que la app te muestre tu presupuesto en cualquier dispositivo. No se venden, no se comparten con terceros y no se usan para publicidad.</p>
  <p><b>Dónde se guardan.</b> En Firebase, el servicio de bases de datos de Google, con conexión cifrada. Las reglas de seguridad impiden que otra persona que use la app vea tus datos.</p>
  <p><b>Quién puede verlos.</b> Tú. Quien administra Pecuniae Ratio tiene acceso técnico a la base de datos, como pasa en cualquier app, y se compromete a no consultar ni compartir tu información. Si prefieres, puedes usar valores aproximados: la app funciona igual.</p>
  <p><b>Tus derechos.</b> Según la Ley 1581 de 2012 puedes conocer, actualizar, corregir y borrar tus datos. Todo lo puedes hacer tú mismo en la app: editar cualquier dato, <b>descargar una copia</b> o <b>borrar todos tus datos</b> desde el menú de tu foto. Para cualquier otra solicitud, comunícate con quien te compartió la app.</p>
  <p><b>Si dejas de usarla.</b> Tus datos quedan guardados hasta que los borres.</p>
  <p class="subtle">Al entrar con Google aceptas este aviso.</p>
</div>`;

// ---------- Clave de acceso ----------
function pedirClave(){
  const nombre=((S.user&&S.user.displayName)||"").split(" ")[0];
  abrirTeclado({ titulo:"Ingresa tu clave", sub:nombre?`Hola, ${esc(nombre)}`:"", len:S.perfil.pin.len, logo:LOGO, olvide:true, contarFallos:true,
    alCompletar: async c => (await pinCorrecto(c,S.perfil.pin)) ? true : false,
    alOlvidar: olvideClave });
}
function olvideClave(){
  mensajeTeclado("Confirma con tu cuenta de Google…");
  // Se llama directo desde el toque, para que el navegador no bloquee la ventana de Google
  reauthenticateWithPopup(auth.currentUser||S.user, new GoogleAuthProvider()).then(()=>{
    limpiarFallos();
    flujoCrear(S.perfil.pin?S.perfil.pin.len:4, {obligatorio:true, titulo:"Crea tu nueva clave", listo:"Listo, tu clave nueva quedó activada 🔒"});
  }).catch(e=>{
    const cod=(e&&e.code)||"";
    mensajeTeclado(cod.includes("mismatch") ? "Esa no es la cuenta con la que entraste. Usa la misma." :
      cod.includes("popup-blocked") ? "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes e intenta de nuevo." :
      "No se confirmó tu cuenta. Toca “¿La olvidaste?” para intentar de nuevo.", true);
  });
}
function flujoCrear(len, o={}){
  let primero=null;
  const base={ titulo:o.titulo||"Crea tu clave", sub:`Elige ${len} números que recuerdes` };
  abrirTeclado({ ...base, len, logo:LOGO, cancelable:!o.obligatorio,
    alCompletar: async c => {
      if(!primero){ primero=c; return {titulo:"Repite tu clave", sub:"Escríbela otra vez para confirmar", err:false}; }
      if(c!==primero){ primero=null; return {...base, sub:"No coincidían. Empecemos de nuevo.", err:true}; }
      S.perfil.pin=await crearPin(c); savePerfil(); limpiarFallos();
      setTimeout(()=>{ S.menu=false; renderMenu(); toast(o.listo||"Clave activada 🔒 Te la pido cada vez que abras la app."); },260);
      return true; },
    alCancelar: ()=>{ if(o.alCancelar) o.alCancelar(); } });
}
function verificarYLuego(titulo, luego){
  abrirTeclado({ titulo, sub:"", len:S.perfil.pin.len, logo:LOGO, cancelable:true, olvide:true, contarFallos:true,
    alCompletar: async c => { if(!(await pinCorrecto(c,S.perfil.pin))) return false; setTimeout(luego,230); return true; },
    alOlvidar: olvideClave });
}
function dlgClave(d){
  const p=S.perfil.pin;
  const elegir = `<div class="lenpick">
      <button class="lenopt" data-act="claveLen" data-v="4"><span class="ldots"><i></i><i></i><i></i><i></i></span><b>4 números</b><small>Rápida</small></button>
      <button class="lenopt" data-act="claveLen" data-v="6"><span class="ldots"><i></i><i></i><i></i><i></i><i></i><i></i></span><b>6 números</b><small>Más segura</small></button></div>`;
  if(!p || d.cambiando) return `<p>${d.cambiando?"¿De cuántos números quieres tu clave nueva?":"Ponle una clave a la app, como la del celular. Te la pido cada vez que la abras y si la dejas más de "+MIN_FUERA+" minutos sin usar."}</p>
    ${elegir}
    <p class="subtle" style="margin-top:12px">Es opcional. Si la olvidas, la cambias confirmando con tu cuenta de Google y tus datos quedan intactos. La clave no se guarda: solo un código cifrado que nadie puede leer.</p>`;
  return `<div class="clave-on"><span class="cicon">🔒</span><div><b>Tu clave está activada</b><br><span class="subtle">${p.len} números${p.fecha?` · desde el ${fechaCorta(p.fecha)}`:""}</span></div></div>
    <p class="subtle">Te la pido cada vez que abres la app y si la dejas más de ${MIN_FUERA} minutos sin usar.</p>
    <div class="gbtns" style="margin:12px 0 0;flex-direction:column;align-items:stretch">
      <button class="btn" data-act="claveCambiar">Cambiar clave</button>
      <button class="btn ghost" data-act="claveQuitar" style="color:var(--bad)">Quitar clave</button></div>`;
}

function dlgPrivAcepta(){
  return `<p>Pecuniae Ratio estrenó su <b>aviso de privacidad</b>. Como entraste antes de que existiera, te lo muestro una sola vez. En resumen:</p>
    <ul class="hq-b">
      <li>Se guarda tu nombre, correo y foto de Google, y lo que escribes en la app.</li>
      <li>Solo sirve para mostrarte tu presupuesto. No se vende ni se comparte, y no se usa para publicidad.</li>
      <li>Otras personas que usan la app no pueden ver tus datos. Quien administra la app tiene acceso técnico y se compromete a no consultarlos.</li>
      <li>Puedes descargar una copia o borrar todo cuando quieras, desde el menú de tu foto.</li>
    </ul>
    <details class="hq-item"><summary>Leer el aviso completo</summary>${PRIVACIDAD_HTML}</details>
    <div class="gbtns" style="margin:14px 0 0;flex-direction:column;align-items:stretch">
      <button class="btn primary big" data-act="privAcepto">Entendido, acepto</button>
      <button class="btn ghost" data-act="privNo">No acepto, cerrar sesión</button></div>
    <p class="subtle" style="margin-top:8px">Si no aceptas, tus datos siguen guardados y no se usan. Puedes volver a entrar y aceptar, o entrar para borrarlos.</p>`;
}

// 3. Copia de seguridad y restaurar
function descargarArchivo(nombre, contenido, tipo){
  const blob=new Blob([contenido],{type:tipo}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function descargarCopia(){
  flushAll();
  const copia={app:"pecuniae-ratio",tipo:"copia",version:5,fecha:new Date().toISOString(),meses:S.months,perfil:S.perfil};
  descargarArchivo(`pecuniae-ratio-copia-${todayISO()}.json`, JSON.stringify(copia,null,1), "application/json");
  S.perfil.ultimaCopia=todayISO(); savePerfil();
  toast("Copia descargada. Guárdala en tu Drive, correo o computador.");
}
function leerCopia(file){
  const r=new FileReader();
  r.onload=()=>{
    let c; try{ c=JSON.parse(r.result); }catch(_){ toast("Ese archivo no es una copia de Pecuniae Ratio."); return; }
    if(!c || c.app!=="pecuniae-ratio" || typeof c.meses!=="object" || typeof c.perfil!=="object"){ toast("Ese archivo no es una copia de Pecuniae Ratio."); return; }
    const meses=Object.keys(c.meses).filter(k=>/^\d{4}-\d{2}$/.test(k));
    if(!meses.length){ toast("La copia está vacía."); return; }
    S.menu=false; renderMenu(); S.dlg={kind:"restaurar",copia:c,meses}; renderModal();
  };
  r.readAsText(file);
}
function dlgRestaurar(d){
  const c=d.copia, p=c.perfil||{}, f=c.fecha?new Date(c.fecha):null;
  const cnt=(a,s,pl)=>`${(a||[]).length} ${(a||[]).length===1?s:pl}`;
  return `<p>Vas a reemplazar <b>todos tus datos actuales</b> por esta copia${f?` del <b>${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}</b>`:""}:</p>
    <ul class="hq-b"><li>${d.meses.length} mes${d.meses.length===1?"":"es"} (${monthName(d.meses.sort()[0])} a ${monthName(d.meses.sort().slice(-1)[0])})</li>
      <li>${cnt(p.tarjetas,"tarjeta","tarjetas")}, ${cnt(p.creditos,"crédito","créditos")}, ${cnt(p.prestamos,"préstamo","préstamos")}</li>
      <li>${cnt(p.ahorros,"ahorro","ahorros")}, ${cnt(p.metas,"meta","metas")}</li></ul>
    <p class="alert warn">Lo que tengas ahora y no esté en la copia se pierde. Si no estás seguro, descarga primero una copia de lo actual.</p>
    <div class="gbtns" style="margin:12px 0 0;flex-direction:column;align-items:stretch">
      <button class="btn" data-act="copiaDescargar">Descargar primero una copia de lo actual</button>
      <button class="btn primary" data-act="copiaRestaurar">Sí, restaurar esta copia</button>
      <button class="btn ghost" data-act="helpClose">Cancelar</button></div>`;
}
async function restaurarCopia(){
  const c=S.dlg.copia, meses=S.dlg.meses;
  for(const k of Object.keys(S.months)){ if(!meses.includes(k)){ clearTimeout(pending.get(k)); pending.delete(k); try{ await deleteDoc(monthDoc(k)); }catch(e){ console.error(e); } } }
  S.months={}; for(const k of meses){ const mm=JSON.parse(JSON.stringify(c.meses[k])); mm.mes=k; S.months[k]=normalize(mm); save(k); }
  const priv=S.perfil.privacidad, pinActual=S.perfil.pin||null; S.perfil=normalizePerfil(JSON.parse(JSON.stringify(c.perfil))); if(!S.perfil.privacidad) S.perfil.privacidad=priv; S.perfil.pin=pinActual; if(!S.perfil.inicio) S.perfil.inicio=meses.sort()[0]; savePerfil();
  if(!S.months[thisMonth()] && meses.sort().slice(-1)[0] < thisMonth()) newMonth(true);
  S.autoMes=null; S.cur = S.months[thisMonth()] ? thisMonth() : Object.keys(S.months).sort().pop();
  S.dlg=null; S.open=new Set(); S.guia=null; S.tab="hoy"; renderModal(); render(); confirmSaved("Copia restaurada");
}

// 4. Calendario
function eventosCalendario(){
  const hoy=todayISO(), M0=mIdx(thisMonth()), c=calc(S.months[thisMonth()]), ev=[];
  const proxDia = d => { const dim=daysIn(thisMonth()); let f=`${thisMonth()}-${pad(Math.min(d,dim))}`; if(f<hoy){ const k=idxKey(M0+1); f=`${k}-${pad(Math.min(d,daysIn(k)))}`; } return f; };
  S.perfil.tarjetas.forEach((t,i)=>{ const d=Math.round(+t.diaPago||0); if(d>0 && (c.tc[i].deuda>0.5||c.tc[i].min>0.5)) ev.push({id:"t"+t.id,titulo:`Pagar tarjeta ${t.nombre||""}`.trim(),fecha:proxDia(d),dia:d,repite:true,desc:`Pago de la tarjeta ${t.nombre||""}. Revisa el valor en Pecuniae Ratio o en tu extracto.`,monto:c.tc[i].min}); });
  S.perfil.creditos.forEach((x,i)=>{ const st=c.cc[i], d=Math.round(+x.diaPago||0)||(x.primerPago&&x.primerPago.length>=10?+x.primerPago.slice(8,10):0); if(!(d>0) || st.deuda<=0.5) return;
    const f=proxDia(d), restantes=Math.max(1, st.item.fin - mIdx(f) + 1);
    ev.push({id:"c"+x.id,titulo:`Cuota ${x.nombre||"crédito"}`,fecha:f,dia:d,repite:true,veces:restantes,desc:`Cuota de ${money(+x.cuotaReal||st.min)} (${restantes} cuota${restantes===1?"":"s"} pendiente${restantes===1?"":"s"}).`,monto:st.min}); });
  (S.perfil.prestamos||[]).forEach(p=>{ const e=prestamoEstado(p,hoy); if(e.estado==="pagado") return; let acum=0;
    e.cal.forEach(q=>{ acum+=q.valor; if(acum-e.pagado<=0.5 || q.fecha<hoy) return;
      ev.push({id:`p${p.id}-${q.n}`,titulo:`${p.dir==="debo"?"Pagarle a":"Cobrarle a"} ${p.persona||"alguien"}`,fecha:q.fecha,desc:`${money(q.valor)}${q.de>1?` · cuota ${q.n} de ${q.de}`:""}${p.motivo?` · ${p.motivo}`:""}`,monto:q.valor}); }); });
  return ev.sort((a,b)=>a.fecha.localeCompare(b.fecha));
}
const ymd = f => f.replace(/-/g,"");
const diaSig = f => { const t=iso2t(f)+86400000; return new Date(t).toISOString().slice(0,10); };
const rrule = e => e.repite ? `RRULE:FREQ=MONTHLY;${e.dia>=29?"BYMONTHDAY=-1":`BYMONTHDAY=${e.dia}`}${e.veces?`;COUNT=${e.veces}`:""}` : "";
function linkGoogle(e){
  const q=new URLSearchParams({action:"TEMPLATE",text:e.titulo,dates:`${ymd(e.fecha)}/${ymd(diaSig(e.fecha))}`,details:e.desc+"\n\nAgregado desde Pecuniae Ratio."});
  if(e.repite) q.set("recur",rrule(e));
  return "https://calendar.google.com/calendar/render?"+q.toString();
}
function icsTexto(evs){
  const escI = s => String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  const now=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Pecuniae Ratio//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  for(const e of evs){
    L.push("BEGIN:VEVENT",`UID:${e.id}@pecuniae-ratio`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${ymd(e.fecha)}`,`DTEND;VALUE=DATE:${ymd(diaSig(e.fecha))}`,`SUMMARY:${escI(e.titulo)}`,`DESCRIPTION:${escI(e.desc)}`);
    if(e.repite) L.push(rrule(e));
    L.push("BEGIN:VALARM","ACTION:DISPLAY",`DESCRIPTION:${escI(e.titulo)}`,"TRIGGER:-PT15H","END:VALARM","END:VEVENT");
  }
  L.push("END:VCALENDAR"); return L.join("\r\n");
}
function dlgCalendario(){
  const evs=eventosCalendario();
  if(!evs.length) return `<p class="hint">Aún no hay fechas para agregar. Escribe el <b>día de pago</b> en tus tarjetas y créditos, o la <b>fecha de pago</b> en tus préstamos, y vuelve aquí.</p>`;
  const cuando = e => e.repite ? `cada mes el día ${e.dia>=29?"último del mes":e.dia}${e.veces?` · ${e.veces} vez${e.veces===1?"":"es"}`:""}` : fechaCorta(e.fecha);
  return `<p class="hint">Así tu celular te avisa el día anterior, aunque no abras la app. Las tarjetas y los créditos quedan como pagos <b>que se repiten cada mes</b>.</p>
    <button class="btn primary big" data-act="calTodo" style="width:100%">📅 Descargar todos (${evs.length})</button>
    <p class="subtle" style="margin:8px 0 14px">En iPhone, abre el archivo descargado y toca “Agregar todo”. En Android o computador, ábrelo con tu calendario, o usa los botones de Google Calendar de abajo, uno por uno.</p>
    <div class="plist">${evs.map(e=>`<div class="pitem" style="cursor:default"><span class="ptxt"><span><b>${esc(e.titulo)}</b></span><small>${cuando(e)}${e.monto>0.5?` · ${money(e.monto)}`:""}</small></span><a class="btn small" href="${esc(linkGoogle(e))}" target="_blank" rel="noopener">Google Calendar</a></div>`).join("")}</div>`;
}

// 5. ¿En qué se va tu plata? y topes por categoría
const CAT_TOPES = [...CAT_MOV, "Gastos hormiga"];
function gastoPorCategoria(m){
  const k=m.mes, out={};
  m.movs.filter(x=>x.tipo!=="ingreso" && !(+x.cuotas>1) && (x.fecha||"").slice(0,7)===k).forEach(x=>{ const cat=x.tipo==="hormiga"?"Gastos hormiga":(CAT_MOV.includes(x.cat)?x.cat:"Otros"); out[cat]=(out[cat]||0)+(+x.monto||0); });
  return out;
}
function alertasTopes(m){
  const topes=S.perfil.topes||{}, g=gastoPorCategoria(m), out=[];
  for(const cat of CAT_TOPES){ const t=+topes[cat]||0; if(!t) continue; const v=g[cat]||0;
    if(v>t+0.5) out.push({cat,v,t,nivel:"bad"}); else if(v>=t*0.8) out.push({cat,v,t,nivel:"warn"}); }
  return out;
}
function enQueSeVa(m,c){
  const k=m.mes, filas={};
  m.gastos.forEach(g=>{ const v=(+g.monto||0)*factor(g.frec,k); if(v>0) filas[g.cat||"Otros"]=(filas[g.cat||"Otros"]||0)+v; });
  const dia=gastoPorCategoria(m); Object.entries(dia).forEach(([cat,v])=>{ const n=cat==="Gastos hormiga"?cat:`${cat} (día a día)`; filas[n]=(filas[n]||0)+v; });
  const deudas=c.tarComp+c.creComp+c.prestComp; if(deudas>0.5) filas["Pagos de deudas"]=deudas;
  if(c.aportes>0.5) filas["Ahorro"]=c.aportes;
  const lista=Object.entries(filas).sort((a,b)=>b[1]-a[1]), total=sum(lista,x=>x[1]);
  const topes=S.perfil.topes||{};
  const barras = lista.length ? lista.map(([n,v])=>`<div class="cbar"><div class="cbar-h"><span>${esc(n)}</span><span class="num">${money(v)} <small>${Math.round(v/total*100)}%</small></span></div><div class="bar"><span class="${n==="Pagos de deudas"?"bad":n==="Ahorro"?"":"neu"}" style="width:${(v/lista[0][1]*100).toFixed(1)}%"></span></div></div>`).join("")
    : `<div class="empty">Cuando tengas gastos, aquí verás en qué se va tu plata.</div>`;
  const filasTope = CAT_TOPES.map(cat=>{ const v=dia[cat]||0, t=+topes[cat]||0, p=t?v/t:0, cl=t&&v>t?"bad":t&&p>=0.8?"warn":"";
    return `<div class="trow"><span class="tcat">${esc(cat)}</span><span class="num tgast">${money(v)}</span>
      <label class="ttope">tope<input inputmode="numeric" data-b="tope|-|${esc(cat)}|money" value="${t?numTxt(t):""}" placeholder="sin tope"></label>
      ${t?`<div class="bar tbar"><span class="${cl}" style="width:${Math.min(100,p*100).toFixed(1)}%"></span></div><span class="tmsg ${cl}">${v>t?`te pasaste ${money(v-t)}`:`quedan ${money(t-v)}`}</span>`:""}</div>`; }).join("");
  return `<section class="panel">
    <div class="listhead"><h2>¿En qué se va tu plata? ${hb("topes")}</h2><span class="total num">${money(total)} en ${monthName(k)}</span></div>
    <div class="cbars">${barras}</div>
  </section>
  <section class="panel">
    <h2>Topes del día a día ${hb("topes")}</h2>
    <p class="hint">Ponle un máximo al mes a lo que quieras controlar, como comida o domicilios. Te aviso en Hoy cuando llegues al 80% y cuando te pases.</p>
    <div class="trows">${filasTope}</div>
  </section>`;
}

// ---------- Guía paso a paso ----------
const PASOS=["hola","ingresos","gastos","deudas","ahorros","metas","fin"];
const PASO_L={ingresos:"Ingresos",gastos:"Gastos",deudas:"Deudas",ahorros:"Ahorros",metas:"Metas"};
const nombreCorto = () => esc(((S.user&&S.user.displayName)||"").trim().split(" ")[0]);
const bub = html => `<div class="bub"><img class="bav" src="icons/logo.svg" alt="" aria-hidden="true"><div class="btxt">${html}</div></div>`;
function gchips(f, items, sel){ return `<div class="gchips">${items.map(([v,l])=>{ const on=String(sel)===String(v); return `<button type="button" class="gchip ${on?"on":""}" data-act="gPick" data-f="${f}" data-v="${esc(v)}" aria-pressed="${on}">${l}</button>`; }).join("")}</div>`; }
function gin(f, ph, o={}){ const v=S.guia.tmp[f]; return `<input id="g-${f}" class="${o.big?"gbig":""}" ${o.type?`type="${o.type}"`:""} ${o.money?'inputmode="numeric"':""} ${o.dec?'inputmode="decimal"':""} placeholder="${esc(ph)}" value="${esc(v==null?"":(o.money&&v!==""?numTxt(parseMoney(v)):v))}">`; }
const gq = (label, inner, hint) => `<div class="gq">${label?`<label class="glab">${label}</label>`:""}${inner}${hint?`<p class="ghint">${hint}</p>`:""}</div>`;
function gSync(){ if(!S.guia) return; document.querySelectorAll('[id^="g-"]').forEach(el=>{ S.guia.tmp[el.id.slice(2)] = el.type==="checkbox" ? el.checked : el.value; }); }
const gItem = (txt, coll, id) => `<div class="gitem"><span class="gok">✓</span><div class="gsum">${txt}</div><button class="icon-btn" data-act="gDel" data-c="${coll}" data-id="${id}" aria-label="Quitar">✕</button></div>`;
const FREQ_ING=[["mensual","Mensual"],["quincenal","Quincenal"],["semanal","Semanal"],["diario","Diario"],["unico","Una sola vez"]];
const FREQ_GAS=[["mensual","Mensual"],["quincenal","Quincenal"],["semanal","Semanal"],["bimestral","Cada 2 meses"],["semestral","Cada 6 meses"],["anual","Una vez al año"],["unico","Solo este mes"]];
const G_ING=["Sueldo","Trabajo extra","Negocio propio","Ventas","Arriendo que recibo","Pensión","Mesada o ayuda","Otro"];
const G_GAS=[["Arriendo","Vivienda"],["Servicios públicos","Servicios"],["Internet y celular","Servicios"],["Mercado","Mercado"],["Transporte","Transporte"],["Estudio","Educación"],["Salud","Salud"],["Suscripciones","Ocio"],["Ayuda a la familia","Familia"],["Otro","Otros"]];
const lastDayPrev = () => { const k=idxKey(mIdx(thisMonth())-1); return `${k}-${pad(daysIn(k))}`; };
function autoForm(paso){ const m=S.months[thisMonth()]; return paso==="ingresos"&&!m.ingresos.length ? "ingreso" : paso==="gastos"&&!m.gastos.length ? "gasto" : null; }
function gDefaults(kind){
  return {ingreso:{frec:"mensual",tipo:"fijo"}, gasto:{frec:"mensual",cat:"Otros"}, tarjeta:{clase:"Tarjeta de crédito",cuotas:"1",pagado:"no"},
    credito:{tipo:"Libre inversión",pagado:"no",cargosSi:"no",tipoTasa:"EA"}, debo:{fecha:todayISO(),forma:"unico",cargoTipo:"no",presu:false}, medeben:{fecha:todayISO(),forma:"unico",cargoTipo:"no",presu:false},
    ahorro:{tipo:"Cuenta de ahorros",apertura:todayISO()}, meta:{tipo:"Carro o moto",pago:"contado",cuentas:[]}}[kind]||{};
}
function vGuia(){
  const g=S.guia, paso=PASOS[g.paso], m=S.months[thisMonth()], n=nombreCorto(), t=g.tmp;
  const c=calc(m);
  const prog = g.paso>0 ? `<div class="gprog" role="tablist" aria-label="Pasos de la guía">${["ingresos","gastos","deudas","ahorros","metas"].map((x,i)=>`<button type="button" data-act="gIr" data-v="${i+1}" class="${i+1<g.paso?"done":i+1===g.paso?"on":""}" ${i+1===g.paso?'aria-current="step"':""}>${PASO_L[x]}</button>`).join("")}</div>
    <p class="subtle gprog-tip">Toca cualquier paso para ir a él y agregar o cambiar algo. No tienes que salir de la guía.</p>` : "";
  const saltar = `<button class="linkbtn" data-act="gNext">Saltar este paso</button>`;
  const otro = (pregunta, kind, no) => `${bub(pregunta)}<div class="gbtns"><button class="btn primary" data-act="gForm" data-v="${kind}">Sí, agregar otro</button><button class="btn" data-act="gDone">${no}</button></div>`;
  const cont = label => `<div class="gbtns"><button class="btn primary big" data-act="gNext">${label} →</button></div>`;
  const cancelar = `<button class="btn ghost" data-act="gCancel">Cancelar</button>`;
  const ok = g.justSaved ? "¡Guardado ✓! " : "Esto es lo que ya tienes. ";
  let body="";
  if(paso==="hola"){
    body = bub(`¡Hola${n?", "+n:""}! 👋 Soy tu guía de <b>Pecuniae Ratio</b>.`)
      + bub(`Te voy a hacer unas preguntas cortas para armar tu presupuesto: lo que te entra, lo que pagas, lo que debes y lo que ahorras. Toma unos 5 minutos y <b>todo se guarda solo</b> a medida que avanzas.`)
      + bub(`¿Cómo estás? ¿Listo para empezar?`)
      + `<div class="gbtns"><button class="btn primary big" data-act="gNext">¡Sí, empecemos!</button><button class="btn" data-act="gExit">Ahora no, lo hago después</button></div>`;
  } else if(paso==="ingresos"){
    const list = m.ingresos.length ? `<div class="glist">${m.ingresos.map(x=>gItem(`<b>${esc(x.nombre||"Ingreso")}</b> · ${money(x.monto)} ${FREQ_TXT(x.frec)}`,"ingresos",x.id)).join("")}</div>` : "";
    if(g.done) body = list + (m.ingresos.length ? bub(`¡Listo! Tus ingresos quedaron guardados ✓<br>En total te entran <b>${money(c.ingPlan)}</b> al mes.`) : bub(`Está bien. Puedes agregar tus ingresos después.`))
      + bub(`Si más adelante tienes otro ingreso, lo agregas en la pestaña <b>Ingresos</b>.`) + cont("Seguir con mis gastos");
    else if(g.form){
      body = (m.ingresos.length ? list + bub("Perfecto. ¿Cuál es el otro ingreso?") : bub(`¿Cómo estás${n?", "+n:""}? ¿Listo para agregar tus ingresos? 💰`) + bub(`Empecemos por el principal: tu sueldo o lo que más te entra.`))
      + `<div class="gform">
        ${gq("¿Qué es?", gchips("nombre",G_ING.map(x=>[x,x]),t.nombre))}
        ${t.nombre==="Otro"?gq("¿Cómo lo llamas?", gin("otro","Ej: Clases particulares")):""}
        ${gq("¿Cuánto recibes cada vez?", gin("valor","$ 0",{money:true,big:true}))}
        ${gq("¿Cada cuánto te llega?", gchips("frec",FREQ_ING,t.frec))}
        ${gq("¿Siempre es el mismo valor?", gchips("tipo",[["fijo","Sí, siempre igual"],["variable","No, varía"]],t.tipo), t.tipo==="variable"?"Pon un valor aproximado. Lo que te entre de más lo anotas en Hoy como ingreso extra.":"")}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="ingreso">Guardar ingreso</button>${m.ingresos.length?cancelar:""}</div></div>` + (m.ingresos.length?"":saltar);
    } else body = list + otro(`${ok}¿Tienes otro ingreso? Por ejemplo, un trabajo extra o un arriendo.`,"ingreso","No, eso es todo");
  } else if(paso==="gastos"){
    const list = m.gastos.length ? `<div class="glist">${m.gastos.map(x=>gItem(`<b>${esc(x.nombre||"Gasto")}</b> · ${money(x.monto)} ${FREQ_TXT(x.frec)}`,"gastos",x.id)).join("")}</div>` : "";
    if(g.done) body = list + (m.gastos.length ? bub(`¡Listo! Tus gastos fijos quedaron guardados ✓<br>Suman <b>${money(c.gasTotal)}</b> al mes.`) : bub(`Está bien, los puedes agregar después.`))
      + bub(`Si después recuerdas otro, lo agregas en la pestaña <b>Gastos</b>.`) + cont("Seguir con mis deudas");
    else if(g.form){
      body = (m.gastos.length ? list + bub("¿Cuál es el otro gasto?") : bub(`¡Muy bien! Ahora tus <b>gastos fijos</b>: lo que pagas siempre, como el arriendo o los servicios.`) + bub(`Empecemos por el más grande.`))
      + `<div class="gform">
        ${gq("¿Qué es?", gchips("nombre",G_GAS.map(([x])=>[x,x]),t.nombre))}
        ${t.nombre==="Otro"?gq("¿Cómo lo llamas?", gin("otro","Ej: Gimnasio")):""}
        ${gq("¿Cuánto pagas cada vez?", gin("valor","$ 0",{money:true,big:true}))}
        ${gq("¿Cada cuánto lo pagas?", gchips("frec",FREQ_GAS,t.frec), ["semestral","anual","bimestral"].includes(t.frec)?"La app lo reparte mes a mes para que vayas apartando.":"")}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="gasto">Guardar gasto</button>${m.gastos.length?cancelar:""}</div></div>` + (m.gastos.length?"":saltar);
    } else body = list + otro(`${ok}¿Tienes otro gasto fijo?`,"gasto","No, eso es todo");
  } else if(paso==="deudas"){
    const items = [
      ...S.perfil.tarjetas.map(x=>gItem(`💳 <b>${esc(x.nombre||"Tarjeta")}</b> · ${esc(x.clase||"Tarjeta de crédito")}`,"tarjetas",x.id)),
      ...S.perfil.creditos.map(x=>gItem(`🏦 <b>${esc(x.nombre||"Crédito")}</b> · ${(+x.cuotaReal)?`pagas ${money(x.cuotaReal)} al mes`:`${money(x.valor)}`}`,"creditos",x.id)),
      ...(S.perfil.prestamos||[]).map(x=>gItem(`${x.dir==="debo"?"🤝 Le debes a":"💸 Te debe"} <b>${esc(x.persona||"alguien")}</b> · ${money(x.valor)}`,"prestamos",x.id))];
    const list = items.length ? `<div class="glist">${items.join("")}</div>` : "";
    if(g.done) body = list + (items.length ? bub(`¡Listo! Tus deudas quedaron guardadas ✓`) : bub(`¡Qué bien, sin deudas! 🙌`))
      + bub(`Si más adelante tienes una deuda o le prestas plata a alguien, la agregas en <b>Tarjetas</b>, <b>Créditos</b> o <b>Préstamos</b>.`) + cont("Seguir con mis ahorros");
    else if(g.form==="tarjeta") body = list + bub(`Cuéntame de tu tarjeta. Si tienes el extracto a la mano, mejor; si no, pon valores aproximados.`) + `<div class="gform">
        ${gq("¿Cómo la identificas?", gin("nombre","Ej: Visa Bancolombia"))}
        ${gq("¿Qué es?", gchips("clase",[["Tarjeta de crédito","Tarjeta de crédito"],["Cupo en almacén o app","Cupo de almacén o app"],["Crédito rotativo","Crédito rotativo"]],t.clase))}
        ${gq("¿Cuánto debes hoy en total?", gin("debe","$ 0",{money:true,big:true}), "Si no debes nada, déjalo vacío.")}
        ${gq("¿En cuántas cuotas lo estás pagando?", gin("cuotas","1",{money:true}), "Si son varias compras, pon un promedio. Luego puedes anotar cada compra en la pestaña Tarjetas.")}
        ${gq("¿Qué tasa de interés cobra? (% E.A.)", gin("tasa","Ej: 28,5",{dec:true}), "Sale en tu extracto como “tasa E.A.”. Si no la sabes, déjala vacía y la completas después.")}
        ${gq("¿Cuánto es el cupo total?", gin("cupo","$ 0",{money:true}), "Opcional. Sirve para saber cuánto cupo te queda.")}
        ${gq("¿Cuánto te cobran de cuota de manejo al mes?", gin("manejo","$ 0",{money:true}), "Opcional.")}
        ${gq("¿Qué día del mes la pagas?", gin("diaPago","Ej: 15",{money:true}), "Opcional. Te lo recuerdo en la pantalla Hoy.")}
        ${gq("¿Ya hiciste el pago de este mes?", gchips("pagado",[["no","Todavía no"],["si","Sí, ya pagué"]],t.pagado))}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="tarjeta">Guardar tarjeta</button>${cancelar}</div></div>`;
    else if(g.form==="credito"){
      const q=parseMoney(t.cuota), V=parseMoney(t.valor), nn=parseMoney(t.cuotas), car=t.cargosSi==="si"?parseMoney(t.seguro)+parseMoney(t.otros):0;
      const iInf = (t.tasa||"").trim()==="" && q>0 ? tasaDesdeCuota(V, nn, Math.max(0,q-car)) : null;
      body = list + bub(`Cuéntame de tu crédito. Si tienes el contrato o un extracto a la mano, mejor.`) + `<div class="gform">
        ${gq("¿Con quién es?", gin("nombre","Ej: Bancolombia, Davivienda, Claro…"))}
        ${gq("¿Qué tipo de crédito es?", gchips("tipo",[["Libre inversión","Libre inversión"],["Libre inversión con garantía de vivienda","Libre inversión con garantía de casa"],["Libre inversión con garantía de vehículo","Libre inversión con garantía de vehículo"],["Libranza","Libranza"],["Vehículo","Para comprar carro o moto"],["Vivienda (hipotecario o leasing)","Vivienda"],["Estudio","Estudio"],["Celular o equipo financiado","Celular o equipo"],["Compra a cuotas en almacén","Compra en almacén"],["Otro","Otro"]],t.tipo))}
        ${gq("¿Cuánto te prestaron?", gin("valor","$ 0",{money:true,big:true}), "El valor del crédito cuando te lo dieron.")}
        ${gq("¿En cuántas cuotas en total?", gin("cuotas","Ej: 60",{money:true}), "Todas, no solo las que faltan. Si no sabes, déjalo vacío y lo calculo con tu cuota y tu tasa.")}
        ${gq("¿Cuándo fue (o será) tu primera cuota?", gin("primerPago","",{type:"date"}), "Sale en tu contrato o en tu primer extracto. Con esta fecha sé en qué cuota vas.")}
        ${gq("¿Cuánto pagas cada mes en total?", gin("cuota","$ 0",{money:true}), "Lo que te sale en el extracto para pagar.")}
        ${gq("¿Dentro de ese pago te cobran seguro u otros cargos?", gchips("cargosSi",[["no","No"],["si","Sí"],["nose","No sé"]],t.cargosSi))}
        ${t.cargosSi==="si"?gq("¿Cuánto es el seguro al mes?", gin("seguro","$ 0",{money:true}), "Si tienes varios créditos con el mismo banco y el seguro se cobra en uno solo, ponlo solo en ese.")+gq("¿Algún otro cargo al mes? (comisión, administración…)", gin("otros","$ 0",{money:true}), "Opcional."):""}
        ${gq("¿Qué tasa de interés tiene?", gin("tasa","Ej: 26,67",{dec:true})+gchips("tipoTasa",[["EA","Efectiva anual (E.A.)"],["MV","Mensual (M.V.)"]],t.tipoTasa), iInf!==null?`Si no la sabes, déjala vacía: con lo que pagas, la tasa sería de unos <b>${pctTxt((Math.pow(1+iInf,12)-1)*100)}% E.A.</b> (${pctTxt(iInf*100)}% mensual).`:"Si no la sabes, déjala vacía y la calculo con lo que pagas.")}
        ${gq("¿Ya pagaste la cuota de este mes?", gchips("pagado",[["no","Todavía no"],["si","Sí, ya pagué"]],t.pagado))}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="credito">Guardar crédito</button>${cancelar}</div></div>`;
    }
    else if(g.form==="debo"||g.form==="medeben"){
      const debo=g.form==="debo";
      body = list + bub(debo?`Cuéntame del préstamo. ¿A quién le debes y cómo quedaron de pagarle?`:`Anotemos quién te debe, para que no se te olvide cobrar.`) + `<div class="gform">
        ${gq(debo?"¿A quién le debes?":"¿Quién te debe?", gin("persona","Nombre"))}
        ${gq("¿Cuánto?", gin("valor","$ 0",{money:true,big:true}))}
        ${gq("¿Cuándo fue el préstamo?", gin("fecha","",{type:"date"}))}
        ${gq("¿Cómo se va a pagar?", gchips("forma",[["unico","Todo en una fecha"],["cuotas","En cuotas mensuales"],["libre","Sin fecha fija"]],t.forma))}
        ${t.forma==="unico"?gq("¿Qué día hay que pagar?", gin("fechaPago","",{type:"date"})):""}
        ${t.forma==="cuotas"?gq("¿En cuántas cuotas?", gin("cuotas","Ej: 3",{money:true}))+gq("¿Cuándo es la primera cuota?", gin("fechaPago","",{type:"date"}), "Las demás quedan cada mes, el mismo día."):""}
        ${gq(debo?"¿Te cobra algo adicional?":"¿Le cobras algo adicional?", gchips("cargoTipo",[["no","No, nada"],["fijo","Un valor fijo"],["pct","Un % cada mes"]],t.cargoTipo))}
        ${t.cargoTipo==="fijo"?gq("¿Cuánto adicional?", gin("cargo","$ 0",{money:true}), "Por ejemplo: te prestó 500.000 y le devuelves 550.000 → pon 50.000."):""}
        ${t.cargoTipo==="pct"?gq("¿Qué porcentaje al mes?", gin("cargo","Ej: 5",{dec:true}), "Se calcula como interés simple sobre lo prestado, por cada mes."):""}
        ${gq("", `<label class="gcheck"><input type="checkbox" id="g-presu" ${t.presu?"checked":""}> ${debo?"Esta plata la voy a usar este mes (súmala a lo que me entra)":"Esta plata salió de mi presupuesto de este mes"}</label>`)}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="${g.form}">Guardar</button>${cancelar}</div></div>`;
    } else body = list + (items.length ? bub(`${ok}¿Tienes otra deuda?`) : bub(`Ahora hablemos de deudas. ¿Tienes alguna? Elige el tipo y te pregunto lo necesario.`) + bub(`También puedes anotar si alguien te debe plata a ti.`))
      + `<div class="gchoices">
        <button class="gchoice" data-act="gForm" data-v="tarjeta"><span>💳</span><b>Tarjeta de crédito o cupo</b><small>Visa, Mastercard, cupos de almacén o apps…</small></button>
        <button class="gchoice" data-act="gForm" data-v="credito"><span>🏦</span><b>Crédito en cuotas</b><small>Banco, libranza, carro, celular, estudio…</small></button>
        <button class="gchoice" data-act="gForm" data-v="debo"><span>🤝</span><b>Le debo plata a alguien</b><small>Un amigo, un familiar, un compañero…</small></button>
        <button class="gchoice" data-act="gForm" data-v="medeben"><span>💸</span><b>Alguien me debe plata</b><small>Para acordarte de cobrar</small></button>
      </div><div class="gbtns"><button class="btn" data-act="gDone">${items.length?"Ya terminé con mis deudas":"No tengo deudas"}</button></div>`;
  } else if(paso==="ahorros"){
    const list = S.perfil.ahorros.length ? `<div class="glist">${S.perfil.ahorros.map(x=>gItem(`🏦 <b>${esc(x.nombre||x.tipo)}</b> · ${money(x.inicial)}`,"ahorros",x.id)).join("")}</div>` : "";
    const cdt=t.tipo==="CDT", efe=t.tipo==="Efectivo";
    if(g.done) body = list + (S.perfil.ahorros.length ? bub(`¡Listo! Tus ahorros quedaron guardados ✓`) : bub(`Está bien. Cuando empieces a ahorrar, lo agregas en la pestaña <b>Ahorros</b>.`))
      + (S.perfil.ahorros.length ? bub(`Cuando metas o saques plata, regístralo en la pestaña <b>Ahorros</b> y la app calcula cuánto has ganado.`) : "") + cont("Seguir con mis metas");
    else if(g.form) body = list + bub(`Cuéntame de ese ahorro.`) + `<div class="gform">
        ${gq("¿Qué tipo de ahorro es?", gchips("tipo",[["Cuenta de ahorros","Cuenta de ahorros"],["Cajita o bolsillo","Cajita o bolsillo"],["CDT","CDT"],["Fondo o inversión","Fondo o inversión"],["Efectivo","Efectivo guardado"]],t.tipo))}
        ${gq("¿Cómo lo llamas?", gin("nombre", cdt?"Ej: CDT Davivienda":"Ej: Cajita del viaje"))}
        ${efe?"":gq("¿En qué banco o app?", gin("entidad","Ej: Nu, Nequi, Bancolombia"), "Opcional.")}
        ${gq(cdt?"¿De cuánto es el CDT?":"¿Cuánto tienes hoy ahí?", gin("valor","$ 0",{money:true,big:true}))}
        ${cdt?gq("¿Cuándo lo abriste?", gin("apertura","",{type:"date"}))+gq("¿A cuántos meses?", gin("plazo","Ej: 6",{money:true})):""}
        ${efe?"":gq("¿Cuánto rinde al año? (% E.A.)", gin("tasa","Ej: 9",{dec:true}), "Lo ves en tu banco o app. Si no sabes o no rinde, déjalo vacío.")}
        ${cdt?"":gq("¿Cuánto le piensas meter cada mes?", gin("aporte","$ 0",{money:true}), "Opcional. Se aparta de tu presupuesto como un compromiso.")}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="ahorro">Guardar ahorro</button>${cancelar}</div></div>`;
    else body = list + (S.perfil.ahorros.length ? otro(`${ok}¿Tienes otro ahorro?`,"ahorro","No, eso es todo")
      : bub(`¡Ya casi! ¿Tienes plata ahorrada? Una cuenta de ahorros, una cajita en Nu o Nequi, un CDT…`) + `<div class="gbtns"><button class="btn primary" data-act="gForm" data-v="ahorro">Sí, agregar un ahorro</button><button class="btn" data-act="gDone">No tengo ahorros por ahora</button></div>`);
  } else if(paso==="metas"){
    const fc=fcOf(thisMonth());
    const list = S.perfil.metas.length ? `<div class="glist">${S.perfil.metas.map(x=>gItem(`🎯 <b>${esc(x.nombre||x.tipo)}</b> · ${money((+x.valor||0)*((+x.porcentaje||100)/100))}`,"metas",x.id)).join("")}</div>` : "";
    const viv=t.tipo==="Cuota inicial de vivienda", car=t.tipo==="Carro o moto", eme=t.tipo==="Fondo de emergencia";
    const sug = Math.round((c.gasTotal+c.tarComp+c.creComp+c.prestComp)*6/1000)*1000;
    if(g.done) body = list + (S.perfil.metas.length ? bub(`¡Listo! Tus metas quedaron guardadas ✓ En la pestaña <b>Metas</b> verás tu avance.`) : bub(`Está bien. Cuando tengas una meta, la agregas en la pestaña <b>Metas</b>.`)) + cont("Ver mi presupuesto");
    else if(g.form) body = list + bub(`¡Me encanta! Cuéntame de tu meta.`) + `<div class="gform">
        ${gq("¿Para qué estás ahorrando?", gchips("tipo",TIPOS_META.map(x=>[x,x]),t.tipo))}
        ${gq("Ponle un nombre", gin("nombre", car?"Ej: Mi primera moto":viv?"Ej: Mi apartamento":"Ej: Viaje a Cartagena"))}
        ${gq(viv?"¿Cuánto vale la vivienda?":car?"¿Cuánto cuesta el vehículo?":"¿Cuánto necesitas?", gin("valor","$ 0",{money:true,big:true}), eme&&sug>0?`Te sugiero <b>${money(sug)}</b>: 6 meses de tus gastos fijos y deudas. <button class="btn small" data-act="gSug" data-v="${sug}">Usar este valor</button>`:"")}
        ${viv?gq("¿Qué porcentaje necesitas de cuota inicial?", gin("pct","30",{money:true}), "En Colombia suele ser el 30% (20% en vivienda de interés social)."):""}
        ${car?gq("¿Cómo lo vas a pagar?", gchips("pago",[["contado","De contado (todo)"],["fin","Financiado (solo la cuota inicial)"]],t.pago))+(t.pago==="fin"?gq("¿Qué porcentaje de cuota inicial?", gin("pct","30",{money:true}), "Los bancos suelen pedir entre 20% y 30%."):""):""}
        ${gq("¿Para cuándo la quieres?", gin("fecha","",{type:"month"}), "Opcional, pero te ayuda a saber cuánto ahorrar al mes.")}
        ${S.perfil.ahorros.length?gq("¿Qué ahorros son para esta meta?", `<div class="gchips">${S.perfil.ahorros.map(a=>{ const on=(t.cuentas||[]).includes(a.id); return `<button type="button" class="gchip ${on?"on":""}" data-act="gAcc" data-v="${a.id}" aria-pressed="${on}">${on?"✓ ":""}${esc(a.nombre||a.tipo)}</button>`; }).join("")}</div>`, "Opcional. Así la app mide tu avance."):""}
        <div class="gbtns"><button class="btn primary big" data-act="gSave" data-v="meta">Guardar meta</button>${cancelar}</div></div>`;
    else body = list + (S.perfil.metas.length ? otro(`${g.justSaved?"¡Meta guardada ✓! ":"Esto es lo que ya tienes. "}¿Tienes otra meta?`,"meta","No, eso es todo")
      : bub(`Por último: ¿estás ahorrando para algo en especial? Un carro, la cuota inicial de una casa, un viaje, un fondo para emergencias…`) + `<div class="gbtns"><button class="btn primary" data-act="gForm" data-v="meta">Sí, tengo una meta</button><button class="btn" data-act="gDone">Ahora no</button></div>`);
  } else {
    body = bub(`¡Listo${n?", "+n:""}! 🎉 Ya armamos tu presupuesto.`)
      + `<div class="gfinal"><p>Hoy puedes gastar</p><div class="big num ${c.quedaHoy<0?"neg":""}">${money(c.quedaHoy)}</div><p class="subtle">Te quedan ${money(Math.max(0,c.libre-c.gastado))} libres para los ${c.rest} días que faltan del mes.</p>
        <div class="stats" style="margin-top:12px;text-align:left">
          <div class="stat"><div class="k">Te entra al mes</div><div class="v num ok">${money(c.ingresos)}</div></div>
          <div class="stat"><div class="k">Gastos fijos</div><div class="v num">${money(c.gasTotal)}</div></div>
          <div class="stat"><div class="k">Pagos de deudas este mes</div><div class="v num">${money(c.tarComp+c.creComp+c.prestComp)}</div></div>
          <div class="stat"><div class="k">Ahorrado</div><div class="v num ok">${money(c.ahorroTotal)}</div></div>
        </div></div>`
      + (c.libre<0 ? bub(`⚠️ Ojo: tus compromisos superan lo que te entra por <b>${money(-c.libre)}</b>. Revisa tus gastos o deudas; en Hoy te lo voy a recordar.`) : "")
      + bub(`Desde ahora, lo único que tienes que hacer es <b>anotar lo que gastas cada día</b> en la pantalla Hoy. Para cosas pequeñas, como un tinto, usa los botones de <b>gasto hormiga</b>.`)
      + bub(`¿Te faltó algo? Toca cualquier paso de arriba para volver a él. Y cuando ya estés en tu presupuesto, el botón <b>🧭 Guía</b> de arriba te trae de vuelta aquí cuando quieras. Para dudas, toca el <b>?</b>.`)
      + `<div class="gbtns"><button class="btn primary big" data-act="gFin">Ir a mi presupuesto</button></div>`;
  }
  return `<section class="panel guia">
    <div class="ghead">${g.paso>1&&g.paso<PASOS.length-1?`<button class="btn small" data-act="gIr" data-v="${g.paso-1}">‹ Paso anterior</button>`:`<b>Guía paso a paso</b>`}<button class="btn small ghost" data-act="gExit">Salir de la guía</button></div>
    ${prog}<div class="gbody">${body}</div></section>`;
}
// Estado de la guía en el perfil: null = nunca la vio · {hecho:true} = terminada · {descartada:true} = no la quiere
// {hecho:false, paso:N} = la dejó a medias en el paso N (1 a 5)
const guiaPendiente = () => { const g=S.perfil.guia; return !!g && !g.hecho && !g.descartada; };
const pasoGuardado = () => { const g=S.perfil.guia; return guiaPendiente() && g.paso>=1 && g.paso<=5 ? g.paso : 0; };
function marcarPaso(n){
  const g=S.perfil.guia; if(g && g.hecho) return;
  if(n>=PASOS.length-1){ S.perfil.guia={hecho:true,fecha:todayISO()}; savePerfil(); return; }
  if(g && !g.descartada && g.paso===n) return;
  S.perfil.guia={hecho:false,paso:n}; savePerfil();
}
// ---------- Novedades: se muestran una vez por versión ----------
// Para anunciar mejoras nuevas: cambia NOVEDADES_ID y la lista. Quien ya usaba la app las ve una vez en Hoy.
const NOVEDADES_ID = "2026-11-clave";
const NOVEDADES = [
  {i:"🔒", t:"Ponle clave a tu app", d:"De 4 o 6 números, con teclado como el del iPhone.", a:"clave", b:"Activar"},
  {i:"🧭", t:"La guía ahora es más fácil", d:"Toca cualquier paso para volver a él, y sigue donde ibas con el botón 🧭 Guía.", a:"gAbrir", b:"Abrir guía"},
  {i:"💳", t:"Compras a cuotas desde Hoy", d:"Al pagar con tarjeta, escribe en cuántas cuotas y se reparte sola mes a mes.", a:"help", v:"compracuotas", b:"Ver cómo"},
  {i:"📊", t:"¿En qué se va tu plata?", d:"Gráfica por categoría y topes del día a día que te avisan al 80%.", a:"goTab", v:"gastos", b:"Ver"},
  {i:"📅", t:"Tus pagos en el calendario", d:"Agrega fechas de tarjetas, créditos y préstamos para que el celular te avise.", a:"cal", b:"Agregar"},
  {i:"💾", t:"Copia de seguridad", d:"Descarga todos tus datos y restáuralos si algo se borra.", a:"help", v:"copia", b:"Ver cómo"}
];
const novedadesPendientes = () => !!S.perfil && S.perfil.novedades!==NOVEDADES_ID && !S.guia;
const filasNovedades = () => NOVEDADES.map((n,i)=>`<div class="nov-it" style="--d:${i*60}ms"><span class="nov-i" aria-hidden="true">${n.i}</span>
  <span class="nov-tx"><b>${n.t}</b><small>${n.d}</small></span>
  <button class="btn small" data-act="${n.a}"${n.v?` data-v="${n.v}"`:""}>${n.b}</button></div>`).join("");
function novedadesCard(){
  if(!novedadesPendientes()) return "";
  return `<section class="panel nov" aria-label="Novedades">
    <div class="nov-h"><span class="nov-badge">✨ Novedades</span><button class="icon-btn" data-act="novOk" aria-label="Cerrar novedades">✕</button></div>
    <h2 class="nov-t">Pecuniae Ratio tiene cosas nuevas</h2>
    <div class="nov-list">${filasNovedades()}</div>
    <button class="btn primary" data-act="novOk" style="width:100%;margin-top:12px">Entendido</button>
  </section>`;
}

function guiaBanner(){
  if(!S.perfil.guia) return `<section class="panel gbanner">${bub("¿Primera vez por aquí? Te puedo guiar paso a paso para armar tu presupuesto en unos minutos.")}
    <div class="gbtns"><button class="btn primary" data-act="gStart">Sí, guíame</button><button class="btn" data-act="gNo">No, gracias</button></div></section>`;
  if(!guiaPendiente()) return "";
  const n=pasoGuardado();
  if(n) return `<section class="panel gbanner">${bub(`Te quedaste en <b>${PASO_L[PASOS[n]]}</b> (paso ${n} de 5). ¿Seguimos donde ibas? Lo que ya llenaste sigue guardado.`)}
    <div class="gbtns"><button class="btn primary" data-act="gSeguir">Sí, seguir</button><button class="btn" data-act="gNo">Ya no la necesito</button></div>
    <p class="subtle" style="margin:6px 0 0"><button class="linkbtn" data-act="gStart">Empezar la guía de nuevo</button></p></section>`;
  return `<section class="panel gbanner">${bub("¿Terminamos de armar tu presupuesto con la guía? Lo que ya llenaste sigue guardado.")}
    <div class="gbtns"><button class="btn primary" data-act="gStart">Sí, guíame</button><button class="btn" data-act="gNo">Ya no la necesito</button></div></section>`;
}
function guardarGuia(kind){
  const t=S.guia.tmp, m=S.months[thisMonth()], id=uid(), dia=Math.max(0,Math.min(31,parseMoney(t.diaPago)))||"";
  const nombreDe = def => (t.nombre==="Otro" ? (t.otro||"").trim() : (t.nombre||"").trim()) || def;
  if(kind==="ingreso"){
    const v=parseMoney(t.valor); if(!v) return "Escribe cuánto recibes.";
    m.ingresos.push({id,nombre:nombreDe("Ingreso"),monto:v,frec:t.frec||"mensual",tipo:t.tipo||"fijo"}); save(thisMonth()); return {ok:"Ingreso guardado"};
  }
  if(kind==="gasto"){
    const v=parseMoney(t.valor); if(!v) return "Escribe cuánto pagas.";
    const cat=(G_GAS.find(([x])=>x===t.nombre)||[0,"Otros"])[1];
    m.gastos.push({id,nombre:nombreDe("Gasto"),monto:v,frec:t.frec||"mensual",cat,tipo:"fijo",medio:"efectivo"}); save(thisMonth()); return {ok:"Gasto guardado"};
  }
  if(kind==="tarjeta"){
    const debe=parseMoney(t.debe), cuotas=Math.max(1,Math.round(parseMoney(t.cuotas)||1));
    const card={id,nombre:(t.nombre||"").trim()||t.clase||"Tarjeta",clase:t.clase||"Tarjeta de crédito",franquicia:"Otra",cupo:parseMoney(t.cupo),tasa:(t.tasa||"").trim()===""?"":parseNum(t.tasa),tipoTasa:"EA",sistema:"capital",manejo:parseMoney(t.manejo),cobraSiempre:true,planExtra:0,diaPago:dia,compras:[],minReal:{}};
    if(debe>0) card.compras.push({id:uid(),fecha:lastDayPrev(),desc:"Lo que debía al empezar",valor:debe,cuotas,primerCobro:t.pagado==="si"?nextMonth(thisMonth()):thisMonth()});
    S.perfil.tarjetas.push(card);
    if(t.pagado==="si"){ const st=cardState(card,ctx(),mIdx(thisMonth())); if(st.min>0.5) S.perfil.pagos.push({id:uid(),oblig:card.id,tipo:"pago",fecha:todayISO(),valor:Math.round(st.min)}); }
    savePerfil(); return {ok:"Tarjeta guardada"};
  }
  if(kind==="credito"){
    const valor=parseMoney(t.valor); if(!valor) return "Escribe cuánto te prestaron.";
    if(!t.primerPago) return "Escribe la fecha de tu primera cuota.";
    const q=parseMoney(t.cuota), n=parseMoney(t.cuotas)||"";
    if(!n && !q) return "Escribe en cuántas cuotas es, o cuánto pagas cada mes.";
    const cargos = t.cargosSi==="si";
    const cr={id,nombre:(t.nombre||"").trim()||t.tipo||"Crédito",tipo:t.tipo||"Libre inversión",valor,cuotas:n,tasa:(t.tasa||"").trim()===""?"":parseNum(t.tasa),tipoTasa:t.tipoTasa||"EA",sistema:"fija",
      primerPago:t.primerPago,cuotaReal:q,seguro:cargos?parseMoney(t.seguro):0,otros:cargos?parseMoney(t.otros):0,segIncl:true,planExtra:0,diaPago:dia||+t.primerPago.slice(8,10)};
    S.perfil.creditos.push(cr);
    const M0=mIdx(thisMonth()), st=creditState(cr,ctx(),M0);
    if(t.pagado==="si" && st.min>0.5) S.perfil.pagos.push({id:uid(),oblig:id,tipo:"pago",fecha:todayISO(),valor:Math.round(st.min)});
    savePerfil();
    const it=st.item, extras=[];
    if(it.inferida) extras.push(`Por lo que pagas, la tasa es de unos ${pctTxt(it.eaUsada)}% E.A.`);
    if(it.nCalc) extras.push(`Te faltan unas ${Math.max(0,it.fin-M0+1)} cuotas.`);
    if(t.cargosSi==="nose") extras.push("Si después ves seguro u otros cargos en tu extracto, agrégalos en la pestaña Créditos.");
    return {ok:"Crédito guardado", extra:extras.join(" ")};
  }
  if(kind==="debo"||kind==="medeben"){
    const valor=parseMoney(t.valor); if(!valor) return "Escribe cuánto fue el préstamo.";
    const forma=t.forma||"unico";
    if(forma!=="libre" && !t.fechaPago) return forma==="cuotas" ? "Escribe la fecha de la primera cuota." : "Escribe la fecha de pago.";
    const persona=(t.persona||"").trim()||"Alguien";
    const p={id,dir:kind,persona,motivo:"",valor,fecha:t.fecha||todayISO(),forma,fechaPago:forma==="libre"?"":t.fechaPago,cuotas:forma==="cuotas"?Math.max(1,Math.round(parseMoney(t.cuotas)||1)):1,
      cargoTipo:t.cargoTipo||"no",cargo:t.cargoTipo==="pct"?parseNum(t.cargo):parseMoney(t.cargo),pagos:[]};
    if(t.presu){ const mk=p.fecha.slice(0,7), md=S.months[mk]; if(md){ const mv={id:uid(),fecha:p.fecha,tipo:kind==="debo"?"ingreso":"gasto",monto:valor,desc:(kind==="debo"?"Préstamo de ":"Préstamo a ")+persona,cat:kind==="debo"?"Otro":"Otros",medio:"efectivo"}; md.movs.push(mv); p.movId=mv.id; save(mk); } }
    S.perfil.prestamos.push(p); savePerfil(); return {ok:"Préstamo guardado"};
  }
  if(kind==="ahorro"){
    const v=parseMoney(t.valor), cdt=t.tipo==="CDT"; if(!v) return cdt?"Escribe el valor del CDT.":"Escribe cuánto tienes.";
    if(cdt && !(parseMoney(t.plazo)>0)) return "Escribe a cuántos meses es el CDT.";
    S.perfil.ahorros.push({id,nombre:(t.nombre||"").trim()||t.tipo,tipo:t.tipo||"Cuenta de ahorros",entidad:(t.entidad||"").trim(),apertura:cdt?(t.apertura||todayISO()):todayISO(),inicial:v,
      tasa:(t.tasa||"").trim()===""?"":parseNum(t.tasa),aporte:cdt?0:parseMoney(t.aporte),plazo:cdt?parseMoney(t.plazo):"",retencion:cdt?4:0,saldoReal:0,fechaReal:"",meta:"",movs:[]});
    savePerfil(); return {ok:"Ahorro guardado"};
  }
  if(kind==="meta"){
    const v=parseMoney(t.valor); if(!v) return "Escribe cuánto cuesta lo que quieres.";
    const pct = t.tipo==="Cuota inicial de vivienda" ? (parseMoney(t.pct)||30) : (t.tipo==="Carro o moto" && t.pago==="fin" ? (parseMoney(t.pct)||30) : 100);
    S.perfil.metas.push({id,nombre:(t.nombre||"").trim()||t.tipo,tipo:t.tipo||"Otro",valor:v,porcentaje:pct,fecha:t.fecha||"",extra:0});
    (t.cuentas||[]).forEach(aid=>{ const a=S.perfil.ahorros.find(x=>x.id===aid); if(a) a.meta=id; });
    savePerfil(); return {ok:"Meta guardada"};
  }
  return "";
}
async function accionesNuevas(act,b,e,m){
  const g=S.guia;
  switch(act){
    case "unfold": S.open.add(b.dataset.id); render(); setTimeout(()=>{ const el=document.querySelector(`[data-fold="${CSS.escape(b.dataset.id)}"]`); if(el) el.scrollIntoView({block:"nearest"}); },0); return true;
    case "fold": S.open.delete(b.dataset.id); render(); confirmSaved(b.dataset.l||"Guardado"); return true;
    case "help": S.menu=false; renderMenu(); S.dlg=null; S.help=b.dataset.v||"inicio"; renderModal(); return true;
    case "helpClose": S.help=null; S.dlg=null; renderModal(); return true;
    case "novOk": S.perfil.novedades=NOVEDADES_ID; savePerfil(); { const el=$(".nov"); if(el){ el.classList.add("nov-sale"); setTimeout(render,230); } else render(); } toast("Puedes volver a verlas en el menú de tu foto, en ✨ Novedades."); return true;
    case "novVer": S.menu=false; renderMenu(); S.help=null; S.dlg={kind:"novedades"}; renderModal(); return true;
    case "clave": S.menu=false; renderMenu(); S.help=null; S.dlg={kind:"clave"}; renderModal(); return true;
    case "claveLen": { const n=+b.dataset.v===6?6:4; S.dlg=null; renderModal(); flujoCrear(n,{alCancelar:()=>{ S.dlg={kind:"clave"}; renderModal(); }}); return true; }
    case "claveCambiar": S.dlg=null; renderModal(); verificarYLuego("Ingresa tu clave actual", ()=>{ S.dlg={kind:"clave",cambiando:true}; renderModal(); }); return true;
    case "claveQuitar": S.dlg=null; renderModal(); verificarYLuego("Ingresa tu clave para quitarla", ()=>{ S.perfil.pin=null; savePerfil(); renderMenu(); toast("Quitaste la clave. La app abre sin pedirla."); }); return true;
    case "privAcepto": S.perfil.privacidad={acepto:true,fecha:todayISO(),version:1,como:"aviso"}; savePerfil(); S.dlg=null; renderModal(); toast("Gracias. Puedes leer el aviso cuando quieras desde el menú de tu foto."); return true;
    case "privNo": flushAll(); S.dlg=null; S.menu=false; await signOut(auth); return true;
    case "privacidad": S.menu=false; renderMenu(); S.help=null; S.dlg={kind:"privacidad"}; renderModal(); return true;
    case "cal": S.menu=false; renderMenu(); S.help=null; S.dlg={kind:"calendario"}; renderModal(); return true;
    case "calTodo": { const evs=eventosCalendario(); if(!evs.length) return true; descargarArchivo("pagos-pecuniae-ratio.ics", icsTexto(evs), "text/calendar;charset=utf-8"); toast(`Descargaste ${evs.length} fecha${evs.length===1?"":"s"}. Ábrelo para agregarlas a tu calendario.`); return true; }
    case "copiaDescargar": S.menu=false; renderMenu(); descargarCopia(); return true;
    case "copiaElegir": { const f=$("#copiaFile"); if(f){ f.value=""; f.click(); } return true; }
    case "copiaRestaurar": if(S.dlg && S.dlg.kind==="restaurar") await restaurarCopia(); return true;
    case "gStart": S.help=null; S.menu=false; S.guia={paso:0,form:null,done:false,tmp:{}}; render(); window.scrollTo({top:0}); return true;
    case "gAbrir": { if(S.guia) return true; S.help=null; S.dlg=null; renderModal(); S.menu=false; renderMenu();
      const n = pasoGuardado() || (S.perfil.guia && S.perfil.guia.hecho ? 1 : 0);
      const g2={paso:n,form:n?autoForm(PASOS[n]):null,done:false,tmp:{}}; if(g2.form) g2.tmp=gDefaults(g2.form); S.guia=g2; S.tab="hoy"; render(); window.scrollTo({top:0}); return true; }
    case "gSeguir": { S.help=null; S.menu=false; const n=pasoGuardado()||1; const g2={paso:n,form:autoForm(PASOS[n]),done:false,tmp:{}}; if(g2.form) g2.tmp=gDefaults(g2.form); S.guia=g2; S.tab="hoy"; render(); window.scrollTo({top:0}); return true; }
    case "gNo": S.perfil.guia={hecho:false,descartada:true}; savePerfil(); render(); toast("Listo. Si cambias de opinión, toca 🧭 Guía, arriba."); return true;
    case "gExit": { const ap=S.guia?S.guia.paso:0; S.guia=null; if(!S.perfil.guia) S.perfil.guia={hecho:false,paso:ap}; savePerfil(); S.tab="hoy"; render();
      toast(guiaPendiente()&&pasoGuardado() ? `Lo que llenaste quedó guardado. Cuando quieras, sigues en ${PASO_L[PASOS[pasoGuardado()]]} con 🧭 Guía, arriba.` : "Lo que alcanzaste a llenar quedó guardado. Vuelve cuando quieras con 🧭 Guía, arriba."); return true; }
    case "addPPago": {
      const p=S.perfil.prestamos.find(x=>x.id===b.dataset.id); if(!p) return true;
      const v=parseMoney($(`#pp-${p.id}-valor`).value), fecha=$(`#pp-${p.id}-fecha`).value||todayISO(), chk=$(`#pp-${p.id}-presu`);
      if(!v){ $(`#pp-${p.id}-valor`).focus(); toast("Escribe el valor."); return true; }
      const pago={id:uid(),fecha,valor:v};
      if(chk && chk.checked){ const mk=fecha.slice(0,7), md=S.months[mk]; if(md){ const cobro=p.dir==="medeben"; const mv={id:uid(),fecha,tipo:cobro?"ingreso":"gasto",monto:v,desc:(cobro?"Cobro a ":"Pago a ")+(p.persona||"alguien"),cat:cobro?"Otro":"Otros",medio:"efectivo"}; md.movs.push(mv); pago.movId=mv.id; save(mk); } }
      p.pagos.push(pago); savePerfil(); render(); confirmSaved(`${p.dir==="medeben"?"Cobro":"Pago"} de ${money(v)} registrado`); return true;
    }
    case "gFin": S.perfil.guia={hecho:true,fecha:todayISO()}; savePerfil(); S.guia=null; S.tab="hoy"; try{localStorage.setItem("pd:tab","hoy");}catch(_){} render(); window.scrollTo({top:0}); return true;
  }
  if(!g || !act.startsWith("g")) return false;
  gSync(); g.justSaved=false;
  switch(act){
    case "gIr": { const n=Math.max(1,Math.min(PASOS.length-2,+b.dataset.v||1)); g.paso=n; g.done=false; g.tmp={}; g.form=autoForm(PASOS[n]); if(g.form) g.tmp=gDefaults(g.form); marcarPaso(n); break; }
    case "gNext": g.paso=Math.min(PASOS.length-1,g.paso+1); g.done=false; g.tmp={}; g.form=autoForm(PASOS[g.paso]); if(g.form) g.tmp=gDefaults(g.form); marcarPaso(g.paso); break;
    case "gDone": g.done=true; g.form=null; g.tmp={}; break;
    case "gForm": g.form=b.dataset.v; g.tmp=gDefaults(g.form); break;
    case "gCancel": g.form=null; g.tmp={}; break;
    case "gPick": g.tmp[b.dataset.f]=b.dataset.v; break;
    case "gAcc": { const l=g.tmp.cuentas||(g.tmp.cuentas=[]); const i=l.indexOf(b.dataset.v); if(i>=0) l.splice(i,1); else l.push(b.dataset.v); break; }
    case "gSug": g.tmp.valor=b.dataset.v; break;
    case "gSave": { const r=guardarGuia(b.dataset.v); if(typeof r==="string"){ if(r) toast(r); return true; } g.form=null; g.tmp={}; g.justSaved=true; render(); confirmSaved(r.ok, r.extra||""); window.scrollTo({top:0}); return true; }
    case "gDel": { const coll=b.dataset.c, id=b.dataset.id; const arr=PERFIL_COLLS.includes(coll)?S.perfil[coll]:S.months[thisMonth()][coll]; const i=arr.findIndex(x=>x.id===id); if(i>=0) arr.splice(i,1);
      if(coll==="tarjetas"||coll==="creditos") S.perfil.pagos=S.perfil.pagos.filter(p=>p.oblig!==id);
      if(coll==="metas") S.perfil.ahorros.forEach(a=>{ if(a.meta===id) a.meta=""; });
      saveFor(coll); toast("Quitado."); break; }
    default: return false;
  }
  render(); if(["gNext","gIr","gDone","gForm","gCancel"].includes(act)) window.scrollTo({top:0});
  return true;
}

// ---------- Acciones ----------
function toast(msg,undoFn){
  const el=$("#toast"); el.innerHTML = esc(msg)+(undoFn?` <button data-act="undo">Deshacer</button>`:""); el.hidden=false;
  S.undo = undoFn||null; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true;S.undo=null;},5000);
}
const PERFIL_COLLS = ["tarjetas","creditos","pagos","tcompra","minReal","ahorros","metas","amov","prestamos","ppago"];
function findColl(m,coll,id){
  if(coll==="ppago"){ const [pid,mid]=id.split(":"); const p=S.perfil.prestamos.find(x=>x.id===pid); return p?{arr:p.pagos,obj:p.pagos.find(x=>x.id===mid)}:{}; }
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
  if(e.target.classList && e.target.classList.contains("modal")){ S.help=null; S.dlg=null; renderModal(); return; }
  if(!S.user){ if(e.target.closest('[data-act="helpClose"]')){ S.dlg=null; renderModal(); } return; }
  if(S.menu && !e.target.closest(".menu") && !e.target.closest('[data-act="menu"]')){ S.menu=false; S.confirmAll=false; renderMenu(); }
  const tabBtn = e.target.closest("#tabs button");
  if(tabBtn){ S.tab=tabBtn.dataset.tab; S.confirmDel=false; S.firstTime=false; try{localStorage.setItem("pd:tab",S.tab);}catch(_){} render(); window.scrollTo({top:0}); return; }
  const b = e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act, m=M();
  if(act==="menu"){ S.menu=!S.menu; S.confirmAll=false; renderMenu(); return; }
  if(act==="logout"){ flushAll(); S.menu=false; cerrarTeclado(true); await signOut(auth); return; }
  if(act==="install"){ if(S.installEvt){ S.installEvt.prompt(); S.installEvt=null; S.menu=false; renderMenu(); } return; }
  if(act==="delAll"){
    if(!S.confirmAll){ S.confirmAll=true; renderMenu(); return; }
    for(const k of [...Object.keys(S.months),"perfil"]){ clearTimeout(pending.get(k)); pending.delete(k); try{ await deleteDoc(monthDoc(k)); }catch(err){ console.error(err); } }
    const k=thisMonth(); S.months={[k]:blankMonth(k)}; S.perfil=blankPerfil(); S.cur=k; S.menu=false; S.confirmAll=false; save(k); savePerfil(); S.tab="ingresos"; render(); toast("Borraste todos tus datos."); return;
  }
  if(await accionesNuevas(act,b,e,m)) return;
  if(act==="movTipo"){ S.movTipo=b.dataset.v; render(); return; }
  if(act==="hchip"){ const v=b.dataset.v; S.hcat = S.hcat===v ? "" : v; S.hval = S.hcat ? ultimoValor(v) : 0; render(); const i=$("#hq-monto"); if(i){ i.focus(); try{ i.select(); }catch(_){} } return; }
  if(act==="goTab"){ if(S.dlg){ S.dlg=null; renderModal(); } S.tab=b.dataset.v; try{localStorage.setItem("pd:tab",S.tab);}catch(_){} render(); window.scrollTo({top:0}); return; }
  if(act==="chip"){ const f=b.dataset.f; $("#"+f+"-desc").value=b.dataset.v; const sel=$("#"+f+"-cat"); if([...sel.options].some(o=>o.value===b.dataset.v)) sel.value=b.dataset.v; $("#"+f+"-monto").focus(); return; }
  if(act==="addMov"){
    const f=b.dataset.f, form=document.querySelector(`[data-form="${f}"]`), tipo=form.dataset.tipo;
    const monto=parseMoney($("#"+f+"-monto").value);
    if(!monto){ $("#"+f+"-monto").focus(); toast("Escribe el valor."); return; }
    const fecha = ($("#"+f+"-fecha")||{}).value || defDate(m);
    if(fecha.slice(0,7)!==m.mes){ toast(`La fecha debe ser de ${monthName(m.mes)}.`); return; }
    const medio = ($("#"+f+"-medio")||{}).value || "efectivo";
    const tarj = medio!=="efectivo" ? S.perfil.tarjetas.find(x=>x.id===medio) : null;
    const cw=$("#"+f+"-cuotasWrap"), cuotas = tipo==="gasto" && tarj && cw && !cw.hidden ? Math.max(1,Math.min(120,Math.round(parseNum($("#"+f+"-cuotas").value)||1))) : 1;
    const desc=$("#"+f+"-desc").value.trim(), mov={id:uid(),fecha,tipo,monto,desc,cat:$("#"+f+"-cat").value,medio};
    const antes = alertasTopes(m).map(a=>a.cat+a.nivel).join();
    if(cuotas>1){ const cid=uid(); tarj.compras.push({id:cid,fecha,desc:desc||mov.cat,valor:monto,cuotas,primerCobro:"",movId:mov.id}); mov.cuotas=cuotas; mov.compraId=cid; savePerfil(); }
    m.movs.push(mov);
    if(f==="hq"){ S.hcat=""; S.hval=0; }
    save(); render();
    const nueva = alertasTopes(m).find(a=>!antes.includes(a.cat+a.nivel) && (a.cat===(tipo==="hormiga"?"Gastos hormiga":(CAT_MOV.includes(mov.cat)?mov.cat:"Otros"))));
    if(nueva) toast(nueva.nivel==="bad" ? `Anotado. Ojo: te pasaste del tope de ${nueva.cat} (${money(nueva.v)} de ${money(nueva.t)}).` : `Anotado. Llevas el ${Math.round(nueva.v/nueva.t*100)}% de tu tope de ${nueva.cat}.`);
    else if(cuotas>1) toast(`Compra de ${money(monto)} a ${cuotas} cuotas en la tarjeta ${tarj.nombre||""}. Cada mes se aparta la cuota.`);
    else toast(`Anotaste ${money(monto)}${tipo==="hormiga"?" en gastos hormiga":""}.`);
    const nf=$("#"+f+"-monto"); if(nf) nf.focus();
    return;
  }
  if(act==="add"){
    const c=b.dataset.c, id=uid();
    const d = { ingresos:{id,nombre:"",monto:0,frec:"mensual",tipo:"fijo"},
      gastos:{id,nombre:"",monto:0,frec:"mensual",cat:"Vivienda",tipo:"fijo",medio:"efectivo"},
      tarjetas:{id,nombre:"",clase:"Tarjeta de crédito",franquicia:"Visa",cupo:0,tasa:"",tipoTasa:"EA",sistema:"capital",manejo:0,cobraSiempre:true,planExtra:0,compras:[],minReal:{}},
      creditos:{id,nombre:"",tipo:"Libre inversión",valor:0,cuotas:12,tasa:"",tipoTasa:"EA",sistema:"fija",primerPago:"",cuotaReal:0,seguro:0,otros:0,segIncl:true,planExtra:0},
      ahorros:{id,nombre:"",tipo:"Cuenta de ahorros",entidad:"",apertura:todayISO(),inicial:0,tasa:"",aporte:0,plazo:"",retencion:0,saldoReal:0,fechaReal:"",meta:"",movs:[]},
      metas:{id,nombre:"",tipo:"Carro o moto",valor:0,porcentaje:100,fecha:"",extra:0},
      prestamos:{id,dir:b.dataset.v||"debo",persona:"",motivo:"",valor:0,fecha:todayISO(),forma:"unico",fechaPago:"",cuotas:2,cargoTipo:"no",cargo:0,pagos:[]} }[c];
    (PERFIL_COLLS.includes(c)?S.perfil:m)[c].push(d); S.open.add(({ingresos:"i",gastos:"g",tarjetas:"t",creditos:"c",ahorros:"a",metas:"m",prestamos:"p"})[c]+":"+id); saveFor(c); render();
    const inp=document.querySelector(`[data-b^="${c}|${id}|nombre"],[data-b^="${c}|${id}|persona"]`); if(inp){ inp.focus(); inp.scrollIntoView({block:"center"}); }
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
    if(c==="ppago" && obj.movId) quitarMov(obj.movId);
    let ligado=null;
    if(c==="movs" && obj.compraId){ for(const t of S.perfil.tarjetas){ const i=t.compras.findIndex(x=>x.id===obj.compraId); if(i>=0){ ligado={arr:t.compras,ix:i,obj:t.compras[i]}; t.compras.splice(i,1); savePerfil(); break; } } }
    if(c==="tcompra" && obj.movId){ for(const k of Object.keys(S.months)){ const a2=S.months[k].movs, i=a2.findIndex(x=>x.id===obj.movId); if(i>=0){ ligado={arr:a2,ix:i,obj:a2[i],k}; a2.splice(i,1); save(k); break; } } }
    saveFor(c); render();
    toast(ligado?(c==="movs"?"Borrado, también de la tarjeta.":"Compra borrada, también de tus movimientos."):"Borrado.",()=>{ arr.splice(ix,0,obj); if(c==="metas") quitados.forEach(a=>a.meta=obj.id); else S.perfil.pagos.push(...quitados);
      if(ligado){ ligado.arr.splice(ligado.ix,0,ligado.obj); if(ligado.k) save(ligado.k); else savePerfil(); } saveFor(c); render(); });
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
  if(S.guia && e.target.id && e.target.id.startsWith("g-")){ gSync(); scheduleRender(); return; }
  if(e.target.id==="monthSel"){ S.cur=e.target.value; S.confirmDel=false; render(); return; }
  if(e.target.id==="copiaFile"){ const f=e.target.files&&e.target.files[0]; if(f) leerCopia(f); return; }
  if(e.target.id && /-medio$/.test(e.target.id)){ const w=$("#"+e.target.id.replace(/-medio$/,"-cuotasWrap")); if(w) w.hidden = e.target.value==="efectivo"; return; }
  const bnd = e.target.dataset.b; if(!bnd) return;
  const [coll,id,field,type] = bnd.split("|"); const m=M();
  const val = type==="money" ? parseMoney(e.target.value) : (type==="num" ? (e.target.value.trim()===""?"":parseNum(e.target.value)) : e.target.value);
  if(coll==="meta"){ m[field]=val===""?0:val; save(); }
  else if(coll==="tope"){ if(!S.perfil.topes) S.perfil.topes={}; if(val>0) S.perfil.topes[field]=val; else delete S.perfil.topes[field]; savePerfil(); }
  else if(coll==="minReal"){ const t=S.perfil.tarjetas.find(x=>x.id===id); if(!t) return; if(!t.minReal) t.minReal={};
    if(e.target.value.trim()==="") delete t.minReal[field]; else t.minReal[field]=val; savePerfil(); }
  else { const {obj}=findColl(m,coll,id); if(!obj) return; obj[field]= field==="cobraSiempre" ? (val!=="no") : field==="segIncl" ? (val==="si") : val;
    if(coll==="creditos" && field==="primerPago" && /^\d{4}-\d{2}-\d{2}$/.test(val)) obj.diaPago = +val.slice(8,10);
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
// Si la app estuvo más de unos minutos en segundo plano, vuelve a pedir la clave
let ocultoEn=0;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){ ocultoEn=Date.now(); return; }
  if(S.user && S.perfil && S.perfil.pin && !tecladoAbierto() && ocultoEn && Date.now()-ocultoEn > MIN_FUERA*60000){ S.menu=false; renderMenu(); pedirClave(); }
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && (S.help||S.dlg)){ S.help=null; S.dlg=null; renderModal(); return; }
  if(e.key==="Enter" && e.target.id && e.target.id.startsWith("g-") && e.target.type!=="checkbox"){ const bt=document.querySelector('[data-act="gSave"]'); if(bt){ e.preventDefault(); bt.click(); } return; }
  if(e.key==="Enter" && e.target.closest("[data-form]")){ const f=e.target.closest("[data-form]").dataset.form; const btn=document.querySelector(`[data-act="addMov"][data-f="${f}"]`); if(btn) btn.click(); }
});

// ---------- App instalable (funciona sin internet) ----------
if("serviceWorker" in navigator){ window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{})); }
