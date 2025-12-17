// app.js - Nueva web Vector Zero: login + NAV + mapa + tablas

let currentFir = "LECB";

// ------------ NAV & VISTAS ------------

document.addEventListener("DOMContentLoaded", function () {
  setupNav();
  setupFirSelector();
});

function setupFirSelector() {
  const sel = document.getElementById("firSelect");
  if (!sel) return;
  currentFir = sel.value || "LECB";

  sel.addEventListener("change", function () {
    currentFir = sel.value || "LECB";
    reloadForCurrentFir();
  });
}

function loadSectorsTableData() {
  fetch("api/sectors.php?fir=" + encodeURIComponent(currentFir))
    .then((r) => r.json())
    .then((rows) => sectorsTable.setData(rows))
    .catch((err) => console.error("Error cargando sectors:", err));
}

function loadPositionsTableData() {
  fetch("api/positions.php?fir=" + encodeURIComponent(currentFir))
    .then((r) => r.json())
    .then((rows) => positionsTable.setData(rows))
    .catch((err) => console.error("Error cargando positions:", err));
}

function reloadForCurrentFir() {
  // recarga mapa
  if (sectorsMapInitialized) {
    loadSectorsForCurrentFir();
  }
  // recarga tablas
  if (sectorsTableInitialized) {
    loadSectorsTableData();
  }
  if (positionsTableInitialized) {
    loadPositionsTableData();
  }
  // más adelante: airports, runways, etc.
}

function setupNav() {
  const views = document.querySelectorAll(".view");
  const buttons = document.querySelectorAll("[data-view]");

  // --- NAV desplegable por click ---
  const navDropdown = document.querySelector(".nav-dropdown");
  const navButton = navDropdown
    ? navDropdown.querySelector(".nav-button")
    : null;

  if (navButton && navDropdown) {
    navButton.addEventListener("click", function (e) {
      e.stopPropagation();
      navDropdown.classList.toggle("open");
    });

    document.addEventListener("click", function () {
      navDropdown.classList.remove("open");
    });
  }
  // ---------------------------------

  function showView(viewName) {
    views.forEach((v) => {
      if (v.dataset.view === viewName) {
        v.classList.add("active");
      } else {
        v.classList.remove("active");
      }
    });

    if (viewName === "sectors-map") {
      initSectorsMapOnce();
    } else if (viewName === "sectors") {
      initSectorsTableOnce();
    } else if (viewName === "positions") {
      initPositionsTableOnce();
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      const view = btn.getAttribute("data-view");
      if (!view) return;
      e.preventDefault();
      showView(view);
	  if (navDropdown) navDropdown.classList.remove("open");
    });
  });

  // Vista inicial
  showView("sectors-map");
}

// ------------ MAPA SECTORES DESDE DB ------------

let sectorsMapInitialized = false;
let leafletMap = null;
let sectorLayers = [];
let currentFL = 200;

function initSectorsMapOnce() {
  if (!sectorsMapInitialized) {
    sectorsMapInitialized = true;

    const flSlider = document.getElementById("flSlider");
    const flValue = document.getElementById("flValue");

    leafletMap = L.map("map").setView([40, 0], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: "&copy; OpenStreetMap",
    }).addTo(leafletMap);

    if (flSlider && flValue) {
      currentFL = parseInt(flSlider.value, 10) || 200;
      flValue.textContent = currentFL;
      flSlider.addEventListener("input", function () {
        const fl = parseInt(flSlider.value, 10) || 0;
        updateSectorsVisibility(fl);
      });
    }
  }

  loadSectorsForCurrentFir();
}

function loadSectorsForCurrentFir() {
  const statusDiv = document.getElementById("status");
  const flSlider = document.getElementById("flSlider");
  if (!leafletMap || !statusDiv || !flSlider) return;

  // limpiar capas antiguas
  sectorLayers.forEach((obj) => {
    if (leafletMap.hasLayer(obj.layer)) leafletMap.removeLayer(obj.layer);
  });
  sectorLayers = [];

  statusDiv.textContent = "Cargando sectores " + currentFir + "…";

  fetch("api/sectors_map.php?fir=" + encodeURIComponent(currentFir))
    .then((resp) => {
      if (!resp.ok) {
        statusDiv.textContent = "Error HTTP " + resp.status;
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then((data) => {
      const sectors = data.sectors || [];
      const sectorlines = data.sectorlines || [];
      statusDiv.textContent = "Sectores " + currentFir + " cargados: " + sectors.length;

      const sectorlinesById = {};
      sectorlines.forEach((sl) => (sectorlinesById[sl.id] = sl));

      let bounds = null;

      sectors.forEach((sector) => {
        const rings = buildSectorRings(sector, sectorlinesById);
        if (!rings || !rings.length) return;

        const fillColor = colorFromKey(sector.name || sector.id);

        const layer = L.polygon(rings, {
          color: "#0f172a",
          weight: 1,
          fill: true,
          fillColor: fillColor,
          fillOpacity: 0.55,
        });

        const flLow = sector.fl_low != null ? sector.fl_low : "";
        const flHigh = sector.fl_high != null ? sector.fl_high : "";
        const label =
          (sector.name || "Sector " + sector.id) +
          (flLow !== "" || flHigh !== ""
            ? `\nFL ${flLow || "?"}-${flHigh || "?"}`
            : "");

        layer.bindTooltip(label, { sticky: true });

        sectorLayers.push({ sector, layer });

        const lb = layer.getBounds();
        if (!bounds) bounds = lb;
        else bounds.extend(lb);
      });

      const fl = parseInt(flSlider.value, 10) || 200;
      updateSectorsVisibility(fl);

      if (bounds) {
        leafletMap.fitBounds(bounds);
      }
    })
    .catch((err) => {
      console.error("Error cargando sectors_map.php:", err);
      statusDiv.textContent = "Error al cargar datos de sectores.";
    });
}

function colorFromKey(key) {
  // hash simple a HSL para que cada sector tenga un color estable pseudo-aleatorio
  let hash = 0;
  const str = String(key || "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const sat = 55 + (Math.abs(hash) % 20); // 55-75
  const light = 45 + (Math.abs(hash >> 3) % 15); // 45-60
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function samePoint(a, b, eps = 1e-5) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

function buildSectorRings(sector, sectorlinesById) {
  const borders = sector.borders || [];
  if (!borders.length) return [];

  const segments = [];
  borders.forEach((border) => {
    const sl = sectorlinesById[border.sectorline_id];
    if (!sl || !sl.coords || sl.coords.length < 2) return;
    segments.push({
      coords: sl.coords.slice(),
      used: false,
    });
  });

  const rings = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].used) continue;

    let seg = segments[i];
    seg.used = true;
    let ring = seg.coords.slice();

    let extended = true;
    while (extended) {
      extended = false;
      const start = ring[0];
      const end = ring[ring.length - 1];

      for (let j = 0; j < segments.length; j++) {
        if (segments[j].used) continue;
        const s = segments[j];
        const c0 = s.coords[0];
        const cN = s.coords[s.coords.length - 1];

        if (samePoint(end, c0)) {
          for (let k = 1; k < s.coords.length; k++) ring.push(s.coords[k]);
          s.used = true;
          extended = true;
          break;
        } else if (samePoint(end, cN)) {
          for (let k = s.coords.length - 2; k >= 0; k--)
            ring.push(s.coords[k]);
          s.used = true;
          extended = true;
          break;
        } else if (samePoint(start, cN)) {
          const newRing = s.coords.slice();
          for (let k = 1; k < ring.length; k++) newRing.push(ring[k]);
          ring = newRing;
          s.used = true;
          extended = true;
          break;
        } else if (samePoint(start, c0)) {
          const rev = [];
          for (let k = s.coords.length - 1; k >= 0; k--) rev.push(s.coords[k]);
          for (let k = 1; k < ring.length; k++) rev.push(ring[k]);
          ring = rev;
          s.used = true;
          extended = true;
          break;
        }
      }
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!samePoint(first, last)) {
      if (samePoint(first, last, 1e-3)) {
        ring.push([first[0], first[1]]);
      }
    }

    if (ring.length >= 3) {
      rings.push(ring);
    }
  }

  return rings;
}

function sectorVisibleAtFL(sector, fl) {
  let low = sector.fl_low;
  let high = sector.fl_high;

  if (typeof low === "string" && low.trim() === "") low = null;
  if (typeof high === "string" && high.trim() === "") high = null;

  if ((low == null || low === "") && sector.alt_low_ft != null) {
    low = Math.round(sector.alt_low_ft / 100);
  }
  if ((high == null || high === "") && sector.alt_high_ft != null) {
    high = Math.round(sector.alt_high_ft / 100);
  }

  low = parseInt(low, 10);
  high = parseInt(high, 10);

  if (!isNaN(low) && low > 500) low = Math.round(low / 100);
  if (!isNaN(high) && high > 500) high = Math.round(high / 100);

  if (isNaN(low)) low = -999;
  if (isNaN(high)) high = 999;

  // FL alto inclusive (un pelín de margen)
  return fl >= low && fl <= high + 1;
}

function updateSectorsVisibility(fl) {
  currentFL = fl;
  const flLabel = document.getElementById("flValue");
  if (flLabel) flLabel.textContent = String(fl);

  if (!leafletMap) return;

  sectorLayers.forEach((obj) => {
    const { sector, layer } = obj;
    const visible = sectorVisibleAtFL(sector, fl);

    if (visible) {
      if (!leafletMap.hasLayer(layer)) leafletMap.addLayer(layer);
    } else {
      if (leafletMap.hasLayer(layer)) leafletMap.removeLayer(layer);
    }
  });
}

function initSectorsMapOnce() {
  if (sectorsMapInitialized) {
    return;
  }
  sectorsMapInitialized = true;

  const mapSection = document.getElementById("view-sectors-map");
  const statusDiv = document.getElementById("status");
  const flSlider = document.getElementById("flSlider");

  if (!mapSection || !statusDiv || !flSlider) {
    console.warn("No se encuentran elementos del mapa (view / status / slider).");
    return;
  }

  if (typeof L === "undefined") {
    statusDiv.textContent = "Leaflet no está cargado.";
    return;
  }

  leafletMap = L.map("map").setView([40, 0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap",
  }).addTo(leafletMap);

  statusDiv.textContent = "Cargando datos de sectores…";

  fetch("api/sectors_map.php")
    .then((resp) => {
      if (!resp.ok) {
        statusDiv.textContent = "Error HTTP " + resp.status;
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then((data) => {
      const sectors = data.sectors || [];
      const sectorlines = data.sectorlines || [];

      statusDiv.textContent = "Sectores cargados: " + sectors.length;

      const sectorlinesById = {};
      sectorlines.forEach((sl) => {
        sectorlinesById[sl.id] = sl;
      });

      let bounds = null;

      sectors.forEach((sector) => {
        const rings = buildSectorRings(sector, sectorlinesById);
        if (!rings || !rings.length) return;

        const fillColor = colorFromKey(sector.name || sector.id);

        const layer = L.polygon(rings, {
          color: "#0f172a",
          weight: 1,
          fill: true,
          fillColor: fillColor,
          fillOpacity: 0.55,
        });

        const flLow = sector.fl_low != null ? sector.fl_low : "";
        const flHigh = sector.fl_high != null ? sector.fl_high : "";
        const label =
          (sector.name || "Sector " + sector.id) +
          (flLow !== "" || flHigh !== ""
            ? `\nFL ${flLow || "?"}-${flHigh || "?"}`
            : "");

        layer.bindTooltip(label, { sticky: true });

        sectorLayers.push({ sector, layer });

        const lb = layer.getBounds();
        if (!bounds) bounds = lb;
        else bounds.extend(lb);
      });

      const initialFL = parseInt(flSlider.value, 10) || 200;
      updateSectorsVisibility(initialFL);

      if (bounds) {
        leafletMap.fitBounds(bounds);
      }

      flSlider.addEventListener("input", function () {
        const fl = parseInt(flSlider.value, 10) || 0;
        updateSectorsVisibility(fl);
      });
    })
    .catch((err) => {
      console.error("Error cargando sectors_map.php:", err);
      statusDiv.textContent = "Error al cargar datos de sectores.";
    });
}

// ------------ TABLA SECTORS (Tabulator) ------------

let sectorsTableInitialized = false;
let sectorsTable = null;

function initSectorsTableOnce() {
  if (sectorsTableInitialized) return;
  sectorsTableInitialized = true;

  const tableElem = document.getElementById("sectorsTable");
  if (!tableElem) return;

  sectorsTable = new Tabulator("#sectorsTable", {
    ajaxURL: "api/sectors.php",
    ajaxConfig: "GET",
    height: "100%",
    layout: "fitColumns",
    index: "id",
    columns: [
      { title: "ID", field: "id", width: 60, hozAlign: "right" },
      { title: "Name", field: "name", editor: "input" },
      { title: "FL Low", field: "fl_low", editor: "number", width: 80 },
      { title: "FL High", field: "fl_high", editor: "number", width: 80 },
      { title: "Alt low ft", field: "alt_low_ft", editor: "number", width: 90 },
      { title: "Alt high ft", field: "alt_high_ft", editor: "number", width: 95 },
      { title: "Active", field: "active", editor: "tickCross", width: 70, hozAlign: "center" },
      {
        title: "",
        field: "delete",
        width: 60,
        hozAlign: "center",
        formatter: "buttonCross",
        cellClick: function (e, cell) {
          const row = cell.getRow();
          const data = row.getData();
          if (!data.id) {
            row.delete();
            return;
          }
          if (!confirm("¿Eliminar sector " + data.name + "?")) return;
          fetch("api/sectors.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id: data.id }),
          })
            .then((r) => r.json())
            .then(() => {
              row.delete();
            })
            .catch((err) => {
              console.error("Error borrando sector:", err);
              alert("Error borrando sector.");
            });
        },
      },
    ],
    cellEdited: function (cell) {
      const data = cell.getRow().getData();
      saveSectorRow(data);
    },
  });

  const addBtn = document.getElementById("btnAddSector");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      const temp = {
        name: "NEW_SECTOR",
        fl_low: null,
        fl_high: null,
        alt_low_ft: null,
        alt_high_ft: null,
        active: 1,
      };
      sectorsTable.addRow(temp, true).then((row) => {
        const data = row.getData();
        saveSectorRow(data, true, row);
      });
    });
  }
}

function saveSectorRow(data, isNew, rowRef) {
  const payload = {
    action: isNew ? "insert" : "update",
    sector: data,
  };

  fetch("api/sectors.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((resp) => {
      if (isNew && resp.id && rowRef) {
        rowRef.update({ id: resp.id });
      }
    })
    .catch((err) => {
      console.error("Error guardando sector:", err);
      alert("Error guardando sector.");
    });
}

// ------------ TABLA POSITIONS (Tabulator) ------------

let positionsTableInitialized = false;
let positionsTable = null;

function initPositionsTableOnce() {
  if (positionsTableInitialized) return;
  positionsTableInitialized = true;

  const tableElem = document.getElementById("positionsTable");
  if (!tableElem) return;

  positionsTable = new Tabulator("#positionsTable", {
    ajaxURL: "api/positions.php",
    ajaxConfig: "GET",
    height: "100%",
    layout: "fitColumns",
    index: "id",
    columns: [
      { title: "ID", field: "id", width: 60, hozAlign: "right" },
      { title: "vACC", field: "vacc", editor: "input", width: 80 },
      { title: "SAP", field: "sap", editor: "input", width: 80 },
      { title: "ML", field: "ml", editor: "input", width: 60 },
      { title: "SFAC", field: "sfac", editor: "input", width: 60 },
      { title: "Callsign", field: "name", editor: "input" },
      { title: "ID ES", field: "id_es", editor: "input", width: 80 },
      { title: "Freq", field: "freq", editor: "input", width: 90 },
      { title: "SQ start", field: "sq_start", editor: "input", width: 80 },
      { title: "SQ end", field: "sq_end", editor: "input", width: 80 },
      { title: "Note", field: "note", editor: "input" },
      {
        title: "",
        field: "delete",
        width: 60,
        hozAlign: "center",
        formatter: "buttonCross",
        cellClick: function (e, cell) {
          const row = cell.getRow();
          const data = row.getData();
          if (!data.id) {
            row.delete();
            return;
          }
          if (!confirm("¿Eliminar posición " + (data.name || data.id) + "?")) return;
          fetch("api/positions.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id: data.id }),
          })
            .then((r) => r.json())
            .then(() => {
              row.delete();
            })
            .catch((err) => {
              console.error("Error borrando posición:", err);
              alert("Error borrando posición.");
            });
        },
      },
    ],
    cellEdited: function (cell) {
      const data = cell.getRow().getData();
      savePositionRow(data);
    },
  });

  const addBtn = document.getElementById("btnAddPosition");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      const temp = {
        vacc: "",
        sap: "",
        ml: "",
        sfac: "",
        name: "NEW_POSITION",
        id_es: "",
        freq: "",
        sq_start: "",
        sq_end: "",
        note: "",
      };
      positionsTable.addRow(temp, true).then((row) => {
        const data = row.getData();
        savePositionRow(data, true, row);
      });
    });
  }
}

function savePositionRow(data, isNew, rowRef) {
  const payload = {
    action: isNew ? "insert" : "update",
    position: data,
  };

  fetch("api/positions.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((resp) => {
      if (isNew && resp.id && rowRef) {
        rowRef.update({ id: resp.id });
      }
    })
    .catch((err) => {
      console.error("Error guardando posición:", err);
      alert("Error guardando posición.");
    });
}
