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
  editMode: document.querySelector("#edit-mode"),
  addLocation: document.querySelector("#add-location"),
  exportLocations: document.querySelector("#export-locations"),
  editorStatus: document.querySelector("#editor-status"),
  dialog: document.querySelector("#location-editor"),
  form: document.querySelector("#location-form"),
  referenceUpload: document.querySelector("#reference-upload"),
  realUpload: document.querySelector("#real-upload"),
  referenceImages: document.querySelector("#reference-images"),
  realImages: document.querySelector("#real-images"),
};

const markerLayer = L.layerGroup().addTo(map);
const LOCAL_LOCATIONS_KEY = "nana-pilgrimage-map.locations.v1";
let locations = [];
let baseLocations = [];
let selectedId = null;
let editMode = false;
let editingId = null;
let draftImages = { reference: [], real: [] };

init().catch((error) => {
  ui.list.innerHTML = `<p class="empty">資料載入失敗：${escapeHtml(error.message)}</p>`;
});

async function init() {
  const dataPath = window.location.pathname.includes("/preview/") ? "../data/locations.json" : "./data/locations.json";
  baseLocations = await fetch(dataPath).then((response) => {
    if (!response.ok) throw new Error(`locations.json ${response.status}`);
    return response.json();
  });
  locations = mergeOverrides(baseLocations, readOverrides());
  bindEditorEvents();
  refreshFilters();
  [ui.search, ui.area, ui.media, ui.status].forEach((control) => control.addEventListener("input", render));
  render();
}

function bindEditorEvents() {
  ui.editMode.addEventListener("click", () => {
    editMode = !editMode;
    ui.editMode.textContent = `編輯模式：${editMode ? "開啟" : "關閉"}`;
    ui.editorStatus.textContent = editMode ? "編輯只會儲存在這個瀏覽器。" : "目前為唯讀瀏覽模式。";
    render();
  });
  ui.addLocation.addEventListener("click", () => openEditor(null));
  ui.exportLocations.addEventListener("click", exportLocations);
  ui.form.addEventListener("submit", saveEditor);
  ui.referenceUpload.addEventListener("change", (event) => appendImages("reference", event.target.files));
  ui.realUpload.addEventListener("change", (event) => appendImages("real", event.target.files));
}

function render() {
  const records = locations.filter(matchesFilters);
  ui.count.textContent = `${records.length} 個地點`;
  ui.stats.innerHTML = `<strong>${locations.length}</strong><span>全部場景</span><strong>${records.length}</strong><span>目前顯示</span>`;
  renderList(records);
  renderMap(records);
  if (selectedId !== null && !records.some((item) => item.id === selectedId)) selectedId = null;
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
      <span>${escapeHtml(location.kind || "NANA 場景")}${editMode ? " · 可編輯" : ""}</span>
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
    <div class="detail-buttons"><button class="edit-detail" type="button" ${editMode ? "" : "hidden"}>編輯</button><button class="close-detail" type="button" aria-label="關閉">×</button></div>
    <p class="detail-kicker">${escapeHtml(location.area)} · ${escapeHtml(location.status)}</p>
    <h2>${escapeHtml(location.title)}</h2>
    <p class="detail-scene">${escapeHtml(location.scene)}</p>
    <div class="meta"><span>${escapeHtml((location.media || []).join(" / "))}</span><span>${escapeHtml(location.kind || "")}</span><span>${escapeHtml(location.address || "地址未填")}</span></div>
    <div class="comparison"><div><h3>作品畫面</h3>${reference || emptyImage("尚未提供作品畫面")}</div><div><h3>現地照片</h3>${real || emptyImage("尚未提供現地照片")}</div></div>
    ${renderVideos(location.videos)}
    <p class="source-note">${escapeHtml(location.reference || "尚未填寫來源說明")}</p>
    ${renderResearch(location.research)}
    <div class="links">${(location.sources || []).map((source) => `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join("")}</div>
  `;
  ui.detail.querySelector(".edit-detail").addEventListener("click", () => openEditor(location));
  ui.detail.querySelector(".close-detail").addEventListener("click", () => { selectedId = null; render(); });
}

function imageCard(label, image) {
  return `<figure class="image-card"><img src="${escapeAttribute(assetPath(image.src))}" alt="${escapeAttribute(image.caption || label)}" /><figcaption>${escapeHtml(image.caption || label)}</figcaption></figure>`;
}

function emptyImage(text) { return `<div class="empty-image">${escapeHtml(text)}</div>`; }
function assetPath(src) {
  if (!src || /^(data:|https?:|blob:|\/)/.test(src)) return src;
  return window.location.pathname.includes("/preview/") ? `../${src.replace(/^\.\//, "")}` : `./${src.replace(/^\.\//, "")}`;
}
function renderResearch(research) {
  if (!research) return "";
  const steps = (research.steps || []).map((step) => `<li><time>${escapeHtml(step.date || "")}</time><strong>${escapeHtml(step.action || "")}</strong><span>${escapeHtml(step.note || "")}</span></li>`).join("");
  const sources = (research.sources || []).map((source) => `<li><a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label || source.title || source.url)}</a>${source.note ? `<span>${escapeHtml(source.note)}</span>` : ""}</li>`).join("");
  return `<details class="research-log"><summary>查看研究脈絡${research.status ? ` · ${escapeHtml(research.status)}` : ""}</summary><p>${escapeHtml(research.summary || "")}</p>${steps ? `<h3>尋找過程</h3><ol>${steps}</ol>` : ""}${sources ? `<h3>參考資料</h3><ul>${sources}</ul>` : ""}</details>`;
}
function renderVideos(videos) {
  if (!videos?.length) return "";
  return `<section class="video-section"><h3>現地影片</h3><div class="video-list">${videos.map((video) => `<figure class="video-card"><video controls preload="metadata"${video.poster ? ` poster="${escapeAttribute(assetPath(video.poster))}"` : ""} src="${escapeAttribute(assetPath(video.src))}"></video><figcaption>${escapeHtml(video.caption || "現地影片")}</figcaption></figure>`).join("")}</div></section>`;
}
function select(id) { selectedId = id; const location = locations.find((item) => item.id === id); if (location) map.flyTo([location.lat, location.lng], 14, { duration: 0.5 }); render(); }
function fillSelect(selectElement, values) { selectElement.insertAdjacentHTML("beforeend", values.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`).join("")); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant")); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeAttribute(value) { return escapeHtml(value).replaceAll("`", "&#96;"); }

function refreshFilters() {
  const values = [[ui.area, unique(locations.map((item) => item.area))], [ui.media, unique(locations.flatMap((item) => item.media || []))], [ui.status, unique(locations.map((item) => item.status))]];
  values.forEach(([selectElement, options]) => { const current = selectElement.value; selectElement.length = 1; fillSelect(selectElement, options); selectElement.value = options.includes(current) ? current : "all"; });
}

function readOverrides() {
  try { return JSON.parse(localStorage.getItem(LOCAL_LOCATIONS_KEY) || "{}"); } catch { return {}; }
}

function mergeOverrides(source, overrides) {
  const sourceIds = new Set(source.map((location) => location.id));
  return [...source.map((location) => ({ ...location, ...(overrides[location.id] || {}) })), ...Object.entries(overrides).filter(([id]) => !sourceIds.has(id)).map(([, location]) => location)];
}

function persistOverrides() {
  const baseById = Object.fromEntries(baseLocations.map((location) => [location.id, location]));
  const overrides = Object.fromEntries(locations.filter((location) => JSON.stringify(location) !== JSON.stringify(baseById[location.id])).map((location) => [location.id, location]));
  localStorage.setItem(LOCAL_LOCATIONS_KEY, JSON.stringify(overrides));
}

function openEditor(location) {
  editingId = location?.id || null;
  draftImages = { reference: structuredClone(location?.images?.reference || []), real: structuredClone(location?.images?.real || []) };
  const values = location || { id: `nana-location-${Date.now()}`, title: "", area: "", kind: "實景取景地", status: "現存", media: [], lat: 35.6815, lng: 139.6917, scene: "", address: "", reference: "", note: "", sources: [] };
  ui.form.elements.id.value = values.id || "";
  ui.form.elements.id.readOnly = Boolean(editingId);
  ui.form.elements.title.value = values.title || "";
  ui.form.elements.area.value = values.area || "";
  ui.form.elements.kind.value = values.kind || "";
  ui.form.elements.status.value = values.status || "";
  ui.form.elements.media.value = (values.media || []).join(", ");
  ui.form.elements.lat.value = values.lat ?? "";
  ui.form.elements.lng.value = values.lng ?? "";
  ui.form.elements.scene.value = values.scene || "";
  ui.form.elements.address.value = values.address || "";
  ui.form.elements.reference.value = values.reference || "";
  ui.form.elements.note.value = values.note || "";
  ui.form.elements.sources.value = (values.sources || []).map((source) => `${source.label || ""} | ${source.url || ""}`).join("\n");
  renderDraftImages();
  ui.dialog.showModal();
}

function renderDraftImages() {
  ["reference", "real"].forEach((type) => {
    const container = type === "reference" ? ui.referenceImages : ui.realImages;
    container.innerHTML = draftImages[type].length ? draftImages[type].map((image, index) => `
      <article class="draft-image"><img src="${escapeAttribute(assetPath(image.src))}" alt="${escapeAttribute(image.caption || type)}" /><input data-image-caption="${type}" data-index="${index}" value="${escapeAttribute(image.caption || "")}" placeholder="圖片說明" /><div><button type="button" data-image-move="up" data-type="${type}" data-index="${index}">↑</button><button type="button" data-image-move="down" data-type="${type}" data-index="${index}">↓</button><button type="button" data-image-remove="${type}" data-index="${index}">刪除</button></div></article>
    `).join("") : '<p class="empty">尚未加入圖片。</p>';
  });
  ui.form.querySelectorAll("[data-image-caption]").forEach((input) => input.addEventListener("input", () => { draftImages[input.dataset.imageCaption][Number(input.dataset.index)].caption = input.value; }));
  ui.form.querySelectorAll("[data-image-remove]").forEach((button) => button.addEventListener("click", () => { draftImages[button.dataset.imageRemove].splice(Number(button.dataset.index), 1); renderDraftImages(); }));
  ui.form.querySelectorAll("[data-image-move]").forEach((button) => button.addEventListener("click", () => moveImage(button.dataset.type, Number(button.dataset.index), button.dataset.imageMove === "up" ? -1 : 1)));
}

function moveImage(type, index, offset) {
  const target = index + offset;
  if (target < 0 || target >= draftImages[type].length) return;
  [draftImages[type][index], draftImages[type][target]] = [draftImages[type][target], draftImages[type][index]];
  renderDraftImages();
}

async function appendImages(type, files) {
  for (const file of Array.from(files || [])) draftImages[type].push({ src: await readFileAsDataUrl(file), caption: file.name });
  renderDraftImages();
}

function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(file); }); }

function saveEditor(event) {
  event.preventDefault();
  const form = ui.form.elements;
  const existing = locations.find((location) => location.id === editingId) || {};
  const sources = form.sources.value.split("\n").map((line) => line.split("|").map((part) => part.trim())).filter(([label, url]) => label && url).map(([label, url]) => ({ label, url }));
  const updated = { ...existing, id: form.id.value.trim(), title: form.title.value.trim(), area: form.area.value.trim(), kind: form.kind.value.trim(), status: form.status.value.trim(), media: form.media.value.split(",").map((item) => item.trim()).filter(Boolean), lat: Number(form.lat.value), lng: Number(form.lng.value), scene: form.scene.value.trim(), address: form.address.value.trim(), reference: form.reference.value.trim(), note: form.note.value.trim(), sources, images: draftImages };
  if (!updated.id || !updated.title || (editingId && updated.id !== editingId) || locations.some((location) => location.id === updated.id && location.id !== editingId)) { alert("ID 不可重複，且標題不可空白；既有地點的 ID 不可修改。"); return; }
  locations = editingId ? locations.map((location) => location.id === editingId ? updated : location) : [...locations, updated];
  persistOverrides();
  refreshFilters();
  ui.dialog.close();
  selectedId = updated.id;
  render();
}

function exportLocations() {
  const blob = new Blob([JSON.stringify(locations, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "nana-locations-edited.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
