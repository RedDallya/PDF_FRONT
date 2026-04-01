import { apiFetch } from "./api.js";
import { appState } from "./state.js";
import { getCompanyProfiles } from "./api.js";
/************************************************************
 * CONTEXTO ACTIVO
 ************************************************************/
function getActiveCotizacionId() {
  return appState.activeQuoteId || null;
}

/************************************************************
 * ESTADO LOCAL
 ************************************************************/
let pdfSectionsState = [];
let tempSectionCounter = 0;
let pdfContextData = {
  quote: null,
  client: null,
  trip: null,
  services: [],
  vouchers: [],
  operators: []
};
let activePdfProfileId = null;

/************************************************************
 * INIT
 ************************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  bindPdfBuilderActions();
  await loadPdfProfiles();
  await syncPdfContext();
});

/************************************************************
 * EVENTOS DE CONTEXTO
 ************************************************************/
document.addEventListener("travel-selected", syncPdfContext);
document.addEventListener("travel-cleared", resetPdfUI);
document.addEventListener("client-selected", () => {
  if (!appState.activeTravelId || !appState.activeQuoteId) {
    resetPdfUI();
  }
});
document.addEventListener("travel-saved", syncPdfContext);
document.addEventListener("quote-tab-changed", syncPdfContext);


document.addEventListener("change", e => {
  const select = e.target.closest("[data-pdf-profile-select]");
  if (!select) return;

  activePdfProfileId = select.value ? Number(select.value) : null;
  localStorage.setItem("active_pdf_profile_id", activePdfProfileId ? String(activePdfProfileId) : "");
});
/************************************************************
 * GENERAR PDF
 ************************************************************/
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-pdf-generate]");
  if (!btn) return;

  const type = btn.dataset.pdfType || "partial";
  const cotizacionId = getActiveCotizacionId();

  if (!cotizacionId) {
    alert("No hay cotización activa.");
    return;
  }

  try {
    if (!activePdfProfileId) {
      alert("Seleccioná un perfil de PDF antes de generar.");
      return;
    }

    const res = await apiFetch(
      `/pdfs/${type}?cotizacion_id=${cotizacionId}&profile_id=${activePdfProfileId}`
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }
  catch (err) {
    console.error("Error generando PDF", err);
    alert("Error generando PDF");
  }
});

/************************************************************
 * SYNC GENERAL
 ************************************************************/
async function syncPdfContext() {
  const id = getActiveCotizacionId();

  if (!id) {
    resetPdfUI();
    return;
  }

  await Promise.all([
    loadPdfContextData(id),
    loadPdfSections(id),
    loadPdfs(id)
  ]);

  renderActivePdfSummary();
}

/************************************************************
 * CARGA CONTEXTO REAL DE LA COTIZACIÓN ACTIVA
 ************************************************************/
async function loadPdfContextData(cotizacionId) {
  pdfContextData = {
    quote: null,
    client: null,
    trip: null,
    services: [],
    vouchers: [],
    operators: []
  };

  try {
    const quoteRes = await apiFetch(`/cotizaciones/${cotizacionId}`);
    pdfContextData.quote = await quoteRes.json();
  } catch (err) {
    console.error("Error cargando cotización activa para PDF", err);
  }

  try {
    if (appState.activeTravelId) {
      const tripRes = await apiFetch(`/viajes/${appState.activeTravelId}`);
      pdfContextData.trip = await tripRes.json();
    }
  } catch (err) {
    console.error("Error cargando viaje activo para PDF", err);
  }

  try {
    if (appState.activeClientId) {
      const clientRes = await apiFetch(`/clientes/${appState.activeClientId}`);
      pdfContextData.client = await clientRes.json();
    }
  } catch (err) {
    console.error("Error cargando cliente activo para PDF", err);
  }

  try {
    const servicesRes = await apiFetch(`/servicios/cotizacion/${cotizacionId}`);
    const services = await servicesRes.json();
    pdfContextData.services = Array.isArray(services) ? services : [];
  } catch (err) {
    console.error("Error cargando servicios activos para PDF", err);
  }

  try {
    if (appState.activeTravelId) {
      const vouchersRes = await apiFetch(`/vouchers/viaje/${appState.activeTravelId}`);
      const vouchers = await vouchersRes.json();
      pdfContextData.vouchers = Array.isArray(vouchers) ? vouchers : [];
    }
  } catch (err) {
    pdfContextData.vouchers = [];
  }

  try {
    if (appState.activeTravelId) {
      const operatorsRes = await apiFetch(`/operadores/viaje/${appState.activeTravelId}`);
      const operators = await operatorsRes.json();
      pdfContextData.operators = Array.isArray(operators) ? operators : [];
    }
  } catch (err) {
    pdfContextData.operators = [];
  }
}

function renderActivePdfSummary() {
  const box = document.querySelector("[data-pdf-active-summary]");
  if (!box) return;

  const quote = pdfContextData.quote;
  const trip = pdfContextData.trip;
  const client = pdfContextData.client;
  const services = pdfContextData.services || [];

  if (!quote) {
    box.textContent = "Seleccioná una cotización para ver el contenido disponible.";
    return;
  }

  box.innerHTML = `
    <div><strong>Cotización:</strong> ${escapeHtml(quote.titulo || `#${quote.id || "-"}`)}</div>
    <div><strong>Cliente:</strong> ${escapeHtml(client?.nombre || quote?.cliente_nombre || "-")}</div>
    <div><strong>Viaje:</strong> ${escapeHtml(trip?.destino || trip?.nombre || "-")}</div>
    <div><strong>Servicios cargados:</strong> ${services.length}</div>
  `;
}

/************************************************************
 * SECCIONES
 ************************************************************/
export async function loadPdfSections(cotizacionId = null) {
  const id = cotizacionId || getActiveCotizacionId();
  const container = document.querySelector("[data-pdf-sections-list]");

  if (!container) return;

  if (!id) {
    pdfSectionsState = [];
    renderPdfSectionsEmpty("Seleccioná una cotización.");
    return;
  }

  try {

    const res = await apiFetch(`/pdf-sections/${id}`);

    if (!res.ok) {
      pdfSectionsState = [];
      renderPdfSectionsEmpty("No hay secciones configuradas.");
      return;
    }

    const sections = await res.json();
    if (!Array.isArray(sections) || !sections.length) {
      pdfSectionsState = [];
      renderPdfSectionsEmpty("No hay secciones configuradas.");
      return;
    }

    pdfSectionsState = sections
      .map(normalizeSection)
      .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

    renderPdfSections(pdfSectionsState);
  } catch (err) {
    console.error(err);
    pdfSectionsState = [];
    renderPdfSectionsEmpty("Error cargando secciones.");
  }
}

/************************************************************
 * BUILDER ACTIONS
 ************************************************************/
function bindPdfBuilderActions() {
  document.addEventListener("click", async e => {
    const addBtn = e.target.closest("[data-add-pdf-section]");
    if (addBtn) {
      const tipo = addBtn.dataset.addPdfSection;
      await handleAddSection(tipo);
      return;
    }

    const deleteBtn = e.target.closest("[data-delete-section]");
    if (deleteBtn) {
      const card = deleteBtn.closest("[data-pdf-section-card]");
      if (!card) return;

      await handleDeleteSection(card.dataset.sectionId);
      return;
    }

    const upBtn = e.target.closest("[data-move-up]");
    if (upBtn) {
      const card = upBtn.closest("[data-pdf-section-card]");
      if (!card) return;
      moveSection(card.dataset.sectionId, -1);
      return;
    }

    const downBtn = e.target.closest("[data-move-down]");
    if (downBtn) {
      const card = downBtn.closest("[data-pdf-section-card]");
      if (!card) return;
      moveSection(card.dataset.sectionId, 1);
      return;
    }

    const saveAllBtn = e.target.closest("[data-pdf-save-all]");
    if (saveAllBtn) {
      await saveAllPdfSections();
      return;
    }

    const resetBtn = e.target.closest("[data-pdf-reset]");
    if (resetBtn) {
      await resetPdfSections();
    }
  });

  document.addEventListener("input", e => {
    const contentWrap = e.target.closest("[data-pdf-section-content]");
    if (!contentWrap) return;

    const card = e.target.closest("[data-pdf-section-card]");
    if (!card) return;

    syncSectionFromDom(card);
  });
}

async function handleAddSection(tipo) {
  const cotizacionId = getActiveCotizacionId();
  if (!cotizacionId) {
    alert("Seleccioná una cotización primero.");
    return;
  }

  const singletonTypes = [
    "cliente",
    "viaje",
    "servicios",
    "vouchers",
    "operadores",
    "totales",
    "titulo"
  ];

  if (singletonTypes.includes(tipo)) {
    const alreadyExists = pdfSectionsState.some(s => s.tipo === tipo);
    if (alreadyExists) {
      alert("Esa sección ya está agregada en el builder.");
      return;
    }
  }

  const section = normalizeSection({
    id: `tmp_${Date.now()}_${tempSectionCounter++}`,
    cotizacion_id: cotizacionId,
    tipo,
    titulo: getDefaultTitleByType(tipo),
    contenido: getDefaultContentByType(tipo),
    orden: pdfSectionsState.length
  });

  pdfSectionsState.push(section);
  renderPdfSections(pdfSectionsState);
}

async function handleDeleteSection(sectionId) {
  const found = pdfSectionsState.find(s => String(s.id) === String(sectionId));
  if (!found) return;

  if (!confirm("¿Eliminar sección?")) return;

  try {
    if (!String(sectionId).startsWith("tmp_")) {
      await apiFetch(`/pdf-sections/${sectionId}`, { method: "DELETE" });
    }

    pdfSectionsState = pdfSectionsState
      .filter(s => String(s.id) !== String(sectionId))
      .map((s, index) => ({ ...s, orden: index }));

    if (!pdfSectionsState.length) {
      renderPdfSectionsEmpty("No hay secciones configuradas.");
      return;
    }

    renderPdfSections(pdfSectionsState);
  } catch (err) {
    console.error("Error eliminando sección PDF", err);
    alert("No se pudo eliminar la sección.");
  }
}

function moveSection(sectionId, direction) {
  const index = pdfSectionsState.findIndex(s => String(s.id) === String(sectionId));
  if (index === -1) return;

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= pdfSectionsState.length) return;

  const cloned = [...pdfSectionsState];
  [cloned[index], cloned[nextIndex]] = [cloned[nextIndex], cloned[index]];

  pdfSectionsState = cloned.map((section, idx) => ({
    ...section,
    orden: idx
  }));

  renderPdfSections(pdfSectionsState);
}

async function saveAllPdfSections() {
  const cotizacionId = getActiveCotizacionId();
  if (!cotizacionId) {
    alert("Seleccioná una cotización primero.");
    return;
  }

  try {
    for (let i = 0; i < pdfSectionsState.length; i++) {
      const section = {
        ...pdfSectionsState[i],
        cotizacion_id: cotizacionId,
        orden: i
      };

      if (String(section.id).startsWith("tmp_")) {
        const res = await apiFetch("/pdf-sections", {
          method: "POST",
          body: JSON.stringify({
            cotizacion_id: section.cotizacion_id,
            tipo: section.tipo,
            titulo: section.titulo,
            contenido: section.contenido,
            orden: section.orden
          })
        });

        const created = await res.json();

        pdfSectionsState[i] = normalizeSection({
          ...section,
          id: created.id
        });
      } else {
        await apiFetch(`/pdf-sections/${section.id}`, {
          method: "PUT",
          body: JSON.stringify({
            tipo: section.tipo,
            titulo: section.titulo,
            contenido: section.contenido,
            orden: section.orden
          })
        });
      }
    }

    await loadPdfSections(cotizacionId);
    alert("Estructura PDF guardada.");
  } catch (err) {
    console.error("Error guardando estructura PDF", err);
    alert("No se pudo guardar la estructura PDF.");
  }
}

async function resetPdfSections() {
  const cotizacionId = getActiveCotizacionId();
  if (!cotizacionId) {
    alert("Seleccioná una cotización primero.");
    return;
  }

  if (!confirm("¿Resetear secciones no guardadas y recargar desde la base?")) return;

  await loadPdfSections(cotizacionId);
}

/************************************************************
 * RENDER SECCIONES
 ************************************************************/
function renderPdfSections(sections) {
  const container = document.querySelector("[data-pdf-sections-list]");
  if (!container) return;

  container.innerHTML = "";

  sections.forEach(section => {
    const template = document.getElementById("pdf-section-template");
    if (!template) return;

    const node = template.content.cloneNode(true);
    const card = node.querySelector(".pdf-section");
    if (!card) return;

    card.setAttribute("data-pdf-section-card", "");
    card.dataset.sectionId = section.id;
    card.dataset.sectionType = section.tipo;

    const titleEl = card.querySelector("[data-pdf-section-title]");
    if (titleEl) {
      titleEl.textContent = section.titulo || getDefaultTitleByType(section.tipo);
    }

    const deleteBtn = card.querySelector("[data-delete]");
    if (deleteBtn) {
      deleteBtn.setAttribute("data-delete-section", section.id);
    }

    const contentWrap = card.querySelector("[data-pdf-section-content]");
    if (contentWrap) {
      contentWrap.innerHTML = "";
      contentWrap.appendChild(buildSectionEditor(section));
    }

    container.appendChild(card);
  });
}

function renderPdfSectionsEmpty(message) {
  const container = document.querySelector("[data-pdf-sections-list]");
  if (!container) return;

  container.innerHTML = `
    <div class="border rounded p-3 text-muted small">
      ${escapeHtml(message)}
    </div>
  `;
}

function buildSectionEditor(section) {
  const tipo = section.tipo;
  const contenido = parseContenido(section.contenido);

  const wrap = document.createElement("div");
  wrap.setAttribute("data-pdf-section-editor", "");
  wrap.dataset.sectionType = tipo;

  if (tipo === "titulo" || tipo === "mensaje" || tipo === "observaciones") {
    wrap.innerHTML = `
      <label class="small d-block mb-1">Texto</label>
      <textarea class="form-control form-control-sm" rows="3" data-pdf-field="texto">${escapeHtml(
      contenido.texto || ""
    )}</textarea>

      <div class="small text-muted mt-2">
        Esta sección es manual y se usa tal cual se escribe acá.
      </div>
    `;
    return wrap;
  }

  wrap.innerHTML = `
    <div class="border rounded p-3 bg-light">
      <div class="small text-muted mb-2">
        Esta sección consume automáticamente los datos cargados en la cotización activa.
      </div>
      <div class="small">
        ${buildDataSectionPreview(tipo)}
      </div>
    </div>
  `;

  return wrap;
}

function buildDataSectionPreview(tipo) {
  const { quote, client, trip, services, vouchers, operators } = pdfContextData;

  switch (tipo) {
    case "cliente":
      return `
        <strong>Cliente:</strong> ${escapeHtml(client?.nombre || quote?.cliente_nombre || "-")}<br>
        <strong>Email:</strong> ${escapeHtml(client?.email || "-")}<br>
        <strong>Teléfono:</strong> ${escapeHtml(client?.telefono || "-")}
      `;

    case "viaje":
      return `
        <strong>Destino:</strong> ${escapeHtml(trip?.destino || "-")}<br>
        <strong>Fecha inicio:</strong> ${escapeHtml(formatDate(trip?.fecha_inicio) || "-")}<br>
        <strong>Fecha fin:</strong> ${escapeHtml(formatDate(trip?.fecha_fin) || "-")}<br>
        <strong>Estado:</strong> ${escapeHtml(trip?.estado || "-")}
      `;

    case "servicios":
      if (!services?.length) {
        return "No hay servicios cargados en esta cotización.";
      }

      return services
        .map((s, i) => {
          const precioAdulto = getPrecioAdulto(s);
          const precioMenor = getPrecioMenor(s);

          return `
            <div class="mb-2">
              <strong>${i + 1}. ${escapeHtml(capitalize(s.tipo || s.categoria || "Servicio"))}</strong><br>
              ${escapeHtml(s.descripcion || "-")}<br>
              Adultos: ${Number(s.adultos || 0)} | Menores: ${Number(s.menores || 0)}<br>
              Precio adulto: ${escapeHtml(s.moneda || "USD")} ${Number(precioAdulto || 0).toFixed(2)}<br>
              Precio menor: ${escapeHtml(s.moneda || "USD")} ${Number(precioMenor || 0).toFixed(2)}<br>
              Subtotal: ${escapeHtml(s.moneda || "USD")} ${Number(s.subtotal || 0).toFixed(2)}
            </div>
          `;
        })
        .join("");

    case "vouchers":
      if (!vouchers?.length) {
        return "No hay vouchers visibles para este viaje.";
      }

      return vouchers
        .map((v, i) => `
          <div class="mb-2">
            <strong>${i + 1}. ${escapeHtml(v.tipo || "-")}</strong><br>
            Servicio: ${escapeHtml(v.servicio || "-")}<br>
            Proveedor: ${escapeHtml(v.proveedor || "-")}
          </div>
        `)
        .join("");

    case "operadores":
      if (!operators?.length) {
        return "No hay operadores cargados para este viaje.";
      }

      return operators
        .map((o, i) => `
          <div class="mb-2">
            <strong>${i + 1}. ${escapeHtml(o.nombre || "-")}</strong><br>
            Tipo: ${escapeHtml(o.tipo_servicio || "-")}<br>
            Contacto: ${escapeHtml(o.contacto || "-")}
          </div>
        `)
        .join("");

    case "totales":
      return `
        <strong>Total cotización:</strong> ${Number(quote?.total || 0).toFixed(2)}
      `;

    default:
      return "Sección automática basada en datos del sistema.";
  }
}

/************************************************************
 * PDFs
 ************************************************************/
export async function loadPdfs(cotizacionId = null) {
  const id = cotizacionId || getActiveCotizacionId();

  if (!id) {
    renderPdfListEmpty("Seleccioná una cotización.");
    return;
  }

  try {
    const res = await apiFetch(`/pdfs/${id}`);
    const pdfs = await res.json();

    if (!pdfs.length) {
      renderPdfListEmpty("No hay PDFs generados.");
      return;
    }

    renderPdfList(pdfs);
  } catch (err) {
    console.error(err);
    renderPdfListEmpty("Error cargando PDFs.");
  }
}

/************************************************************
 * LISTA PDF
 ************************************************************/
function renderPdfList(pdfs) {
  const container = getPdfListContainer();
  if (!container) return;

  container.innerHTML = "";

  pdfs.forEach(pdf => {
    const div = document.createElement("div");

    div.className = "border rounded p-3 mb-2 d-flex justify-content-between align-items-center flex-wrap gap-3";

    div.innerHTML = `
      <div>
        <strong>${escapeHtml(pdf.nombre)}</strong>
        <div class="small text-muted">${formatDateTime(pdf.created_at)}</div>
      </div>

      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" data-view>Ver</button>
        <button class="btn btn-sm btn-outline-primary" data-download>Descargar</button>
      </div>
    `;

    container.appendChild(div);

    const pdfUrl = buildPdfFileUrl(pdf.url);

    div.querySelector("[data-view]").onclick = () => {
      window.open(pdfUrl, "_blank");
    };

    div.querySelector("[data-download]").onclick = () => {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = pdf.nombre || "archivo.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  });
}

function renderPdfListEmpty(message) {
  const container = getPdfListContainer();
  if (!container) return;

  container.innerHTML = `<div class="text-muted small">${escapeHtml(message)}</div>`;
}

/************************************************************
 * HELPERS BUILDER
 ************************************************************/
function syncSectionFromDom(card) {
  const sectionId = card.dataset.sectionId;
  const sectionType = card.dataset.sectionType;
  const stateIndex = pdfSectionsState.findIndex(s => String(s.id) === String(sectionId));
  if (stateIndex === -1) return;

  const editor = card.querySelector("[data-pdf-section-editor]");
  const updatedContent = collectSectionContent(editor, sectionType);

  pdfSectionsState[stateIndex] = {
    ...pdfSectionsState[stateIndex],
    contenido: updatedContent
  };
}

function collectSectionContent(editor, tipo) {
  if (!editor) return {};

  if (tipo === "titulo" || tipo === "mensaje" || tipo === "observaciones") {
    return {
      texto: editor.querySelector('[data-pdf-field="texto"]')?.value || ""
    };
  }

  return {};
}

function normalizeSection(section = {}) {
  return {
    id: section.id,
    cotizacion_id: section.cotizacion_id || getActiveCotizacionId(),
    tipo: section.tipo || "observaciones",
    titulo: section.titulo || section.title || getDefaultTitleByType(section.tipo),
    contenido: parseContenido(section.contenido ?? section.content ?? {}),
    orden: Number(section.orden ?? 0)
  };
}

function getDefaultTitleByType(tipo) {
  switch (tipo) {
    case "titulo": return "Título";
    case "mensaje": return "Mensaje";
    case "observaciones": return "Observaciones";
    case "cliente": return "Cliente";
    case "viaje": return "Viaje";
    case "servicios": return "Servicios";
    case "vouchers": return "Vouchers";
    case "operadores": return "Operadores";
    case "totales": return "Totales";
    default: return "Sección";
  }
}

function getDefaultContentByType(tipo) {
  switch (tipo) {
    case "titulo":
      return { texto: "Título del viaje" };
    case "mensaje":
      return { texto: "Gracias por elegirnos." };
    case "observaciones":
      return { texto: "" };
    case "cliente":
    case "viaje":
    case "servicios":
    case "vouchers":
    case "operadores":
    case "totales":
      return {};
    default:
      return {};
  }
}
function buildPdfFileUrl(filePath = "") {
  if (!filePath) return "#";

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  const apiBase =
    window.API_BASE ||
    localStorage.getItem("api_base") ||
    `${window.location.protocol}//${window.location.hostname}:3000/api`;

  const backendOrigin = apiBase.replace(/\/api\/?$/, "");
  return `${backendOrigin}/${String(filePath).replace(/^\/+/, "")}`;
}
/************************************************************
 * HELPERS
 ************************************************************/
function getPdfListContainer() {
  let el = document.querySelector("[data-pdf-runtime-list]");
  if (el) return el;

  const parent = document.querySelector("[data-pdf-management]");
  if (!parent) return null;

  el = document.createElement("div");
  el.setAttribute("data-pdf-runtime-list", "");
  parent.appendChild(el);

  return el;
}

function parseContenido(c) {
  if (!c) return {};
  if (typeof c === "string") {
    try {
      return JSON.parse(c);
    } catch {
      return { texto: c };
    }
  }
  return c;
}

function formatDateTime(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function formatDate(v) {
  if (!v) return "";
  const raw = String(v);
  if (raw.includes("T")) return raw.split("T")[0];
  if (raw.includes(" ")) return raw.split(" ")[0];
  return raw;
}

function getPrecioAdulto(service = {}) {
  const metadata = parseContenido(service.metadata);
  return metadata.precio_adulto ?? service.precio_adulto ?? service.precio ?? 0;
}

function getPrecioMenor(service = {}) {
  const metadata = parseContenido(service.metadata);
  return metadata.precio_menor ?? service.precio_menor ?? 0;
}

function capitalize(v) {
  const s = String(v || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
async function loadPdfProfiles() {
  try {
    const profiles = await getCompanyProfiles();
    fillPdfProfileSelect(profiles || []);

    const saved = Number(localStorage.getItem("active_pdf_profile_id") || 0);

    if (saved && profiles.some(p => Number(p.id) === saved)) {
      activePdfProfileId = saved;
    } else if (profiles.length) {
      activePdfProfileId = Number(profiles[0].id);
    } else {
      activePdfProfileId = null;
    }

    const select = document.querySelector("[data-pdf-profile-select]");
    if (select) {
      select.value = activePdfProfileId ? String(activePdfProfileId) : "";
    }
  } catch (err) {
    console.error("Error cargando perfiles PDF", err);
  }
}

function fillPdfProfileSelect(profiles = []) {
  const select = document.querySelector("[data-pdf-profile-select]");
  if (!select) return;

  select.innerHTML = `<option value="">Seleccionar perfil</option>`;

  profiles.forEach(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.profile_name || `Perfil ${profile.id}`;
    select.appendChild(option);
  });
}
/************************************************************
 * RESET
 ************************************************************/
function resetPdfUI() {
  pdfSectionsState = [];
  pdfContextData = {
    quote: null,
    client: null,
    trip: null,
    services: [],
    vouchers: [],
    operators: []
  };

  const summary = document.querySelector("[data-pdf-active-summary]");
  if (summary) {
    summary.textContent = "Seleccioná una cotización para ver el contenido disponible.";
  }

  renderPdfSectionsEmpty("Seleccioná una cotización.");
  renderPdfListEmpty("Seleccioná una cotización.");
}