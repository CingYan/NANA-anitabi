const map = L.map("map", {
  zoomControl: false,
});

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

map.setView([35.6811505, 139.7659765], 6);

const ui = {
  stats: document.getElementById("stats"),
  list: document.getElementById("location-list"),
  detail: document.getElementById("detail-card"),
  detailTemplate: document.getElementById("detail-template"),
  search: document.getElementById("search-input"),
  routeToggle: document.getElementById("route-toggle"),
  importInput: document.getElementById("import-input"),
  exportButton: document.getElementById("export-button"),
  resultSummary: document.getElementById("result-summary"),
  segments: Array.from(document.querySelectorAll(".segment")),
};

const LOCAL_STORAGE_KEY = "nana-pilgrimage-map.visits.v2";
const markerLayer = L.layerGroup().addTo(map);

let routeLayer = null;
let state = {
  filter: "all",
  search: "",
  locations: [],
  visits: {},
  selectedId: null,
};

init().catch((error) => {
  ui.detail.innerHTML = `<p class="detail-empty">資料載入失敗：${escapeHtml(error.message)}</p>`;
});

async function init() {
  const [locations, seedVisits] = await Promise.all([
    fetchJson("./data/locations.json"),
    fetchJson("./data/visits.json"),
  ]);

  state.locations = locations;
  state.visits = mergeVisits(indexVisitsById(seedVisits), readLocalVisits());

  bindEvents();
  render();
}

function bindEvents() {
  ui.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  ui.segments.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      ui.segments.forEach((segment) => segment.classList.toggle("is-active", segment === button));
      render();
    });
  });

  ui.routeToggle.addEventListener("change", render);
  ui.exportButton.addEventListener("click", exportVisits);
  ui.importInput.addEventListener("change", importVisits);
}

function render() {
  const records = getDisplayRecords();

  if (!records.some((record) => record.location.id === state.selectedId)) {
    state.selectedId = records[0]?.location.id ?? null;
  }

  renderStats(records);
  renderList(records);
  renderMap(records);
  renderDetail(records.find((record) => record.location.id === state.selectedId) ?? null);
  ui.resultSummary.textContent = `共 ${records.length} 筆`;
}

function getDisplayRecords() {
  return state.locations
    .map((location) => ({
      location,
      visit: normalizeVisit(state.visits[location.id] ?? createEmptyVisit(location.id)),
    }))
    .filter(applyFilters)
    .sort((a, b) => {
      const aVisited = a.visit.visited ? 1 : 0;
      const bVisited = b.visit.visited ? 1 : 0;
      if (aVisited !== bVisited) {
        return bVisited - aVisited;
      }

      if (a.visit.visitDate && b.visit.visitDate) {
        return a.visit.visitDate < b.visit.visitDate ? 1 : -1;
      }

      return a.location.title.localeCompare(b.location.title, "zh-Hant");
    });
}

function applyFilters(record) {
  if (state.filter === "visited" && !record.visit.visited) {
    return false;
  }

  if (state.filter === "wishlist" && record.visit.visited) {
    return false;
  }

  if (!state.search) {
    return true;
  }

  const haystack = [
    record.location.title,
    record.location.area,
    record.location.address,
    record.location.scene,
    record.location.kind,
    record.location.status,
    record.location.media.join(" "),
    record.visit.notes || "",
    (record.visit.photos || []).map((photo) => [photo.caption, photo.shotFrom, photo.shotTo].join(" ")).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.search);
}

function renderStats(records) {
  const visitedCount = records.filter((record) => record.visit.visited).length;
  const historicalCount = records.filter((record) => record.location.status === "已消失" || record.location.status === "已搬遷").length;
  const areas = new Set(records.map((record) => record.location.area)).size;

  const stats = [
    { label: "總點位", value: records.length },
    { label: "已踩點", value: visitedCount },
    { label: "歷史點", value: historicalCount },
    { label: "區域數", value: areas },
  ];

  ui.stats.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card">
          <span class="stat-value">${stat.value}</span>
          <span class="stat-label">${escapeHtml(stat.label)}</span>
        </div>
      `,
    )
    .join("");
}

function renderList(records) {
  if (records.length === 0) {
    ui.list.innerHTML = '<p class="detail-empty">沒有符合的地點。</p>';
    return;
  }

  ui.list.innerHTML = records
    .map(({ location, visit }) => {
      const status = visit.visited ? "已去過" : "待朝聖";
      const media = location.media.join(" / ");
      return `
        <article class="location-card ${state.selectedId === location.id ? "is-active" : ""}" data-id="${location.id}">
          <div class="location-topline">
            <div>
              <p class="location-area">${escapeHtml(location.area)}</p>
              <h3 class="location-title">${escapeHtml(location.title)}</h3>
            </div>
            <span class="detail-badge">${escapeHtml(status)}</span>
          </div>
          <p class="hero-copy">${escapeHtml(location.scene)}</p>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">媒介</span>
              <span class="meta-value">${escapeHtml(media)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">類型</span>
              <span class="meta-value">${escapeHtml(location.kind)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">現況</span>
              <span class="meta-value">${escapeHtml(location.status)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  Array.from(ui.list.querySelectorAll(".location-card")).forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.dataset.id;
      const target = records.find((record) => record.location.id === state.selectedId);
      if (target) {
        map.flyTo([target.location.lat, target.location.lng], 15, { duration: 0.6 });
      }
      render();
    });
  });
}

function renderMap(records) {
  markerLayer.clearLayers();

  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  const bounds = [];

  records.forEach(({ location, visit }) => {
    const palette = getMarkerPalette(location.status, visit.visited);
    const marker = L.circleMarker([location.lat, location.lng], {
      radius: state.selectedId === location.id ? 11 : 8,
      weight: 2,
      color: palette.stroke,
      fillColor: palette.fill,
      fillOpacity: 0.92,
    });

    marker.bindPopup(`
      <div class="popup-card">
        <div class="popup-title">${escapeHtml(location.title)}</div>
        <div>${escapeHtml(location.area)}</div>
        <div class="popup-scene">${escapeHtml(location.scene)}</div>
      </div>
    `);

    marker.on("click", () => {
      state.selectedId = location.id;
      render();
    });

    marker.addTo(markerLayer);
    bounds.push([location.lat, location.lng]);
  });

  const routePoints = records
    .filter((record) => record.visit.visited && record.visit.visitDate)
    .sort((a, b) => (a.visit.visitDate > b.visit.visitDate ? 1 : -1))
    .map((record) => [record.location.lat, record.location.lng]);

  if (ui.routeToggle.checked && routePoints.length >= 2) {
    routeLayer = L.polyline(routePoints, {
      color: "#f0b35b",
      weight: 4,
      opacity: 0.85,
      dashArray: "10 8",
    }).addTo(map);
  }

  if (bounds.length > 0 && !state.selectedId) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }
}

function renderDetail(record) {
  if (!record) {
    ui.detail.innerHTML = '<p class="detail-empty">沒有可顯示的地點。</p>';
    return;
  }

  const { location, visit } = record;
  const fragment = ui.detailTemplate.content.cloneNode(true);

  fragment.querySelector(".detail-kicker").textContent = location.area;
  fragment.querySelector(".detail-title").textContent = location.title;
  fragment.querySelector(".detail-badge").textContent = location.status;
  fragment.querySelector(".detail-scene").textContent = location.scene;

  const metadata = [
    ["媒介", location.media.join(" / ")],
    ["地點類型", location.kind],
    ["地址", location.address],
    ["存續狀態", location.status],
    ["來源說明", location.reference],
    ["補充", location.note || "未填"],
  ];

  fragment.querySelector(".meta-grid").innerHTML = metadata
    .map(
      ([label, value]) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(label)}</span>
          <span class="meta-value">${escapeHtml(value || "未填")}</span>
        </div>
      `,
    )
    .join("");

  fragment.querySelector(".source-list").innerHTML = location.sources
    .map(
      (source) => `
        <a class="source-link" href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(source.label)}
          <small>${escapeHtml(source.url)}</small>
        </a>
      `,
    )
    .join("");

  const dateInput = fragment.querySelector(".visit-date");
  const visitedInput = fragment.querySelector(".visit-visited");
  const notesInput = fragment.querySelector(".visit-notes");
  const photoInput = fragment.querySelector(".visit-photo-upload");
  const photoList = fragment.querySelector(".photo-list");

  dateInput.value = visit.visitDate || "";
  visitedInput.checked = Boolean(visit.visited);
  notesInput.value = visit.notes || "";

  renderPhotoEditors(photoList, visit.photos);

  photoInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const newPhotos = await Promise.all(files.map(fileToPhotoRecord));
    const currentPhotos = collectPhotoEditors(photoList);
    renderPhotoEditors(photoList, [...currentPhotos, ...newPhotos]);
    photoInput.value = "";
  });

  fragment.querySelector(".save-button").addEventListener("click", () => {
    state.visits[location.id] = normalizeVisit({
      locationId: location.id,
      visited: visitedInput.checked,
      visitDate: dateInput.value || "",
      notes: notesInput.value.trim(),
      photos: collectPhotoEditors(photoList),
    });

    persistVisits();
    render();
  });

  fragment.querySelector(".reset-button").addEventListener("click", async () => {
    const seedVisits = await fetchJson("./data/visits.json");
    const seed = indexVisitsById(seedVisits)[location.id] ?? createEmptyVisit(location.id);
    state.visits[location.id] = normalizeVisit(seed);
    persistVisits();
    render();
  });

  ui.detail.replaceChildren(fragment);
}

function renderPhotoEditors(container, photos) {
  if (photos.length === 0) {
    container.innerHTML = '<p class="detail-empty">這個點位還沒有照片。直接上傳就好，不用先找圖床。</p>';
    return;
  }

  container.innerHTML = photos
    .map(
      (photo) => `
        <article class="photo-card" data-photo-id="${escapeHtml(photo.id)}">
          <div class="photo-preview-wrap">
            <img class="photo-preview" src="${escapeAttribute(photo.dataUrl)}" alt="${escapeAttribute(photo.name || "朝聖照片")}" />
          </div>
          <label class="field">
            <span>照片標題</span>
            <input class="photo-name" type="text" value="${escapeAttribute(photo.name || "")}" placeholder="例如：東京站丸之內口" />
          </label>
          <label class="field">
            <span>從哪裡拍</span>
            <input class="photo-from" type="text" value="${escapeAttribute(photo.shotFrom || "")}" placeholder="例如：丸之內北口人行道" />
          </label>
          <label class="field">
            <span>拍到哪裡</span>
            <input class="photo-to" type="text" value="${escapeAttribute(photo.shotTo || "")}" placeholder="例如：東京站紅磚立面中央" />
          </label>
          <label class="field">
            <span>照片說明</span>
            <textarea class="photo-caption" rows="3" placeholder="例如：這張是對準動畫第一話列車進站前的視角。">${escapeHtml(photo.caption || "")}</textarea>
          </label>
          <button type="button" class="ghost-button photo-remove">刪掉這張</button>
        </article>
      `,
    )
    .join("");

  Array.from(container.querySelectorAll(".photo-remove")).forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".photo-card")?.remove();
      if (!container.querySelector(".photo-card")) {
        renderPhotoEditors(container, []);
      }
    });
  });
}

function collectPhotoEditors(container) {
  return Array.from(container.querySelectorAll(".photo-card")).map((card) => ({
    id: card.dataset.photoId || crypto.randomUUID(),
    dataUrl: card.querySelector(".photo-preview")?.getAttribute("src") || "",
    name: card.querySelector(".photo-name")?.value.trim() || "",
    shotFrom: card.querySelector(".photo-from")?.value.trim() || "",
    shotTo: card.querySelector(".photo-to")?.value.trim() || "",
    caption: card.querySelector(".photo-caption")?.value.trim() || "",
  }));
}

function getMarkerPalette(status, visited) {
  if (status === "已消失") {
    return visited
      ? { fill: "#d77752", stroke: "#ffe1d1" }
      : { fill: "#845748", stroke: "#eac8b9" };
  }

  if (status === "已搬遷") {
    return visited
      ? { fill: "#d4a64f", stroke: "#fff0c9" }
      : { fill: "#8f7641", stroke: "#e7d6ad" };
  }

  return visited
    ? { fill: "#ff5f4a", stroke: "#ffd6ce" }
    : { fill: "#8cc7c5", stroke: "#d4f2f1" };
}

function exportVisits() {
  const data = Object.values(state.visits)
    .map(normalizeVisit)
    .sort((a, b) => a.locationId.localeCompare(b.locationId));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nana-visits.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importVisits(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  const imported = JSON.parse(text);
  state.visits = mergeVisits(state.visits, indexVisitsById(imported.map(normalizeVisit)));
  persistVisits();
  render();
  ui.importInput.value = "";
}

function persistVisits() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.visits));
}

function readLocalVisits() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([locationId, visit]) => [locationId, normalizeVisit(visit)]),
    );
  } catch {
    return {};
  }
}

function createEmptyVisit(locationId) {
  return {
    locationId,
    visited: false,
    visitDate: "",
    notes: "",
    photos: [],
  };
}

function normalizeVisit(visit) {
  return {
    locationId: visit.locationId,
    visited: Boolean(visit.visited),
    visitDate: visit.visitDate || "",
    notes: visit.notes || "",
    photos: Array.isArray(visit.photos)
      ? visit.photos.map((photo) => ({
          id: photo.id || crypto.randomUUID(),
          dataUrl: photo.dataUrl || "",
          name: photo.name || "",
          shotFrom: photo.shotFrom || "",
          shotTo: photo.shotTo || "",
          caption: photo.caption || "",
        }))
      : [],
  };
}

function indexVisitsById(items) {
  return Object.fromEntries(items.map((item) => [item.locationId, normalizeVisit(item)]));
}

function mergeVisits(base, override) {
  return { ...base, ...override };
}

async function fileToPhotoRecord(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: crypto.randomUUID(),
    dataUrl,
    name: file.name,
    shotFrom: "",
    shotTo: "",
    caption: "",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`讀取 ${file.name} 失敗`));
    reader.readAsDataURL(file);
  });
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} ${response.status}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
