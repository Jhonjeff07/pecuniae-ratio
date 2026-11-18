// Entiende frases como "gasté 15 mil en almuerzo con la Nu" o "me pagaron 80 lucas de domicilios".
// Todo pasa en el celular: no se envía nada a ningún servidor.

const sinTildes = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = s => sinTildes(String(s || "").toLowerCase());

// ---------- Números en palabras ----------
const UNIDADES = { cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15,
  dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiun:21, veintiuno:21, veintiuna:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25,
  veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29, treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90,
  cien:100, ciento:100, doscientos:200, doscientas:200, trescientos:300, trescientas:300, cuatrocientos:400, cuatrocientas:400, quinientos:500, quinientas:500,
  seiscientos:600, seiscientas:600, setecientos:700, setecientas:700, ochocientos:800, ochocientas:800, novecientos:900, novecientas:900 };
const MULT = { mil:1e3, k:1e3, luca:1e3, lucas:1e3, lukas:1e3, millon:1e6, millones:1e6, palo:1e6, palos:1e6, melon:1e6, melones:1e6 };

function numDigitos(t){
  // "15.000" "1.500.000" "15,000" "1,5" "15000" "$15.000" "15k" "15mil"
  let m = t.match(/^\$?(\d[\d.,]*)(k|mil|lucas?|palos?)?$/); if(!m) return null;
  let d = m[1], v;
  if(/^\d{1,3}([.,]\d{3})+$/.test(d)) v = +d.replace(/[.,]/g, "");      // separador de miles
  else if(/^\d+[.,]\d{1,2}$/.test(d)) v = +d.replace(",", ".");           // decimal: 1,5
  else v = +d.replace(/[.,]/g, "");
  if(isNaN(v)) return null;
  return { v, mult: m[2] ? MULT[m[2]] || 1e3 : 0 };
}

// Busca el valor de plata. Devuelve {valor, desde, hasta} (índices de palabras) o null
function buscarMonto(tok){
  let mejor = null;
  for(let i = 0; i < tok.length; i++){
    let total = 0, cur = 0, ult = 0, j = i, vistos = 0, conMult = false, usado = false;
    for(; j < tok.length; j++){
      const w = tok[j], dg = numDigitos(w);
      if(dg){ if(usado && !conMult && cur >= 1 && dg.v >= 1) break; cur += dg.v; usado = true; vistos++;
        if(dg.mult){ cur = cur * dg.mult; ult = dg.mult; conMult = true; if(dg.mult >= 1e6){ total += cur; cur = 0; } } continue; }
      if(w in UNIDADES){ cur += UNIDADES[w]; usado = true; vistos++; continue; }
      if(w in MULT && usado){ const k = MULT[w]; ult = k; conMult = true; vistos++;
        if(k >= 1e6){ total += (cur || 1) * k; cur = 0; } else cur = (cur || 1) * k; continue; }
      if(w in MULT && !usado && (w === "mil" || w === "millon")){ cur = MULT[w]; ult = MULT[w]; usado = true; conMult = true; vistos++; continue; }
      if(w === "medio" || w === "media"){ if(usado && ult){ cur += ult / 2; vistos++; continue; } if(!usado && tok[j+1] && tok[j+1] in MULT){ cur = 0.5; usado = true; vistos++; continue; } break; }
      if(w === "y" && usado && j + 1 < tok.length && (tok[j+1] in UNIDADES || tok[j+1] === "medio" || tok[j+1] === "media")) continue;
      if(w === "pesos" && usado){ vistos++; j++; break; }
      break;
    }
    if(!usado) continue;
    const valor = Math.round(total + cur);
    if(valor <= 0) continue;
    // Preferimos montos "de plata": con mil/millón o de 3 cifras o más
    const peso = (conMult ? 2 : 0) + (valor >= 100 ? 1 : 0);
    if(!mejor || peso > mejor.peso) mejor = { valor, desde:i, hasta:j, peso };
    i = j - 1;
  }
  return mejor && mejor.valor >= 50 ? mejor : (mejor && mejor.peso >= 2 ? mejor : null);
}

// ---------- Palabras clave ----------
const ING = ["me pagaron","pagaron","me consignaron","me transfirieron","me giraron","recibi","ingreso","ingresaron","me entro","me entraron","gane","ganancia","propina","propinas",
  "vendi","venta","sueldo","salario","quincena","prima","comision","bono","me devolvieron","reembolso","cobre","me cancelaron","me abonaron"];
const ING_CAT = [["Venta",["vendi","venta"]],["Reembolso",["me devolvieron","reembolso","devolucion"]],["Regalo",["regalo","regalaron","me dieron"]],
  ["Trabajo extra",["domicilio","domicilios","didi","rappi","uber","picap","indrive","turno","turnos","trabajo","trabajos","propina","propinas","extra","extras","freelance","cliente","clientes","servicio","servicios","carreras","entregas","gane","ganancia","ganancias"]]];
const HORMIGA = [
  ["Tinto o café",["tinto","tintico","cafe","cafecito","capuchino","latte","aromatica","pintadito","juan valdez","oma"]],
  ["Gaseosa o jugo",["gaseosa","coca","cocacola","cola","pony","jugo","agua","bebida","colombiana","postobon","sprite","hit","speed","redbull","energizante","te helado"]],
  ["Snack o dulce",["snack","papas","papitas","dulce","dulces","chocolate","chocolatina","galleta","galletas","chicle","chicles","mecato","golosina","gomitas","chitos","detodito","bombon","mani","yogurt"]],
  ["Domicilio",["domicilio","domi","rappi","ifood","didi food","picap food"]],
  ["Cigarrillos",["cigarrillo","cigarrillos","cigarro","cigarros","vape","vapeador","pucho","tabaco","marlboro","boston"]],
  ["Transporte corto",["bus","buseta","transmilenio","sitp","metro","mio","colectivo","mototaxi","bicitaxi","pasaje","pasajes","tm","megabus","transmetro","metrolinea"]],
  ["Antojo",["antojo","helado","empanada","empanadas","pandebono","bunuelo","bunuelos","perro caliente","salchipapa","arepa","arepita","pastel","postre","dona","palito de queso","obleas","raspao","mazorca"]],
];
const GASTO = [
  ["Comida",["almuerzo","almorce","desayuno","desayune","cena","comida","comi","restaurante","corrientazo","ejecutivo","hamburguesa","pizza","pollo","asado","sushi","comidas rapidas","frisby","kfc","mcdonalds","crepes","onces","sandwich","bandeja"]],
  ["Mercado",["mercado","d1","ara","exito","olimpica","jumbo","carulla","tienda","supermercado","frutas","verduras","fruver","carne","huevos","leche","pan","arroz","surtimax","isimo","colsubsidio","makro"]],
  ["Transporte",["taxi","uber","didi","indrive","cabify","picap","gasolina","tanqueada","tanquee","parqueadero","parqueo","peaje","peajes","lavada","aceite","llanta","mecanico","moto","carro","soat","tecnomecanica","viaje en"]],
  ["Ocio",["cine","rumba","cerveza","cervezas","pola","polas","trago","tragos","licor","aguardiente","ron","bar","discoteca","concierto","partido","futbol","juego","juegos","salida","paseo","boletas","boleta","netflix","spotify","videojuego","bolos","karaoke"]],
  ["Personal",["ropa","camisa","pantalon","zapatos","tenis","peluqueria","corte","barberia","barbero","unas","manicure","maquillaje","perfume","regalo","recarga","plan","celular","audifonos","cargador","gafas de sol","gym","gimnasio"]],
  ["Salud",["drogueria","farmacia","medicina","medicamento","medicamentos","pastillas","acetaminofen","ibuprofeno","medico","cita","odontologo","dentista","gafas","eps","examen","examenes","vacuna","terapia"]],
  ["Hogar",["aseo","detergente","jabon","papel higienico","papel","bombillo","ferreteria","arreglo","plomero","electricista","cobija","sabanas","olla","escoba","trapero","cloro","suavizante"]],
];
const RELLENO = new Set(("gaste gastè me gaste pague pagué compre compré fue fueron en de del un una unos unas el la los las por para con y al a lo que mi mis su hoy ayer antier anteayer pesos valor " +
  "plata tarjeta credito debito efectivo cuotas cuota se nos le esta este eso esa como mas o u total anote anota anotar registra registrar coloca pon").split(" "));
const EFECTIVO = ["efectivo","en efectivo","cash","nequi","daviplata","transferencia","transferi","debito","bre-b","breb","pse","dale"];

const hay = (txt, palabra) => new RegExp(`(^|[^a-z0-9])${palabra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(txt);

// "15 000" o "1 500 000" (así dicta Chrome los miles) → "15000"
const juntarMiles = s => s.replace(/(^|[^\d.,])(\d{1,3})((?: \d{3})+)(?![\d])/g, (m, a, b, c) => a + b + c.replace(/ /g, ""));

// ---------- Interpretar ----------
// ctx: { tarjetas:[{id,nombre}], aprendido:{palabra:{tipo,cat}}, hoy:"AAAA-MM-DD" }
export function interpretar(texto, ctx = {}){
  const original = String(texto || "").trim();
  const t = juntarMiles(norm(original).replace(/[\u00a0\u202f\u2009]/g, " ")).replace(/[¿?¡!;:"“”()]/g, " ").replace(/\s+/g, " ").trim();
  const r = { texto:original, monto:0, tipo:"gasto", cat:"", medio:"efectivo", medioNombre:"", medioDuda:false, cuotas:1, fecha:ctx.hoy || "", desc:"", seguro:{} };
  if(!t) return r;
  // Cuotas: "a 6 cuotas", "en seis cuotas", "6 cuotas"
  let tt = " " + t + " ";
  const mc = tt.match(/\s(?:a|en|de)?\s*(\d{1,3}|[a-z]+)\s+cuotas?\s/);
  if(mc){ const n = /^\d+$/.test(mc[1]) ? +mc[1] : UNIDADES[mc[1]]; if(n >= 1 && n <= 120){ r.cuotas = n; tt = tt.replace(mc[0], " "); } }
  // Fecha
  const hoy = ctx.hoy ? new Date(ctx.hoy + "T12:00:00") : new Date();
  const menos = d => { const x = new Date(hoy); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
  if(hay(tt, "antier") || hay(tt, "anteayer") || hay(tt, "antes de ayer")){ r.fecha = menos(2); r.seguro.fecha = true; }
  else if(hay(tt, "ayer")){ r.fecha = menos(1); r.seguro.fecha = true; }
  // Monto
  const tok = tt.trim().split(" ").filter(Boolean);
  const mm = buscarMonto(tok);
  const usados = new Set();
  if(mm){ r.monto = mm.valor; for(let k = mm.desde; k < mm.hasta; k++) usados.add(k); }
  const resto = tok.filter((_, k) => !usados.has(k)).join(" ");
  // Tipo
  if(ING.some(p => hay(tt, p))) r.tipo = "ingreso";
  // Medio de pago (solo para gastos)
  if(r.tipo !== "ingreso"){
    const tarjetas = ctx.tarjetas || [];
    let found = null;
    for(const c of tarjetas){
      const nom = norm(c.nombre).trim(); if(!nom) continue;
      if(hay(tt, nom)){ found = c; break; }
      const partes = nom.split(/\s+/).filter(w => w.length >= 2 && !["tarjeta","de","credito","la","el","visa","mastercard","master","banco","cuenta"].includes(w));
      if(partes.some(w => hay(tt, w))){ found = c; break; }
    }
    if(found){ r.medio = found.id; r.medioNombre = found.nombre; r.seguro.medio = true; }
    else if(/tarjeta|credito/.test(tt) && !/debito/.test(tt) && tarjetas.length){ r.medio = tarjetas[0].id; r.medioNombre = tarjetas[0].nombre; r.medioDuda = tarjetas.length > 1; r.seguro.medio = true; }
    else if(EFECTIVO.some(p => hay(tt, p))) r.seguro.medio = true;
  }
  // Categoría: primero lo que la persona ya ha anotado antes
  const ap = ctx.aprendido || {};
  const palabras = resto.split(" ").filter(w => w.length > 2 && !RELLENO.has(w));
  const enDiccionario = [...HORMIGA, ...GASTO, ...ING_CAT].some(([, ks]) => ks.some(k => hay(tt, k)));
  for(const w of palabras){ const a = ap[w]; if(!a) continue;
    if(enDiccionario && a.n < 2) continue;            // una sola vez no le gana a lo obvio ("almuerzo" es comida)
    if(r.tipo !== "ingreso" ? a.tipo !== "ingreso" : a.tipo === "ingreso"){ r.cat = a.cat; if(r.tipo !== "ingreso") r.tipo = a.tipo; r.seguro.cat = "aprendido"; break; } }
  if(!r.cat){
    if(r.tipo === "ingreso"){ for(const [cat, ks] of ING_CAT) if(ks.some(k => hay(tt, k))){ r.cat = cat; break; } r.cat = r.cat || "Otro"; }
    else {
      const h = HORMIGA.find(([, ks]) => ks.some(k => hay(tt, k)));
      const g = GASTO.find(([, ks]) => ks.some(k => hay(tt, k)));
      let usar = null;
      if(h && g) usar = h[0] === "Domicilio" ? ["hormiga", h[0]] : (["Comida","Mercado"].includes(g[0]) ? ["gasto", g[0]] : ["hormiga", h[0]]);
      else if(h) usar = ["hormiga", h[0]]; else if(g) usar = ["gasto", g[0]];
      if(usar){ r.tipo = usar[0]; r.cat = usar[1]; }
      if(!r.cat) r.cat = "Otros";
    }
    if(r.cat && r.cat !== "Otros" && r.cat !== "Otro") r.seguro.cat = "palabra";
  }
  // Una "hormiga" muy grande probablemente no lo es
  if(r.tipo === "hormiga" && r.monto > 60000 && r.cat !== "Domicilio"){ r.tipo = "gasto"; r.cat = r.cat === "Transporte corto" ? "Transporte" : (r.cat === "Antojo" ? "Comida" : "Otros"); }
  // Descripción: lo que queda sin relleno ni medio de pago
  const quitar = new Set([...RELLENO, ...(r.medioNombre ? norm(r.medioNombre).split(/\s+/) : []), ...EFECTIVO.flatMap(e => e.split(" ")), "gaste","pague","compre","me","pagaron","recibi","gane","consignaron","transfirieron","giraron","entro","entraron","cobre","devolvieron","vendi","ingresaron","abonaron","cancelaron"]);
  const origTok = original.replace(/[¿?¡!;:"“”()]/g, " ").split(/\s+/).filter(Boolean);
  const descTok = [];
  const nTok = norm(origTok.join(" ")).split(" ");
  // Reconstruye desde el texto original para conservar tildes y mayúsculas
  for(let k = 0; k < origTok.length; k++){
    const w = nTok[k] || "";
    if(quitar.has(w) || numDigitos(w) || w in UNIDADES || w in MULT || w === "medio" || w === "media" || /^\d+$/.test(w)) continue;
    descTok.push(origTok[k]);
  }
  let d = descTok.join(" ").replace(/\s+/g, " ").trim();
  if(d.length > 40) d = d.slice(0, 40).trim() + "…";
  r.desc = d ? d.charAt(0).toUpperCase() + d.slice(1) : "";
  return r;
}

// Aprende de lo que la persona ya anotó: la palabra principal de la descripción → categoría
export function aprenderDe(movs){
  const cuenta = {};
  for(const x of movs){
    if(!x.desc || !x.cat || norm(x.desc) === norm(x.cat)) continue;   // el botón de hormiga guarda la categoría como descripción: eso no enseña nada
    for(const w of new Set(norm(x.desc).split(/\s+/))) if(w.length > 2 && !RELLENO.has(w)){
      const k = x.tipo + "|" + x.cat; (cuenta[w] = cuenta[w] || {})[k] = (cuenta[w][k] || 0) + 1; }
  }
  const ap = {};
  for(const [w, c] of Object.entries(cuenta)){ const [k, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; const [tipo, cat] = k.split("|"); ap[w] = { tipo, cat, n }; }
  return ap;
}
