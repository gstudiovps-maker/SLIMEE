/**
 * Customer Discord session (localStorage) + nav sign-in / profile chip.
 */
(function () {
  const TOKEN_KEY = "slimee_customer_token";
  const PROFILE_KEY = "slimee_customer_profile";

  function apiBase() {
    return (window.STORE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
  }

  function pagesPrefix() {
    const p =
      typeof window.STORE_REPO_PREFIX !== "undefined"
        ? String(window.STORE_REPO_PREFIX).trim().replace(/\/+$/, "")
        : "";
    return p === "" ? "" : `${p}/`;
  }

  function accountHref() {
    if (typeof window.storeHref === "function") {
      return window.storeHref("account");
    }
    return `${pagesPrefix()}account/`;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(token, profile) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("slimee-customer-auth"));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new CustomEvent("slimee-customer-auth"));
  }

  function discordLoginUrl() {
    const base = apiBase();
    let accountPath = accountHref();
    if (accountPath.startsWith("../")) {
      accountPath = accountPath.replace(/^\.\.\//, "/");
    }
    if (!accountPath.startsWith("/")) {
      accountPath = `/${accountPath}`;
    }
    const returnTo = encodeURIComponent(`${window.location.origin}${accountPath}`);
    return `${base}/api/auth/discord?returnTo=${returnTo}`;
  }

  function captureTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return false;
    setSession(token, null);
    params.delete("token");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState({}, "", next);
    return true;
  }

  async function fetchProfile() {
    const token = getToken();
    if (!token) return null;
    const base = apiBase();
    if (!base) return null;
    const res = await fetch(`${base}/api/account/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) clearSession();
      return null;
    }
    const data = await res.json();
    if (data.customer) {
      setSession(token, data.customer);
    }
    return data.customer || null;
  }

  function renderNavAuth() {
    document.querySelectorAll("[data-customer-auth]").forEach((slot) => {
      const token = getToken();
      const profile = getProfile();
      if (token && profile) {
        const name = profile.displayName || profile.username || "Account";
        slot.innerHTML = [
          `<a class="nav-customer-chip" href="${accountHref()}" title="My purchases">`,
          `<img class="nav-customer-avatar" src="${profile.avatarUrl || ""}" alt="" width="32" height="32" />`,
          `<span class="nav-customer-name">${escapeHtml(name)}</span>`,
          `</a>`
        ].join("");
      } else if (token) {
        slot.innerHTML = `<a class="nav-customer-signin" href="${accountHref()}">My purchases</a>`;
      } else {
        slot.innerHTML = `<a class="nav-customer-signin" href="${discordLoginUrl()}">Sign in</a>`;
      }
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  window.SlimeeCustomerAuth = {
    getToken,
    getProfile,
    setSession,
    clearSession,
    fetchProfile,
    discordLoginUrl,
    accountHref,
    apiFetch: async (path, options = {}) => {
      const base = apiBase();
      const headers = { ...(options.headers || {}) };
      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${base}/api/account${path}`, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    }
  };

  captureTokenFromUrl();

  document.addEventListener("DOMContentLoaded", async () => {
    if (getToken()) {
      await fetchProfile().catch(() => null);
    }
    renderNavAuth();
  });

  window.addEventListener("slimee-customer-auth", renderNavAuth);
})();
