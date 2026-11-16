// Motor de cálculo de tarjetas, cupos rotativos y créditos (mismo modelo que el Excel).
// Cuenta mes a mes, como la lleva el banco:
//   saldo nuevo = saldo anterior + compras nuevas + intereses + manejo/seguro − lo que pagaste
// Lo que no pagas del mínimo pasa al mes siguiente (mora). Cuando el saldo llega a 0, la deuda se cierra.
// Meses como índice: año*12 + (mes-1). Tasas en porcentaje (28.5 = 28,5 %).
const pad = n => String(n).padStart(2, "0");
export const mIdx = k => { const [y, m] = String(k).slice(0, 7).split("-").map(Number); return y * 12 + m - 1; };
export const idxKey = i => `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`;
export const daysIn = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const FREQ = {
  diario: { l: "Diario" }, semanal: { l: "Semanal", f: 52 / 12 }, quincenal: { l: "Quincenal", f: 2 }, mensual: { l: "Mensual", f: 1 },
  bimestral: { l: "Bimestral", f: 1 / 2 }, trimestral: { l: "Trimestral", f: 1 / 3 }, semestral: { l: "Semestral", f: 1 / 6 },
  anual: { l: "Anual", f: 1 / 12 }, unico: { l: "Solo este mes", f: 1 }
};
export const factor = (frec, mes) => frec === "diario" ? daysIn(mes) : ((FREQ[frec] || FREQ.mensual).f);
export function tasaMes(t, tipo) { const r = (+t || 0) / 100; return tipo === "MV" ? r : Math.pow(1 + r, 1 / 12) - 1; }
export function tasaEA(t, tipo) { const r = (+t || 0) / 100; return tipo === "MV" ? Math.pow(1 + r, 12) - 1 : r; }

// Clases de crédito
export const CLASES_ROTATIVAS = ["Tarjeta de crédito", "Crédito rotativo", "Cupo en almacén o app"];
export const TIPOS_CUOTAS = ["Libre inversión", "Libranza", "Vehículo", "Vivienda (hipotecario o leasing)", "Estudio", "Celular o equipo financiado", "Compra a cuotas en almacén", "Préstamo personal", "Otro"];

// Una compra o préstamo a cuotas (plan del banco)
export function makeItem({ V, n, i, sistema, start, buy }) {
  V = +V || 0; n = Math.max(1, Math.round(+n || 1));
  const ie = n > 1 ? (+i || 0) : 0, s = sistema === "fija" && ie > 0, cap = V / n;
  const cf = s ? V * ie / (1 - Math.pow(1 + ie, -n)) : 0, D = s ? Math.pow(1 + ie, n) - 1 : 1;
  const it = { V, n, ie, s, cap, cf, start, buy, fin: start + n - 1 };
  it.act = M => M - start >= 0 && M - start < n;
  it.cuota = M => { if (!it.act(M)) return 0; const k = M - start; return s ? cf : cap + (V - k * cap) * ie; };
  it.intSched = M => { if (!it.act(M)) return 0; const k = M - start; return s ? V * (Math.pow(1 + ie, n) - Math.pow(1 + ie, k)) / D * ie : (V - k * cap) * ie; };
  it.capDue = M => it.cuota(M) - it.intSched(M);
  it.capital = M => { if (M < buy) return 0; const Kc = Math.max(0, Math.min(n, M - start + 1)); return V - (s ? V * (Math.pow(1 + ie, Kc) - 1) / D : cap * Kc); };
  it.interesTotal = () => s ? cf * n - V : ie * V * (n + 1) / 2;
  return it;
}

// ctx = { months: {AAAA-MM: doc}, pagos: [], start: idx, cur: idx }
function docFor(ctx, X) {
  const k = idxKey(X);
  if (ctx.months[k]) return ctx.months[k];
  let best = null;
  for (const key of Object.keys(ctx.months)) if (key < k && (!best || key > best)) best = key;
  return best ? ctx.months[best] : null;
}
// Cargos a 1 cuota del mes X: gastos fijos que pagas con esa tarjeta y compras del día a día con ella.
export function cargosMes(card, ctx, X) {
  if (X < ctx.start) return 0;
  const k = idxKey(X), d = docFor(ctx, X);
  const gastos = d ? (d.gastos || []).filter(g => g.medio === card.id && (g.frec !== "unico" || d.mes === k)).reduce((s, g) => s + (+g.monto || 0) * factor(g.frec, k), 0) : 0;
  const m = ctx.months[k];
  const diario = m ? (m.movs || []).filter(x => x.medio === card.id && x.tipo !== "ingreso" && (x.fecha || "").slice(0, 7) === k).reduce((s, x) => s + (+x.monto || 0), 0) : 0;
  return gastos + diario;
}
export function cardItems(card) {
  const i = tasaMes(card.tasa, card.tipoTasa);
  return (card.compras || []).filter(c => c.fecha && (+c.valor || 0) > 0).map(c => {
    const buy = mIdx(c.fecha), start = c.primerCobro ? mIdx(c.primerCobro) : buy + 1;
    const it = makeItem({ V: c.valor, n: c.cuotas, i, sistema: card.sistema, start, buy }); it.ref = c; return it;
  });
}
export function creditItem(cr, ctx) {
  const start = cr.primerPago ? mIdx(cr.primerPago) : ctx.cur;
  const it = makeItem({ V: cr.valor, n: cr.cuotas, i: tasaMes(cr.tasa, cr.tipoTasa), sistema: cr.sistema, start, buy: start - 1 });
  it.ref = cr; return it;
}
function pagosMes(id, ctx, X) {
  const k = idxKey(X); let pago = 0, abono = 0;
  for (const p of ctx.pagos) if (p.oblig === id && (p.fecha || "").slice(0, 7) === k) { if (p.tipo === "abono") abono += +p.valor || 0; else pago += +p.valor || 0; }
  return { pago, abono, total: pago + abono };
}
const HORIZ = 240; // meses que se proyectan hacia adelante

// ---------- Simulación mes a mes ----------
function simCard(card, ctx, upto, plan) {
  const items = cardItems(card);
  const extra = []; // cargos a 1 cuota como compras sin interés
  for (let X = ctx.start; X <= upto; X++) { const v = cargosMes(card, ctx, X); if (v > 0.5) extra.push(makeItem({ V: v, n: 1, i: 0, start: X + 1, buy: X })); }
  const all = items.concat(extra), i = tasaMes(card.tasa, card.tipoTasa), manejo = +card.manejo || 0, siempre = card.cobraSiempre !== false;
  let B = all.filter(it => it.buy < ctx.start).reduce((s, it) => s + it.capital(ctx.start - 1), 0);
  const rows = []; let prev = null;
  for (let X = ctx.start; X <= upto; X++) {
    const Z = all.filter(it => it.n === 1 && it.buy === X - 1).reduce((s, it) => s + it.V, 0);
    const INT = i * Math.max(0, B - Z);
    const MAN = X >= ctx.start && (siempre || B > 0.5 || (prev && prev.NEW > 0.5)) ? manejo : 0;
    const MORA = prev ? Math.max(0, prev.MIN - prev.P) : 0;
    const CAP = all.reduce((s, it) => s + it.capDue(X), 0);
    const real = (card.minReal || {})[idxKey(X)];
    const MINcalc = Math.min(B + INT + MAN, CAP + INT + MAN + MORA);
    const MIN = real !== undefined && real !== null && real !== "" ? +real : MINcalc;
    const NEW = all.filter(it => it.buy === X).reduce((s, it) => s + it.V, 0);
    const pg = pagosMes(card.id, ctx, X);
    const P = X < ctx.cur ? pg.total : (X === ctx.cur ? Math.max(pg.total, MIN) : MIN + plan);
    const Bn = Math.max(0, B + NEW + INT + MAN - P), Bhoy = Math.max(0, B + NEW + INT + MAN - pg.total);
    prev = { X, B0: B, INT, MAN, MORA, CAP, MIN, MINcalc, NEW, P, pago: pg.pago, abono: pg.abono, B: Bn, Bhoy, aFavor: Math.max(0, pg.total - (B + NEW + INT + MAN)) };
    rows.push(prev); B = Bn;
  }
  return { rows, items, all };
}
function simCredit(cr, ctx, upto, plan) {
  const it = creditItem(cr, ctx), seguro = +cr.seguro || 0, cuotaReal = +cr.cuotaReal || 0;
  let B = it.buy < ctx.start ? it.capital(ctx.start - 1) : 0;
  const rows = []; let prev = null;
  for (let X = ctx.start; X <= upto; X++) {
    const INT = it.n > 1 ? it.ie * B : 0;
    const SEG = B > 0.5 ? seguro : 0;
    const MORA = prev ? Math.max(0, prev.MIN - prev.P) : 0;
    const prog = it.act(X) ? (cuotaReal > 0 ? cuotaReal : it.cuota(X)) : 0;
    const MIN = X > it.fin ? B + INT + SEG : Math.min(B + INT + SEG, prog + SEG + MORA);
    const NEW = it.buy === X ? it.V : 0;
    const pg = pagosMes(cr.id, ctx, X);
    const P = X < ctx.cur ? pg.total : (X === ctx.cur ? Math.max(pg.total, MIN) : MIN + plan);
    const Bn = Math.max(0, B + NEW + INT + SEG - P), Bhoy = Math.max(0, B + NEW + INT + SEG - pg.total);
    prev = { X, B0: B, INT, MAN: SEG, MORA, MIN, NEW, P, pago: pg.pago, abono: pg.abono, B: Bn, Bhoy, aFavor: Math.max(0, pg.total - (B + NEW + INT + SEG)) };
    rows.push(prev); B = Bn;
  }
  return { rows, item: it };
}
// Cuándo terminas y cuánto pagas de intereses desde el mes M (sin contar cargos nuevos del mes)
function proyeccion(rows, M) {
  let intereses = 0, fin = null;
  for (const r of rows) {
    if (r.X < M) continue;
    if (r.X > M) intereses += r.INT;
    if (r.B - r.NEW <= 0.5 && r.X >= M) { fin = r.X; break; }
  }
  return { fin, intereses, meses: fin === null ? null : fin - M };
}

function evaluar(base, conPlan, M, plan) {
  const sin = proyeccion(base.rows, M), con = plan > 0 ? proyeccion(conPlan.rows, M) : null;
  return { sin, con, ahorro: con ? Math.max(0, sin.intereses - con.intereses) : 0, mesesMenos: con && sin.fin !== null && con.fin !== null ? sin.fin - con.fin : 0 };
}
function estadoPago(r, M, cur) {
  if (!r) return "sin";
  const falta = Math.max(0, r.MIN - (M <= cur ? r.pago + r.abono : 0));
  if (r.MIN <= 0.5) return "sin";
  if (M > cur) return "futuro";
  if (falta <= 0.5) return "ok";
  if (M < cur) return "atrasado";
  return r.MORA > 0.5 ? "mora" : "pendiente";
}

// ---------- Estado de una tarjeta o cupo rotativo en el mes M ----------
export function cardState(card, ctx, M) {
  const upto = Math.max(M, ctx.cur) + HORIZ, plan = +card.planExtra || 0;
  const base = simCard(card, ctx, upto, 0), withPlan = plan > 0 ? simCard(card, ctx, upto, plan) : base;
  const rows = withPlan.rows, r = rows.find(x => x.X === M) || null;
  const rPrev = rows.find(x => x.X === M - 1) || null;
  const pagado = r && M <= ctx.cur ? r.pago : 0, abonos = r && M <= ctx.cur ? r.abono : 0;
  const min = r ? r.MIN : 0, falta = Math.max(0, min - pagado - abonos);
  const deuda = r ? (M === ctx.cur ? r.Bhoy : r.B) : 0;
  const usos = base.all.filter(it => it.buy <= M).map(it => it.buy);
  const ultimoUso = usos.length ? Math.max(...usos) : null;
  const usoEsteMes = base.all.some(it => it.buy === M);
  const cupo = +card.cupo || 0;
  let estadoDeuda;
  const debeCompras = r ? r.B0 > 0.5 : false;
  if (!usoEsteMes && !debeCompras) estadoDeuda = "sinuso";          // al día y sin uso (aunque deba la cuota de manejo del mes)
  else if (deuda > 0.5) estadoDeuda = "uso";
  else estadoDeuda = "aldia";                                        // la usó y ya pagó todo
  const ev = evaluar(base, withPlan, M, plan);
  return {
    clase: "rotativo", rows, r, min, minCalc: r ? r.MINcalc : 0, minReal: (card.minReal || {})[idxKey(M)],
    pagado, abonos, falta, deuda, deudaInicio: r ? r.B0 : 0, interes: r ? r.INT : 0, manejo: r ? r.MAN : 0,
    mora: r ? r.MORA : 0, capDue: r ? r.CAP : 0, aFavor: r ? r.aFavor : 0,
    estado: estadoPago(r, M, ctx.cur), estadoDeuda, ultimoUso, mesesSinUso: ultimoUso === null ? null : M - ultimoUso,
    cupo, disponible: cupo - deuda, uso: cupo > 0 ? deuda / cupo : 0, ea: tasaEA(card.tasa, card.tipoTasa),
    items: base.items, eval: ev, plan, minOf: X => { const x = rows.find(y => y.X === X); return x ? x.MIN : 0; },
    deudaEn: X => { const x = rows.find(y => y.X === X); return x ? x.B : 0; }, prevMora: rPrev ? Math.max(0, rPrev.MIN - rPrev.P) : 0
  };
}
// ---------- Estado de un crédito de cuotas (no rotativo) ----------
export function creditState(cr, ctx, M) {
  const upto = Math.max(M, ctx.cur) + HORIZ, plan = +cr.planExtra || 0;
  const base = simCredit(cr, ctx, upto, 0), withPlan = plan > 0 ? simCredit(cr, ctx, upto, plan) : base;
  const rows = withPlan.rows, it = base.item, r = rows.find(x => x.X === M) || null;
  const pagado = r && M <= ctx.cur ? r.pago : 0, abonos = r && M <= ctx.cur ? r.abono : 0;
  const min = r ? r.MIN : 0, falta = Math.max(0, min - pagado - abonos), deuda = r ? (M === ctx.cur ? r.Bhoy : r.B) : 0;
  let estadoDeuda;
  if (M < it.buy || (M < ctx.start && !r)) estadoDeuda = "noempieza";
  else if (r && r.B0 <= 0.5 && r.NEW <= 0.5) estadoDeuda = "cerrado";
  else if (r && (M === ctx.cur ? r.Bhoy : r.B) <= 0.5) estadoDeuda = "pagado";
  else estadoDeuda = "activo";
  const ev = evaluar(base, withPlan, M, plan);
  const cuotaN = M - it.start + 1;
  return {
    clase: "cuotas", rows, r, item: it, min, pagado, abonos, falta, deuda, deudaInicio: r ? r.B0 : 0, interes: r ? r.INT : 0,
    seguro: r ? r.MAN : 0, mora: r ? r.MORA : 0, aFavor: r ? r.aFavor : 0, estado: estadoPago(r, M, ctx.cur), estadoDeuda,
    cuotaN, ea: tasaEA(cr.tasa, cr.tipoTasa), eval: ev, plan, vencido: M > it.fin && deuda > 0.5,
    minOf: X => { const x = rows.find(y => y.X === X); return x ? x.MIN : 0; },
    deudaEn: X => { const x = rows.find(y => y.X === X); return x ? x.B : 0; }
  };
}

// ---------- Evaluación general: qué hacer con cada deuda ----------
export function consejos(nombre, st) {
  const out = [];
  if (st.estado === "atrasado" || st.estado === "mora" || st.mora > 0.5) out.push({ n: 3, t: `${nombre}: tienes ${fmt(st.mora || st.falta)} atrasado. Ponte al día primero: el atraso genera intereses de mora y daña tu historial en las centrales de riesgo.` });
  if (st.clase === "rotativo") {
    if (st.estadoDeuda === "sinuso" && st.manejo > 0.5) out.push({ n: 2, t: `${nombre}: no la estás usando pero te cobra ${fmt(st.manejo)} de manejo al mes. Pide que te la exoneren o cancélala.` });
    else if (st.estadoDeuda === "sinuso" && st.mesesSinUso !== null && st.mesesSinUso >= 6) out.push({ n: 1, t: `${nombre}: llevas ${st.mesesSinUso} meses sin usarla. Si no la necesitas, evalúa cancelarla.` });
    if (st.cupo > 0 && st.uso > 0.3) out.push({ n: 2, t: `${nombre}: usas el ${Math.round(st.uso * 100)}% del cupo. Lo recomendable es menos del 30% para cuidar tu puntaje de crédito.` });
    if (st.cupo > 0 && st.disponible < 0) out.push({ n: 3, t: `${nombre}: te pasaste del cupo por ${fmt(-st.disponible)}.` });
  } else {
    if (st.estadoDeuda === "pagado") out.push({ n: 1, t: `${nombre}: ¡lo terminaste de pagar! Pide el paz y salvo y guárdalo.` });
    if (st.vencido) out.push({ n: 3, t: `${nombre}: el plazo ya terminó y aún debes ${fmt(st.deuda)}. Todo ese saldo está vencido.` });
  }
  if (st.aFavor > 0.5) out.push({ n: 1, t: `${nombre}: pagaste ${fmt(st.aFavor)} más de lo que debías. Pide la devolución o que te lo abonen.` });
  if (st.eval && st.eval.con && st.eval.ahorro > 1) out.push({ n: 1, t: `${nombre}: con el abono extra de ${fmt(st.plan)} al mes terminas ${st.eval.mesesMenos} mes(es) antes y te ahorras ${fmt(st.eval.ahorro)} de intereses.` });
  return out;
}
const fmt = v => "$ " + Math.round(v || 0).toLocaleString("es-CO");
// Orden sugerido para abonar (avalancha: primero la tasa más alta)
export function ordenPago(lista) { return lista.filter(o => o.st.deuda > 0.5).sort((a, b) => b.st.ea - a.st.ea || a.st.deuda - b.st.deuda); }
