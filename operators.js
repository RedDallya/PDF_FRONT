import { apiFetch } from "./api.js";
import { appState } from "./state.js";

/* =========================================
INIT
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  resetOperatorsUI();
});

/* =========================================
EVENTOS DE CONTEXTO
========================================= */
document.addEventListener("travel-selected", async () => {
  await loadOperatorsByTravel();
});

document.addEventListener("travel-cleared", () => {
  resetOperatorsUI();
});

document.addEventListener("client-selected", () => {
  if (!appState.activeTravelId) {
    resetOperatorsUI();
  }
});

/* =========================================
EVENTOS UI
========================================= */
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-operator-add]")) {
    e.preventDefault();
    addEmptyOperatorCard();
    return;
  }

  const saveBtn = e.target.closest("[data-operator-save]");
  if (saveBtn) {
    e.preventDefault();

    if (!appState.activeTravelId) {
      alert("Seleccioná un viaje primero");
      return;
    }

    const card = saveBtn.closest("[data-operator-card]");
    if (!card) return;

    if (!canEditOperatorCard(card)) {
      alert("No tenés permiso para editar este operador");
      return;
    }

    await saveOperatorCard(card);
    return;
  }

  const deleteBtn = e.target.closest("[data-operator-delete]");
  if (deleteBtn) {
    e.preventDefault();

    const card = deleteBtn.closest("[data-operator-card]");
    if (!card) return;

    if (!canEditOperatorCard(card)) {
      alert("No tenés permiso para eliminar este operador");
      return;
    }

    await deleteOperatorCard(card);
  }
});

/* =========================================
LOAD
========================================= */
async function loadOperatorsByTravel() {
  if (!appState.activeTravelId) {
    resetOperatorsUI();
    return;
  }

  try {
    const res = await apiFetch(`/operadores/viaje/${appState.activeTravelId}`, {
      method: "GET"
    });

    const rows = await safeJson(res);

    if (!Array.isArray(rows) || !rows.length) {
      resetOperatorsUI();
      return;
    }

    renderOperators(rows);
  } catch (err) {
    console.error("LOAD OPERATORS ERROR:", err);
    resetOperatorsUI();
  }
}

/* =========================================
SAVE
========================================= */
async function saveOperatorCard(card) {
  try {
    const payload = getOperatorPayloadFromCard(card);

    if (!payload.nombre) {
      alert("Completá el nombre del operador");
      return;
    }

    const recordId = getOperatorCardId(card);
    let saved;

    if (recordId) {
      const res = await apiFetch(`/operadores/${recordId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      saved = await safeJson(res);
    } else {
      const res = await apiFetch("/operadores", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      saved = await safeJson(res);
    }

    if (!saved?.id) {
      throw new Error("No se pudo guardar el operador");
    }

    await loadOperatorsByTravel();
    alert("Operador guardado");
  } catch (err) {
    console.error("SAVE OPERATOR ERROR:", err);
    alert("Error guardando operador");
  }
}

/* =========================================
DELETE
========================================= */
async function deleteOperatorCard(card) {
  try {
    const id = getOperatorCardId(card);

    if (!id) {
      card.remove();
      toggleOperatorEmptyState();
      return;
    }

    const ok = confirm("¿Eliminar operador?");
    if (!ok) return;

    await apiFetch(`/operadores/${id}`, {
      method: "DELETE"
    });

    await loadOperatorsByTravel();
    alert("Operador eliminado");
  } catch (err) {
    console.error("DELETE OPERATOR ERROR:", err);
    alert("Error eliminando operador");
  }
}

/* =========================================
RENDER
========================================= */
function renderOperators(rows = []) {
  const list = getOperatorListEl();
  if (!list) return;

  list.innerHTML = "";

  rows.forEach(row => {
    const card = createOperatorCard(row);
    list.appendChild(card);
  });

  toggleOperatorEmptyState();
}

function addEmptyOperatorCard() {
  const list = getOperatorListEl();
  if (!list) return;

  const card = createOperatorCard();
  list.prepend(card);
  toggleOperatorEmptyState();
}

function createOperatorCard(data = {}) {
  const template = document.querySelector("#operator-template");

  let card;
  if (template?.content?.firstElementChild) {
    card = template.content.firstElementChild.cloneNode(true);
  } else {
    card = document.createElement("div");
    card.className = "card p-3 mb-3";
    card.setAttribute("data-operator-card", "");
    card.innerHTML = fallbackOperatorTemplate();
  }

  hydrateOperatorCard(card, data);
  return card;
}

function hydrateOperatorCard(card, data = {}) {
  setOperatorCardId(card, data.id || "");
  setOperatorField(card, "nombre", data.nombre || "");
  setOperatorField(card, "tipo_servicio", data.tipo_servicio || "");
  setOperatorField(card, "contacto", data.contacto || "");
  setOperatorField(card, "email", data.email || "");
  setOperatorField(card, "telefono", data.telefono || "");
  setOperatorField(card, "estado", data.estado || "");
  setOperatorField(card, "condiciones_comerciales", data.condiciones_comerciales || "");
  setOperatorField(card, "notes", data.notes || "");

  card.dataset.createdBy = data.created_by || "";

  applyOperatorPermissions(card, data);
}

/* =========================================
FORM HELPERS
========================================= */
function getOperatorPayloadFromCard(card) {
  return {
    viaje_id: Number(appState.activeTravelId),
    nombre: getOperatorField(card, "nombre"),
    tipo_servicio: getOperatorField(card, "tipo_servicio") || null,
    contacto: getOperatorField(card, "contacto") || null,
    email: getOperatorField(card, "email") || null,
    telefono: getOperatorField(card, "telefono") || null,
    estado: getOperatorField(card, "estado") || null,
    condiciones_comerciales: getOperatorField(card, "condiciones_comerciales") || null,
    notes: getOperatorField(card, "notes") || null
  };
}

function getOperatorField(card, key) {
  const el = card.querySelector(`[data-operator="${key}"]`);
  if (!el) return "";
  return el.value || "";
}

function setOperatorField(card, key, value) {
  const el = card.querySelector(`[data-operator="${key}"]`);
  if (el) {
    el.value = value ?? "";
  }
}

function getOperatorCardId(card) {
  return card.getAttribute("data-operator-id") || "";
}

function setOperatorCardId(card, value) {
  card.setAttribute("data-operator-id", value || "");
}

/* =========================================
PERMISOS
========================================= */
function isOwner(createdBy) {
  const currentUserId = Number(localStorage.getItem("user_id"));
  return Number(createdBy) === currentUserId;
}

function canEditOperatorCard(card) {
  const recordId = getOperatorCardId(card);

  if (!recordId) return true;

  const createdBy = card.dataset.createdBy || "";
  return isOwner(createdBy);
}

function applyOperatorPermissions(card, data = {}) {
  const recordId = getOperatorCardId(card);

  if (!recordId) return;
  if (!data.created_by) return;
  if (isOwner(data.created_by)) return;

  const saveBtn = card.querySelector("[data-operator-save]");
  const deleteBtn = card.querySelector("[data-operator-delete]");

  if (saveBtn) saveBtn.style.display = "none";
  if (deleteBtn) deleteBtn.style.display = "none";

  card.querySelectorAll("input, textarea, select").forEach(el => {
    el.disabled = true;
  });
}

/* =========================================
UI HELPERS
========================================= */
function resetOperatorsUI() {
  const list = getOperatorListEl();
  if (list) list.innerHTML = "";
  toggleOperatorEmptyState();
}

function toggleOperatorEmptyState() {
  const list = getOperatorListEl();
  const empty = document.querySelector("[data-operator-empty]");

  if (!list || !empty) return;

  empty.style.display = list.children.length ? "none" : "";
}

function getOperatorListEl() {
  return document.querySelector("[data-operators-list]");
}

/* =========================================
UTILS
========================================= */
async function safeJson(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
}

function fallbackOperatorTemplate() {
  return `
    <div class="row g-3">
      <div class="col-md-4">
        <label class="form-label">Nombre</label>
        <input class="form-control" data-operator="nombre" placeholder="Nombre del operador" />
      </div>
      <div class="col-md-4">
        <label class="form-label">Tipo de servicio</label>
        <input class="form-control" data-operator="tipo_servicio" placeholder="Hotel / Aéreo / Excursión..." />
      </div>
      <div class="col-md-4">
        <label class="form-label">Estado</label>
        <input class="form-control" data-operator="estado" placeholder="pendiente / confirmado / cancelado" />
      </div>

      <div class="col-md-4">
        <label class="form-label">Contacto</label>
        <input class="form-control" data-operator="contacto" placeholder="Persona de contacto" />
      </div>
      <div class="col-md-4">
        <label class="form-label">Email</label>
        <input class="form-control" data-operator="email" placeholder="mail@dominio.com" />
      </div>
      <div class="col-md-4">
        <label class="form-label">Teléfono</label>
        <input class="form-control" data-operator="telefono" placeholder="223..." />
      </div>

      <div class="col-12">
        <label class="form-label">Condiciones comerciales</label>
        <textarea class="form-control" rows="3" data-operator="condiciones_comerciales"></textarea>
      </div>

      <div class="col-12">
        <label class="form-label">Notas</label>
        <textarea class="form-control" rows="3" data-operator="notes"></textarea>
      </div>

      <div class="col-12 d-flex gap-2">
        <button type="button" class="btn btn-primary" data-operator-save>Guardar operador</button>
        <button type="button" class="btn btn-outline-danger" data-operator-delete>Eliminar</button>
      </div>
    </div>
  `;
}