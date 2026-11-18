// Instalar la app como ícono: detecta el navegador y muestra el paso a paso de cada uno.

// Android Chrome, Edge y Samsung avisan que se puede instalar con un toque
let aviso = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); aviso = e; document.dispatchEvent(new Event("pr-instalable")); });
window.addEventListener("appinstalled", () => { marcarInstalada(); document.dispatchEvent(new Event("pr-instalada")); });

export const puedeUnToque = () => !!aviso;
export async function instalarUnToque(){
  if(!aviso) return false;
  aviso.prompt();
  const r = await aviso.userChoice.catch(() => ({}));
  aviso = null;
  if(r && r.outcome === "accepted"){ marcarInstalada(); return true; }
  return false;
}

export const estaInstalada = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
function marcarInstalada(){ try{ localStorage.setItem("pr:instalada", "1"); }catch(_){} }
export const yaLaInstalo = () => { if(estaInstalada()){ marcarInstalada(); return true; } try{ return localStorage.getItem("pr:instalada") === "1"; }catch(_){ return false; } };

export const esCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
export const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export function navegadorActual(){
  const ua = navigator.userAgent;
  if(esIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS|Brave/i.test(ua) ? "iphone-otro" : "iphone-safari";
  if(navigator.brave) return "brave";
  if(/SamsungBrowser/i.test(ua)) return "samsung";
  if(/EdgA|Edg\//i.test(ua)) return "edge";
  if(/OPR|OPT|Opera/i.test(ua)) return "opera";
  if(/MiuiBrowser|XiaoMi/i.test(ua)) return "xiaomi";
  if(/Firefox|FxiOS/i.test(ua)) return "firefox";
  if(/Chrome/i.test(ua)) return "chrome";
  return "otro";
}

// Íconos que se ven en los menús de cada navegador
const PUNTOS = `<span class="ico-k" aria-label="tres puntos">⋮</span>`;
const PUNTOS_H = `<span class="ico-k" aria-label="tres puntos">⋯</span>`;
const RAYAS = `<span class="ico-k" aria-label="menú">☰</span>`;
const COMPARTIR = `<span class="ico-k" aria-label="compartir"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4L12 2ZM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-2v10H7V10H5Z"/></svg></span>`;

export const NAVEGADORES = [
  { id:"chrome", nombre:"Chrome", logo:"🟢", pasos:[
    `Toca los ${PUNTOS} de <b>arriba a la derecha</b>.`,
    `Toca <b>“Agregar a la pantalla principal”</b> o <b>“Instalar app”</b>.`,
    `Toca <b>Instalar</b> (o <b>Agregar</b>). Listo: la hormiga queda con tus apps.`]},
  { id:"samsung", nombre:"Samsung Internet", logo:"🟣", pasos:[
    `Toca el ${RAYAS} de <b>abajo a la derecha</b>.`,
    `Toca <b>“Añadir página a”</b>.`,
    `Elige <b>“Pantalla de inicio”</b> y toca <b>Añadir</b>.`],
    nota:`Si en la barra de la dirección ves un ícono de descarga ⤓, tócalo: instala con un toque.`},
  { id:"brave", nombre:"Brave", logo:"🦁", pasos:[
    `Toca los ${PUNTOS} (están <b>abajo a la derecha</b> o <b>arriba a la derecha</b>, según tu versión).`,
    `Toca <b>“Añadir a pantalla de inicio”</b> o <b>“Instalar app”</b>.`,
    `Toca <b>Instalar</b> o <b>Añadir</b>.`]},
  { id:"firefox", nombre:"Firefox", logo:"🦊", pasos:[
    `Toca los ${PUNTOS} (<b>abajo</b> o <b>arriba a la derecha</b>).`,
    `Toca <b>“Añadir a la pantalla de inicio”</b> o <b>“Instalar”</b>. Si no lo ves, entra a <b>“Más”</b> o desliza el menú.`,
    `Toca <b>Añadir</b>. Si el celular pregunta, toca <b>Añadir automáticamente</b>.`]},
  { id:"edge", nombre:"Microsoft Edge", logo:"🌊", pasos:[
    `Toca los ${PUNTOS_H} de <b>abajo en el centro</b>.`,
    `Toca <b>“Añadir al teléfono”</b> o <b>“Agregar a la pantalla de inicio”</b> (a veces hay que deslizar el menú).`,
    `Toca <b>Instalar</b>.`]},
  { id:"opera", nombre:"Opera", logo:"🔴", pasos:[
    `Toca los ${PUNTOS} de <b>arriba a la derecha</b>.`,
    `Toca <b>“Pantalla de inicio”</b> o <b>“Añadir a…”</b> y luego <b>“Pantalla de inicio”</b>.`,
    `Toca <b>Añadir</b>.`]},
  { id:"xiaomi", nombre:"Navegador de Xiaomi", logo:"🟠", pasos:[
    `Toca el ${RAYAS} o los ${PUNTOS} del menú (abajo a la derecha).`,
    `Busca <b>“Añadir a la pantalla de inicio”</b> o un ícono de <b>“+ Inicio”</b>.`,
    `Toca <b>Añadir</b>. Si no aparece, abre la app en <b>Chrome</b>: ahí es más fácil.`]},
  { id:"iphone-safari", nombre:"iPhone · Safari", logo:"🧭", pasos:[
    `Toca el botón <b>Compartir</b> ${COMPARTIR} (abajo en el centro, o arriba a la derecha en iPad).`,
    `Baja y toca <b>“Agregar a inicio”</b>.`,
    `Toca <b>Agregar</b> arriba a la derecha.`]},
  { id:"iphone-otro", nombre:"iPhone · Chrome u otro", logo:"📱", pasos:[
    `Toca el botón <b>Compartir</b> ${COMPARTIR} que está <b>al lado de la dirección</b>, arriba.`,
    `Toca <b>“Agregar a inicio”</b> (si no lo ves, toca <b>“Más”</b>).`,
    `Toca <b>Agregar</b>. Si no aparece la opción, ábrela en <b>Safari</b>.`]},
];
