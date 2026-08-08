// ===================== CONFIG =====================
const WHATSAPP_NUMBER = "5583988944480";
const ADMIN_PASSWORD = "uniao2026";
const MASTER_WHATSAPP_DIGITS = "5583988944480";

const ACCESS_CODE = "UQPARCEIRO2026";
const LICENSE_PRICE = 9.90;
const PIX_KEY = "+5583996374249";
const PIX_KEY_TYPE = "telefone";
const PIX_NAME = "RODRIGO PINTO";
const PIX_CITY = "CAMPINA GRANDE";

const MIN_PRODUTOS_PEDIDO = 20;

// ===================== STATE =====================
let state = {
  view: "login",
  client: null,
  cart: {},
  search: "",
  linhaFiltro: "Todas",
  categoriaFiltro: "Todas",
  modalProduct: null,
  cartOpen: false,
  lastOrder: null,
  adminOrders: null,
  adminReps: null,
  adminError: "",
  loginError: "",
  loading: false,
  repIdFromLink: currentRepFromURLSafe(),
  activeRep: null,
  isMaster: false,
  pendingRep: null,
  repRegError: "",
  repLoginError: "",
};

function currentRepFromURLSafe() {
  try { return currentRepFromURL(); } catch (e) { return null; }
}

const root = document.getElementById("app");

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function priceForQty(pres, qty) {
  if (pres.preco_1_6 == null) return null;
  if (qty <= 6) return pres.preco_1_6;
  if (qty <= 12) return pres.preco_7_12;
  return pres.preco_13_24;
}

function cartCount() {
  return Object.values(state.cart).reduce((a, i) => a + i.quantidade, 0);
}

function distinctProductCount() {
  return Object.keys(state.cart).length;
}

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

function money(v) {
  return "R$ " + (v || 0).toFixed(2).replace(".", ",");
}

function formatCNPJ(digits) {
  const d = onlyDigits(digits).slice(0, 14);
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (d.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (d.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
}

function showToast(message, icon = "✓") {
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast-modern";
  el.innerHTML = `<span style="color: var(--uq-green); font-weight:800;">${icon}</span> <span>${esc(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    el.style.transition = 'all 0.2s ease';
    setTimeout(() => el.remove(), 200);
  }, 2000);
}

// ===================== PIX GENERATOR =====================
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id, value) {
  return id + String(value.length).padStart(2, "0") + value;
}

function buildPixPayload(key, amount, name, city, txid) {
  name = (name || "").substring(0, 25);
  city = (city || "").substring(0, 15);
  txid = (txid || "***").substring(0, 25);
  const mai = tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key));
  const amt = amount ? tlv("54", amount.toFixed(2)) : "";
  let payload =
    tlv("00", "01") + mai + tlv("52", "0000") + tlv("53", "986") + amt +
    tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid)) + "6304";
  return payload + crc16(payload);
}

// ===================== STORAGE HELPERS =====================
async function saveRep(whatsappDigits, data) {
  try { localStorage.setItem(`representante:${whatsappDigits}`, JSON.stringify(data)); } catch (e) {}
}

async function loadRep(whatsappDigits) {
  try {
    const r = localStorage.getItem(`representante:${whatsappDigits}`);
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}

async function listAllReps() {
  const reps = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("representante:")) {
        reps.push(JSON.parse(localStorage.getItem(k)));
      }
    }
  } catch (e) {}
  reps.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return reps;
}

function currentRepFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("rep") || null;
}

async function saveClient(cnpj, data) {
  try { localStorage.setItem(`cliente:${cnpj}`, JSON.stringify(data)); } catch (e) {}
}

async function saveOrder(order) {
  const key = `pedido:${order.timestamp}_${order.cnpj}`;
  try { localStorage.setItem(key, JSON.stringify(order)); } catch (e) {}
  return key;
}

async function listAllOrders() {
  const orders = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("pedido:")) {
        orders.push(JSON.parse(localStorage.getItem(k)));
      }
    }
  } catch (e) {}
  orders.sort((a, b) => b.timestamp - a.timestamp);
  return orders;
}

// ===================== DERIVED DATA =====================
function getCategorias() {
  const set = new Set();
  PRODUCTS.forEach((p) => {
    if (state.linhaFiltro === "Todas" || p.linha === state.linhaFiltro) set.add(p.categoria);
  });
  return ["Todas", ...Array.from(set).sort()];
}

function getFilteredProducts() {
  const q = state.search.trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (state.linhaFiltro !== "Todas" && p.linha !== state.linhaFiltro) return false;
    if (state.categoriaFiltro !== "Todas" && p.categoria !== state.categoriaFiltro) return false;
    if (q) {
      const hay = (p.nome + " " + p.principio_ativo + " " + p.categoria).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function linhaCounts() {
  const c = { Todas: PRODUCTS.length, OTC: 0, Genéricos: 0, Marcas: 0 };
  PRODUCTS.forEach((p) => { c[p.linha] = (c[p.linha] || 0) + 1; });
  return c;
}

// ===================== RENDER COMPONENTS =====================
function renderTopbar() {
  const dpc = distinctProductCount();
  const progressPct = Math.min(100, (dpc / MIN_PRODUTOS_PEDIDO) * 100);

  return `
  <header class="topbar">
    <div class="brand-badge">
      <div class="mark">UQ</div>
      <div class="title">
        <b>PORTAL RODRIGO UQ</b>
        <span>União Química · Catálogo & Pedidos</span>
      </div>
    </div>
    
    <div class="topbar-right">
      ${state.client ? `
        <div class="min-order-tracker">
          <span>Pedido Mínimo: <b>${dpc}/${MIN_PRODUTOS_PEDIDO}</b> prods</span>
          <div class="tracker-bar">
            <div class="tracker-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>
        <div class="pill">🏪 ${esc(state.client.razaoSocial)}</div>
      ` : ""}
      
      <button class="cart-btn" onclick="openCart()">
        🛒 Pedido ${cartCount() > 0 ? `<span class="cart-badge">${cartCount()}</span>` : ""}
      </button>
    </div>
  </header>`;
}

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-badge">UQ</div>
      <div class="login-eyebrow">Acesso do cliente</div>
      <h1 class="login-title">Bem-vindo(a)</h1>
      <p class="login-sub">Consulte todo o portfólio Farma e Genéricos da União Química e monte seu pedido direto pelo celular ou computador.</p>
      ${state.loginError ? `<div class="error-msg">${esc(state.loginError)}</div>` : ""}
      <div class="field">
        <label>Razão Social (login)</label>
        <input id="inp-razao" type="text" placeholder="Ex: Farmácia Boa Saúde LTDA" value="${esc(state.tmpRazao || "")}">
      </div>
      <div class="field">
        <label>CNPJ (senha)</label>
        <input id="inp-cnpj" type="text" placeholder="00.000.000/0000-00" value="${esc(state.tmpCnpj || "")}" maxlength="18">
        <div class="hint">Usamos seu CNPJ só para identificar seus pedidos.</div>
      </div>
      <button class="btn-primary" onclick="handleLogin()">Entrar no catálogo →</button>
      <button class="admin-link" onclick="setState({view:'admin-login', adminError:''})">Sou representante da União Química</button>
    </div>
  </div>`;
}

function bindLoginInputs() {
  const r = document.getElementById("inp-razao");
  const c = document.getElementById("inp-cnpj");
  if (r) r.addEventListener("input", (e) => { state.tmpRazao = e.target.value; });
  if (c) c.addEventListener("input", (e) => {
    e.target.value = formatCNPJ(e.target.value);
    state.tmpCnpj = e.target.value;
  });
}

async function resolveOrderRep() {
  const repId = state.repIdFromLink;
  if (repId) {
    const rep = await loadRep(repId);
    if (rep && rep.status === "ativo") {
      return { orderRepId: repId, orderRepWhatsapp: rep.whatsapp, orderRepNome: rep.nome };
    }
  }
  return { orderRepId: "rodrigo", orderRepWhatsapp: WHATSAPP_NUMBER, orderRepNome: "Rodrigo" };
}

async function handleLogin() {
  const razao = (state.tmpRazao || "").trim();
  const cnpjDigits = onlyDigits(state.tmpCnpj || "");
  if (razao.length < 3) return setState({ loginError: "Digite a razão social completa da sua loja." });
  if (cnpjDigits.length !== 14) return setState({ loginError: "CNPJ inválido. Digite os 14 números do CNPJ." });
  const client = { razaoSocial: razao, cnpj: cnpjDigits, ultimoAcesso: Date.now() };
  await saveClient(cnpjDigits, client);
  const repInfo = await resolveOrderRep();
  setState({ client, view: "catalog", loginError: "", ...repInfo });
}

function renderCard(p) {
  const initials = p.nome.trim().split(/\s+/).slice(0,2).map((w) => w[0]).join("").toUpperCase();
  const photo = p.foto
    ? `<img src="${p.foto}" alt="${esc(p.nome)}" loading="lazy">`
    : `<div class="noimg">${esc(initials)}</div>`;
  const isSingle = p.apresentacoes.length === 1;
  const key = p.id + "|0";
  const inCartQty = isSingle && state.cart[key] ? state.cart[key].quantidade : 0;
  return `
  <article class="card">
    <div class="card-photo">
      <span class="card-line ${p.linha === 'Genéricos' ? 'Genéricos' : p.linha}">${esc(p.linha)}</span>
      ${photo}
    </div>
    <div class="card-body">
      <div class="card-cat">${esc(p.categoria)}</div>
      <h3 class="card-name">${esc(p.nome)}</h3>
      <div class="card-active">${esc(p.principio_ativo)}</div>
      ${p.selos && p.selos.length ? `<div class="selos-row">${p.selos.slice(0,3).map((s) => `<span class="selo-chip">${esc(s)}</span>`).join("")}</div>` : ""}
      <ul class="card-bullets">
        ${p.beneficios.slice(0, 2).map((b) => `<li>${esc(b)}</li>`).join("")}
      </ul>
      <div class="card-foot">
        <button class="btn-detail" onclick="openProduct('${p.id}')">Apresentações (${p.apresentacoes.length})</button>
        ${isSingle ? `<button class="btn-quick-add ${inCartQty ? "added" : ""}" onclick="quickAdd('${p.id}')" title="Adicionar rápido">${inCartQty ? inCartQty : "+"}</button>` : ""}
      </div>
    </div>
  </article>`;
}

function quickAdd(productId) {
  const p = PRODUCTS.find((x) => x.id === productId);
  const key = productId + "|0";
  const cart = { ...state.cart };
  const existing = cart[key];
  const pres = p.apresentacoes[0];
  cart[key] = {
    productId, presIndex: 0,
    nome: p.nome, categoria: p.categoria,
    apresentacao: pres.apresentacao, codigo: pres.codigo,
    preco_1_6: pres.preco_1_6, preco_7_12: pres.preco_7_12, preco_13_24: pres.preco_13_24,
    quantidade: (existing ? existing.quantidade : 0) + 1,
  };
  setState({ cart });
  showToast(`${p.nome} adicionado ao pedido`);
}

function renderFeatured() {
  const withPhoto = PRODUCTS.filter((p) => p.foto);
  if (withPhoto.length < 3) return "";
  const picks = [withPhoto[0], withPhoto[Math.floor(withPhoto.length / 3)], withPhoto[Math.floor(withPhoto.length * 2 / 3)]];
  return `
  <div class="featured-row">
    ${picks.map((p, i) => `
      <div class="featured-card ${i === 0 ? "big" : ""}" onclick="openProduct('${p.id}')">
        <img src="${p.foto}" alt="${esc(p.nome)}">
        <div class="fc-overlay">
          <div class="fc-tag">${esc(p.linha)} · Destaque</div>
          <div class="fc-name">${esc(p.nome)}</div>
        </div>
      </div>`).join("")}
  </div>`;
}

function renderCatalog() {
  const products = getFilteredProducts();
  const counts = linhaCounts();
  const cats = getCategorias();
  return `
  <div class="catalog-wrap">
    <div class="wix-hero">
      <div class="wix-hero-eyebrow">União Química · Farmacêutica Nacional</div>
      <h1>Seu catálogo,<br>seu pedido, sem complicação.</h1>
      <p>Consulte o portfólio completo Farma OTC, Marcas e Genéricos e monte seu pedido em minutos — direto do celular ou computador.</p>
      <div class="wix-hero-stats">
        <div class="stat"><b>${PRODUCTS.length}</b><span>Produtos</span></div>
        <div class="stat"><b>${PRODUCTS.filter((p) => p.linha === "OTC").length}</b><span>Linha OTC</span></div>
        <div class="stat"><b>${PRODUCTS.filter((p) => p.linha === "Genéricos").length}</b><span>Genéricos</span></div>
      </div>
    </div>
    ${renderFeatured()}
    <div class="tabs">
      ${["Todas", "OTC", "Marcas", "Genéricos"].map((l) => `
        <button class="tab ${state.linhaFiltro === l ? "active" : ""}" onclick="setFiltroLinha('${l}')">
          ${l} <span class="n">(${counts[l] || 0})</span>
        </button>`).join("")}
    </div>
    <div class="search-row">
      <div class="search-box">
        <span class="ic">🔍</span>
        <input type="text" placeholder="Buscar por nome, princípio ativo ou categoria..." value="${esc(state.search)}" oninput="setState({search:this.value})">
      </div>
      <select class="cat-select" onchange="setState({categoriaFiltro:this.value})">
        ${cats.map((c) => `<option value="${esc(c)}" ${state.categoriaFiltro === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
      </select>
    </div>
    ${products.length === 0
      ? `<div class="empty-state"><div class="big">🔎</div>Nenhum produto encontrado.<br>Tente outra busca ou categoria.</div>`
      : `<div class="grid">${products.map(renderCard).join("")}</div>`}
  </div>`;
}

function setFiltroLinha(l) {
  setState({ linhaFiltro: l, categoriaFiltro: "Todas" });
}

// ===================== PRODUCT MODAL =====================
function openProduct(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  setState({ modalProduct: p, modalQty: p.apresentacoes.map(() => 1) });
}

function closeProduct() { setState({ modalProduct: null }); }

function renderProductModal() {
  const p = state.modalProduct;
  if (!p) return "";
  const modalInitials = p.nome.trim().split(/\s+/).slice(0,2).map((w) => w[0]).join("").toUpperCase();
  const photo = p.foto ? `<img src="${p.foto}" alt="${esc(p.nome)}">` : `<div class="noimg" style="width:88px;height:88px;font-size:30px;">${esc(modalInitials)}</div>`;
  return `
  <div class="overlay" onclick="if(event.target===this) closeProduct()">
    <div class="modal">
      <div class="modal-photo">
        ${photo}
        <button class="modal-close" onclick="closeProduct()">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-cat">${esc(p.categoria)} · ${esc(p.linha)}</div>
        <h2 class="modal-name">${esc(p.nome)}</h2>
        <div class="modal-active">${esc(p.principio_ativo)}</div>
        ${p.selos && p.selos.length ? `<div class="selos-row" style="margin-bottom:12px;">${p.selos.map((s) => `<span class="selo-chip">${esc(s)}</span>`).join("")}</div>` : ""}
        <ul class="modal-bullets">
          ${p.beneficios.map((b) => `<li>${esc(b)}</li>`).join("")}
        </ul>
        <div class="pres-title">Apresentações disponíveis</div>
        ${p.apresentacoes.map((a, i) => {
          const cartKey = p.id + "|" + i;
          const inCart = state.cart[cartKey];
          const qty = state.modalQty ? state.modalQty[i] : 1;
          return `
          <div class="pres-item">
            <div>
              <div class="pres-name">${esc(a.apresentacao)}</div>
              <div class="pres-meta mono">Cód: ${esc(a.codigo)} · EAN: ${esc(a.ean13)}</div>
              <div class="pres-price">
                ${a.pf != null ? `PF: <b>${money(a.pf)}</b>` : `PF: <i>sob consulta</i>`}
                ${a.pmc != null ? ` &nbsp;·&nbsp; PMC: <b>${money(a.pmc)}</b>` : ""}
              </div>
              ${a.preco_1_6 != null ? `
              <div class="pres-tiers">
                <div class="tier"><span>1-6 un.</span><b>${money(a.preco_1_6)}</b></div>
                <div class="tier"><span>7-12 un.</span><b>${money(a.preco_7_12)}</b></div>
                <div class="tier"><span>13+ un.</span><b>${money(a.preco_13_24)}</b></div>
              </div>` : `<div class="pres-price"><i>Preço de venda sob consulta</i></div>`}
              ${a.bula_url ? `<a class="pres-bula" href="${esc(a.bula_url)}" target="_blank" rel="noopener">📄 Ver bula (ANVISA)</a>` : ""}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <div class="qty-row">
                <button class="qty-btn" onclick="changeModalQty(${i},-1)">−</button>
                <span class="qty-val">${qty}</span>
                <button class="qty-btn" onclick="changeModalQty(${i},1)">+</button>
              </div>
              <button class="btn-add ${inCart ? "added" : ""}" onclick="addToCart('${p.id}',${i})">
                ${inCart ? `No pedido (${inCart.quantidade})` : "Adicionar"}
              </button>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  </div>`;
}

function changeModalQty(i, delta) {
  const q = [...state.modalQty];
  q[i] = Math.max(1, (q[i] || 1) + delta);
  state.modalQty = q;
  render();
}

function addToCart(productId, presIndex) {
  const p = PRODUCTS.find((x) => x.id === productId);
  const pres = p.apresentacoes[presIndex];
  const key = productId + "|" + presIndex;
  const qty = (state.modalQty && state.modalQty[presIndex]) || 1;
  const cart = { ...state.cart };
  const existing = cart[key];
  cart[key] = {
    productId, presIndex,
    nome: p.nome, categoria: p.categoria,
    apresentacao: pres.apresentacao, codigo: pres.codigo,
    preco_1_6: pres.preco_1_6, preco_7_12: pres.preco_7_12, preco_13_24: pres.preco_13_24,
    quantidade: (existing ? existing.quantidade : 0) + qty,
  };
  setState({ cart });
  showToast(`${p.nome} adicionado ao pedido`);
}

// ===================== CART DRAWER =====================
function openCart() { setState({ cartOpen: true }); }
function closeCart() { setState({ cartOpen: false }); }

function removeFromCart(key) {
  const cart = { ...state.cart };
  delete cart[key];
  setState({ cart });
}

function changeCartQty(key, delta) {
  const cart = { ...state.cart };
  if (!cart[key]) return;
  const newQty = cart[key].quantidade + delta;
  if (newQty <= 0) { delete cart[key]; }
  else { cart[key] = { ...cart[key], quantidade: newQty }; }
  setState({ cart });
}

function cartTotal() {
  return Object.values(state.cart).reduce((sum, item) => {
    const price = priceForQty(item, item.quantidade);
    return sum + (price != null ? price * item.quantidade : 0);
  }, 0);
}

function renderCartDrawer() {
  if (!state.cartOpen) return "";
  const items = Object.entries(state.cart);
  const dpc = distinctProductCount();
  return `
  <div class="cart-overlay" onclick="if(event.target===this) closeCart()">
    <div class="cart-drawer">
      <div class="cart-head">
        <h2>Seu Pedido</h2>
        <button class="cart-close" onclick="closeCart()">✕</button>
      </div>
      <div class="cart-items">
        ${state.client ? `<div class="client-box">🏪 <b>${esc(state.client.razaoSocial)}</b><br>CNPJ: ${formatCNPJ(state.client.cnpj)}</div>` : ""}
        ${items.length === 0
          ? `<div class="cart-empty">🛒<br><br>Seu carrinho está vazio.<br>Explore o catálogo e adicione produtos.</div>`
          : items.map(([key, item]) => {
              const unitPrice = priceForQty(item, item.quantidade);
              const subtotal = unitPrice != null ? unitPrice * item.quantidade : null;
              return `
            <div class="cart-item">
              <div class="ci-top">
                <div>
                  <div class="ci-name">${esc(item.nome)}</div>
                  <div class="ci-pres">${esc(item.apresentacao)}</div>
                </div>
                <button class="ci-remove" onclick="removeFromCart('${key}')">remover</button>
              </div>
              <div class="ci-bottom">
                <div class="qty-row">
                  <button class="qty-btn" onclick="changeCartQty('${key}',-1)">−</button>
                  <span class="qty-val">${item.quantidade}</span>
                  <button class="qty-btn" onclick="changeCartQty('${key}',1)">+</button>
                </div>
                <div style="text-align:right;">
                  ${unitPrice != null ? `${money(unitPrice)} un. · <b>${money(subtotal)}</b>` : `<i>preço sob consulta</i>`}
                </div>
              </div>
            </div>`;
            }).join("")}
      </div>
      ${items.length > 0 ? `
      <div class="cart-foot">
        <div class="step-labels"><span class="active">1. Carrinho</span><span>2. Confirmar</span><span>3. Enviar</span></div>
        <div class="steps-row"><div class="step-dot done"></div><div class="step-dot"></div><div class="step-dot"></div></div>
        <div class="cart-summary"><span>Itens no pedido</span><b>${cartCount()} unid. · ${dpc} prod(s) diferentes</b></div>
        <div class="cart-total-row"><span>Total do pedido</span><b>${money(cartTotal())}</b></div>
        ${dpc < MIN_PRODUTOS_PEDIDO ? `
        <div class="min-order-warning">
          ⚠️ Pedido mínimo de <b>${MIN_PRODUTOS_PEDIDO} produtos diferentes</b>.<br>
          Faltam <b>${MIN_PRODUTOS_PEDIDO - dpc}</b> produto(s) (${dpc}/${MIN_PRODUTOS_PEDIDO}).
        </div>
        <button class="btn-primary" disabled style="opacity:.5;cursor:not-allowed;">Finalizar Pedido →</button>
        ` : `
        <button class="btn-primary" onclick="finalizeOrder()" ${state.loading ? "disabled" : ""}>
          ${state.loading ? "Enviando..." : "Finalizar Pedido →"}
        </button>
        `}
      </div>` : ""}
    </div>
  </div>`;
}

// ===================== FINALIZE ORDER =====================
async function finalizeOrder() {
  if (Object.keys(state.cart).length === 0) return;
  if (distinctProductCount() < MIN_PRODUTOS_PEDIDO) {
    showToast(`Faltam ${MIN_PRODUTOS_PEDIDO - distinctProductCount()} produto(s) para o mínimo de ${MIN_PRODUTOS_PEDIDO}.`);
    return;
  }
  setState({ loading: true });
  const timestamp = Date.now();
  const orderNumber = "UQ" + timestamp.toString().slice(-8);
  const order = {
    numero: orderNumber,
    timestamp,
    dataHora: new Date(timestamp).toLocaleString("pt-BR"),
    cnpj: state.client.cnpj,
    razaoSocial: state.client.razaoSocial,
    repId: state.orderRepId || "rodrigo",
    repWhatsapp: state.orderRepWhatsapp || WHATSAPP_NUMBER,
    repNome: state.orderRepNome || "Rodrigo",
    itens: Object.values(state.cart).map((i) => {
      const preco = priceForQty(i, i.quantidade);
      return {
        codigo: i.codigo,
        produto: i.nome,
        apresentacao: i.apresentacao,
        quantidade: i.quantidade,
        precoUnit: preco,
        subtotal: preco != null ? +(preco * i.quantidade).toFixed(2) : null,
      };
    }),
    total: cartTotal(),
  };
  try { await saveOrder(order); } catch (e) { console.error(e); }
  setState({ lastOrder: order, cart: {}, cartOpen: false, view: "confirm", loading: false });
}

function buildWhatsAppText(order) {
  let txt = `*NOVO PEDIDO ${order.numero}*\n`;
  txt += `Cliente: ${order.razaoSocial}\n`;
  txt += `CNPJ: ${formatCNPJ(order.cnpj)}\n`;
  txt += `Data: ${order.dataHora}\n\n`;
  txt += `*Itens:*\n`;
  order.itens.forEach((i) => {
    txt += `• ${i.quantidade}x ${i.apresentacao}${i.subtotal != null ? ` — ${money(i.subtotal)}` : ""}\n`;
  });
  txt += `\n*TOTAL DO PEDIDO: ${money(order.total || 0)}*\n`;
  txt += `\nPedido gerado via Portal de Pedidos União Química.`;
  return txt;
}

function sendWhatsApp() {
  const text = buildWhatsAppText(state.lastOrder);
  const target = state.lastOrder.repWhatsapp || WHATSAPP_NUMBER;
  const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

function downloadOrderXLSX(order) {
  const rows = order.itens.map((i) => ({
    "Pedido": order.numero,
    "Data": order.dataHora,
    "Cliente (Razão Social)": order.razaoSocial,
    "CNPJ": formatCNPJ(order.cnpj),
    "Código": i.codigo,
    "Produto": i.produto,
    "Apresentação": i.apresentacao,
    "Quantidade": i.quantidade,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 34 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido");
  XLSX.writeFile(wb, `Pedido_${order.numero}.xlsx`);
}

function renderConfirm() {
  const o = state.lastOrder;
  if (!o) { setState({ view: "catalog" }); return ""; }
  return `
  <div class="confirm-wrap">
    <div class="confirm-card">
      <div class="step-labels"><span>1. Carrinho</span><span>2. Confirmar</span><span class="active">3. Enviar</span></div>
      <div class="steps-row"><div class="step-dot done"></div><div class="step-dot done"></div><div class="step-dot done"></div></div>
      <div class="confirm-icon">✓</div>
      <h2>Pedido Registrado!</h2>
      <p>Seu pedido foi salvo com sucesso. Baixe a planilha e envie pelo WhatsApp para confirmar com o representante.</p>
      <div class="confirm-num">Pedido Nº ${o.numero}</div>
      <div class="btn-row">
        <button class="btn-xls" onclick='downloadOrderXLSX(${JSON.stringify(o).replace(/'/g, "&apos;")})'>⬇ Baixar planilha (Excel)</button>
        <button class="btn-wa" onclick="sendWhatsApp()">✆ Enviar via WhatsApp</button>
        <button class="btn-ghost" onclick="setState({view:'catalog', lastOrder:null})">Fazer novo pedido</button>
      </div>
    </div>
  </div>`;
}

// ===================== ADMIN / REPRESENTANTES =====================
function renderAdminLogin() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-eyebrow">Área restrita</div>
      <h1 class="login-title">Área do Representante</h1>
      <p class="login-sub">Acesse seu painel de pedidos ou cadastre-se para ter sua própria licença do Portal UQ.</p>
      ${state.adminError ? `<div class="error-msg">${esc(state.adminError)}</div>` : ""}
      <div class="field">
        <label>WhatsApp (com DDD)</label>
        <input id="inp-admin-wpp" type="text" placeholder="83 90000-0000" value="${esc(state.tmpAdminWpp || "")}">
      </div>
      <div class="field">
        <label>Senha</label>
        <input id="inp-admin-pass" type="password" placeholder="Digite sua senha">
      </div>
      <button class="btn-primary" onclick="handleAdminLogin()">Entrar no painel →</button>
      <button class="admin-link" onclick="setState({view:'rep-register', repRegError:''})">Ainda não sou representante — quero me cadastrar</button>
      <button class="admin-link" onclick="setState({view:'login'})">← Voltar para o catálogo</button>
    </div>
  </div>`;
}

function bindAdminInput() {
  const inp = document.getElementById("inp-admin-pass");
  const wpp = document.getElementById("inp-admin-wpp");
  if (wpp) wpp.addEventListener("input", (e) => { state.tmpAdminWpp = e.target.value; });
  if (inp) {
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAdminLogin(); });
    inp.focus();
  }
}

const GRACE_DAYS = 5;

function licenseStatus(rep) {
  if (!rep.validoAte) return { state: "ok", daysLeft: null };
  const daysLeft = Math.ceil((rep.validoAte - Date.now()) / 86400000);
  if (daysLeft > GRACE_DAYS) return { state: "ok", daysLeft };
  if (daysLeft >= -GRACE_DAYS) return { state: "warning", daysLeft };
  return { state: "blocked", daysLeft };
}

async function handleAdminLogin() {
  const wppDigits = onlyDigits(document.getElementById("inp-admin-wpp").value);
  const val = document.getElementById("inp-admin-pass").value;
  const wppFull = wppDigits.length === 11 ? "55" + wppDigits : wppDigits;

  if (wppFull === MASTER_WHATSAPP_DIGITS && val === ADMIN_PASSWORD) {
    setState({ view: "admin", adminError: "", loading: true, isMaster: true, activeRep: null });
    const [orders, reps] = await Promise.all([listAllOrders(), listAllReps()]);
    setState({ adminOrders: orders, adminReps: reps, loading: false });
    return;
  }

  const rep = await loadRep(wppFull);
  if (!rep || rep.senha !== val) {
    return setState({ adminError: "WhatsApp ou senha incorretos." });
  }
  if (rep.status === "pendente_pagamento" || rep.status === "pendente_aprovacao" || rep.status === "pendente_renovacao") {
    return setState({ adminError: "Seu cadastro/renovação ainda está aguardando aprovação do Rodrigo após a confirmação do PIX." });
  }
  if (rep.status !== "ativo") {
    return setState({ adminError: "Seu acesso não está ativo. Fale com o Rodrigo." });
  }

  const lic = licenseStatus(rep);
  if (lic.state === "blocked") {
    return setState({ view: "rep-expired", activeRep: rep, adminError: "" });
  }
  setState({ view: "rep-admin", adminError: "", loading: true, isMaster: false, activeRep: rep, licenseWarning: lic.state === "warning" ? lic.daysLeft : null });
  const orders = await listAllOrders();
  const mine = orders.filter((o) => o.repId === wppFull);
  setState({ adminOrders: mine, loading: false });
}

function toggleOrderDetail(idx) {
  state.expandedOrder = state.expandedOrder === idx ? null : idx;
  render();
}

function exportAllOrdersXLSX() {
  const orders = state.adminOrders || [];
  const rows = [];
  orders.forEach((o) => {
    o.itens.forEach((i) => {
      rows.push({
        "Pedido": o.numero,
        "Data": o.dataHora,
        "Cliente (Razão Social)": o.razaoSocial,
        "CNPJ": formatCNPJ(o.cnpj),
        "Representante": o.repNome || "Rodrigo",
        "Código": i.codigo,
        "Produto": i.produto,
        "Apresentação": i.apresentacao,
        "Quantidade": i.quantidade,
      });
    });
  });
  if (rows.length === 0) { alert("Não há pedidos para exportar ainda."); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 34 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
  XLSX.writeFile(wb, `Todos_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function renderRepRegister() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-eyebrow">Nova licença</div>
      <h1 class="login-title">Seja um Representante UQ</h1>
      <p class="login-sub">Tenha seu próprio Portal de Pedidos para atender suas farmácias com pedidos chegando direto no seu WhatsApp.</p>
      ${state.repRegError ? `<div class="error-msg">${esc(state.repRegError)}</div>` : ""}
      <div class="field"><label>Nome completo</label>
        <input id="inp-rep-nome" type="text" placeholder="Seu nome" value="${esc(state.tmpRepNome || "")}"></div>
      <div class="field"><label>WhatsApp (com DDD)</label>
        <input id="inp-rep-wpp" type="text" placeholder="83 90000-0000" value="${esc(state.tmpRepWpp || "")}"></div>
      <div class="field"><label>Crie uma senha</label>
        <input id="inp-rep-senha" type="password" placeholder="Mínimo 4 caracteres"></div>
      <div class="field"><label>Código de acesso</label>
        <input id="inp-rep-codigo" type="text" placeholder="Código fornecido pelo Rodrigo"></div>
      <button class="btn-primary" onclick="handleRepRegister()">Continuar para pagamento →</button>
      <button class="admin-link" onclick="setState({view:'admin-login', adminError:''})">← Já tenho cadastro</button>
    </div>
  </div>`;
}

async function handleRepRegister() {
  const nome = (document.getElementById("inp-rep-nome").value || "").trim();
  const wppDigits = onlyDigits(document.getElementById("inp-rep-wpp").value);
  const senha = document.getElementById("inp-rep-senha").value;
  const codigo = (document.getElementById("inp-rep-codigo").value || "").trim();
  state.tmpRepNome = nome; state.tmpRepWpp = document.getElementById("inp-rep-wpp").value;

  if (nome.length < 3) return setState({ repRegError: "Digite seu nome completo." });
  if (wppDigits.length !== 11) return setState({ repRegError: "WhatsApp inválido. Digite DDD + número (11 dígitos)." });
  if (senha.length < 4) return setState({ repRegError: "A senha precisa ter pelo menos 4 caracteres." });
  if (codigo !== ACCESS_CODE) return setState({ repRegError: "Código de acesso incorreto." });

  const wppFull = "55" + wppDigits;
  const existing = await loadRep(wppFull);
  if (existing && existing.status === "ativo") {
    return setState({ repRegError: "Esse WhatsApp já tem uma licença ativa. Faça login." });
  }
  const rep = {
    nome, whatsapp: wppFull, senha,
    status: "pendente_pagamento",
    criadoEm: Date.now(),
    aprovadoEm: null,
    validoAte: null,
  };
  await saveRep(wppFull, rep);
  setState({ pendingRep: rep, view: "rep-payment", repRegError: "" });
}

function renderRepPayment() {
  const rep = state.pendingRep;
  if (!rep) { setState({ view: "admin-login" }); return ""; }
  const isRenewal = rep.status === "pendente_renovacao";
  const payload = buildPixPayload(PIX_KEY, LICENSE_PRICE, PIX_NAME, PIX_CITY, "LICENCAUQ");
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-eyebrow">${isRenewal ? "Renovação de licença" : `Falta pouco, ${esc(rep.nome.split(" ")[0])}!`}</div>
      <h1 class="login-title">${isRenewal ? "Renove sua licença" : "Pague sua licença mensal"}</h1>
      <p class="login-sub">Escaneie o QR Code ou copie o código PIX abaixo. Assim que o Rodrigo confirmar o recebimento, seu acesso ${isRenewal ? "é renovado por mais 1 mês" : "é liberado"}.</p>
      <div class="pix-price">R$ ${LICENSE_PRICE.toFixed(2).replace(".", ",")} <span>/ mês</span></div>
      <div id="pix-qrcode" class="pix-qr"></div>
      <div class="field">
        <label>PIX Copia e Cola</label>
        <textarea id="pix-payload" readonly rows="3">${payload}</textarea>
      </div>
      <button class="btn-primary" onclick="copyPixCode()">📋 Copiar código PIX</button>
      <div class="client-box" style="margin-top:14px;">
        ⏳ Após pagar, seu cadastro fica <b>aguardando aprovação</b>. O Rodrigo confirma o recebimento e libera seu acesso.
      </div>
      <button class="admin-link" onclick="setState({view:'admin-login', pendingRep:null})">Já paguei / voltar depois</button>
    </div>
  </div>`;
}

function copyPixCode() {
  const el = document.getElementById("pix-payload");
  el.select();
  document.execCommand("copy");
  showToast("Código PIX copiado!");
}

function renderPixQR() {
  const holder = document.getElementById("pix-qrcode");
  if (!holder || !state.pendingRep) return;
  try {
    const payload = buildPixPayload(PIX_KEY, LICENSE_PRICE, PIX_NAME, PIX_CITY, "LICENCAUQ");
    holder.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--uq-ink-soft);text-align:center;">Código PIX gerado com sucesso. Use o código copia e cola abaixo.</div>`;
  } catch (e) {
    console.error("QR Error", e);
  }
}

async function approveRep(whatsapp) {
  const rep = await loadRep(whatsapp);
  if (!rep) return;
  const now = Date.now();
  rep.status = "ativo";
  rep.aprovadoEm = now;
  rep.validoAte = now + 30 * 24 * 60 * 60 * 1000;
  await saveRep(whatsapp, rep);
  showToast(`${rep.nome} aprovado!`);
  const reps = await listAllReps();
  setState({ adminReps: reps });
}

function renderAdmin() {
  const orders = state.adminOrders || [];
  const reps = state.adminReps || [];
  const totalItens = orders.reduce((a, o) => a + o.itens.reduce((x, i) => x + i.quantidade, 0), 0);
  const clientesUnicos = new Set(orders.map((o) => o.cnpj)).size;
  const pendentes = reps.filter((r) => r.status === "pendente_pagamento" || r.status === "pendente_aprovacao" || r.status === "pendente_renovacao");
  const ativos = reps.filter((r) => r.status === "ativo");
  const tab = state.adminTab || "pedidos";
  return `
  <div class="admin-wrap">
    <button class="btn-back" onclick="setState({view:'login'})">← Sair do painel</button>
    <div class="admin-head">
      <h1>Painel Master</h1>
      ${tab === "pedidos" ? `<button class="btn-export" onclick="exportAllOrdersXLSX()">⬇ Exportar todos (Excel)</button>` : ""}
    </div>
    <div class="tabs" style="margin-bottom:18px;">
      <button class="tab ${tab === "pedidos" ? "active" : ""}" onclick="setState({adminTab:'pedidos'})">Pedidos</button>
      <button class="tab ${tab === "reps" ? "active" : ""}" onclick="setState({adminTab:'reps'})">Representantes ${pendentes.length ? `<span class="n">(${pendentes.length} pendente)</span>` : ""}</button>
    </div>
    ${tab === "pedidos" ? `
      <div class="admin-stats">
        <div class="stat-card"><div class="num">${orders.length}</div><div class="lbl">Pedidos recebidos</div></div>
        <div class="stat-card"><div class="num">${totalItens}</div><div class="lbl">Unidades pedidas</div></div>
        <div class="stat-card"><div class="num">${clientesUnicos}</div><div class="lbl">Clientes únicos</div></div>
      </div>
      ${state.loading ? `<div class="loading">Carregando pedidos...</div>` :
        orders.length === 0 ? `<div class="empty-state"><div class="big">📭</div>Nenhum pedido recebido ainda.</div>` :
        orders.map((o, idx) => `
          <div class="order-row" onclick="toggleOrderDetail(${idx})">
            <div class="order-row-top">
              <span class="num">#${esc(o.numero)}</span>
              <span class="date">${esc(o.dataHora)}</span>
            </div>
            <div class="order-row-client">${esc(o.razaoSocial)}</div>
            <div class="order-row-meta">CNPJ ${formatCNPJ(o.cnpj)} · ${o.itens.length} produto(s) · rep: ${esc(o.repNome || "Rodrigo")}</div>
            ${state.expandedOrder === idx ? `
              <div class="order-detail">
                ${o.itens.map((i) => `<div class="order-detail-item"><span>${esc(i.quantidade)}x ${esc(i.produto)} — ${esc(i.apresentacao)}</span></div>`).join("")}
              </div>` : ""}
          </div>`).join("")}
    ` : `
      ${state.loading ? `<div class="loading">Carregando representantes...</div>` : `
        ${pendentes.length > 0 ? `
          <div class="pres-title">Aguardando aprovação (${pendentes.length})</div>
          ${pendentes.map((r) => `
            <div class="order-row">
              <div class="order-row-top"><span class="num">${esc(r.nome)}</span><span class="date">${new Date(r.criadoEm).toLocaleDateString("pt-BR")}</span></div>
              <div class="order-row-meta">WhatsApp: ${esc(r.whatsapp)}</div>
              <div style="margin-top:10px;"><button class="btn-export" onclick="approveRep('${r.whatsapp}')">✓ Aprovar (confirmei o PIX)</button></div>
            </div>`).join("")}
        ` : ""}
        <div class="pres-title" style="margin-top:20px;">Representantes ativos (${ativos.length})</div>
        ${ativos.length === 0 ? `<div class="empty-state"><div class="big">🧑‍💼</div>Nenhum representante ativo ainda.</div>` :
          ativos.map((r) => `
            <div class="order-row">
              <div class="order-row-top"><span class="num">${esc(r.nome)}</span><span class="date">até ${new Date(r.validoAte).toLocaleDateString("pt-BR")}</span></div>
              <div class="order-row-meta">WhatsApp: ${esc(r.whatsapp)} · Link: ${esc(location.origin + location.pathname)}?rep=${esc(r.whatsapp)}</div>
            </div>`).join("")}
      `}
    `}
  </div>`;
}

function renderRepAdmin() {
  const rep = state.activeRep;
  const orders = state.adminOrders || [];
  const totalItens = orders.reduce((a, o) => a + o.itens.reduce((x, i) => x + i.quantidade, 0), 0);
  const clientesUnicos = new Set(orders.map((o) => o.cnpj)).size;
  const link = `${location.origin}${location.pathname}?rep=${rep.whatsapp}`;
  return `
  <div class="admin-wrap">
    <button class="btn-back" onclick="setState({view:'login'})">← Sair do painel</button>
    <div class="admin-head">
      <h1>Meu Painel</h1>
      <button class="btn-export" onclick="exportAllOrdersXLSX()">⬇ Exportar meus pedidos</button>
    </div>
    <div class="client-box" style="margin-bottom:18px;">
      🔗 Seu link exclusivo para compartilhar com farmácias:<br>
      <b style="word-break:break-all;">${esc(link)}</b>
      <div style="margin-top:8px;"><button class="btn-detail" onclick="navigator.clipboard.writeText('${link}'); showToast('Link copiado!');">Copiar link</button></div>
    </div>
    <div class="admin-stats">
      <div class="stat-card"><div class="num">${orders.length}</div><div class="lbl">Pedidos recebidos</div></div>
      <div class="stat-card"><div class="num">${totalItens}</div><div class="lbl">Unidades pedidas</div></div>
      <div class="stat-card"><div class="num">${clientesUnicos}</div><div class="lbl">Clientes únicos</div></div>
    </div>
    ${state.loading ? `<div class="loading">Carregando pedidos...</div>` :
      orders.length === 0 ? `<div class="empty-state"><div class="big">📭</div>Nenhum pedido recebido ainda. Compartilhe seu link!</div>` :
      orders.map((o, idx) => `
        <div class="order-row" onclick="toggleOrderDetail(${idx})">
          <div class="order-row-top">
            <span class="num">#${esc(o.numero)}</span>
            <span class="date">${esc(o.dataHora)}</span>
          </div>
          <div class="order-row-client">${esc(o.razaoSocial)}</div>
          <div class="order-row-meta">CNPJ ${formatCNPJ(o.cnpj)} · ${o.itens.length} produto(s)</div>
          ${state.expandedOrder === idx ? `
            <div class="order-detail">
              ${o.itens.map((i) => `<div class="order-detail-item"><span>${esc(i.quantidade)}x ${esc(i.produto)} — ${esc(i.apresentacao)}</span></div>`).join("")}
            </div>` : ""}
        </div>`).join("")}
  </div>`;
}

function renderStickyCartBar() {
  if (state.view !== "catalog" || state.cartOpen || cartCount() === 0) return "";
  const dpc = distinctProductCount();
  return `
  <div class="sticky-cart-bar">
    <div class="info"><b>${cartCount()} unid.</b> · ${dpc} prod(s)${dpc < MIN_PRODUTOS_PEDIDO ? ` · <span style="color:#ffce6b;">faltam ${MIN_PRODUTOS_PEDIDO - dpc}</span>` : ""}</div>
    <button onclick="openCart()">Ver pedido →</button>
  </div>`;
}

// ===================== MAIN RENDER =====================
function render() {
  const modalEl = root.querySelector(".modal");
  const modalScroll = modalEl ? modalEl.scrollTop : null;
  const cartItemsEl = root.querySelector(".cart-items");
  const cartScroll = cartItemsEl ? cartItemsEl.scrollTop : null;

  let html = "";
  if (state.view === "login") html = renderLogin();
  else if (state.view === "admin-login") html = renderAdminLogin();
  else if (state.view === "rep-register") html = renderRepRegister();
  else if (state.view === "rep-payment") html = renderRepPayment();
  else if (state.view === "admin") html = renderTopbarAdmin() + renderAdmin();
  else if (state.view === "rep-admin") html = renderTopbarAdmin() + renderRepAdmin();
  else if (state.view === "catalog") html = renderTopbar() + renderCatalog();
  else if (state.view === "confirm") html = renderTopbar() + renderConfirm();

  root.innerHTML = html + renderProductModal() + renderCartDrawer() + renderStickyCartBar();

  if (modalScroll != null) {
    const newModalEl = root.querySelector(".modal");
    if (newModalEl) newModalEl.scrollTop = modalScroll;
  }
  if (cartScroll != null) {
    const newCartItemsEl = root.querySelector(".cart-items");
    if (newCartItemsEl) newCartItemsEl.scrollTop = cartScroll;
  }

  if (state.view === "login") bindLoginInputs();
  if (state.view === "admin-login") bindAdminInput();
  if (state.view === "rep-payment") renderPixQR();
}

function renderTopbarAdmin() {
  return `
  <header class="topbar">
    <div class="brand-badge">
      <div class="mark">UQ</div>
      <div class="title"><b>PORTAL RODRIGO UQ</b><span>Painel do Representante</span></div>
    </div>
  </header>`;
}

// Window Expose
window.setState = setState;
window.handleLogin = handleLogin;
window.setFiltroLinha = setFiltroLinha;
window.openProduct = openProduct;
window.closeProduct = closeProduct;
window.changeModalQty = changeModalQty;
window.addToCart = addToCart;
window.quickAdd = quickAdd;
window.openCart = openCart;
window.closeCart = closeCart;
window.removeFromCart = removeFromCart;
window.changeCartQty = changeCartQty;
window.finalizeOrder = finalizeOrder;
window.sendWhatsApp = sendWhatsApp;
window.downloadOrderXLSX = downloadOrderXLSX;
window.handleAdminLogin = handleAdminLogin;
window.toggleOrderDetail = toggleOrderDetail;
window.exportAllOrdersXLSX = exportAllOrdersXLSX;
window.handleRepRegister = handleRepRegister;
window.copyPixCode = copyPixCode;
window.approveRep = approveRep;
window.showToast = showToast;

render();