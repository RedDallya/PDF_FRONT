import { API_BASE } from "./config.js";

/* =====================================
TOKEN STATE
===================================== */
let authToken = localStorage.getItem("auth_token") || null;
let refreshTokenValue = localStorage.getItem("refresh_token") || null;

export function setAuthToken(token) {
  authToken = token;
  localStorage.setItem("auth_token", token);
}

export function setRefreshToken(token) {
  refreshTokenValue = token;
  localStorage.setItem("refresh_token", token);
}

export function getAuthToken() {
  return authToken;
}

/* =====================================
UI STATE
===================================== */
export function showApp() {
  document.getElementById("login-screen")?.classList.add("d-none");
  document.getElementById("app-screen")?.classList.remove("d-none");
}

export function showLogin() {
  document.getElementById("app-screen")?.classList.add("d-none");
  document.getElementById("login-screen")?.classList.remove("d-none");
}

/* =====================================
CORE FETCH (ÚNICO PUNTO DE SALIDA)
===================================== */
export async function apiFetch(endpoint, options = {}) {
  const headers = {
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
  };

  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  /* ===== Refresh automático ===== */
  if (res.status === 401 && refreshTokenValue) {
    const refresh = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenValue })
    });

    if (refresh.ok) {
      const data = await refresh.json();
      setAuthToken(data.accessToken);

      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${data.accessToken}`
        }
      });
    } else {
      logout();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.status);
  }

  return res;
}

export const fetchJSON = async (e, o) => {
  const res = await apiFetch(e, o);
  const contentType = res.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    const text = await res.text();
    console.error("Expected JSON but got:", contentType, text.substring(0, 200));
    throw new Error(`Server returned ${contentType} instead of JSON`);
  }

  return res.json();
};

/* =====================================
AUTH
===================================== */
export async function login(username, password) {
  const res = await fetchJSON("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  setAuthToken(res.accessToken);
  setRefreshToken(res.refreshToken);

  if (res.user?.id) {
    localStorage.setItem("user_id", String(res.user.id));
  }

  showApp();
  return res;
}

export function logout() {
  authToken = null;
  refreshTokenValue = null;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_id");
  showLogin();
}

/* =====================================
UPLOADS
===================================== */
export const fetchForm = (e, f) =>
  apiFetch(e, { method: "POST", body: f }).then(r => r.json());

/* =====================================
ENDPOINTS (sin /api)
===================================== */
export const getClientes = () => fetchJSON("/clientes");
export const getCliente = id => fetchJSON(`/clientes/${id}`);
export const createCliente = d => fetchJSON("/clientes", { method: "POST", body: JSON.stringify(d) });
export const updateCliente = (id, d) => fetchJSON(`/clientes/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const deleteCliente = id => fetchJSON(`/clientes/${id}`, { method: "DELETE" });

export const getClientDocuments = id => fetchJSON(`/client-documents/${id}`);
export const createClientDocument = f => fetchForm("/client-documents", f);
export const deleteClientDocument = id => fetchJSON(`/client-documents/${id}`, { method: "DELETE" });

export const getTravelsByClient = id => fetchJSON(`/viajes/cliente/${id}`);
export const getTravelById = id => fetchJSON(`/viajes/${id}`);
export const createTravel = d => fetchJSON("/viajes", { method: "POST", body: JSON.stringify(d) });
export const updateTravel = (id, d) => fetchJSON(`/viajes/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const deleteTravel = id => fetchJSON(`/viajes/${id}`, { method: "DELETE" });

export const getCotizacionesByViaje = id => fetchJSON(`/cotizaciones/viaje/${id}`);
export const createCotizacion = d => fetchJSON("/cotizaciones", { method: "POST", body: JSON.stringify(d) });
export const updateCotizacion = (id, d) => fetchJSON(`/cotizaciones/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const deleteCotizacion = id => fetchJSON(`/cotizaciones/${id}`, { method: "DELETE" });

export const getServicios = id => fetchJSON(`/servicios/cotizacion/${id}`);
export const createServicio = d => fetchJSON("/servicios", { method: "POST", body: JSON.stringify(d) });
export const updateServicio = (id, d) => fetchJSON(`/servicios/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const deleteServicio = id => fetchJSON(`/servicios/${id}`, { method: "DELETE" });

export const getPdfs = id => fetchJSON(`/pdfs/${id}`);
export const getPdfSections = id => fetchJSON(`/pdf-sections/${id}`);

/* =====================
PDF BRAND PROFILES
===================== */

export const getCompanyProfiles = () => fetchJSON("/company-profile");

export const getCompanyProfileById = id =>
  fetchJSON(`/company-profile/${id}`);

export const createCompanyProfile = data =>
  fetchJSON("/company-profile", {
    method: "POST",
    body: JSON.stringify(data)
  });

export const updateCompanyProfile = (id, data) =>
  fetchJSON(`/company-profile/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });

export const deleteCompanyProfile = id =>
  fetchJSON(`/company-profile/${id}`, {
    method: "DELETE"
  });

export const uploadCompanyLogo = (id, file) => {
  const form = new FormData();
  form.append("logo", file);
  return fetchForm(`/company-profile/${id}/logo`, form);
};

export const uploadCompanyCover = (id, file) => {
  const form = new FormData();
  form.append("cover", file);
  return fetchForm(`/company-profile/${id}/cover`, form);
};