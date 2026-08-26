const map = L.map("map", {
  zoomControl: false,
});

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

map.setView([35.6895, 139.6917], 11);

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

const LOCAL_STORAGE_KEY = "nana-pilgrimage-map.visits";

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
  ui.detail.innerHTML = `<p class="detail-empty">資料載入失敗：${error.message}</p>`;
});

async function init() {
  const [locations, seedVisits] = await Promise.all([
    fetchJson("./data/locations.json"),
    fetchJson("./data/visits.json"),
  ]);

  state.locations = locations;
  state.visits = mergeVisits(indexById(seedVisits), readLocalVisits());

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
  renderStats(records);
  renderList(records);

  if (!records.some((record) => record.location.id === state.selectedId)) {
    state.selectedId = records[0]?.location.id ?? null;
  }

  renderMap(records);
  renderDetail(records.find((record) => record.location.id === state.selectedId) ?? null);
  ui.resultSummary.textContent = `共 ${records.length} 筆`;
}

function getDisplayRecords() {
  return state.locations
    .map((location) => ({
      location,
      visit: state.visits[location.id] ?? createEmptyVisit(location.id),
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
    record.location.scene,
    record.location.tags.join(" "),
    record.visit.notes || "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.search);
}

function renderStats(records) {
  const visitedCount = records.filter((record) => record.visit.visited).length;
  const areas = new Set(records.map((record) => record.location.area)).size;

  const stats = [
    { label: "總點位", value: records.length },
    { label: "已踩點", value: visitedCount },
    { label: "區域數", value: areas },
  ];

  ui.stats.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card">
          <span class="stat-value">${stat.value}</span>
          <span class="stat-label">${stat.label}</span>
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
      const status = visit.visited ? "已去過" : "想去";
      const tags = location.tags
        .slice(0, 3)
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("");

      return `
        <article class="location-card ${state.selectedId === location.id ? "is-active" : ""}" data-id="${location.id}">
          <div class="location-topline">
            <div>
              <p class="location-area">${escapeHtml(location.area)}</p>
              <h3 class="location-title">${escapeHtml(location.title)}</h3>
            </div>
            <span class="detail-badge">${status}</span>
          </div>
          <p class="hero-copy">${escapeHtml(location.scene)}</p>
          <div class="tag-row">${tags}</div>
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
    const marker = L.circleMarker([location.lat, location.lng], {
      radius: state.selectedId === location.id ? 11 : 8,
      weight: 2,
      color: visit.visited ? "#ffd6ce" : "#d4f2f1",
      fillColor: visit.visited ? "#ff5f4a" : "#8cc7c5",
      fillOpacity: 0.9,
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
  fragment.querySelector(".detail-badge").textContent = visit.visited ? "已去過" : "想去";
  fragment.querySelector(".detail-scene").textContent = location.scene;

  const metaGrid = fragment.querySelector(".meta-grid");
  const metadata = [
    ["參考", location.reference],
    ["地址", location.address],
    ["標籤", location.tags.join(" / ")],
    ["備註", location.note],
  ];

  metaGrid.innerHTML = metadata
    .map(
      ([label, value]) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(label)}</span>
          <span class="meta-value">${escapeHtml(value || "未填")}</span>
        </div>
      `,
    )
    .join("");

  const dateInput = fragment.querySelector(".visit-date");
  const ratingInput = fragment.querySelector(".visit-rating");
  const visitedInput = fragment.querySelector(".visit-visited");
  const notesInput = fragment.querySelector(".visit-notes");
  const photosInput = fragment.querySelector(".visit-photos");

  dateInput.value = visit.visitDate || "";
  ratingInput.value = visit.rating || "";
  visitedInput.checked = Boolean(visit.visited);
  notesInput.value = visit.notes || "";
  photosInput.value = (visit.photos || []).join("\n");

  fragment.querySelector(".save-button").addEventListener("click", () => {
    state.visits[location.id] = {
      locationId: location.id,
      visited: visitedInput.checked,
      visitDate: dateInput.value || "",
      rating: ratingInput.value || "",
      notes: notesInput.value.trim(),
      photos: photosInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    persistVisits();
    render();
  });

  fragment.querySelector(".reset-button").addEventListener("click", async () => {
    const seedVisits = await fetchJson("./data/visits.json");
    const seed = indexById(seedVisits)[location.id] ?? createEmptyVisit(location.id);
    state.visits[location.id] = seed;
    persistVisits();
    render();
  });

  ui.detail.replaceChildren(fragment);
}

function exportVisits() {
  const data = Object.values(state.visits).sort((a, b) => a.locationId.localeCompare(b.locationId));
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
  state.visits = mergeVisits(state.visits, indexById(imported));
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
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function createEmptyVisit(locationId) {
  return {
    locationId,
    visited: false,
    visitDate: "",
    rating: "",
    notes: "",
    photos: [],
  };
}

function indexById(items) {
  return Object.fromEntries(items.map((item) => [item.locationId, item]));
}

function mergeVisits(base, override) {
  return { ...base, ...override };
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
