/* ================================
BOOTSTRAP APP FRONTEND
================================ */

import {
  setAuthToken,
  showApp,
  showLogin,
  login,
  logout
} from "./api.js";

import {
  appState,
  setQuoteTab,
  setTravelTab,
  setView
} from "./state.js";

import { loadState, saveState, clearState } from "./storage.js";
import { loadClients } from "./clients.js";
import { loadTravels } from "./travel-tabs.js";
import {
  getCompanyProfiles,
  getCompanyProfileById,
  createCompanyProfile,
  updateCompanyProfile,
  deleteCompanyProfile,
  uploadCompanyLogo,
  uploadCompanyCover
} from "./api.js";

/* UI / módulos funcionales */
import "./travel-tabs.js";
import "./travel-ui.js";
import "./clients.js";
import "./services.js";
import "./pdf.js";
import "./quotes.js";
import "./itinerary.js";
import "./vouchers.js";
import "./operators.js";

let activeConfigProfileId = null;

/* ================================
INIT
================================ */
document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  initLoginForm();
  initLogoutButton();
  initMainTabs();
  initTravelTabs();
  initQuoteTabs();
  initGlobalStateSync();
  initConfigModule();
  await restoreSession();

  syncAppUI();
  console.log("APP cargada correctamente");
}

/* ================================
RESTORE JWT SESSION + UI STATE
================================ */
async function restoreSession() {
  const savedToken = localStorage.getItem("auth_token");

  if (!savedToken) {
    showLogin();
    return;
  }

  try {
    setAuthToken(savedToken);
    loadState();
    showApp();
    syncAppUI();

    await restorePersistedContext();
    syncAppUI();
  } catch (err) {
    console.error("Error restaurando sesión:", err);
    showLogin();
  }
}

/* ================================
RESTORE PERSISTED CONTEXT
================================ */
async function restorePersistedContext() {
  const persisted = {
    view: appState.view,
    travelTab: appState.travelTab,
    quoteTab: appState.quoteTab,
    activeClientId: appState.activeClientId,
    activeTravelId: appState.activeTravelId
  };

  try {
    await loadClients();

    if (persisted.activeClientId) {
      const clientSelect = document.querySelector("[data-client-select]");
      if (clientSelect) {
        clientSelect.value = String(persisted.activeClientId);
        clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForUi();
      }
    }

    if (persisted.activeTravelId) {
      appState.activeTravelId = Number(persisted.activeTravelId);
      await loadTravels();

      appState.view = persisted.view || "viaje";
      appState.travelTab = persisted.travelTab || "datos";
      appState.quoteTab = persisted.quoteTab || "presupuesto";

      document.dispatchEvent(new Event("travel-selected"));
      await waitForUi();
    }

    syncAppUI();
    saveState();
  } catch (err) {
    console.error("Error restaurando contexto persistido:", err);
  }
}

function waitForUi(ms = 120) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================================
LOGIN FORM
================================ */
function initLoginForm() {
  const form = document.querySelector("[data-login-form]");

  form?.addEventListener("submit", async e => {
    e.preventDefault();

    const username = document.querySelector("[data-login-username]")?.value || "";
    const password = document.querySelector("[data-login-password]")?.value || "";

    try {
      await login(username, password);
      loadState();
      showApp();
      syncAppUI();
      await restorePersistedContext();

      console.log("Login exitoso");
    } catch (err) {
      alert("Credenciales incorrectas");
      console.error(err);
    }
  });
}

/* ================================
LOGOUT BUTTON
================================ */
function initLogoutButton() {
  const btn = document.getElementById("logout-btn");

  btn?.addEventListener("click", () => {
    clearState();
    logout();
    console.log("Sesión cerrada");
  });
}

/* ================================
MAIN NAV
================================ */
function initMainTabs() {
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-main-tab]");
    if (!btn) return;

    const tab = btn.dataset.mainTab;

    if (tab === "clientes") {
      if (appState.activeTravelId) {
        setView("viaje");
      } else if (appState.activeClientId) {
        setView("cliente");
      } else {
        setView("clientes");
      }
    }

    if (tab === "inicio") {
      setView("clientes");
    }

    if (tab === "config") {
      setView("config");
    }

    syncAppUI();
    saveState();
  });
}

/* ================================
TRAVEL NAV
================================ */
function initTravelTabs() {
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-travel-tab]");
    if (!btn) return;

    const tab = btn.dataset.travelTab;

    setTravelTab(tab);

    if (appState.activeTravelId) {
      setView("viaje");
    }

    syncTravelTabs();
    syncTravelPanels();
    syncAppUI();
    saveState();
  });
}

/* ================================
QUOTE NAV
================================ */
function initQuoteTabs() {
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-quote-tab]");
    if (!btn) return;

    const tab = btn.dataset.quoteTab;
    setQuoteTab(tab);

    syncQuoteTabs();
    syncQuotePanels();
    syncAppUI();
    saveState();
  });
}

/* ================================
GLOBAL STATE SYNC
================================ */
function initGlobalStateSync() {
  const syncAndPersist = () => {
    syncAppUI();
    saveState();
  };

  document.addEventListener("client-selected", syncAndPersist);
  document.addEventListener("travel-selected", syncAndPersist);
  document.addEventListener("travel-cleared", syncAndPersist);
  document.addEventListener("travel-saved", syncAndPersist);

  window.addEventListener("beforeunload", saveState);
}

/* ================================
SYNC APP UI
================================ */
function syncAppUI() {
  syncViews();
  syncMainTabs();
  syncTravelTabs();
  syncTravelPanels();
  syncQuoteTabs();
  syncQuotePanels();
  syncBreadcrumb();
  syncSelectedLabels();
}

/* ================================
VIEW VISIBILITY
================================ */
function syncViews() {
  const allViews = document.querySelectorAll("[data-view]");
  allViews.forEach(view => view.classList.add("d-none"));

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

  if (appState.view === "config") {
    document.querySelector('[data-view="config"]')?.classList.remove("d-none");
    return;
  }
}

/* ================================
MAIN TABS UI
================================ */
function syncMainTabs() {
  document.querySelectorAll("[data-main-tab]").forEach(btn => {
    btn.classList.remove("active");
  });

  const clientesBtn = document.querySelector('[data-main-tab="clientes"]');
  const inicioBtn = document.querySelector('[data-main-tab="inicio"]');
  const configBtn = document.querySelector('[data-main-tab="config"]');

  if (appState.view === "config") {
    configBtn?.classList.add("active");
    return;
  }

  if (
    appState.view === "clientes" ||
    appState.view === "cliente" ||
    appState.view === "viaje"
  ) {
    clientesBtn?.classList.add("active");
    return;
  }

  inicioBtn?.classList.add("active");
}

/* ================================
TRAVEL TABS UI
================================ */
function syncTravelTabs() {
  document.querySelectorAll("[data-travel-tab]").forEach(btn => {
    const isActive = btn.dataset.travelTab === appState.travelTab;

    btn.classList.toggle("active", isActive);
    btn.classList.remove("btn-primary", "btn-outline-primary");
    btn.classList.add(isActive ? "btn-primary" : "btn-outline-primary");
  });
}

function syncTravelPanels() {
  document.querySelectorAll("[data-travel-panel]").forEach(panel => {
    panel.classList.add("d-none");
  });

  document.querySelectorAll("[data-section]").forEach(section => {
    section.classList.add("d-none");
  });

  if (appState.travelTab === "datos") {
    document.querySelector('[data-travel-panel="datos"]')?.classList.remove("d-none");
    return;
  }

  document.querySelector(`[data-section="${appState.travelTab}"]`)?.classList.remove("d-none");
}

/* ================================
QUOTE TABS UI
================================ */
function syncQuoteTabs() {
  document.querySelectorAll("[data-quote-tab]").forEach(btn => {
    const isActive = btn.dataset.quoteTab === appState.quoteTab;

    btn.classList.toggle("active", isActive);
    btn.classList.remove("btn-secondary", "btn-outline-secondary");
    btn.classList.add(isActive ? "btn-secondary" : "btn-outline-secondary");
  });
}

function syncQuotePanels() {
  document.querySelectorAll("[data-quote-section]").forEach(panel => {
    panel.classList.add("d-none");
  });

  document
    .querySelector(`[data-quote-section="${appState.quoteTab}"]`)
    ?.classList.remove("d-none");
}

/* ================================
BREADCRUMB
================================ */
function syncBreadcrumb() {
  const el = document.querySelector("[data-breadcrumb]");
  if (!el) return;

  const parts = ["Inicio", "Clientes"];

  if (appState.selectedClientName) {
    parts.push(appState.selectedClientName);
  }

  if (appState.selectedTravelName) {
    parts.push(appState.selectedTravelName);
  }

  if (appState.view === "viaje") {
    if (appState.travelTab === "datos") parts.push("Datos del viaje");
    if (appState.travelTab === "cotizaciones") parts.push("Cotizaciones");
    if (appState.travelTab === "operadores") parts.push("Operadores");
    if (appState.travelTab === "vouchers") parts.push("Vouchers y Pasajes");
    if (appState.travelTab === "itinerario") parts.push("Itinerarios");

    if (appState.travelTab === "cotizaciones") {
      if (appState.quoteTab === "presupuesto") parts.push("Datos del Presupuesto");
      if (appState.quoteTab === "servicios") parts.push("Servicios");
    }
  }

  el.textContent = parts.join(" > ");
}

/* ================================
SELECTED LABELS
================================ */
function syncSelectedLabels() {
  const clientLabel = document.querySelector("[data-client-selected-label]");
  if (clientLabel) {
    clientLabel.textContent = appState.selectedClientName || "—";
  }

  const travelLabel = document.querySelector("[data-travel-selected-label]");
  if (travelLabel) {
    travelLabel.textContent = appState.selectedTravelName || "—";
  }
}

/* ================================
CONFIG MODULE
================================ */
function initConfigModule() {
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-main-tab='config']")) {
      setView("config");
      syncAppUI();
      await loadConfigProfiles();
      return;
    }

    if (e.target.closest("[data-config-save]")) {
      await saveConfigProfile();
      return;
    }

    if (e.target.closest("[data-config-load]")) {
      await loadConfigProfiles();
      return;
    }

    if (e.target.closest("[data-config-new]")) {
      activeConfigProfileId = null;
      clearConfigForm();
      const select = document.querySelector("[data-config-profile-select]");
      if (select) select.value = "";
      return;
    }

    if (e.target.closest("[data-config-delete]")) {
      await deleteCurrentConfigProfile();
      return;
    }
  });

  document.addEventListener("change", async e => {
    if (e.target.matches("[data-config-profile-select]")) {
      const id = e.target.value;
      if (!id) {
        activeConfigProfileId = null;
        clearConfigForm();
        return;
      }

      activeConfigProfileId = Number(id);
      await loadConfigProfileById(activeConfigProfileId);
      return;
    }

    if (e.target.matches("[data-config-logo]")) {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!activeConfigProfileId) {
        alert("Primero guardá o seleccioná un perfil.");
        return;
      }

      await uploadCompanyLogo(activeConfigProfileId, file);
      await loadConfigProfileById(activeConfigProfileId);
      return;
    }

    if (e.target.matches("[data-config-cover]")) {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!activeConfigProfileId) {
        alert("Primero guardá o seleccioná un perfil.");
        return;
      }

      await uploadCompanyCover(activeConfigProfileId, file);
      await loadConfigProfileById(activeConfigProfileId);
    }
  });
}

/* ======================
LOAD PROFILES
====================== */
async function loadConfigProfiles() {
  try {
    const profiles = await getCompanyProfiles();
    fillConfigProfileSelect(profiles || []);

    if (!profiles?.length) {
      activeConfigProfileId = null;
      clearConfigForm();
      return;
    }

    const stillExists = profiles.some(p => Number(p.id) === Number(activeConfigProfileId));

    if (!stillExists) {
      activeConfigProfileId = Number(profiles[0].id);
    }

    const select = document.querySelector("[data-config-profile-select]");
    if (select) {
      select.value = String(activeConfigProfileId || "");
    }

    if (activeConfigProfileId) {
      await loadConfigProfileById(activeConfigProfileId);
    }
  } catch (err) {
    console.error("Error cargando perfiles", err);
  }
}

/* ======================
LOAD ONE PROFILE
====================== */
async function loadConfigProfileById(id) {
  try {
    const data = await getCompanyProfileById(id);
    if (!data) {
      clearConfigForm();
      return;
    }

    activeConfigProfileId = Number(data.id);

    document.querySelectorAll("[data-config]").forEach(input => {
      const key = input.dataset.config;
      input.value = data[key] || "";
    });

    const logoImg = document.querySelector("[data-config-logo-preview]");
    if (logoImg) {
      const logoUrl = buildBackendAssetUrl(data.logo_path || "");
      logoImg.src = logoUrl;
      logoImg.style.display = logoUrl ? "block" : "none";
    }

    const coverImg = document.querySelector("[data-config-cover-preview]");
    if (coverImg) {
      const coverUrl = buildBackendAssetUrl(data.cover_image_path || "");
      coverImg.src = coverUrl;
      coverImg.style.display = coverUrl ? "block" : "none";
    }
  } catch (err) {
    console.error("Error cargando perfil", err);
  }
}

/* ======================
SAVE PROFILE
====================== */
async function saveConfigProfile() {
  try {
    const payload = {};

    document.querySelectorAll("[data-config]").forEach(input => {
      payload[input.dataset.config] = input.value;
    });

    if (!payload.profile_name?.trim()) {
      alert("Poné un nombre interno al perfil.");
      return;
    }

    if (activeConfigProfileId) {
      await updateCompanyProfile(activeConfigProfileId, payload);
    } else {
      const res = await createCompanyProfile(payload);
      activeConfigProfileId = res?.id || null;
    }

    await loadConfigProfiles();
    alert("Perfil guardado correctamente");
  } catch (err) {
    console.error("Error guardando perfil", err);
    alert("Error al guardar perfil");
  }
}

/* ======================
DELETE PROFILE
====================== */
async function deleteCurrentConfigProfile() {
  try {
    if (!activeConfigProfileId) {
      alert("Seleccioná un perfil primero.");
      return;
    }

    if (!confirm("¿Eliminar este perfil?")) return;

    await deleteCompanyProfile(activeConfigProfileId);
    activeConfigProfileId = null;
    clearConfigForm();
    await loadConfigProfiles();
  } catch (err) {
    console.error("Error eliminando perfil", err);
    alert("Error eliminando perfil");
  }
}

/* ======================
PROFILE SELECT
====================== */
function fillConfigProfileSelect(profiles = []) {
  const select = document.querySelector("[data-config-profile-select]");
  if (!select) return;

  select.innerHTML = `<option value="">Seleccionar perfil</option>`;

  profiles.forEach(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.profile_name || `Perfil ${profile.id}`;
    select.appendChild(option);
  });
}

function buildBackendAssetUrl(filePath = "") {
  if (!filePath) return "";

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

/* ======================
CLEAR FORM
====================== */
function clearConfigForm() {
  document.querySelectorAll("[data-config]").forEach(input => {
    if (input.tagName === "SELECT") {
      input.value = input.querySelector("option")?.value || "";
    } else {
      input.value = "";
    }
  });

  const logoImg = document.querySelector("[data-config-logo-preview]");
  if (logoImg) {
    logoImg.src = "";
    logoImg.style.display = "none";
  }

  const coverImg = document.querySelector("[data-config-cover-preview]");
  if (coverImg) {
    coverImg.src = "";
    coverImg.style.display = "none";
  }

  const logoInput = document.querySelector("[data-config-logo]");
  if (logoInput) {
    logoInput.value = "";
  }

  const coverInput = document.querySelector("[data-config-cover]");
  if (coverInput) {
    coverInput.value = "";
  }
}