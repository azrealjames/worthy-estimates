/* Worthy Estimates — vanilla JS, localStorage-backed */
(() => {
"use strict";

const STORE_KEY = "worthy-estimates-v1";

/* ---------------- State ---------------- */

const defaultState = () => ({
  business: {
    name: "", tagline: "", phone: "", email: "", address: "",
    footer: "Estimate valid for 30 days. Thank you for your business!",
    payments: { paypal: "", venmo: "", zelle: "", zelleName: "" }
  },
  cities: [],            // {id, name, rate}  rate = percent, e.g. 8.25
  estimates: [],         // see newEstimate(); type: "estimate" | "invoice"
  nextNumber: 1,
  nextInvoiceNumber: 1
});

function migrate(s) {
  s.business.payments = Object.assign(
    { paypal: "", venmo: "", zelle: "", zelleName: "" }, s.business.payments || {});
  if (!s.nextInvoiceNumber) s.nextInvoiceNumber = 1;
  s.estimates.forEach(e => {
    if (!e.type) e.type = "estimate";
    if (e.paid == null) e.paid = false;
    if (e.dueDate == null) e.dueDate = "";
  });
  return s;
}

let state = load();
let currentId = null;    // estimate being edited
let saveTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(Object.assign(defaultState(), JSON.parse(raw)));
  } catch (e) { console.warn("Could not load saved data", e); }
  return defaultState();
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  flashSaved();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function newEstimate() {
  const num = "EST-" + String(state.nextNumber).padStart(4, "0");
  state.nextNumber++;
  const est = {
    id: uid(),
    type: "estimate",
    number: num,
    title: "",
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    paid: false,
    customer: { name: "", phone: "", email: "", address: "" },
    items: [blankItem()],
    cityId: state.cities.length ? state.cities[0].id : "",
    updated: Date.now()
  };
  state.estimates.unshift(est);
  save();
  return est;
}

const blankItem = () => ({ id: uid(), desc: "", notes: "", qty: 1, rate: "" });

const getEstimate = (id) => state.estimates.find(e => e.id === id);
const getCity = (id) => state.cities.find(c => c.id === id);

/* ---------------- Money math ---------------- */

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n) => fmt.format(isFinite(n) ? n : 0);

function itemAmount(item) {
  const qty = parseFloat(item.qty) || 0;
  const rate = parseFloat(item.rate) || 0;
  return qty * rate;
}

function calc(est) {
  const subtotal = est.items.reduce((s, it) => s + itemAmount(it), 0);
  const city = getCity(est.cityId);
  const pct = city ? (parseFloat(city.rate) || 0) : 0;
  const tax = Math.round(subtotal * pct) / 100; // round to the cent
  return { subtotal, tax, grand: subtotal + tax, city, pct };
}

const docWord = (est) => est.type === "invoice" ? "INVOICE" : "ESTIMATE";

/* Payment options configured in Settings, with links where the platform has them.
   The app only displays these — the customer pays directly in their own app. */
function paymentOptions(est) {
  const p = state.business.payments || {};
  const amt = calc(est).grand.toFixed(2);
  const opts = [];
  if (p.paypal.trim()) {
    const user = p.paypal.trim().replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, "");
    opts.push({ method: "PayPal", text: "paypal.me/" + user,
      url: "https://paypal.me/" + encodeURIComponent(user) + "/" + amt });
  }
  if (p.venmo.trim()) {
    const user = p.venmo.trim().replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, "");
    opts.push({ method: "Venmo", text: "@" + user,
      url: "https://venmo.com/u/" + encodeURIComponent(user) });
  }
  if (p.zelle.trim()) {
    opts.push({ method: "Zelle", text: p.zelle.trim() +
      (p.zelleName.trim() ? "  (" + p.zelleName.trim() + ")" : ""), url: null });
  }
  return opts;
}

/* ---------------- DOM helpers ---------------- */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

function flashSaved() {
  const el = $("#autosaveNote");
  if (!el) return;
  el.textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 900);
}

/* ---------------- Views ---------------- */

const VIEWS = ["list", "editor", "settings"];

function show(view) {
  VIEWS.forEach(v => {
    $("#view-" + v).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === view));
  $("#appbarBrand").textContent =
    view === "settings" ? "Settings" :
    view === "editor" ? "Estimate" : "Estimates";
  $("#appbarBadge").textContent =
    view === "editor" && currentId ? (getEstimate(currentId)?.number || "") : "Worthy";
  window.scrollTo(0, 0);
  if (view === "list") renderList();
  if (view === "settings") renderSettings();
  if (view === "editor") {
    const est = getEstimate(currentId);
    if (est) {
      renderLetterhead();
      renderCityOptions(est);
      updateTotals();
    }
  }
}

/* ---------------- Estimate list ---------------- */

function renderList() {
  const wrap = $("#estimateList");
  const ests = [...state.estimates].sort((a, b) => b.updated - a.updated);
  $("#listEmpty").classList.toggle("hidden", ests.length > 0);
  wrap.innerHTML = ests.map(e => {
    const { grand, city } = calc(e);
    const d = e.date ? new Date(e.date + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
    const paid = e.type === "invoice" && e.paid;
    return `<button class="est-card${paid ? " est-paid" : ""}" data-id="${e.id}">
      <div class="est-card-top">
        <span class="est-card-cust">${esc(e.customer.name) || "Unnamed customer"}</span>
        <span class="est-card-total">${money(grand)}</span>
      </div>
      <div class="est-card-sub">
        <span>${esc(e.title) || "No job title"}${city ? " · " + esc(city.name) : ""}</span>
        <span class="mono">${esc(e.number)}${paid ? " · PAID" : ""} · ${d}</span>
      </div>
    </button>`;
  }).join("");
  wrap.querySelectorAll(".est-card").forEach(btn =>
    btn.addEventListener("click", () => openEstimate(btn.dataset.id)));
}

/* ---------------- Editor ---------------- */

function openEstimate(id) {
  currentId = id;
  const est = getEstimate(id);
  if (!est) return;
  $("#tabEditor").disabled = false;

  $("#edDate").value = est.date;
  $("#edDue").value = est.dueDate;
  $("#edTitle").value = est.title;
  syncTypeUI(est);
  $("#cuName").value = est.customer.name;
  $("#cuPhone").value = est.customer.phone;
  $("#cuEmail").value = est.customer.email;
  $("#cuAddress").value = est.customer.address;

  renderLetterhead();
  renderCityOptions(est);
  renderItems(est);
  updateTotals();
  show("editor");
}

function syncTypeUI(est) {
  const isInv = est.type === "invoice";
  $("#dueWrap").classList.toggle("hidden", !isInv);
  $("#btnConvert").classList.toggle("hidden", isInv);
  $("#btnTogglePaid").classList.toggle("hidden", !isInv);
  $("#btnTogglePaid").textContent = est.paid ? "Mark as Unpaid" : "Mark as Paid";
  $("#edNumber").textContent = est.number + (isInv && est.paid ? " · PAID" : "");
  $("#btnShare").textContent = isInv
    ? "Share Invoice PDF — Text / Email"
    : "Share PDF — Text / Email";
  $("#btnDeleteEstimate").textContent = isInv ? "Delete invoice" : "Delete estimate";
}

function renderLetterhead() {
  const b = state.business;
  $("#lhName").textContent = b.name || "Your Business Name";
  $("#lhTagline").textContent = b.tagline;
  $("#lhTagline").classList.toggle("hidden", !b.tagline);
  const contact = [b.phone, b.email, b.address].filter(Boolean).join("\n");
  $("#lhContact").textContent = contact;
}

function renderCityOptions(est) {
  const sel = $("#edCity");
  const opts = ['<option value="">No tax (0%)</option>']
    .concat(state.cities.map(c =>
      `<option value="${c.id}">${esc(c.name)} — ${esc(c.rate)}%</option>`));
  sel.innerHTML = opts.join("");
  sel.value = getCity(est.cityId) ? est.cityId : "";
}

function renderItems(est) {
  const wrap = $("#itemsWrap");
  wrap.innerHTML = est.items.map((it, i) => `
    <div class="item-card" data-id="${it.id}">
      <div class="item-head">
        <span class="item-index">ITEM ${String(i + 1).padStart(2, "0")}</span>
        <button class="item-remove" title="Remove item" aria-label="Remove item">✕</button>
      </div>
      <label class="field"><span>Work performed</span>
        <input type="text" class="it-desc" value="${esc(it.desc)}" placeholder="Describe the work"></label>
      <label class="field"><span>Notes</span>
        <textarea class="it-notes" rows="2" placeholder="Materials, prep, specifics…">${esc(it.notes)}</textarea></label>
      <div class="item-grid">
        <label class="field"><span>Qty</span>
          <input type="number" class="it-qty" value="${esc(it.qty)}" min="0" step="any" inputmode="decimal"></label>
        <label class="field"><span>Rate ($)</span>
          <input type="number" class="it-rate" value="${esc(it.rate)}" min="0" step="any" inputmode="decimal" placeholder="0.00"></label>
        <div class="item-amount">
          <span class="amt-label">Amount</span>
          <span class="amt-value it-amount">${money(itemAmount(it))}</span>
        </div>
      </div>
    </div>`).join("");

  wrap.querySelectorAll(".item-card").forEach(cardEl => {
    const item = est.items.find(x => x.id === cardEl.dataset.id);
    if (!item) return;
    const bind = (cls, key) => {
      const input = cardEl.querySelector(cls);
      input.addEventListener("input", () => {
        item[key] = input.value;
        cardEl.querySelector(".it-amount").textContent = money(itemAmount(item));
        touch(); updateTotals();
      });
    };
    bind(".it-desc", "desc");
    bind(".it-notes", "notes");
    bind(".it-qty", "qty");
    bind(".it-rate", "rate");
    cardEl.querySelector(".item-remove").addEventListener("click", () => {
      if (est.items.length === 1) {
        Object.assign(item, blankItem(), { id: item.id });
      } else {
        est.items = est.items.filter(x => x.id !== item.id);
      }
      touch(); renderItems(est); updateTotals();
    });
  });
}

function updateTotals() {
  const est = getEstimate(currentId);
  if (!est) return;
  const { subtotal, tax, grand, city, pct } = calc(est);
  $("#tSubtotal").textContent = money(subtotal);
  $("#tTaxLabel").textContent = city ? `Tax — ${city.name} (${pct}%)` : "Tax (0%)";
  $("#tTax").textContent = money(tax);
  $("#tGrand").textContent = money(grand);
}

function touch() {
  const est = getEstimate(currentId);
  if (est) est.updated = Date.now();
  scheduleSave();
}

/* editor field bindings (static inputs) */
function bindEditorFields() {
  const map = [
    ["#edDate",   (est, v) => est.date = v],
    ["#edDue",    (est, v) => est.dueDate = v],
    ["#edTitle",  (est, v) => est.title = v],
    ["#cuName",   (est, v) => est.customer.name = v],
    ["#cuPhone",  (est, v) => est.customer.phone = v],
    ["#cuEmail",  (est, v) => est.customer.email = v],
    ["#cuAddress",(est, v) => est.customer.address = v],
  ];
  map.forEach(([sel, apply]) => {
    $(sel).addEventListener("input", (ev) => {
      const est = getEstimate(currentId);
      if (!est) return;
      apply(est, ev.target.value);
      touch();
    });
  });
  $("#edCity").addEventListener("change", (ev) => {
    const est = getEstimate(currentId);
    if (!est) return;
    est.cityId = ev.target.value;
    touch(); updateTotals();
  });
}

/* ---------------- Settings ---------------- */

function renderSettings() {
  const b = state.business;
  $("#bzName").value = b.name;
  $("#bzTagline").value = b.tagline;
  $("#bzPhone").value = b.phone;
  $("#bzEmail").value = b.email;
  $("#bzAddress").value = b.address;
  $("#bzFooter").value = b.footer;
  $("#payPaypal").value = b.payments.paypal;
  $("#payVenmo").value = b.payments.venmo;
  $("#payZelle").value = b.payments.zelle;
  $("#payZelleName").value = b.payments.zelleName;
  renderCityList();
}

function renderCityList() {
  const wrap = $("#cityList");
  if (!state.cities.length) {
    wrap.innerHTML = '<p class="hint">No cities yet — add the first one below.</p>';
    return;
  }
  wrap.innerHTML = state.cities.map(c => `
    <div class="city-row" data-id="${c.id}">
      <span class="city-name">${esc(c.name)}</span>
      <span class="city-rate">${esc(c.rate)}%</span>
      <button class="city-del" title="Remove city" aria-label="Remove city">✕</button>
    </div>`).join("");
  wrap.querySelectorAll(".city-row").forEach(row => {
    row.querySelector(".city-del").addEventListener("click", () => {
      state.cities = state.cities.filter(c => c.id !== row.dataset.id);
      save(); renderCityList();
    });
  });
}

function bindSettings() {
  const map = [
    ["#bzName", "name"], ["#bzTagline", "tagline"], ["#bzPhone", "phone"],
    ["#bzEmail", "email"], ["#bzAddress", "address"], ["#bzFooter", "footer"]
  ];
  map.forEach(([sel, key]) => {
    $(sel).addEventListener("input", (ev) => {
      state.business[key] = ev.target.value;
      scheduleSave();
    });
  });
  [["#payPaypal", "paypal"], ["#payVenmo", "venmo"],
   ["#payZelle", "zelle"], ["#payZelleName", "zelleName"]].forEach(([sel, key]) => {
    $(sel).addEventListener("input", (ev) => {
      state.business.payments[key] = ev.target.value;
      scheduleSave();
    });
  });
  $("#btnAddCity").addEventListener("click", () => {
    const name = $("#newCityName").value.trim();
    const rate = parseFloat($("#newCityRate").value);
    if (!name) { $("#newCityName").focus(); return; }
    if (!isFinite(rate) || rate < 0) { $("#newCityRate").focus(); return; }
    state.cities.push({ id: uid(), name, rate });
    $("#newCityName").value = ""; $("#newCityRate").value = "";
    save(); renderCityList();
  });
}

/* ---------------- Print document ---------------- */

function renderDoc(est) {
  const b = state.business;
  const { subtotal, tax, grand, city, pct } = calc(est);
  const contact = [b.phone, b.email, b.address].filter(Boolean).join("\n");
  const d = est.date ? new Date(est.date + "T12:00:00").toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "";
  const cust = est.customer;
  const custLines = [cust.phone, cust.email].filter(Boolean).join(" · ");
  const items = est.items.filter(it => it.desc || itemAmount(it) > 0);

  return `
  <div class="doc-head">
    <div>
      <div class="doc-biz-name">${esc(b.name) || "Your Business Name"}</div>
      ${b.tagline ? `<div class="doc-biz-tagline">${esc(b.tagline)}</div>` : ""}
      ${contact ? `<div class="doc-biz-contact">${esc(contact)}</div>` : ""}
    </div>
    <div class="doc-stamp">
      <div class="doc-word">${docWord(est)}</div>
      <span class="mono">${esc(est.number)}</span>
      <span class="mono">${esc(d)}</span>
      ${est.type === "invoice" ? `<span class="mono">Due: ${est.dueDate
        ? esc(new Date(est.dueDate + "T12:00:00").toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }))
        : "on receipt"}</span>` : ""}
      ${est.estimateRef ? `<span class="mono">Ref: ${esc(est.estimateRef)}</span>` : ""}
    </div>
  </div>
  ${est.type === "invoice" && est.paid ? `<div class="doc-paid-stamp">PAID</div>` : ""}

  <div class="doc-parties">
    <div class="doc-billto">
      <div class="doc-label">Prepared for</div>
      <div class="name">${esc(cust.name) || "—"}</div>
      ${custLines ? `<div>${esc(custLines)}</div>` : ""}
      ${cust.address ? `<div>${esc(cust.address)}</div>` : ""}
    </div>
    <div class="doc-job">
      <div class="doc-label">Job</div>
      <div>${esc(est.title) || "—"}</div>
      ${city ? `<div>${esc(city.name)}</div>` : ""}
    </div>
  </div>

  <table class="doc-table">
    <thead><tr>
      <th>Work performed</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>
      ${items.map(it => `<tr>
        <td>
          <div class="doc-item-desc">${esc(it.desc) || "—"}</div>
          ${it.notes ? `<div class="doc-item-notes">${esc(it.notes)}</div>` : ""}
        </td>
        <td class="num">${esc(it.qty)}</td>
        <td class="num">${money(parseFloat(it.rate) || 0)}</td>
        <td class="num">${money(itemAmount(it))}</td>
      </tr>`).join("") || `<tr><td colspan="4"><em>No items</em></td></tr>`}
    </tbody>
  </table>

  <div class="doc-totals">
    <div class="doc-t-row"><span>Subtotal</span><span class="mono">${money(subtotal)}</span></div>
    <div class="doc-t-row"><span>${city ? `Tax — ${esc(city.name)} (${pct}%)` : "Tax (0%)"}</span><span class="mono">${money(tax)}</span></div>
    <div class="doc-t-grand"><span>GRAND TOTAL</span><span class="mono">${money(grand)}</span></div>
  </div>

  ${renderDocPaySection(est)}

  ${b.footer ? `<div class="doc-footer">${esc(b.footer)}</div>` : ""}

  ${est.type === "invoice" ? "" : `<div class="doc-sign">
    <div class="sig">Customer signature</div>
    <div class="sig">Date</div>
  </div>`}`;
}

function renderDocPaySection(est) {
  if (est.type !== "invoice") return "";
  if (est.paid) return `<div class="doc-paid-line">PAID — Thank you!</div>`;
  const opts = paymentOptions(est);
  if (!opts.length) return "";
  return `<div class="doc-pay">
    <div class="doc-label">How to pay</div>
    ${opts.map(o => `<div class="doc-pay-row">
      <span class="pay-method">${esc(o.method)}</span>
      ${o.url
        ? `<a class="mono" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.text)}</a>`
        : `<span class="mono">${esc(o.text)}</span>`}
    </div>`).join("")}
    <div class="doc-pay-note">Please include ${esc(est.number)} in the payment note.</div>
  </div>`;
}

/* ---------------- PDF generation & sharing ---------------- */

function buildPdf(est) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const W = 612, H = 792, M = 48;
  const INK = [24, 34, 53], SOFT = [74, 84, 104], ACCENT = [217, 72, 15],
        FAINT = [185, 174, 151], PAPER = [247, 242, 233], GOLD = [255, 216, 168];
  const b = state.business;
  const { subtotal, tax, grand, city, pct } = calc(est);
  let y = 0;

  const ensure = (space) => {
    if (y + space > H - M) { doc.addPage(); topStripe(); y = M + 14; }
  };
  const topStripe = () => {
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, W, 6, "F");
  };

  topStripe();
  y = M + 14;

  /* --- PAID watermark (drawn first so text prints over it) --- */
  if (est.type === "invoice" && est.paid) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(96);
    doc.setTextColor(205, 226, 210);
    doc.text("PAID", W / 2 - 130, H / 2 + 60, { angle: 24 });
  }

  /* --- letterhead: business (left) / stamp (right) --- */
  let leftY = y, rightY = y;
  doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...INK);
  const nameLines = doc.splitTextToSize(b.name || "Your Business Name", 330);
  doc.text(nameLines, M, leftY);
  leftY += nameLines.length * 21;
  if (b.tagline) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(...SOFT);
    doc.text(doc.splitTextToSize(b.tagline, 330), M, leftY);
    leftY += 13;
  }
  doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(...SOFT);
  [b.phone, b.email, b.address].filter(Boolean).forEach(line => {
    const lns = doc.splitTextToSize(line, 330);
    doc.text(lns, M, leftY);
    leftY += lns.length * 10.5;
  });

  const isInvoice = est.type === "invoice";
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...ACCENT);
  doc.text(docWord(est).split("").join(" "), W - M, rightY, { align: "right" });
  rightY += 15;
  doc.setFont("courier", "bold"); doc.setFontSize(9); doc.setTextColor(...SOFT);
  doc.text(est.number, W - M, rightY, { align: "right" });
  rightY += 12;
  const longDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.setFont("courier", "normal");
  if (est.date) {
    doc.text(longDate(est.date), W - M, rightY, { align: "right" });
    rightY += 12;
  }
  if (isInvoice) {
    doc.text("Due: " + (est.dueDate ? longDate(est.dueDate) : "on receipt"), W - M, rightY, { align: "right" });
    rightY += 12;
    if (est.estimateRef) {
      doc.text("Ref: " + est.estimateRef, W - M, rightY, { align: "right" });
      rightY += 12;
    }
  }

  y = Math.max(leftY, rightY) + 6;
  doc.setDrawColor(...INK); doc.setLineWidth(2.5);
  doc.line(M, y, W - M, y);
  y += 24;

  /* --- prepared for (left) / job (right) --- */
  const label = (txt, x, align) => {
    doc.setFont("courier", "bold"); doc.setFontSize(7); doc.setTextColor(...ACCENT);
    doc.text(txt.toUpperCase(), x, y0, { align, charSpace: 1.5 });
  };
  let y0 = y;
  let lY = y, rY = y;
  const cust = est.customer;
  label("Prepared for", M, "left");
  label("Job", W - M, "right");
  lY += 14; rY += 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(cust.name || "—", M, lY); lY += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...SOFT);
  const contactLine = [cust.phone, cust.email].filter(Boolean).join("  ·  ");
  if (contactLine) { doc.text(contactLine, M, lY); lY += 12; }
  if (cust.address) {
    const lns = doc.splitTextToSize(cust.address, 300);
    doc.text(lns, M, lY); lY += lns.length * 12;
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  const jobLines = doc.splitTextToSize(est.title || "—", 180);
  doc.text(jobLines, W - M, rY, { align: "right" }); rY += jobLines.length * 12.5;
  if (city) {
    doc.setFontSize(9.5); doc.setTextColor(...SOFT);
    doc.text(city.name, W - M, rY, { align: "right" }); rY += 12;
  }
  y = Math.max(lY, rY) + 16;

  /* --- items table --- */
  const AMT_R = W - M;          // amount right edge
  const RATE_R = AMT_R - 78;    // rate right edge
  const QTY_R = RATE_R - 66;    // qty right edge
  const DESC_W = QTY_R - 46 - M;

  const tableHead = () => {
    doc.setFont("courier", "bold"); doc.setFontSize(7); doc.setTextColor(...SOFT);
    doc.text("WORK PERFORMED", M, y, { charSpace: 1 });
    doc.text("QTY", QTY_R, y, { align: "right", charSpace: 1 });
    doc.text("RATE", RATE_R, y, { align: "right", charSpace: 1 });
    doc.text("AMOUNT", AMT_R, y, { align: "right", charSpace: 1 });
    y += 6;
    doc.setDrawColor(...INK); doc.setLineWidth(1.5);
    doc.line(M, y, W - M, y);
    y += 16;
  };
  tableHead();

  const items = est.items.filter(it => it.desc || itemAmount(it) > 0);
  items.forEach(it => {
    const descLines = doc.splitTextToSize(it.desc || "—", DESC_W);
    const noteLines = it.notes ? doc.splitTextToSize(it.notes, DESC_W) : [];
    const rowH = descLines.length * 12.5 + (noteLines.length ? noteLines.length * 11 + 3 : 0) + 18;
    ensure(rowH + 10);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(descLines, M, y);
    doc.setFont("courier", "normal"); doc.setFontSize(9);
    doc.text(String(parseFloat(it.qty) || 0), QTY_R, y, { align: "right" });
    doc.text(money(parseFloat(it.rate) || 0), RATE_R, y, { align: "right" });
    doc.setFont("courier", "bold");
    doc.text(money(itemAmount(it)), AMT_R, y, { align: "right" });
    y += descLines.length * 12.5;
    if (noteLines.length) {
      y += 3;
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...SOFT);
      doc.text(noteLines, M, y);
      y += noteLines.length * 11;
    }
    y += 8;
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.75); doc.setLineDashPattern([2, 2], 0);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 16;
  });
  if (!items.length) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...SOFT);
    doc.text("No items", M, y);
    y += 20;
  }

  /* --- totals --- */
  ensure(120);
  const TX = W - M - 250;
  y += 4;
  const trow = (labelTxt, amt) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(labelTxt, TX, y);
    doc.setFont("courier", "bold"); doc.setFontSize(10);
    doc.text(amt, AMT_R, y, { align: "right" });
    y += 17;
  };
  trow("Subtotal", money(subtotal));
  trow(city ? `Tax — ${city.name} (${pct}%)` : "Tax (0%)", money(tax));
  doc.setFillColor(...INK);
  doc.rect(TX - 12, y - 10, W - M - TX + 12, 30, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...PAPER);
  doc.text("GRAND TOTAL", TX, y + 9);
  doc.setFont("courier", "bold"); doc.setFontSize(13); doc.setTextColor(...GOLD);
  doc.text(money(grand), AMT_R, y + 9, { align: "right" });
  y += 42;

  /* --- payment section (invoices) --- */
  const GREEN = [43, 122, 61];
  if (isInvoice) {
    if (est.paid) {
      ensure(50);
      y += 8;
      doc.setDrawColor(...GREEN); doc.setLineWidth(1.5);
      doc.roundedRect(M, y - 4, W - M * 2, 32, 4, 4, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GREEN);
      doc.text("PAID — Thank you!", W / 2, y + 16, { align: "center" });
      y += 44;
    } else {
      const opts = paymentOptions(est);
      if (opts.length) {
        const boxH = 34 + opts.length * 16 + 16;
        ensure(boxH + 12);
        y += 8;
        const boxTop = y - 4;
        doc.setDrawColor(...INK); doc.setLineWidth(1.5);
        doc.roundedRect(M, boxTop, W - M * 2, boxH, 4, 4, "S");
        y = boxTop + 20;
        doc.setFont("courier", "bold"); doc.setFontSize(7); doc.setTextColor(...ACCENT);
        doc.text("HOW TO PAY", M + 16, y, { charSpace: 1.5 });
        y += 15;
        opts.forEach(o => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
          doc.text(o.method, M + 16, y);
          doc.setFont("courier", "normal"); doc.setFontSize(9);
          if (o.url) {
            doc.setTextColor(...ACCENT);
            doc.textWithLink(o.text, M + 84, y, { url: o.url });
          } else {
            doc.setTextColor(...INK);
            doc.text(o.text, M + 84, y);
          }
          y += 16;
        });
        doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...SOFT);
        doc.text(`Please include ${est.number} in the payment note.`, M + 16, y + 2);
        y = boxTop + boxH + 18;
      }
    }
  }

  /* --- footer note --- */
  if (b.footer) {
    ensure(46);
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.75); doc.setLineDashPattern([2, 2], 0);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 15;
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...SOFT);
    const fl = doc.splitTextToSize(b.footer, W - M * 2);
    doc.text(fl, M, y);
    y += fl.length * 12;
  }

  /* --- signature lines (estimates only) --- */
  if (!isInvoice) {
    ensure(64);
    y += 34;
    doc.setDrawColor(...INK); doc.setLineWidth(0.9);
    doc.line(M, y, M + 220, y);
    doc.line(W - M - 160, y, W - M, y);
    y += 11;
    doc.setFont("courier", "normal"); doc.setFontSize(7); doc.setTextColor(...SOFT);
    doc.text("CUSTOMER SIGNATURE", M, y, { charSpace: 1 });
    doc.text("DATE", W - M - 160, y, { charSpace: 1 });
  }

  return doc;
}

function pdfFilename(est) {
  const cust = (est.customer.name || "").trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return est.number + (cust ? "-" + cust : "") + ".pdf";
}

async function sharePdf() {
  const est = getEstimate(currentId);
  if (!est) return;
  if (!window.jspdf) {
    alert("PDF engine failed to load. Reload the app and try again.");
    return;
  }
  let blob;
  try {
    blob = buildPdf(est).output("blob");
  } catch (err) {
    console.error("PDF generation failed", err);
    alert("Sorry — could not build the PDF.");
    return;
  }
  const filename = pdfFilename(est);
  const file = new File([blob], filename, { type: "application/pdf" });

  const word = est.type === "invoice" ? "Invoice" : "Estimate";
  let shareText = `${word} ${est.number}` +
    (state.business.name ? ` from ${state.business.name}` : "") +
    ` — Total ${money(calc(est).grand)}`;
  if (est.type === "invoice" && !est.paid) {
    if (est.dueDate) {
      shareText += `, due ${new Date(est.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    const opts = paymentOptions(est);
    if (opts.length) {
      shareText += "\nPay: " + opts.map(o => o.url || `Zelle ${o.text}`).join("  ·  ");
    }
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${word} ${est.number}`,
        text: shareText
      });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // user closed the share sheet
      console.warn("Share failed, falling back to download", err);
    }
  }
  // No share support (desktop) — download instead so it can be attached manually
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openPreview() {
  const est = getEstimate(currentId);
  if (!est) return;
  $("#docSheet").innerHTML = renderDoc(est);
  $("#previewOverlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closePreview() {
  $("#previewOverlay").classList.add("hidden");
  document.body.style.overflow = "";
}

/* ---------------- Wire-up ---------------- */

function init() {
  bindEditorFields();
  bindSettings();

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;
      if (tab.dataset.view === "editor" && !currentId) return;
      show(tab.dataset.view);
    });
  });

  $("#btnNewEstimate").addEventListener("click", () => openEstimate(newEstimate().id));
  $("#btnBackToList").addEventListener("click", () => show("list"));
  $("#btnEditBusiness").addEventListener("click", () => show("settings"));

  $("#btnAddItem").addEventListener("click", () => {
    const est = getEstimate(currentId);
    if (!est) return;
    est.items.push(blankItem());
    touch(); renderItems(est); updateTotals();
    const cards = document.querySelectorAll("#itemsWrap .item-card");
    cards[cards.length - 1]?.querySelector(".it-desc")?.focus();
  });

  $("#btnDeleteEstimate").addEventListener("click", () => {
    const est = getEstimate(currentId);
    if (!est) return;
    if (!confirm(`Delete ${est.number}? This cannot be undone.`)) return;
    state.estimates = state.estimates.filter(e => e.id !== currentId);
    currentId = null;
    $("#tabEditor").disabled = true;
    save();
    show("list");
  });

  $("#btnPreview").addEventListener("click", openPreview);
  $("#btnClosePreview").addEventListener("click", closePreview);
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnShare").addEventListener("click", sharePdf);
  $("#btnShareFromPreview").addEventListener("click", sharePdf);

  $("#btnConvert").addEventListener("click", () => {
    const est = getEstimate(currentId);
    if (!est || est.type === "invoice") return;
    if (!confirm(`Convert ${est.number} to an invoice? It will get an invoice number (the estimate number is kept as a reference).`)) return;
    est.estimateRef = est.number;
    est.number = "INV-" + String(state.nextInvoiceNumber).padStart(4, "0");
    state.nextInvoiceNumber++;
    est.type = "invoice";
    est.date = new Date().toISOString().slice(0, 10);
    if (!est.dueDate) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      est.dueDate = d.toISOString().slice(0, 10);
    }
    est.updated = Date.now();
    save();
    openEstimate(est.id);
  });

  $("#btnTogglePaid").addEventListener("click", () => {
    const est = getEstimate(currentId);
    if (!est || est.type !== "invoice") return;
    est.paid = !est.paid;
    est.updated = Date.now();
    save();
    syncTypeUI(est);
  });

  show("list");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err =>
      console.warn("Service worker registration failed:", err));
  }
}

document.addEventListener("DOMContentLoaded", init);
})();
