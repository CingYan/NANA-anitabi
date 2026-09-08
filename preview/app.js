const map = L.map("map", { zoomControl: false }).setView([35.6815, 139.6917], 6);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const ui = {
  search: document.querySelector("#search"),
  area: document.querySelector("#area-filter"),
  media: document.querySelector("#media-filter"),
  status: document.querySelector("#status-filter"),
  stats: document.querySelector("#stats"),
  count: document.querySelector("#count"),
  list: document.querySelector("#location-list"),
  detail: document.querySelector("#detail"),
};

const markerLayer = L.layerGroup().addTo(map);
let locations = [];
let selectedId = null;

init().catch((error) => {
  ui.list.innerHTML = `<p class="empty">資料載入失敗：${escapeHtml(error.message)}</p>`;
});

async function init() {
  locations = await fetch("../data/locations.json").then((response) => {
    if (!response.ok) throw new Error(`locations.json ${response.status}`);
    return response.json();
  });
  fillSelect(ui.area, unique(locations.map((item) => item.area)));
  fillSelect(ui.media, unique(locations.flatMap((item) => item.media || [])));
  fillSelect(ui.status, unique(locations.map((item) => item.status)));
  [ui.search, ui.area, ui.media, ui.status].forEach((control) => control.addEventListener("input", render));
  render();
}

function render() {
  const records = locations.filter(matchesFilters);
  ui.count.textContent = `${records.length} 個地點`;
  ui.stats.innerHTML = `<strong>${locations.length}</strong><span>全部場景</span><strong>${records.length}</strong><span>目前顯示</span>`;
  renderList(records);
  renderMap(records);
  if (!records.some((item) => item.id === selectedId)) selectedId = records[0]?.id || null;
  renderDetail(locations.find((item) => item.id === selectedId));
}

function matchesFilters(location) {
  const query = ui.search.value.trim().toLowerCase();
  const haystack = [location.title, location.area, location.scene, location.address, ...(location.tags || [])].join(" ").toLowerCase();
  return (!query || haystack.includes(query))
    && (ui.area.value === "all" || location.area === ui.area.value)
    && (ui.media.value === "all" || (location.media || []).includes(ui.media.value))
    && (ui.status.value === "all" || location.status === ui.status.value);
}

function renderList(records) {
  ui.list.innerHTML = records.length ? records.map((location) => `
    <button class="location-card ${location.id === selectedId ? "is-active" : ""}" data-id="${escapeAttribute(location.id)}">
      <span class="card-area">${escapeHtml(location.area)}</span>
      <strong>${escapeHtml(location.title)}</strong>
      <span>${escapeHtml(location.kind || "NANA 場景")}</span>
    </button>
  `).join("") : '<p class="empty">沒有符合的場景。</p>';
  ui.list.querySelectorAll(".location-card").forEach((card) => card.addEventListener("click", () => select(card.dataset.id)));
}

function renderMap(records) {
  markerLayer.clearLayers();
  const bounds = [];
  records.forEach((location) => {
    const marker = L.circleMarker([location.lat, location.lng], {
      radius: location.id === selectedId ? 11 : 7,
      color: location.id === selectedId ? "#ffcf8a" : "#ff7a62",
      fillColor: location.id === selectedId ? "#ffcf8a" : "#ff5f4a",
      fillOpacity: 0.9,
      weight: 2,
    }).bindTooltip(location.title);
    marker.on("click", () => select(location.id));
    marker.addTo(markerLayer);
    bounds.push([location.lat, location.lng]);
  });
  if (bounds.length && !selectedId) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
}

function renderDetail(location) {
  if (!location) {
    ui.detail.classList.add("is-hidden");
    return;
  }
  ui.detail.classList.remove("is-hidden");
  const reference = (location.images?.reference || []).map((image) => imageCard("作品畫面", image)).join("");
  const real = (location.images?.real || []).map((image) => imageCard("現地照片", image)).join("");
  ui.detail.innerHTML = `
    <button class="close-detail" type="button" aria-label="關閉">×</button>
    <p class="detail-kicker">${escapeHtml(location.area)} · ${escapeHtml(location.status)}</p>
    <h2>${escapeHtml(location.title)}</h2>
    <p class="detail-scene">${escapeHtml(location.scene)}</p>
    <div class="meta"><span>${escapeHtml((location.media || []).join(" / "))}</span><span>${escapeHtml(location.kind || "")}</span><span>${escapeHtml(location.address || "地址未填")}</span></div>
    <div class="comparison"><div><h3>作品畫面</h3>${reference || emptyImage("尚未提供作品畫面")}</div><div><h3>現地照片</h3>${real || emptyImage("尚未提供現地照片")}</div></div>
    <p class="source-note">${escapeHtml(location.reference || "尚未填寫來源說明")}</p>
    <div class="links">${(location.sources || []).map((source) => `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join("")}</div>
  `;
  ui.detail.querySelector(".close-detail").addEventListener("click", () => { selectedId = null; render(); });
}

function imageCard(label, image) {
  return `<figure class="image-card"><img src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.caption || label)}" /><figcaption>${escapeHtml(image.caption || label)}</figcaption></figure>`;
}

function emptyImage(text) { return `<div class="empty-image">${escapeHtml(text)}</div>`; }
function select(id) { selectedId = id; const location = locations.find((item) => item.id === id); if (location) map.flyTo([location.lat, location.lng], 14, { duration: 0.5 }); render(); }
function fillSelect(selectElement, values) { selectElement.insertAdjacentHTML("beforeend", values.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`).join("")); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant")); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeAttribute(value) { return escapeHtml(value).replaceAll("`", "&#96;"); }
