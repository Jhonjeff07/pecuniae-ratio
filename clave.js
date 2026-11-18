// Clave de acceso opcional (PIN de 4 o 6 números) con teclado estilo iPhone.
// Es un bloqueo de pantalla: protege la app si alguien toma tu celular o computador.
// La clave nunca se guarda: solo un resumen cifrado (PBKDF2 + sal) que no se puede revertir.

const LETRAS = {2:"ABC",3:"DEF",4:"GHI",5:"JKL",6:"MNO",7:"PQRS",8:"TUV",9:"WXYZ"};
const hex = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");

export async function hashPin(pin, salt){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt:enc.encode(salt), iterations:150000, hash:"SHA-256"}, key, 256);
  return hex(bits);
}
export async function crearPin(pin){
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { v:1, len:pin.length, salt, hash: await hashPin(pin, salt), fecha: new Date().toISOString().slice(0,10) };
}
export async function pinCorrecto(pin, guardado){
  if(!guardado || !guardado.hash) return false;
  return (await hashPin(pin, guardado.salt)) === guardado.hash;
}

// Intentos fallidos: después de 5 seguidos, espera de 30 segundos (luego 60, 120…)
const FKEY = "pr:pinfail";
const leerFallos = () => { try{ return JSON.parse(localStorage.getItem(FKEY)) || {n:0,until:0,ronda:0}; }catch(_){ return {n:0,until:0,ronda:0}; } };
const guardarFallos = f => { try{ localStorage.setItem(FKEY, JSON.stringify(f)); }catch(_){} };
export const limpiarFallos = () => guardarFallos({n:0,until:0,ronda:0});

// ---------- Teclado ----------
// abrirTeclado({titulo, sub, len, logo, cancelable, olvide, contarFallos, alCompletar, alCancelar, alOlvidar})
// alCompletar(codigo) → true (listo, se cierra), false/"mensaje" (error: tiembla), o {titulo, sub} (siguiente paso, sigue abierto)
let activo = null;
export const tecladoAbierto = () => !!activo;

export function abrirTeclado(cfg){
  cerrarTeclado(true);
  const el = document.createElement("div");
  el.id = "lock"; el.className = "lock entra";
  el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  document.body.appendChild(el); document.body.classList.add("lock-open");
  activo = { el, cfg, code:"", ocupado:false, timer:null };
  pintar();
  requestAnimationFrame(()=>el.classList.remove("entra"));
  el.addEventListener("click", alClick);
  document.addEventListener("keydown", alTecla, true);
  revisarEspera();
}

export function cerrarTeclado(inmediato){
  if(!activo) return;
  const {el, timer} = activo; clearInterval(timer);
  document.removeEventListener("keydown", alTecla, true);
  activo = null; document.body.classList.remove("lock-open");
  if(inmediato){ el.remove(); return; }
  el.classList.add("sale"); setTimeout(()=>el.remove(), 260);
}

function pintar(){
  const a = activo, c = a.cfg, len = c.len || 4;
  const teclas = [1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" class="pk" data-k="${n}" aria-label="${n}"><span class="pkn">${n}</span><span class="pkl">${LETRAS[n]||"&nbsp;"}</span></button>`).join("");
  a.el.innerHTML = `
    <div class="lock-bg" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="lock-in">
      ${c.logo?`<img class="lock-logo" src="${c.logo}" alt="">`:""}
      <h2 class="lock-t">${c.titulo||"Ingresa tu clave"}</h2>
      <p class="lock-s" aria-live="polite">${c.sub||""}</p>
      <div class="pdots" aria-hidden="true">${Array.from({length:len},(_,i)=>`<span class="${i<a.code.length?"on":""}"></span>`).join("")}</div>
      <div class="pgrid">
        ${teclas}
        <button type="button" class="pk txt" data-k="izq">${c.olvide?"¿La olvidaste?":""}</button>
        <button type="button" class="pk" data-k="0" aria-label="0"><span class="pkn">0</span><span class="pkl">&nbsp;</span></button>
        <button type="button" class="pk txt" data-k="der" aria-label="${a.code.length?"Borrar":"Cancelar"}">${a.code.length?"Borrar":(c.cancelable?"Cancelar":"")}</button>
      </div>
    </div>`;
}

function puntos(){
  const a = activo; if(!a) return;
  a.el.querySelectorAll(".pdots span").forEach((s,i)=>s.classList.toggle("on", i<a.code.length));
  const der = a.el.querySelector('[data-k="der"]');
  der.textContent = a.code.length ? "Borrar" : (a.cfg.cancelable ? "Cancelar" : "");
  der.setAttribute("aria-label", a.code.length ? "Borrar" : "Cancelar");
}

export const mensajeTeclado = (txt, error) => setSub(txt, error);
function setSub(txt, error){
  const s = activo && activo.el.querySelector(".lock-s"); if(!s) return;
  s.textContent = txt || ""; s.classList.toggle("err", !!error);
}

function bloqueado(){ const f=leerFallos(); return f.until > Date.now() ? Math.ceil((f.until-Date.now())/1000) : 0; }
function revisarEspera(){
  const a = activo; if(!a || !a.cfg.contarFallos) return;
  clearInterval(a.timer);
  const tick = () => {
    const s = bloqueado();
    a.el.classList.toggle("espera", s>0);
    if(s>0) setSub(`Demasiados intentos. Espera ${s} s.`, true);
    else { clearInterval(a.timer); if(a.el.classList.contains("fue-espera")){ a.el.classList.remove("fue-espera"); setSub(a.cfg.sub||""); } }
  };
  if(bloqueado()>0){ a.el.classList.add("fue-espera"); tick(); a.timer=setInterval(tick, 500); }
}

async function teclear(k){
  const a = activo; if(!a || a.ocupado) return;
  const c = a.cfg, len = c.len || 4;
  if(k==="der"){ if(a.code.length){ a.code=a.code.slice(0,-1); puntos(); } else if(c.cancelable){ cerrarTeclado(); c.alCancelar && c.alCancelar(); } return; }
  if(k==="izq"){ if(c.olvide && c.alOlvidar) c.alOlvidar(); return; }
  if(!/^\d$/.test(k) || a.code.length>=len) return;
  if(c.contarFallos && bloqueado()>0) return;
  a.code += k; puntos();
  if(a.code.length < len) return;
  a.ocupado = true;
  await new Promise(r=>setTimeout(r,120));       // deja ver el último punto lleno
  let r; try{ r = await c.alCompletar(a.code); }catch(e){ console.error(e); r = "Algo falló. Intenta de nuevo."; }
  if(!activo || activo!==a) return;
  a.ocupado = false;
  if(r===true){ if(c.contarFallos) limpiarFallos(); a.el.classList.add("ok"); setTimeout(()=>cerrarTeclado(), 180); return; }
  if(r && typeof r==="object"){
    Object.assign(c, r); a.code=""; pintar(); a.el.querySelector(".lock-in").classList.add("paso");
    if(r.err){ a.el.querySelector(".pdots").classList.add("tiembla"); a.el.querySelector(".lock-s").classList.add("err"); if(navigator.vibrate) try{ navigator.vibrate([40,40,40]); }catch(_){} }
    return; }
  // error
  if(c.contarFallos){
    const f = leerFallos(); f.n++;
    if(f.n>=5){ f.ronda=(f.ronda||0)+1; f.until=Date.now()+30000*Math.pow(2,f.ronda-1); f.n=0; }
    guardarFallos(f);
  }
  const box = a.el.querySelector(".pdots");
  box.classList.remove("tiembla"); void box.offsetWidth; box.classList.add("tiembla");
  if(navigator.vibrate) try{ navigator.vibrate([40,40,40]); }catch(_){}
  setSub(typeof r==="string" ? r : "Clave incorrecta", true);
  setTimeout(()=>{ if(activo===a){ a.code=""; puntos(); } }, 380);
  revisarEspera();
}

function alClick(e){
  const b = e.target.closest(".pk"); if(!b) return;
  b.classList.remove("toca"); void b.offsetWidth; b.classList.add("toca");
  teclear(b.dataset.k);
}
function alTecla(e){
  if(!activo) return;
  if(/^\d$/.test(e.key)){ e.preventDefault(); e.stopPropagation(); const b=activo.el.querySelector(`[data-k="${e.key}"]`); if(b){ b.classList.remove("toca"); void b.offsetWidth; b.classList.add("toca"); } teclear(e.key); }
  else if(e.key==="Backspace"){ e.preventDefault(); e.stopPropagation(); if(activo.code.length) teclear("der"); }
  else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); if(activo.cfg.cancelable) teclear("der"); }
  else if(e.key==="Tab"){ /* deja navegar entre teclas */ }
  else { e.stopPropagation(); }
}
