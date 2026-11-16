// Ahorros (cuentas, cajitas o bolsillos, CDT, fondos) y metas. Mismo modelo que el Excel.
// Rendimiento: tasa efectiva anual (E.A.), se capitaliza por días: (1+EA)^(días/365).
export const TIPOS_AHORRO = ["Cuenta de ahorros", "Cajita o bolsillo", "CDT", "Fondo o inversión", "Efectivo", "Otro"];
export const TIPOS_META = ["Carro o moto", "Cuota inicial de vivienda", "Fondo de emergencia", "Viaje", "Estudio", "Otro"];
const DAY = 86400000;
export const toDate = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
export const fromDate = t => new Date(t).toISOString().slice(0, 10);
export const addMonths = (t, k) => { const d = new Date(t); const day = d.getUTCDate(); const r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1); const last = new Date(Date.UTC(new Date(r).getUTCFullYear(), new Date(r).getUTCMonth() + 1, 0)).getUTCDate(); return Date.UTC(new Date(r).getUTCFullYear(), new Date(r).getUTCMonth(), Math.min(day, last)); };
const g = (r, t1, t2) => Math.pow(1 + r, Math.max(0, t2 - t1) / DAY / 365);

// a = { tipo, apertura:"AAAA-MM-DD", inicial, tasa (% E.A.), aporte (plan mensual), plazo (meses, CDT), retencion (%), saldoReal, fechaReal, movs:[{fecha,tipo:'aporte'|'retiro',valor}] }
export function ahorroEn(a, fc) {
  const r = (+a.tasa || 0) / 100, ret = (+a.retencion || 0) / 100, cdt = a.tipo === "CDT";
  if (!a.apertura) return null;
  const ap = toDate(a.apertura);
  const venc = cdt && (+a.plazo || 0) > 0 ? addMonths(ap, +a.plazo) : null;
  if (ap > fc) return { abierto: false, saldo: 0, neto: 0, ingresado: 0, ganancia: 0, retencion: 0, venc, vencido: false, r, cdt };
  const useReal = (+a.saldoReal || 0) > 0 && a.fechaReal && toDate(a.fechaReal) <= fc && toDate(a.fechaReal) >= ap;
  const d0 = useReal ? toDate(a.fechaReal) : ap, B0 = useReal ? +a.saldoReal : (+a.inicial || 0);
  const end = venc ? Math.min(fc, venc) : fc;
  // Si escribiste el saldo real, "lo que has metido" parte de ese saldo y la ganancia se cuenta desde esa fecha.
  let saldo = B0 * g(r, d0, end), ingresado = useReal ? B0 : (+a.inicial || 0);
  for (const m of a.movs || []) {
    const f = toDate(m.fecha), v = (+m.valor || 0) * (m.tipo === "retiro" ? -1 : 1);
    if (f > fc || (useReal && f <= d0)) continue;
    ingresado += v;
    if (f > d0 && f <= end) saldo += v * g(r, f, end);
  }
  const ganancia = saldo - ingresado, retencion = Math.max(0, ganancia) * ret;
  const res = { abierto: true, saldo, neto: saldo - retencion, ingresado, ganancia, retencion, venc, vencido: venc !== null && fc >= venc, r, cdt, useReal };
  if (venc) { const v = ahorroValorEn(a, venc, res, fc); res.alVencer = v; }
  return res;
}
function ahorroValorEn(a, t, base, fc) { // valor bruto y neto en t (t >= fc), sin aportes nuevos
  const end = base.venc ? Math.min(t, base.venc) : t;
  const bruto = base.saldo * g(base.r, Math.min(fc, end), end), gan = bruto - base.ingresado;
  return { bruto, neto: bruto - Math.max(0, gan) * ((+a.retencion || 0) / 100) };
}
// Proyección a k meses desde fc, con el aporte mensual planeado (los CDT no reciben aportes y se detienen al vencer)
export function proyectarAhorro(a, fc, meses = 12) {
  const b = ahorroEn(a, fc); if (!b) return [];
  const out = [], rm = Math.pow(1 + b.r, 1 / 12) - 1, ap = b.cdt ? 0 : (+a.aporte || 0), ret = (+a.retencion || 0) / 100;
  for (let k = 1; k <= meses; k++) {
    let bruto, ing;
    if (b.cdt) { const t = addMonths(fc, k); const end = b.venc ? Math.min(t, b.venc) : t; bruto = b.saldo * g(b.r, Math.min(fc, end), end); ing = b.ingresado; }
    else { bruto = b.saldo * Math.pow(1 + rm, k) + ap * (rm > 0 ? (Math.pow(1 + rm, k) - 1) / rm : k); ing = b.ingresado + ap * k; }
    out.push({ k, bruto, neto: bruto - Math.max(0, bruto - ing) * ret, ingresado: ing });
  }
  return out;
}
// Metas: meta = { nombre, tipo, valor, porcentaje (100 = todo), fecha:"AAAA-MM", extra }
export function metaEstado(meta, cuentas, fc) {
  const objetivo = (+meta.valor || 0) * ((meta.porcentaje === "" || meta.porcentaje == null ? 100 : +meta.porcentaje) / 100);
  const asignadas = cuentas.filter(c => c.meta === meta.id);
  let ahorrado = +meta.extra || 0, sumR = 0, sumS = 0, aporte = 0, rs = [];
  for (const c of asignadas) { const e = ahorroEn(c, fc); if (!e || !e.abierto) continue; ahorrado += e.neto; sumS += e.neto; sumR += e.neto * (Math.pow(1 + e.r, 1 / 12) - 1); rs.push(Math.pow(1 + e.r, 1 / 12) - 1); if (c.tipo !== "CDT") aporte += +c.aporte || 0; }
  const rm = sumS > 0 ? sumR / sumS : (rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0);
  const falta = Math.max(0, objetivo - ahorrado), progreso = objetivo > 0 ? Math.min(1, ahorrado / objetivo) : 0;
  const hoy = new Date(fc), curIdx = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();
  let mesesRest = null;
  if (meta.fecha) { const [y, m] = meta.fecha.split("-").map(Number); mesesRest = Math.max(0, y * 12 + m - 1 - curIdx); }
  let necesario = null;
  if (falta > 0 && mesesRest !== null) {
    if (mesesRest === 0) necesario = falta;
    else necesario = rm > 0 ? Math.max(0, (objetivo - ahorrado * Math.pow(1 + rm, mesesRest)) * rm / (Math.pow(1 + rm, mesesRest) - 1)) : falta / mesesRest;
  }
  let mesesEstim = falta <= 0 ? 0 : null;
  if (falta > 0 && (aporte > 0 || (rm > 0 && ahorrado > 0))) { let s = ahorrado, n = 0; while (s < objetivo && n < 600) { s = s * (1 + rm) + aporte; n++; } if (n < 600) mesesEstim = n; }
  // Serie mensual para el gráfico (hasta la fecha objetivo o la estimada, máximo 10 años)
  const H = Math.min(120, Math.max(12, mesesRest || 0, mesesEstim || 0));
  const serie = []; let s = ahorrado; for (let k = 0; k <= H; k++) { serie.push(s); s = s * (1 + rm) + aporte; }
  let estado;
  if (objetivo <= 0) estado = "sinvalor";
  else if (falta <= 0.5) estado = "cumplida";
  else if (!asignadas.length && !(+meta.extra)) estado = "sincuentas";
  else if (mesesEstim === null) estado = "sinaporte";
  else if (mesesRest === null) estado = "sinfecha";
  else estado = mesesEstim <= mesesRest ? "atiempo" : "atrasada";
  return { objetivo, ahorrado, falta, progreso, mesesRest, necesario, aporte, mesesEstim, rm, ea: Math.pow(1 + rm, 12) - 1, estado, serie, asignadas };
}
