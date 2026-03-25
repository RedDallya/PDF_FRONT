import { qs, val } from "./dom.js";
import {
  appState,
  setActiveClientId,
  setClientTab,
  setSelectedClientName,
  setSelectedTravelName,
  setView
} from "./state.js";

import {
  getClientes,
  getCliente,
  createCliente,
  deleteCliente,
  createClientDocument,
  getClientDocuments,
  deleteClientDocument
} from "./api.js";

/********************************
INIT
*********************************/
document.addEventListener("DOMContentLoaded", async () => {
  await loadClients();
  syncClientContextUI();
});

/********************************
LOAD CLIENTES
*********************************/
export async function loadClients() {
  let clients = [];

  try {
    clients = await getClientes();
  } catch (err) {
    console.error("Error cargando clientes:", err);
  }

  const selects = document.querySelectorAll("[data-client-select]");
  if (!selects.length) return;

  selects.forEach(select => {
    select.innerHTML = `<option value="">Seleccionar cliente</option>`;

    clients.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });

    if (appState.activeClientId) {
      select.value = String(appState.activeClientId);
    }
  });
}

/********************************
SELECT CLIENTE
*********************************/
document.addEventListener("change", async e => {
  const select = e.target.closest("[data-client-select]");
  if (!select) return;

  const id = Number(select.value);

  if (!id) {
    setActiveClientId(null);
    setSelectedClientName("");
    setSelectedTravelName("");
    clearClientForm();
    clearDocForm();
    clearDocumentsList();
    syncClientSelects();
    syncClientContextUI();

    document.dispatchEvent(new Event("travel-cleared"));
    document.dispatchEvent(new Event("client-selected"));
    return;
  }

  try {
    const client = await getCliente(id);

    setActiveClientId(id);
    setSelectedClientName(client?.nombre || "");
    setSelectedTravelName("");
    setView("cliente");
    setClientTab("ficha");

    fillClientForm(client);
    await loadClientDocuments(id);

    syncClientSelects();
    syncClientContextUI();

    document.dispatchEvent(new Event("travel-cleared"));
    document.dispatchEvent(new Event("client-selected"));
  } catch (err) {
    console.error("Error seleccionando cliente:", err);
  }
});

/********************************
GLOBAL CLICK HANDLER
*********************************/
document.addEventListener("click", async e => {
  if (e.target.closest("[data-client-new]")) {
    setActiveClientId(null);
    setSelectedClientName("");
    setSelectedTravelName("");

    setView("cliente");
    setClientTab("ficha");

    clearClientForm();
    clearDocForm();
    clearDocumentsList();

    syncClientSelects();
    syncClientContextUI();

    document.dispatchEvent(new Event("travel-cleared"));
    return;
  }

  const clientTabBtn = e.target.closest("[data-client-tab]");
  if (clientTabBtn) {
    const tab = clientTabBtn.dataset.clientTab;
    setClientTab(tab);

    if (appState.activeClientId) {
      setView("cliente");
    }

    syncClientTabs();
    syncClientPanels();
    syncClientContextUI();

    return;
  }

  if (e.target.closest("[data-client-save]")) {
    const payload = {
      nombre: val("name"),
      telefono: val("phone"),
      email: val("email"),
      notas: val("notes"),
      status: val("status"),
      location: val("location"),
      created_at: val("created")
    };

    try {
      const saved = await createCliente(payload);
      const clientId = saved.id || appState.activeClientId;

      setActiveClientId(clientId);

      await loadClients();
      syncClientSelects();

      const full = await getCliente(clientId);

      setSelectedClientName(full?.nombre || "");
      setView("cliente");
      setClientTab("ficha");

      fillClientForm(full);
      await loadClientDocuments(clientId);

      syncClientContextUI();

      document.dispatchEvent(new Event("client-selected"));
    } catch (err) {
      console.error("Error guardando cliente:", err);
    }

    return;
  }

  if (e.target.closest("[data-client-delete]")) {
    if (!appState.activeClientId) return;
    if (!confirm("¿Eliminar cliente?")) return;

    try {
      await deleteCliente(appState.activeClientId);

      setActiveClientId(null);
      setSelectedClientName("");
      setSelectedTravelName("");
      setView("clientes");
      setClientTab("ficha");

      clearClientForm();
      clearDocForm();
      clearDocumentsList();

      await loadClientesAfterDelete();

      document.dispatchEvent(new Event("travel-cleared"));
      document.dispatchEvent(new Event("client-selected"));
    } catch (err) {
      console.error("Error eliminando cliente:", err);
    }

    return;
  }

  if (e.target.closest("[data-doc-save]")) {
    if (!appState.activeClientId) {
      alert("Seleccioná un cliente");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("client_id", appState.activeClientId);
      formData.append("type", qs('[data-doc="type"]')?.value || "");
      formData.append("number", qs('[data-doc="number"]')?.value || "");
      formData.append("expiry", qs('[data-doc="expiry"]')?.value || "");
      formData.append("notes", qs('[data-doc="notes"]')?.value || "");

      const fileInput = qs('[data-doc="files"]');
      if (fileInput?.files?.[0]) {
        formData.append("file", fileInput.files[0]);
      }

      await createClientDocument(formData);

      await loadClientDocuments(appState.activeClientId);
      clearDocForm();

      if (appState.activeClientId) {
        setView("cliente");
        setClientTab("documentacion");
        syncClientContextUI();
      }
    } catch (err) {
      console.error("Error guardando documento:", err);
    }

    return;
  }

  const deleteBtn = e.target.closest("[data-doc-delete]");
  if (deleteBtn) {
    if (!confirm("¿Eliminar documento?")) return;

    try {
      await deleteClientDocument(deleteBtn.dataset.docDelete);
      await loadClientDocuments(appState.activeClientId);
    } catch (err) {
      console.error("Error eliminando documento:", err);
    }

    return;
  }

  if (e.target.closest("[data-client-doc-cancel]")) {
    if (!appState.activeClientId) {
      clearClientForm();
      return;
    }

    try {
      const client = await getCliente(appState.activeClientId);
      fillClientForm(client);
    } catch (err) {
      console.error("Error recargando ficha cliente:", err);
    }

    return;
  }
});

/********************************
DOCUMENTOS
*********************************/
async function loadClientDocuments(clientId) {
  const list = qs("[data-doc-list]");
  if (!list) return;

  list.innerHTML = "";

  if (!clientId) return;

  let docs = [];

  try {
    docs = await getClientDocuments(clientId);
  } catch (err) {
    console.error("Error cargando documentos:", err);
  }

  if (!docs.length) {
    list.innerHTML = `
      <div class="small text-muted">
        No hay documentos cargados para este cliente.
      </div>
    `;
    return;
  }

  docs.forEach(d => {
    const div = document.createElement("div");
    div.className = "border rounded p-2 mb-2";

    const fileLink = buildDocumentLink(d);
    const fileHtml = fileLink
      ? `
        <div class="small mt-2">
          <a href="${escapeAttr(fileLink.href)}" target="_blank" rel="noopener noreferrer" class="text-decoration-none">
            ${escapeHtml(fileLink.label)}
          </a>
        </div>
      `
      : `
        <div class="small mt-2 text-muted">Sin archivo adjunto</div>
      `;

    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <strong>${escapeHtml(d.type || "Documento")}</strong>
          <div class="small text-muted">${escapeHtml(d.number || "Sin número")}</div>
          ${d.expiry ? `<div class="small text-muted">Vence: ${escapeHtml(formatDate(d.expiry))}</div>` : ""}
          ${d.notes ? `<div class="small mt-1">${escapeHtml(d.notes)}</div>` : ""}
          ${fileHtml}
        </div>

        <button class="btn btn-sm btn-outline-danger" data-doc-delete="${d.id}">
          Eliminar
        </button>
      </div>
    `;

    list.appendChild(div);
  });
}

function clearDocumentsList() {
  const list = qs("[data-doc-list]");
  if (list) list.innerHTML = "";
}

/********************************
SYNC UI
*********************************/
function syncClientContextUI() {
  syncViewVisibility();
  syncClientTabs();
  syncClientPanels();
  syncClientLabels();
  syncClientSelects();
}

function syncViewVisibility() {
  const views = document.querySelectorAll("[data-view]");
  views.forEach(el => el.classList.add("d-none"));

  if (appState.view === "clientes") {
    document.querySelector('[data-view="clientes"]')?.classList.remove("d-none");
    return;
  }

  if (appState.view === "cliente") {
    document.querySelector('[data-view="cliente"]')?.classList.remove("d-none");
    return;
  }

  if (appState.view === "viaje") {
    document.querySelector('[data-view="cliente"]')?.classList.remove("d-none");
    document.querySelector('[data-view="viaje"]')?.classList.remove("d-none");
    return;
  }
}

function syncClientTabs() {
  document.querySelectorAll("[data-client-tab]").forEach(btn => {
    const isActive = btn.dataset.clientTab === appState.clientTab;
    btn.classList.toggle("active", isActive);

    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-outline-secondary");
  });

  const activeBtn = document.querySelector(`[data-client-tab="${appState.clientTab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove("btn-outline-secondary");
    activeBtn.classList.add("btn-secondary");
  }
}

function syncClientPanels() {
  document.querySelectorAll("[data-client-panel]").forEach(panel => {
    panel.classList.add("d-none");
  });

  const activePanel = document.querySelector(`[data-client-panel="${appState.clientTab}"]`);
  if (activePanel) {
    activePanel.classList.remove("d-none");
  }
}

function syncClientLabels() {
  const label = document.querySelector("[data-client-selected-label]");
  if (label) {
    label.textContent = appState.selectedClientName || "—";
  }
}

function syncClientSelects() {
  document.querySelectorAll("[data-client-select]").forEach(select => {
    select.value = appState.activeClientId ? String(appState.activeClientId) : "";
  });
}

/********************************
FORM HELPERS
*********************************/
function fillClientForm(c = {}) {
  set("id", c.id);
  set("name", c.nombre);
  set("phone", c.telefono);
  set("email", c.email);
  set("notes", c.notas);
  set("status", c.status);
  set("location", c.location);
  set("created", c.created_at);
  set("tags", c.tags);
}

function clearClientForm() {
  ["id", "name", "phone", "email", "notes", "status", "location", "created", "tags"].forEach(k => {
    set(k, "");
  });
}

function clearDocForm() {
  ["type", "number", "expiry", "notes"].forEach(k => {
    const el = qs(`[data-doc="${k}"]`);
    if (el) el.value = "";
  });

  const fileInput = qs('[data-doc="files"]');
  if (fileInput) fileInput.value = "";
}

function set(key, value) {
  const fields = document.querySelectorAll(`[data-client="${key}"]`);
  fields.forEach(el => {
    el.value = value || "";
  });
}

async function loadClientesAfterDelete() {
  await loadClients();
  syncClientSelects();
  syncClientContextUI();
}

/********************************
UTILS
*********************************/
function buildDocumentLink(doc = {}) {
  const rawPath = doc.file_path || doc.path || doc.url || "";
  const rawName = doc.file_name || doc.original_name || doc.filename || "Ver archivo";

  if (!rawPath) return null;

  if (/^https?:\/\//i.test(rawPath)) {
    return {
      href: rawPath,
      label: rawName
    };
  }

  const normalizedPath = String(rawPath).replace(/\\/g, "/").replace(/^\/+/, "");

  const apiBase =
    window.API_BASE ||
    localStorage.getItem("api_base") ||
    "http://localhost:3000/api";

  const backendOrigin = apiBase.replace(/\/api\/?$/, "");

  return {
    href: `${backendOrigin}/${normalizedPath}`,
    label: rawName
  };
}

function formatDate(value) {
  if (!value) return "";
  const raw = String(value);
  if (raw.includes("T")) return raw.split("T")[0];
  if (raw.includes(" ")) return raw.split(" ")[0];
  return raw;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}