import {
  getTravelsByClient,
  createTravel,
  deleteTravel,
  getTravelById
} from "./api.js";

import {
  appState,
  setActiveTravelId,
  setSelectedTravelName,
  setView
} from "./state.js";

/************************************************
INIT
*************************************************/
document.addEventListener("DOMContentLoaded", () => {
  syncTravelContextUI();
});

/************************************************
EVENT REFRESH
*************************************************/
document.addEventListener("travel-saved", loadTravels);
document.addEventListener("client-selected", loadTravels);
document.addEventListener("travel-cleared", syncTravelContextUI);
document.addEventListener("travel-selected", syncTravelContextUI);

/************************************************
LOAD TRAVELS
*************************************************/
export async function loadTravels() {
  const tabsContainer = document.querySelector("[data-travel-tabs]");
  const switcher = document.querySelector("[data-travel-switcher]");

  if (tabsContainer) tabsContainer.innerHTML = "";
  if (switcher) switcher.innerHTML = "";

  if (!appState.activeClientId) {
    setActiveTravelId(null);
    setSelectedTravelName("");
    syncTravelContextUI();
    document.dispatchEvent(new Event("travel-cleared"));
    return;
  }

  let travels = [];

  try {
    travels = await getTravelsByClient(appState.activeClientId);
  } catch (err) {
    console.error("Error cargando viajes:", err);
  }

  if (!travels.length) {
    setActiveTravelId(null);
    setSelectedTravelName("");
    renderEmptyTravelState();
    populateTravelSwitcher([]);
    syncTravelContextUI();
    document.dispatchEvent(new Event("travel-cleared"));
    return;
  }

  const activeExists = travels.some(
    t => Number(t.id) === Number(appState.activeTravelId)
  );

  if (!activeExists) {
    setActiveTravelId(travels[0].id);
  }

  const activeTravel =
    travels.find(t => Number(t.id) === Number(appState.activeTravelId)) || travels[0];

  setSelectedTravelName(activeTravel?.destino || `Viaje ${activeTravel?.id || ""}`);

  travels.forEach(renderTravelTab);
  populateTravelSwitcher(travels);
  syncTravelContextUI();

  document.dispatchEvent(new Event("travel-selected"));
}

/************************************************
TRAVEL SWITCHER
*************************************************/
function populateTravelSwitcher(travels) {
  const select = document.querySelector("[data-travel-switcher]");
  if (!select) return;

  select.innerHTML = "";

  if (!travels.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin viajes";
    select.appendChild(opt);
    return;
  }

  travels.forEach(travel => {
    const opt = document.createElement("option");
    opt.value = travel.id;
    opt.textContent = travel.destino || `Viaje ${travel.id}`;

    if (Number(travel.id) === Number(appState.activeTravelId)) {
      opt.selected = true;
    }

    select.appendChild(opt);
  });
}

/************************************************
RENDER TABS
*************************************************/
function renderTravelTab(travel) {
  const container = document.querySelector("[data-travel-tabs]");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "travel-tab";
  div.dataset.travelId = travel.id;

  if (Number(travel.id) === Number(appState.activeTravelId)) {
    div.classList.add("active");
  }

  div.innerHTML = `
    <button
      type="button"
      class="btn btn-sm ${Number(travel.id) === Number(appState.activeTravelId) ? "btn-primary" : "btn-outline-primary"}"
      data-open-travel
    >
      ${travel.destino || `Viaje ${travel.id}`}
    </button>
  `;

  container.appendChild(div);
}

/************************************************
EMPTY STATE
*************************************************/
function renderEmptyTravelState() {
  const container = document.querySelector("[data-travel-tabs]");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "small text-muted";
  div.textContent = "Este cliente todavía no tiene viajes asociados.";

  container.appendChild(div);
}

/************************************************
OPEN SELECTED TRAVEL
*************************************************/
async function openTravelById(travelId) {
  if (!travelId) {
    setActiveTravelId(null);
    setSelectedTravelName("");
    syncTravelContextUI();
    document.dispatchEvent(new Event("travel-cleared"));
    return;
  }

  try {
    const current = await getTravelById(travelId);

    setActiveTravelId(Number(travelId));
    setSelectedTravelName(current?.destino || `Viaje ${travelId}`);
    setView("viaje");

    markActiveTravelTab();
    syncTravelContextUI();

    document.dispatchEvent(new Event("travel-selected"));
  } catch (err) {
    console.error("Error abriendo viaje:", err);
  }
}

/************************************************
SYNC UI
*************************************************/
function syncTravelContextUI() {
  const travelLabel = document.querySelector("[data-travel-selected-label]");
  if (travelLabel) {
    travelLabel.textContent = appState.selectedTravelName || "—";
  }

  const switcher = document.querySelector("[data-travel-switcher]");
  if (switcher) {
    switcher.value = appState.activeTravelId ? String(appState.activeTravelId) : "";
  }

  markActiveTravelTab();
}

function markActiveTravelTab() {
  document.querySelectorAll(".travel-tab").forEach(tab => {
    const isActive = Number(tab.dataset.travelId) === Number(appState.activeTravelId);
    tab.classList.toggle("active", isActive);

    const openBtn = tab.querySelector("[data-open-travel]");
    if (openBtn) {
      openBtn.classList.remove("btn-primary", "btn-outline-primary");
      openBtn.classList.add(isActive ? "btn-primary" : "btn-outline-primary");
    }
  });
}

/************************************************
CHANGE HANDLER
*************************************************/
document.addEventListener("change", async e => {
  const select = e.target.closest("[data-travel-switcher]");
  if (!select) return;

  const travelId = Number(select.value);
  if (!travelId) return;

  await openTravelById(travelId);
});

/************************************************
CLICK HANDLER
*************************************************/
document.addEventListener("click", async e => {
  if (!appState.activeClientId) return;

  const travelTab = e.target.closest(".travel-tab");
  const travelId = Number(travelTab?.dataset.travelId);

  if (e.target.closest("[data-open-travel]") && travelTab) {
    await openTravelById(travelId);
    return;
  }

  if (
    travelTab &&
    !e.target.closest("button") &&
    !e.target.closest("input") &&
    !e.target.closest("select") &&
    !e.target.closest("textarea")
  ) {
    await openTravelById(travelId);
    return;
  }

  if (e.target.closest("[data-add-travel]")) {
    try {
      const newTravel = await createTravel({
        cliente_id: appState.activeClientId,
        destino: "Nuevo viaje"
      });

      setActiveTravelId(newTravel.id);
      setSelectedTravelName(newTravel.destino || "Nuevo viaje");

      await loadTravels();
      await openTravelById(newTravel.id);
    } catch (err) {
      console.error("Error creando viaje:", err);
    }

    return;
  }

  if (e.target.closest("[data-delete-travel-global]")) {
    if (!appState.activeTravelId) return;
    if (!confirm("¿Eliminar viaje?")) return;

    try {
      await deleteTravel(appState.activeTravelId);
      setActiveTravelId(null);
      setSelectedTravelName("");

      await loadTravels();
    } catch (err) {
      console.error("Error eliminando viaje global:", err);
    }

    return;
  }

  if (e.target.closest("[data-duplicate-travel-global]")) {
    if (!appState.activeTravelId) return;

    try {
      const current = await getTravelById(appState.activeTravelId);

      const newTravel = await createTravel({
        cliente_id: appState.activeClientId,
        destino: `${current?.destino || "Viaje"} copia`
      });

      setActiveTravelId(newTravel.id);
      setSelectedTravelName(newTravel.destino || `${current?.destino || "Viaje"} copia`);

      await loadTravels();
      await openTravelById(newTravel.id);
    } catch (err) {
      console.error("Error duplicando viaje global:", err);
    }

    return;
  }
});