'use strict';
/* Биржевой стакан — движок рынка без отрисовки (работает в браузере и в Node).
   Книга заявок с приоритетом «цена, затем время», четыре типа агентов, новости,
   уход ликвидности, крупная программа продаж и предохранитель (остановка торгов).
   Устойчивость проверена прогонами на десяти зёрнах: в спокойном режиме остановок нет,
   после серии крахов цена возвращается к справедливой, а не уходит в разнос. */
(function (root) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- книга заявок ---------------- */
  class Book {
    constructor() {
      this.lv = { buy: new Map(), sell: new Map() };
      this.px = { buy: [], sell: [] }; // покупки — по убыванию, продажи — по возрастанию
      this.orders = new Map();
      this.nextId = 1;
    }
    best(side) { const a = this.px[side]; return a.length ? a[0] : null; }
    insertPx(side, p) {
      const a = this.px[side];
      let lo = 0, hi = a.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (side === 'buy' ? a[m] > p : a[m] < p) lo = m + 1; else hi = m;
      }
      a.splice(lo, 0, p);
    }
    removePx(side, p) {
      const a = this.px[side];
      const i = a.indexOf(p);
      if (i >= 0) a.splice(i, 1);
    }
    // исполнение против встречной стороны; limitPx = null — рыночная заявка
    match(side, qty, limitPx, owner, t, out) {
      const opp = side === 'buy' ? 'sell' : 'buy';
      while (qty > 0) {
        const bp = this.best(opp);
        if (bp === null) break;
        if (limitPx !== null && (side === 'buy' ? bp > limitPx : bp < limitPx)) break;
        const level = this.lv[opp].get(bp);
        while (qty > 0 && level.q.length) {
          const o = level.q[0];
          const f = Math.min(qty, o.qty);
          o.qty -= f; qty -= f; level.qty -= f;
          out.push({ t, px: bp, qty: f, aggr: side, buyer: side === 'buy' ? owner : o.owner, seller: side === 'buy' ? o.owner : owner });
          if (o.qty === 0) { level.q.shift(); this.orders.delete(o.id); }
        }
        if (!level.q.length) { this.lv[opp].delete(bp); this.removePx(opp, bp); }
      }
      return qty;
    }
    limit(side, px, qty, owner, t, out) {
      const rest = this.match(side, qty, px, owner, t, out);
      if (rest <= 0) return null;
      const o = { id: this.nextId++, side, px, qty: rest, owner, t };
      let level = this.lv[side].get(px);
      if (!level) { level = { px, qty: 0, q: [] }; this.lv[side].set(px, level); this.insertPx(side, px); }
      level.q.push(o); level.qty += rest;
      this.orders.set(o.id, o);
      return o.id;
    }
    market(side, qty, owner, t, out) { return this.match(side, qty, null, owner, t, out); }
    cancel(id) {
      const o = this.orders.get(id);
      if (!o) return;
      this.orders.delete(id);
      const level = this.lv[o.side].get(o.px);
      if (!level) return;
      const i = level.q.indexOf(o);
      if (i >= 0) { level.q.splice(i, 1); level.qty -= o.qty; }
      if (!level.q.length) { this.lv[o.side].delete(o.px); this.removePx(o.side, o.px); }
    }
    depth(side, n) {
      const out = [];
      const a = this.px[side];
      for (let i = 0; i < Math.min(n, a.length); i++) out.push([a[i], this.lv[side].get(a[i]).qty]);
      return out;
    }
  }

  /* ---------------- рынок ---------------- */
  const CLASSES = ['mm', 'fund', 'trend', 'noise', 'prog'];
  class Market {
    constructor(seed, mix) {
      this.rng = mulberry32(seed || 7);
      this.book = new Book();
      this.t = 0;
      this.V = 10000;       // справедливая цена в тиках (1 тик = 0,01 ₽)
      this.last = 10000;
      this.candleLen = 30;  // секунд в свече
      this.candles = [];
      this.tape = [];
      this.events = [];
      this.hist = [];       // цены по секундам — для предохранителя
      this.r5 = [];         // 5-секундные лог-доходности — для гистограммы хвостов
      this.halt = 0; this.cbOn = true; this.resumeT = 0;
      this.panicUntil = -1;
      this.program = null;
      this.pnl = Object.fromEntries(CLASSES.map((c) => [c, { cash: 0, pos: 0 }]));
      this.volume = 0;
      this.nTrades = 0;
      this.setMix(mix || { mm: 5, fund: 30, trend: 30, noise: 60 });
      this.noiseOrders = [];
      this.newCandle();
    }
    randn() { let u = 0; while (!u) u = this.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng()); }
    poisson(l) { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= this.rng(); } while (p > L); return k - 1; }
    setMix(mix) {
      this.mix = { ...mix };
      const R = () => this.rng();
      const keepMM = this.mms || [];
      this.mms = Array.from({ length: mix.mm }, (_, i) => keepMM[i] || { orders: [], inv: 0, h: 3 + Math.floor(R() * 4), sz: 0.7 + R() * 0.6 });
      for (const m of keepMM.slice(mix.mm)) for (const id of m.orders) this.book.cancel(id);
      this.funds = Array.from({ length: mix.fund }, () => ({ bias: this.randn() * 0.003, theta: 0.002 + R() * 0.006 }));
      this.trends = Array.from({ length: mix.trend }, () => ({ ema: this.last, a: 1 / (30 + R() * 120), thr: 0.0015 + R() * 0.003 }));
    }
    mid() {
      const b = this.book.best('buy'), a = this.book.best('sell');
      if (b !== null && a !== null) return (a + b) / 2;
      return this.last;
    }
    newCandle() {
      const p = this.last;
      this.cur = { t0: this.t, o: p, h: p, l: p, c: p, v: 0, V: this.V, ev: null };
      this.candles.push(this.cur);
      if (this.candles.length > 400) this.candles.shift();
    }
    record(trades) {
      for (const tr of trades) {
        this.last = tr.px;
        const c = this.cur;
        c.h = Math.max(c.h, tr.px); c.l = Math.min(c.l, tr.px); c.c = tr.px; c.v += tr.qty;
        this.volume += tr.qty;
        const val = tr.px * tr.qty;
        this.pnl[tr.buyer.cls].cash -= val; this.pnl[tr.buyer.cls].pos += tr.qty;
        this.pnl[tr.seller.cls].cash += val; this.pnl[tr.seller.cls].pos -= tr.qty;
        if (tr.buyer.cls === 'mm') this.mms[tr.buyer.i] && (this.mms[tr.buyer.i].inv += tr.qty);
        if (tr.seller.cls === 'mm') this.mms[tr.seller.i] && (this.mms[tr.seller.i].inv -= tr.qty);
        this.tape.push(tr);
        this.nTrades++;
      }
      if (this.tape.length > 60) this.tape.splice(0, this.tape.length - 60);
    }
    event(kind, text) {
      const e = { t: this.t, kind, text };
      this.events.push(e);
      if (this.events.length > 40) this.events.shift();
      this.cur.ev = kind;
      return e;
    }
    news(sign) {
      this.V *= sign > 0 ? 1.05 : 0.95;
      this.event(sign > 0 ? 'up' : 'down', sign > 0 ? 'Хорошая новость: справедливая цена +5 %' : 'Плохая новость: справедливая цена −5 %');
    }
    liquidityShock() {
      this.panicUntil = this.t + 80;
      this.event('liq', 'Маркетмейкеры отозвали котировки');
    }
    flashCrash() {
      this.panicUntil = this.t + 90;
      this.program = { left: 16000, per: 520, floor: Math.round(this.last * 0.85), until: this.t + 180 };
      this.event('crash', 'Программа продаж 16 000 акций в тонком стакане');
    }

    step() {
      this.t++;
      const out = [];
      this.V *= Math.exp(0.0004 * this.randn());
      this.hist.push(this.last);
      if (this.hist.length > 400) this.hist.shift();
      this.cur.V = this.V;
      if (this.halt > 0) {
        this.cur.halt = true;
        this.halt--;
        if (this.halt === 0) { this.resumeT = this.t; this.event('resume', 'Торги возобновлены'); }
        if (this.t % this.candleLen === 0) this.newCandle();
        return out;
      }
      const R = () => this.rng();
      const mid = this.mid();
      const panic = this.t < this.panicUntil;

      // маркетмейкеры: снимают и заново выставляют лесенку котировок
      this.mms.forEach((m, i) => {
        if (R() > 0.5) return;
        for (const id of m.orders) this.book.cancel(id);
        m.orders = [];
        if (panic && R() < 0.7) return;
        // сдвиг котировок против позиции, но не шире полуспреда — иначе котировки гонят цену
        const skew = Math.max(-(m.h - 1), Math.min(m.h - 1, -m.inv * 0.003));
        const offs = panic ? [30, 55, 90] : [m.h, m.h + 4, m.h + 10];
        const sizes = (panic ? [10, 15, 20] : [80, 170, 340]).map((s) => Math.round(s * m.sz));
        const own = { cls: 'mm', i };
        for (let k = 0; k < 3; k++) {
          // котировки «только в стакан»: маркетмейкер не снимает чужие заявки
          const ba = this.book.best('sell'), bb = this.book.best('buy');
          let bpx = Math.round(mid - offs[k] + skew), apx = Math.round(mid + offs[k] + skew);
          if (ba !== null) bpx = Math.min(bpx, ba - 1);
          if (bb !== null) apx = Math.max(apx, bb + 1);
          if (m.inv < 4000) { const id = this.book.limit('buy', bpx, sizes[k], own, this.t, out); if (id) m.orders.push(id); }
          if (m.inv > -4000) { const id = this.book.limit('sell', apx, sizes[k], own, this.t, out); if (id) m.orders.push(id); }
        }
      });

      // шумовые трейдеры
      const nN = this.poisson(this.mix.noise * 0.06);
      for (let k = 0; k < nN; k++) {
        const side = R() < 0.5 ? 'buy' : 'sell';
        const own = { cls: 'noise', i: 0 };
        if (R() < 0.25) this.book.market(side, 5 + Math.floor(R() * 36), own, this.t, out);
        else {
          const off = 1 + Math.floor(-Math.log(R() + 1e-9) * 7);
          const px = Math.round(side === 'buy' ? mid - off : mid + off);
          const id = this.book.limit(side, px, 5 + Math.floor(R() * 46), own, this.t, out);
          if (id) this.noiseOrders.push([id, this.t + 40 + Math.floor(R() * 300)]);
        }
      }
      // фундаменталисты: покупают дешевле справедливой цены, продают дороже
      const p = this.last;
      const nF = this.poisson(this.funds.length * 0.025 * (1 + 12 * Math.abs(this.V / p - 1)));
      for (let k = 0; k < nF; k++) {
        const a = this.funds[Math.floor(R() * this.funds.length)];
        const mis = (this.V * (1 + a.bias) - p) / p;
        if (Math.abs(mis) < a.theta) continue;
        const q = Math.min(160, Math.round(10 + 2500 * Math.abs(mis)));
        this.book.market(mis > 0 ? 'buy' : 'sell', q, { cls: 'fund', i: 0 }, this.t, out);
      }
      // трендовые: следуют за движением цены относительно своей скользящей средней
      for (const a of this.trends) a.ema += (p - a.ema) * a.a;
      const nT = this.poisson(this.trends.length * 0.02);
      for (let k = 0; k < nT; k++) {
        const a = this.trends[Math.floor(R() * this.trends.length)];
        const sig = (p - a.ema) / p;
        if (Math.abs(sig) < a.thr) continue;
        const q = Math.min(130, Math.round(10 + 2200 * Math.abs(sig)));
        this.book.market(sig > 0 ? 'buy' : 'sell', q, { cls: 'trend', i: 0 }, this.t, out);
      }
      // крупная программа продаж
      if (this.program) {
        const q = Math.min(this.program.per, this.program.left);
        // алгоритм продаёт «по рынку», но не ниже 85 % цены на старте программы
        const rest = this.book.match('sell', q, this.program.floor, { cls: 'prog', i: 0 }, this.t, out);
        this.program.left -= q - rest;
        if (this.program.left <= 0 || this.t >= this.program.until) this.program = null;
      }
      // срок жизни шумовых заявок
      if (this.noiseOrders.length) {
        const keep = [];
        for (const [id, exp] of this.noiseOrders) { if (exp <= this.t) this.book.cancel(id); else if (this.book.orders.has(id)) keep.push([id, exp]); }
        this.noiseOrders = keep;
      }
      this.record(out);
      if (this.t % 5 === 0 && this.hist.length > 5) {
        this.r5.push(Math.log(this.last / this.hist[this.hist.length - 5]));
        if (this.r5.length > 1500) this.r5.shift();
      }
      // предохранитель: движение больше 6,5 % за 5 минут — пауза 40 секунд;
      // после возобновления отсчёт идёт от цены открытия, а не от цены до обвала
      const span = Math.min(300, this.t - this.resumeT, this.hist.length - 1);
      if (this.cbOn && span >= 5) {
        const ref = this.hist[this.hist.length - 1 - span];
        if (Math.abs(this.last / ref - 1) > 0.065) {
          this.halt = 40;
          this.event('halt', `Предохранитель: движение ${this.last > ref ? '+' : '−'}${(Math.abs(this.last / ref - 1) * 100).toFixed(1).replace('.', ',')} % за 5 минут, пауза 40 с`);
        }
      }
      if (this.t % this.candleLen === 0) this.newCandle();
      return out;
    }
  }

  root.Market = { Market, Book, CLASSES, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
