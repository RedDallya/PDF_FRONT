import { apiFetch } from "./api.js";
import { appState, setServiceType } from "./state.js";

/* =========================================
   INIT CONTROL
========================================= */
let serviceFilterBound = false;

/* =========================================
   INIT
========================================= */
document.addEventListener("DOMContentLoaded", async () => {
  bindServiceFilter();
  resetServicesUI();
});

/* =========================================
   EVENTOS DE CONTEXTO
========================================= */
document.addEventListener("travel-selected", async () => {
  await reloadServicesContext();
});

document.addEventListener("travel-cleared", () => {
  resetServicesUI();
});

document.addEventListener("client-selected", () => {
  if (!appState.activeTravelId || !appState.activeQuoteId) {
    resetServicesUI();
  }
});

document.addEventListener("travel-saved", async () => {
  if (!appState.activeTravelId || !appState.activeQuoteId) return;
  await reloadServicesContext();
});

document.addEventListener("quote-tab-changed", () => {
  syncServiceFilterUI();
  syncVisibleServicesByType();
});

/* =========================================
   API PÚBLICA
========================================= */
export async function loadServicios() {
  await reloadServicesContext();
}

/* =========================================
   RECARGA COMPLETA DEL CONTEXTO
========================================= */
async function reloadServicesContext() {
  clearServicesList();
  resetTotals();

  if (!appState.activeTravelId || !appState.activeQuoteId) {
    renderEmptyServicesState("Seleccioná una cotización para cargar los servicios.");
    syncServiceFilterUI();
    return;
  }

  try {
    const res = await apiFetch(`/servicios/cotizacion/${appState.activeQuoteId}`);
    const services = await safeJson(res);

    clearServicesList();

    if (!Array.isArray(services) || !services.length) {
      renderEmptyServicesState("No hay servicios cargados para esta cotización.");
      resetTotals();
      syncServiceFilterUI();
      return;
    }

    services.forEach(service => {
      renderServiceCard(service, { mode: "preview" });
    });

    syncServiceFilterUI();
    syncVisibleServicesByType();
    updateTotals();
  } catch (err) {
    console.error("Error cargando servicios:", err);
    clearServicesList();
    renderEmptyServicesState("No se pudieron cargar los servicios.");
    resetTotals();
    syncServiceFilterUI();
  }
}

/* =========================================
   FILTRO DE TIPO DE SERVICIO
========================================= */
function bindServiceFilter() {
  if (serviceFilterBound) return;
  serviceFilterBound = true;

  document.addEventListener("change", e => {
    const select = e.target.closest("[data-service-filter]");
    if (!select) return;

    setServiceType(select.value || "");
    syncVisibleServicesByType();
  });
}

function syncServiceFilterUI() {
  const select = document.querySelector("[data-service-filter]");
  if (!select) return;

  select.value = appState.serviceType || "";
}

function syncVisibleServicesByType() {
  const cards = document.querySelectorAll(".service-card");

  cards.forEach(card => {
    const tipo =
      card.dataset.serviceTipo ||
      card.querySelector('[data-field="tipo"]')?.value ||
      "";

    const shouldShow = !appState.serviceType || tipo === appState.serviceType;
    card.classList.toggle("d-none", !shouldShow);
  });
}

/* =========================================
   AGREGAR SERVICIO
========================================= */
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-add-service]");
  if (!btn) return;

  if (!appState.activeTravelId) {
    alert("Seleccioná un viaje primero");
    return;
  }

  if (!appState.activeQuoteId) {
    alert("Seleccioná una cotización primero");
    return;
  }

  const defaultType = appState.serviceType || btn.dataset.addService || "hotel";
  renderServiceCard(
    {
      tipo: defaultType,
      categoria: defaultType,
      moneda: "USD",
      precio_adulto: 0,
      precio_menor: 0,
      adultos: 1,
      menores: 0,
      subtotal: 0,
      metadata: {}
    },
    { mode: "edit", isNew: true }
  );

  syncVisibleServicesByType();
  updateTotals();
});

/* =========================================
   GUARDAR SERVICIOS
========================================= */
document.addEventListener("click", async e => {
  if (!e.target.closest("[data-services-save]")) return;

  if (!appState.activeTravelId) {
    alert("Seleccioná un viaje primero");
    return;
  }

  if (!appState.activeQuoteId) {
    alert("Seleccioná una cotización primero");
    return;
  }

  const cards = Array.from(document.querySelectorAll(".service-card"));
  const services = cards.map(card => buildServicePayload(card)).filter(Boolean);

  try {
    const oldRes = await apiFetch(`/servicios/cotizacion/${appState.activeQuoteId}`);
    const existing = await safeJson(oldRes);

    if (Array.isArray(existing)) {
      for (const s of existing) {
        await apiFetch(`/servicios/${s.id}`, { method: "DELETE" });
      }
    }

    for (const service of services) {
      await apiFetch("/servicios", {
        method: "POST",
        body: JSON.stringify(service)
      });
    }

    await reloadServicesContext();
    alert("Servicios guardados correctamente");
  } catch (err) {
    console.error("Error guardando servicios:", err);
    alert("Error guardando servicios");
  }
});

/* =========================================
   CLICK GLOBAL DE CARDS
========================================= */
document.addEventListener("click", e => {
  const editBtn = e.target.closest("[data-service-edit]");
  if (editBtn) {
    const card = editBtn.closest(".service-card");
    if (!card) return;

    switchServiceCardToEdit(card);
    syncVisibleServicesByType();
    return;
  }

  const cancelBtn = e.target.closest("[data-service-cancel]");
  if (cancelBtn) {
    const card = cancelBtn.closest(".service-card");
    if (!card) return;

    const snapshot = parseServiceSnapshot(card.dataset.serviceSnapshot);

    if (!snapshot && card.dataset.isNew === "1") {
      card.remove();
      if (!document.querySelector(".service-card")) {
        renderEmptyServicesState("No hay servicios cargados para esta cotización.");
      }
      updateTotals();
      return;
    }

    switchServiceCardToPreview(card, snapshot || buildServicePayload(card));
    syncVisibleServicesByType();
    updateTotals();
    return;
  }

  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) {
    const card = removeBtn.closest(".service-card");
    if (!card) return;

    card.remove();

    if (!document.querySelector(".service-card")) {
      renderEmptyServicesState("No hay servicios cargados para esta cotización.");
    }

    updateTotals();
  }
});

/* =========================================
   RENDER CARD
========================================= */
function renderServiceCard(service = {}, options = {}) {
  const { mode = "preview", isNew = false } = options;

  const list = document.querySelector(".services-list");
  const tpl = document.getElementById("service-template");

  if (!tpl || !list) return;

  removeEmptyServicesState();

  const node = tpl.content.cloneNode(true);
  const serviceEl = node.querySelector(".service-card");
  if (!serviceEl) return;

  serviceEl.dataset.serviceId = service.id || crypto.randomUUID();
  serviceEl.dataset.isNew = isNew ? "1" : "0";

  if (service.id) {
    serviceEl.dataset.backendId = service.id;
  }

  wireServiceCard(serviceEl);
  hydrateServiceCard(serviceEl, service);

  const normalized = normalizeServiceData(service);
  serviceEl.dataset.serviceSnapshot = JSON.stringify(normalized);
  serviceEl.dataset.serviceTipo = normalized.tipo || normalized.categoria || "";

  if (mode === "preview" && !isNew) {
    switchServiceCardToPreview(serviceEl, normalized);
  } else {
    switchServiceCardToEdit(serviceEl);
  }

  list.appendChild(serviceEl);
}

/* =========================================
   WIRING CARD
========================================= */
function wireServiceCard(serviceEl) {
  serviceEl
    .querySelectorAll('[data-field="precio_adulto"], [data-field="precio_menor"], [data-field="adultos"], [data-field="menores"]')
    .forEach(input => {
      input.addEventListener("input", () => {
        updateServiceSubtotal(serviceEl);
        syncLivePreviewIfAny(serviceEl);
        updateTotals();
      });
    });

  const tipoSelect = serviceEl.querySelector('[data-field="tipo"]');
  tipoSelect?.addEventListener("change", () => {
    const type = tipoSelect.value || "";

    clearSpecificFields(serviceEl);
    setDefaultSpecificFields(serviceEl, type);
    toggleSpecificFields(serviceEl, type);
    serviceEl.dataset.serviceTipo = type;

    syncVisibleServicesByType();
    syncLivePreviewIfAny(serviceEl);
    updateServiceSubtotal(serviceEl);
    updateTotals();
  });

  serviceEl
    .querySelectorAll('[data-field="descripcion"], [data-field="observaciones"], [data-field="moneda"]')
    .forEach(input => {
      input.addEventListener("input", () => {
        syncLivePreviewIfAny(serviceEl);
      });
    });

  serviceEl.querySelectorAll(".service-specific input, .service-specific select, .service-specific textarea")
    .forEach(input => {
      input.addEventListener("input", () => {
        syncLivePreviewIfAny(serviceEl);
      });
    });
}

/* =========================================
   HYDRATE CARD
========================================= */
function hydrateServiceCard(serviceEl, service) {
  const tipo = service.tipo || service.categoria || "hotel";
  const metadata = normalizeMetadata(service.metadata);

  const normalized = normalizeServiceData(service);

  setField(serviceEl, "tipo", tipo);
  setField(serviceEl, "descripcion", service.descripcion || "");
  setField(serviceEl, "observaciones", service.observaciones || "");
  setField(serviceEl, "moneda", service.moneda || "USD");
  setField(serviceEl, "precio_adulto", normalized.precio_adulto || 0);
  setField(serviceEl, "precio_menor", normalized.precio_menor || 0);
  setField(serviceEl, "adultos", normalized.adultos || 0);
  setField(serviceEl, "menores", normalized.menores || 0);
  setField(serviceEl, "subtotal", normalized.subtotal || 0);

  toggleSpecificFields(serviceEl, tipo);
  hydrateSpecificFields(serviceEl, tipo, metadata);
  updateServiceSubtotal(serviceEl);
}

/* =========================================
   MODOS: PREVIEW / EDIT
========================================= */
function switchServiceCardToPreview(serviceEl, serviceData = {}) {
  const normalized = normalizeServiceData(serviceData);
  serviceEl.dataset.serviceSnapshot = JSON.stringify(normalized);
  serviceEl.dataset.serviceTipo = normalized.tipo || normalized.categoria || "";

  hideEditorElements(serviceEl);

  let preview = serviceEl.querySelector(".service-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "service-preview border rounded p-3 mt-2";
    serviceEl.appendChild(preview);
  }

  preview.innerHTML = buildServicePreviewHtml(normalized);
  preview.classList.remove("d-none");
}

function switchServiceCardToEdit(serviceEl) {
  showEditorElements(serviceEl);

  let preview = serviceEl.querySelector(".service-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "service-preview border rounded p-3 mt-2 d-none";
    serviceEl.appendChild(preview);
  } else {
    preview.classList.add("d-none");
  }

  ensureEditorActionButtons(serviceEl);
}

function hideEditorElements(serviceEl) {
  serviceEl.querySelectorAll(
    '.service-header, [data-field="descripcion"], [data-field="observaciones"], [data-field="adjuntos"], .row.g-2.mb-2, .service-specific'
  ).forEach(el => el.classList.add("d-none"));

  const removeBtn = serviceEl.querySelector("[data-remove]");
  if (removeBtn) removeBtn.classList.add("d-none");

  const actionWrap = ensureEditorActionButtons(serviceEl);
  actionWrap.classList.remove("d-none");

  const editBtn = actionWrap.querySelector("[data-service-edit]");
  const cancelBtn = actionWrap.querySelector("[data-service-cancel]");

  if (editBtn) editBtn.classList.remove("d-none");
  if (cancelBtn) cancelBtn.classList.add("d-none");
}

function showEditorElements(serviceEl) {
  serviceEl.querySelectorAll(
    '.service-header, [data-field="descripcion"], [data-field="observaciones"], [data-field="adjuntos"], .row.g-2.mb-2'
  ).forEach(el => el.classList.remove("d-none"));

  const tipo = getField(serviceEl, "tipo");
  toggleSpecificFields(serviceEl, tipo);

  const removeBtn = serviceEl.querySelector("[data-remove]");
  if (removeBtn) removeBtn.classList.remove("d-none");

  const actionWrap = ensureEditorActionButtons(serviceEl);
  actionWrap.classList.remove("d-none");

  const editBtn = actionWrap.querySelector("[data-service-edit]");
  const cancelBtn = actionWrap.querySelector("[data-service-cancel]");

  if (editBtn) editBtn.classList.add("d-none");
  if (cancelBtn) cancelBtn.classList.remove("d-none");
}

function ensureEditorActionButtons(serviceEl) {
  let wrap = serviceEl.querySelector(".service-mode-actions");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.className = "service-mode-actions d-flex gap-2 mt-2";
  wrap.innerHTML = `
    <button type="button" class="btn btn-sm btn-outline-secondary" data-service-edit>Editar</button>
    <button type="button" class="btn btn-sm btn-outline-secondary d-none" data-service-cancel>Cancelar</button>
  `;

  serviceEl.appendChild(wrap);
  return wrap;
}

function syncLivePreviewIfAny(serviceEl) {
  const preview = serviceEl.querySelector(".service-preview");
  if (!preview || preview.classList.contains("d-none")) return;

  const payload = buildServicePayload(serviceEl);
  if (!payload) return;

  preview.innerHTML = buildServicePreviewHtml(payload);
}

/* =========================================
   PREVIEW HTML
========================================= */
function buildServicePreviewHtml(service = {}) {
  const tipo = service.tipo || service.categoria || "-";
  const descripcion = service.descripcion || "-";
  const observaciones = service.observaciones || "";
  const moneda = service.moneda || "USD";
  const precioAdulto = Number(service.precio_adulto || 0).toFixed(2);
  const precioMenor = Number(service.precio_menor || 0).toFixed(2);
  const adultos = Number(service.adultos || 0);
  const menores = Number(service.menores || 0);
  const subtotal = Number(service.subtotal || 0).toFixed(2);
  const metadata = normalizeMetadata(service.metadata);

  const metadataHtml = buildMetadataPreview(tipo, metadata);

  return `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
      <div class="flex-grow-1">
        <div class="fw-semibold mb-1">${escapeHtml(capitalize(tipo))}</div>
        <div class="small mb-1"><strong>Descripción:</strong> ${escapeHtml(descripcion)}</div>
        ${observaciones ? `<div class="small mb-1"><strong>Observaciones:</strong> ${escapeHtml(observaciones)}</div>` : ""}
        <div class="small mb-1">
          <strong>Precio adulto:</strong> ${escapeHtml(moneda)} ${escapeHtml(precioAdulto)}
        </div>
        <div class="small mb-1">
          <strong>Precio menor:</strong> ${escapeHtml(moneda)} ${escapeHtml(precioMenor)}
        </div>
        <div class="small mb-1">
          <strong>Pasajeros:</strong> Adultos ${adultos} / Menores ${menores}
        </div>
        <div class="small mb-1">
          <strong>Subtotal:</strong> ${escapeHtml(moneda)} ${escapeHtml(subtotal)}
        </div>
        ${metadataHtml}
      </div>
    </div>
  `;
}

function buildMetadataPreview(tipo, metadata = {}) {
  const lines = [];

  if (tipo === "hotel") {
    if (metadata.field_0) lines.push(`Check-in: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Check-out: ${metadata.field_1}`);
  }

  if (tipo === "aereo") {
    if (metadata.field_0) lines.push(`Aerolínea: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Vuelo: ${metadata.field_1}`);
    if (metadata.field_2) lines.push(`Fecha/hora: ${metadata.field_2}`);
    if (metadata.field_3) lines.push(`Origen/Destino: ${metadata.field_3}`);
  }

  if (tipo === "tren") {
    if (metadata.field_0) lines.push(`Fecha/hora: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Lugar salida/llegada: ${metadata.field_1}`);
  }

  if (tipo === "auto") {
    if (metadata.field_0) lines.push(`Proveedor: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Vehículo: ${metadata.field_1}`);
    if (metadata.field_2) lines.push(`Coberturas: ${metadata.field_2}`);
  }

  if (!lines.length) return "";

  return `
    <div class="small mt-2">
      <strong>Detalle específico:</strong>
      <ul class="mb-0 mt-1">
        ${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </div>
  `;
}

/* =========================================
   SPECIFIC FIELDS
========================================= */
function toggleSpecificFields(serviceEl, type) {
  serviceEl.querySelectorAll(".service-specific")
    .forEach(div => div.classList.add("hidden"));

  const block = serviceEl.querySelector(`.service-specific[data-specific="${type}"]`);
  if (block) {
    block.classList.remove("hidden");
  }
}

function hydrateSpecificFields(serviceEl, type, metadata) {
  const block = serviceEl.querySelector(`.service-specific[data-specific="${type}"]`);
  if (!block) return;

  const inputs = block.querySelectorAll("input, select, textarea");

  inputs.forEach((input, index) => {
    const keyByName = input.name;
    const keyByDataset = input.dataset.meta;
    const keyByIndex = `field_${index}`;

    const value =
      metadata[keyByName] ??
      metadata[keyByDataset] ??
      metadata[keyByIndex] ??
      "";

    input.value = value;
  });
}

function collectSpecificMetadata(card, tipo) {
  const metadata = {};
  const block = card.querySelector(`.service-specific[data-specific="${tipo}"]`);
  if (!block) return metadata;

  block.querySelectorAll("input, select, textarea").forEach((input, index) => {
    const key = input.name || input.dataset.meta || `field_${index}`;
    metadata[key] = input.value ?? "";
  });

  return metadata;
}

function clearSpecificFields(serviceEl) {
  serviceEl.querySelectorAll(".service-specific input, .service-specific select, .service-specific textarea")
    .forEach(input => {
      if (input.type === "checkbox" || input.type === "radio") {
        input.checked = false;
      } else {
        input.value = "";
      }
    });
}

function setDefaultSpecificFields(serviceEl, type) {
  const block = serviceEl.querySelector(`.service-specific[data-specific="${type}"]`);
  if (!block) return;

  const inputs = block.querySelectorAll("input, select, textarea");
  inputs.forEach(input => {
    if (input.tagName === "SELECT" && input.options.length) {
      input.selectedIndex = 0;
    }
  });
}

/* =========================================
   BUILD PAYLOAD
========================================= */
function buildServicePayload(card) {
  const tipo = getField(card, "tipo");

  if (!tipo) return null;

  const precioAdulto = Number(getField(card, "precio_adulto") || 0);
  const precioMenor = Number(getField(card, "precio_menor") || 0);
  const adultos = Number(getField(card, "adultos") || 0);
  const menores = Number(getField(card, "menores") || 0);
  const subtotal = Number(getField(card, "subtotal") || 0);

  const payload = {
    cotizacion_id: Number(appState.activeQuoteId),
    tipo,
    categoria: tipo,
    descripcion: getField(card, "descripcion"),
    observaciones: getField(card, "observaciones"),
    moneda: getField(card, "moneda") || "USD",
    precio: precioAdulto,
    adultos,
    menores,
    subtotal,
    metadata: {
      ...collectSpecificMetadata(card, tipo),
      precio_adulto: precioAdulto,
      precio_menor: precioMenor
    }
  };

  if (card.dataset.backendId) {
    payload.id = Number(card.dataset.backendId);
  }

  return payload;
}

/* =========================================
   SUBTOTAL
========================================= */
function updateServiceSubtotal(serviceEl) {
  const precioAdulto = Number(getField(serviceEl, "precio_adulto") || 0);
  const precioMenor = Number(getField(serviceEl, "precio_menor") || 0);
  const adultos = Number(getField(serviceEl, "adultos") || 0);
  const menores = Number(getField(serviceEl, "menores") || 0);

  const subtotal = (precioAdulto * adultos) + (precioMenor * menores);
  setField(serviceEl, "subtotal", subtotal.toFixed(2));
}

/* =========================================
   TOTALES
========================================= */
function updateTotals() {
  const totals = {
    hotel: 0,
    aereo: 0,
    traslado: 0,
    excursion: 0,
    asistencia: 0,
    crucero: 0,
    tren: 0,
    auto: 0,
    gastos: 0
  };

  document.querySelectorAll(".service-card").forEach(card => {
    const tipo =
      card.dataset.serviceTipo ||
      getField(card, "tipo");

    const subtotal = Number(getField(card, "subtotal") || 0);

    if (!tipo) return;

    if (typeof totals[tipo] === "undefined") {
      totals[tipo] = 0;
    }

    totals[tipo] += subtotal;
  });

  Object.entries(totals).forEach(([key, sum]) => {
    const totalEl = document.querySelector(`[data-total-category="${key}"]`);
    if (totalEl) {
      totalEl.textContent = `USD ${sum.toFixed(2)}`;
    }
  });

  const totalGeneral = Object.values(totals)
    .reduce((acc, value) => acc + Number(value || 0), 0);

  const totalGeneralEl = document.querySelector("[data-total-general]");
  if (totalGeneralEl) {
    totalGeneralEl.textContent = `USD ${totalGeneral.toFixed(2)}`;
  }
}

function resetTotals() {
  document.querySelectorAll("[data-total-category]").forEach(el => {
    el.textContent = "USD 0.00";
  });

  const totalGeneralEl = document.querySelector("[data-total-general]");
  if (totalGeneralEl) {
    totalGeneralEl.textContent = "USD 0.00";
  }
}

/* =========================================
   EMPTY STATE
========================================= */
function renderEmptyServicesState(message) {
  const list = document.querySelector(".services-list");
  if (!list) return;

  list.innerHTML = `
    <div class="service-empty-state border rounded p-3 text-muted small">
      ${escapeHtml(message)}
    </div>
  `;
}

function removeEmptyServicesState() {
  document.querySelectorAll(".service-empty-state").forEach(empty => empty.remove());
}

function clearServicesList() {
  document.querySelectorAll(".services-list").forEach(list => {
    list.innerHTML = "";
  });
}

function resetServicesUI() {
  clearServicesList();
  renderEmptyServicesState("Seleccioná una cotización para cargar los servicios.");
  resetTotals();
  syncServiceFilterUI();
}

/* =========================================
   HELPERS
========================================= */
async function safeJson(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return res.json();
}

function getField(root, key) {
  return root.querySelector(`[data-field="${key}"]`)?.value || "";
}

function setField(root, key, value) {
  const el = root.querySelector(`[data-field="${key}"]`);
  if (el) {
    el.value = value ?? "";
  }
}

function normalizeMetadata(metadata) {
  if (!metadata) return {};

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return {};
}

function normalizeServiceData(service = {}) {
  const metadata = normalizeMetadata(service.metadata);

  const precioAdulto =
    metadata.precio_adulto ??
    service.precio_adulto ??
    service.precio ??
    0;

  const precioMenor =
    metadata.precio_menor ??
    service.precio_menor ??
    0;

  const adultos = Number(service.adultos || 0);
  const menores = Number(service.menores || 0);

  const subtotalRaw =
    service.subtotal ??
    (Number(precioAdulto || 0) * adultos) + (Number(precioMenor || 0) * menores);

  return {
    id: service.id || null,
    cotizacion_id: service.cotizacion_id || appState.activeQuoteId || null,
    tipo: service.tipo || service.categoria || "hotel",
    categoria: service.categoria || service.tipo || "hotel",
    descripcion: service.descripcion || "",
    observaciones: service.observaciones || "",
    moneda: service.moneda || "USD",
    precio_adulto: Number(precioAdulto || 0),
    precio_menor: Number(precioMenor || 0),
    adultos,
    menores,
    subtotal: Number(subtotalRaw || 0),
    metadata
  };
}

function parseServiceSnapshot(snapshot) {
  if (!snapshot) return null;

  try {
    return normalizeServiceData(JSON.parse(snapshot));
  } catch {
    return null;
  }
}

function capitalize(value) {
  const str = String(value || "");
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}