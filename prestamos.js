// Préstamos personales: plata que le debes a alguien ("debo") o que alguien te debe ("medeben").
// p = { id, dir:"debo"|"medeben", persona, motivo, valor, fecha:"AAAA-MM-DD" (cuándo se prestó),
//       forma:"unico"|"cuotas"|"libre", fechaPago:"AAAA-MM-DD" (pago único o primera cuota), cuotas,
//       cargoTipo:"no"|"fijo"|"pct", cargo (pesos o % mensual), diaRecordar, pagos:[{id,fecha,valor}] }
// El % se cobra como interés simple mensual sobre lo prestado, que es lo usual entre personas.
const pad = n => String(n).padStart(2, "0");
const DAY = 86400000;
export const iso2t = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
const t2iso = t => new Date(t).toISOString().slice(0, 10);
export function addMonthsISO(s, k) {
  const [y, m, d] = s.split("-").map(Number);
  const tot = y * 12 + (m - 1) + k, Y = Math.floor(tot / 12), Mo = tot % 12;
  const last = new Date(Date.UTC(Y, Mo + 1, 0)).getUTCDate();
  return `${Y}-${pad(Mo + 1)}-${pad(Math.min(d || 1, last))}`;
}
function mesesEntre(a, b) { // meses completos entre dos fechas ISO
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}
export function totalPrestamo(p, hoy) {
  const V = +p.valor || 0, c = +p.cargo || 0;
  if (p.cargoTipo === "fijo") return V + c;
  if (p.cargoTipo === "pct") {
    const r = c / 100;
    let meses;
    if (p.forma === "cuotas") meses = Math.max(1, Math.round(+p.cuotas || 1));
    else if (p.forma === "unico" && p.fechaPago && p.fecha) meses = Math.max(1, Math.ceil((iso2t(p.fechaPago) - iso2t(p.fecha)) / DAY / 30.4));
    else meses = p.fecha ? Math.max(1, mesesEntre(p.fecha, hoy) + 1) : 1; // sin fecha: va sumando cada mes que pasa
    return V * (1 + r * meses);
  }
  return V;
}
export function calendario(p, hoy) {
  const total = totalPrestamo(p, hoy);
  if (p.forma === "unico" && p.fechaPago) return [{ fecha: p.fechaPago, valor: total, n: 1, de: 1 }];
  if (p.forma === "cuotas" && p.fechaPago) {
    const n = Math.max(1, Math.round(+p.cuotas || 1)), q = total / n;
    return Array.from({ length: n }, (_, k) => ({ fecha: addMonthsISO(p.fechaPago, k), valor: q, n: k + 1, de: n }));
  }
  return [];
}
export function prestamoEstado(p, hoy) {
  const total = totalPrestamo(p, hoy), cal = calendario(p, hoy);
  const pagos = (p.pagos || []).filter(x => x.fecha <= hoy);
  const pagado = pagos.reduce((s, x) => s + (+x.valor || 0), 0);
  const saldo = Math.max(0, total - pagado), aFavor = Math.max(0, pagado - total);
  let acum = 0, vencido = 0, proxima = null;
  for (const c of cal) {
    acum += c.valor;
    if (c.fecha < hoy) vencido = Math.max(0, acum - pagado);
    if (!proxima && acum - pagado > 0.5) proxima = { ...c, falta: Math.min(c.valor, acum - pagado) };
  }
  if (proxima && proxima.fecha < hoy) { // la más vieja sin pagar ya pasó
    const pend = cal.find(c => c.fecha >= hoy && cal.slice(0, cal.indexOf(c) + 1).reduce((s, x) => s + x.valor, 0) - pagado > 0.5);
    proxima = { ...proxima, siguiente: pend || null };
  }
  const dias = proxima ? Math.round((iso2t(proxima.fecha) - iso2t(hoy)) / DAY) : null;
  let estado;
  if (total <= 0.5) estado = "sinvalor";
  else if (saldo <= 0.5) estado = "pagado";
  else if (vencido > 0.5) estado = "atrasado";
  else if (!cal.length) estado = "sinfecha";
  else estado = "aldia";
  const cuotasPagadas = cal.length ? cal.filter((c, i) => cal.slice(0, i + 1).reduce((s, x) => s + x.valor, 0) - pagado <= 0.5).length : 0;
  return { total, cargo: total - (+p.valor || 0), pagado, saldo, aFavor, vencido, proxima, dias, estado, cal, cuotasPagadas };
}
// Lo que vence en el mes "AAAA-MM": para el mes actual incluye lo atrasado de antes.
export function venceEnMes(p, mes, hoy) {
  const cal = calendario(p, hoy); if (!cal.length) return 0;
  const ini = mes + "-01", fin = mes + "-31";
  const pagadoAntes = (p.pagos || []).filter(x => x.fecha < ini).reduce((s, x) => s + (+x.valor || 0), 0);
  const hasta = cal.filter(c => c.fecha <= fin).reduce((s, c) => s + c.valor, 0);
  const antes = cal.filter(c => c.fecha < ini).reduce((s, c) => s + c.valor, 0);
  if (mes === hoy.slice(0, 7)) return Math.max(0, hasta - pagadoAntes);
  if (mes < hoy.slice(0, 7)) return Math.max(0, hasta - antes);
  const pagadoTotal = (p.pagos || []).reduce((s, x) => s + (+x.valor || 0), 0);
  return Math.max(0, hasta - Math.max(antes, pagadoTotal));
}
export const t2isoExport = t2iso;
