import { apiFetch } from "./api.js";
import { appState, setQuoteTab, setActiveQuoteId } from "./state.js";
import { loadServicios } from "./services.js";

/* =========================
   UTIL
========================= */
async function safeJson(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return res.json();
}

function q(selector) {
  return document.querySelector(selector);
}

function setValue(selector, value) {
  const el = q(selector);
  if (el) el.value = value ?? "";
}

function getValue(selector) {
  return q(selector)?.value || "";
}

function clearQuoteForm() {
  setValue('[data-basic="idpresupuesto"]', "");
  setValue('[data-basic="titulo"]', "");
  setValue('[data-basic="cliente_nom"]', "");
  setValue('[data-basic="creationfecha"]', "");
  setValue('[data-basic="condicion_legal"]', "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateForInput(value) {
  if (!value) return "";
  const raw = String(value);
  if (raw.includes("T")) return raw.split("T")[0];
  if (raw.includes(" ")) return raw.split(" ")[0];
  return raw;
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "USD 0.00";
  return `USD ${num.toFixed(2)}`;
}

function clearQuotesList() {
  const container = document.getElementById("quotes-list");
  if (container) container.innerHTML = "";
}

function clearTravelHeader() {
  const header = document.getElementById("travel-header");
  if (header) header.innerHTML = "";
}

function resetQuoteContext() {
  setActiveQuoteId(null);
  clearQuoteForm();
  clearQuotesList();
  clearTravelHeader();
}

/* =========================
   HEADER DEL VIAJE
========================= */
async function renderTravelHeader() {
  try {
    if (!appState.activeTravelId) {
      clearTravelHeader();
      setValue('[data-basic="cliente_nom"]', "");
      return;
    }

    const res = await apiFetch(`/viajes/${appState.activeTravelId}`);
    const viaje = await safeJson(res);

    const header = document.getElementById("travel-header");
    if (header) {
      header.innerHTML = `
        <div class="border rounded p-3 bg-light">
          <div class="fw-semibold mb-1">
            ${escapeHtml(viaje?.nombre || viaje?.destino || `Viaje #${appState.activeTravelId}`)}
          </div>
          <div class="small text-muted">
            Cliente: ${escapeHtml(viaje?.cliente_nombre || "-")}
          </div>
          <div class="small text-muted">
            Fecha inicio: ${escapeHtml(formatDateForInput(viaje?.fecha_inicio) || "-")}
          </div>
        </div>
      `;
    }

    setClienteEnFormulario(viaje);
  } catch (err) {
    console.error("Error cargando header del viaje:", err);
  }
}

function setClienteEnFormulario(viaje) {
  setValue('[data-basic="cliente_nom"]', viaje?.cliente_nombre || "");
}

/* =========================
   LISTAR COTIZACIONES
========================= */
export async function loadQuotes() {
  try {
    const container = document.getElementById("quotes-list");
    if (!container) return;

    if (!appState.activeTravelId) {
      resetQuoteContext();
      container.innerHTML = `
        <div class="small text-muted">
          Seleccioná un viaje para ver sus cotizaciones.
        </div>
      `;
      return;
    }

    const res = await apiFetch(`/cotizaciones/viaje/${appState.activeTravelId}`);
    const quotes = await safeJson(res);

    container.innerHTML = "";
    await renderTravelHeader();

    if (!Array.isArray(quotes) || !quotes.length) {
      setActiveQuoteId(null);
      clearQuoteForm();

      container.innerHTML = `
        <div class="small text-muted">
          No hay cotizaciones cargadas para este viaje.
        </div>
      `;
      return;
    }

    const existsActive = quotes.some(qt => Number(qt.id) === Number(appState.activeQuoteId));
    if (!existsActive) {
      setActiveQuoteId(null); // 👈 clave
    }

    quotes.forEach(qt => {
      const isActive = Number(qt.id) === Number(appState.activeQuoteId);

      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="quote-item border rounded p-3 mb-2 ${isActive ? "quote-selected" : ""}" data-quote-item="${qt.id}">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div class="flex-grow-1">
              <button
                type="button"
                class="btn btn-sm ${isActive ? "btn-primary" : "btn-outline-primary"}"
                data-select-quote="${qt.id}"
              >
                ${escapeHtml(qt.titulo || `Cotización #${qt.id}`)}
              </button>

              <div class="small text-muted mt-2">
                Condición legal: ${escapeHtml(qt.condicion_legal || "-")}
              </div>

              <div class="small text-muted">
                Fecha: ${escapeHtml(formatDateForInput(qt.fecha_creacion) || "-")}
              </div>

              <div class="small text-muted">
                Estado: ${escapeHtml(qt.estado || "-")}
              </div>

              <div class="small text-muted">
                Total: ${escapeHtml(formatMoney(qt.total))}
              </div>
            </div>

            <div class="d-flex gap-2 flex-wrap">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-edit-quote="${qt.id}"
              >
                Editar
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-delete-quote="${qt.id}"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
        `
      );
    });

    if (appState.activeQuoteId) {
      const activeQuote = quotes.find(qt => Number(qt.id) === Number(appState.activeQuoteId));
      if (activeQuote) {
        fillQuoteForm(activeQuote);
      }
    }

    updateQuoteSelectionUI();
  } catch (err) {
    console.error("Error cargando cotizaciones:", err);
  }
}

/* =========================
   CARGAR UNA COTIZACIÓN
========================= */
async function loadQuoteById(id) {
  if (!id) return null;

  try {
    const res = await apiFetch(`/cotizaciones/${id}`);
    const cotizacion = await safeJson(res);
    fillQuoteForm(cotizacion);
    return cotizacion;
  } catch (err) {
    console.error("Error cargando cotización:", err);
    return null;
  }
}

function fillQuoteForm(cotizacion = {}) {
  setValue('[data-basic="idpresupuesto"]', cotizacion.id || "");
  setValue('[data-basic="titulo"]', cotizacion.titulo || "");
  setValue('[data-basic="condicion_legal"]', cotizacion.condicion_legal || "");
  setValue(
    '[data-basic="creationfecha"]',
    formatDateForInput(cotizacion.fecha_creacion || cotizacion.creationfecha || "")
  );

  if (cotizacion.cliente_nombre) {
    setValue('[data-basic="cliente_nom"]', cotizacion.cliente_nombre);
  }
}

/* =========================
   SELECCIONAR COTIZACIÓN
========================= */
async function selectQuote(id, { openServicios = false } = {}) {
  if (!id) return;

  setActiveQuoteId(Number(id));
  await loadQuoteById(id);
  updateQuoteSelectionUI();

  if (openServicios) {
    setQuoteTab("servicios");
    document.dispatchEvent(new Event("quote-tab-changed"));
  }

  try {
    await loadServicios();
  } catch (err) {
    console.error("Error cargando servicios:", err);
  }
}

function updateQuoteSelectionUI() {
  document.querySelectorAll("[data-quote-item]").forEach(item => {
    const id = Number(item.dataset.quoteItem);
    const isActive = id === Number(appState.activeQuoteId);

    item.classList.toggle("quote-selected", isActive);

    const btn = item.querySelector("[data-select-quote]");
    if (btn) {
      btn.classList.remove("btn-primary", "btn-outline-primary");
      btn.classList.add(isActive ? "btn-primary" : "btn-outline-primary");
    }
  });
}

/* =========================
   GUARDAR
========================= */
document.addEventListener("click", async e => {
  if (!e.target.closest("[data-quote-save]")) return;

  if (!appState.activeTravelId) {
    alert("Seleccioná un viaje antes de guardar una cotización.");
    return;
  }

  const id = getValue('[data-basic="idpresupuesto"]');

  const payload = {
    viaje_id: appState.activeTravelId,
    titulo: getValue('[data-basic="titulo"]'),
    condicion_legal: getValue('[data-basic="condicion_legal"]'),
    fecha_creacion: getValue('[data-basic="creationfecha"]') || null
  };

  try {
    if (id) {
      await apiFetch(`/cotizaciones/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setActiveQuoteId(Number(id));
    } else {
      const res = await apiFetch("/cotizaciones", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const created = await safeJson(res);
      setActiveQuoteId(created?.id ? Number(created.id) : null);
    }

    await loadQuotes();

    if (appState.activeQuoteId) {
      await selectQuote(appState.activeQuoteId, { openServicios: false });
    }

    alert("Cotización guardada");
  } catch (err) {
    console.error("Error guardando cotización:", err);
  }
});

/* =========================
   ELIMINAR
========================= */
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-delete-quote]");
  if (!btn) return;

  const id = btn.dataset.deleteQuote;
  if (!id) return;

  if (!confirm("¿Eliminar cotización?")) return;

  try {
    await apiFetch(`/cotizaciones/${id}`, {
      method: "DELETE"
    });

    if (Number(appState.activeQuoteId) === Number(id)) {
      setActiveQuoteId(null);
      clearQuoteForm();
    }

    await loadQuotes();

    if (appState.activeQuoteId) {
      await selectQuote(appState.activeQuoteId, { openServicios: false });
    } else {
      try {
        await loadServicios();
      } catch (err) {
        console.error("Error limpiando servicios tras eliminar cotización:", err);
      }
    }
  } catch (err) {
    console.error("Error eliminando cotización:", err);
  }
});

/* =========================
   EDITAR / SELECCIONAR
========================= */
document.addEventListener("click", async e => {
  const selectBtn = e.target.closest("[data-select-quote]");
  if (selectBtn) {
    const id = selectBtn.dataset.selectQuote;
    if (!id) return;

    await selectQuote(id, { openServicios: true });
    return;
  }

  const editBtn = e.target.closest("[data-edit-quote]");
  if (editBtn) {
    const id = editBtn.dataset.editQuote;
    if (!id) return;

    setQuoteTab("presupuesto");
    document.dispatchEvent(new Event("quote-tab-changed"));

    await selectQuote(id, { openServicios: false });
    return;
  }
});
/* =========================
   NUEVA COTIZACIÓN
========================= */
document.addEventListener("click", e => {
  if (!e.target.closest("[data-quote-new]")) return;

  setActiveQuoteId(null);
  clearQuoteForm();
});
/* =========================
   BOTÓN VER VIAJE / REFRESH
========================= */
document.getElementById("btn-ver-viaje")?.addEventListener("click", async () => {
  if (!appState.activeTravelId) {
    alert("Seleccioná un viaje primero");
    return;
  }

  await loadQuotes();

  if (appState.activeQuoteId) {
    await selectQuote(appState.activeQuoteId, { openServicios: false });
  }
});

/* =========================
   EVENTOS DE CONTEXTO
========================= */
document.addEventListener("travel-selected", async () => {
  setActiveQuoteId(null);
  clearQuoteForm();
  await loadQuotes();

  if (appState.activeQuoteId) {
    await selectQuote(appState.activeQuoteId, { openServicios: false });
  } else {
    try {
      await loadServicios();
    } catch (err) {
      console.error("Error limpiando servicios al seleccionar viaje:", err);
    }
  }
});

document.addEventListener("travel-cleared", async () => {
  resetQuoteContext();

  try {
    await loadServicios();
  } catch (err) {
    console.error("Error limpiando servicios al limpiar viaje:", err);
  }
});

document.addEventListener("travel-saved", async () => {
  if (!appState.activeTravelId) return;
  await loadQuotes();
});

document.addEventListener("client-selected", async () => {
  if (!appState.activeTravelId) {
    resetQuoteContext();

    try {
      await loadServicios();
    } catch (err) {
      console.error("Error limpiando servicios al cambiar cliente:", err);
    }
  }
});

/* =========================
   AUTOLOAD
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  if (!appState.activeTravelId) {
    resetQuoteContext();
    return;
  }

  await loadQuotes();

  if (appState.activeQuoteId) {
    await selectQuote(appState.activeQuoteId, { openServicios: false });
  }
});