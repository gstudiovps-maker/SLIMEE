(function () {
  const TOKEN_KEY = "slimee_admin_token";
  const USER_KEY = "slimee_admin_user";

  const loginView = document.getElementById("admin-login");
  const appView = document.getElementById("admin-app");
  const loginForm = document.getElementById("admin-login-form");
  const loginMsg = document.getElementById("admin-login-msg");
  const panelMsg = document.getElementById("admin-panel-msg");
  const userPill = document.getElementById("admin-user-pill");
  const logoutBtn = document.getElementById("admin-logout");
  const viewTitle = document.getElementById("admin-view-title");
  const newBtn = document.getElementById("admin-new-package");

  let packages = [];
  let selectedId = null;
  let currentView = "dashboard";

  function apiBase() {
    return (window.STORE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function isMainAdmin() {
    return getUser()?.role === "main";
  }

  function setSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
    el.classList.toggle("is-error", type === "error");
    el.classList.toggle("is-success", type === "success");
  }

  async function api(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error("Set apiBaseUrl in assets/js/config.js");
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/api/admin${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function apiLicenses(path, options = {}) {
    const base = apiBase();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}/api/admin/licenses${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    const user = getUser();
    if (userPill && user) {
      userPill.textContent = `${user.username} (${user.role})`;
      userPill.classList.toggle("is-main", user.role === "main");
    }
    const main = isMainAdmin();
    ["nav-licenses", "nav-validation", "nav-audit"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !main;
    });
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".admin-view").forEach((el) => {
      el.hidden = el.id !== `view-${view}`;
    });
    document.querySelectorAll(".admin-nav button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
    const titles = {
      dashboard: "Dashboard",
      products: "Products",
      licenses: "License management",
      validation: "Validation logs",
      audit: "Admin audit logs"
    };
    viewTitle.textContent = titles[view] || "Admin";
    newBtn.hidden = view !== "products";

    if (view === "dashboard" && isMainAdmin()) loadDashboard();
    if (view === "products") renderProductGrid();
    if (view === "licenses" && isMainAdmin()) searchLicenses();
    if (view === "validation" && isMainAdmin()) loadValidationEvents(false);
    if (view === "audit" && isMainAdmin()) loadAuditLogs();
  }

  document.getElementById("admin-nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) switchView(btn.dataset.view);
  });

  async function loadDashboard() {
    try {
      const stats = await apiLicenses("/stats");
      const statsEl = document.getElementById("admin-stats");
      statsEl.innerHTML = [
        ["Licenses", stats.totalLicenses],
        ["Published products", stats.publishedPackages],
        ["Sales (30d)", stats.licenses30d],
        ["Failed checks (7d)", stats.failedValidations7d]
      ]
        .map(
          ([label, val]) =>
            `<article class="admin-stat-card"><span>${label}</span><strong>${val}</strong></article>`
        )
        .join("");

      const tbody = document.querySelector("#recent-purchases-table tbody");
      tbody.innerHTML = (stats.recentPurchases || [])
        .map(
          (r) =>
            `<tr><td><code>${r.license_key}</code></td><td>${r.package_id}</td><td>${r.customer_email || "—"}</td><td>${r.status}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`
        )
        .join("");
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
  }

  function parseTags(v) {
    return String(v || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function readEditor() {
    let detailSections = [];
    try {
      const raw = document.getElementById("pkg-detail-sections").value.trim();
      detailSections = raw ? JSON.parse(raw) : [];
    } catch (e) {
      throw new Error(`Detail sections JSON: ${e.message}`);
    }
    const escrowIgnore = document
      .getElementById("pkg-escrow-ignore")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return {
      id: document.getElementById("pkg-id").value.trim(),
      name: document.getElementById("pkg-name").value.trim(),
      category: document.getElementById("pkg-category").value,
      priceAmount: document.getElementById("pkg-price-amount").value.trim(),
      currency: document.getElementById("pkg-currency").value.trim() || "USD",
      description: document.getElementById("pkg-description").value.trim(),
      protectionMode: document.getElementById("pkg-protection-mode").value,
      escrowIgnore,
      featured: document.getElementById("pkg-featured").checked,
      published: document.getElementById("pkg-published").checked,
      tags: parseTags(document.getElementById("pkg-tags").value),
      detailSections
    };
  }

  function fillEditor(pkg) {
    const p = pkg || {};
    document.getElementById("pkg-id").value = p.id || "";
    document.getElementById("pkg-id").readOnly = Boolean(p.id);
    document.getElementById("pkg-name").value = p.name || "";
    document.getElementById("pkg-category").value = p.category || "Scripts";
    document.getElementById("pkg-price-amount").value = p.priceAmount || "";
    document.getElementById("pkg-currency").value = p.currency || "USD";
    document.getElementById("pkg-description").value = p.description || "";
    document.getElementById("pkg-protection-mode").value = p.protectionMode || "partial";
    document.getElementById("pkg-escrow-ignore").value = (p.escrowIgnore || []).join("\n");
    document.getElementById("pkg-featured").checked = Boolean(p.featured);
    document.getElementById("pkg-published").checked = p.published !== false;
    document.getElementById("pkg-tags").value = (p.tags || []).join(", ");
    document.getElementById("pkg-detail-sections").value = JSON.stringify(p.detailSections || [], null, 2);
    selectedId = p.id || null;
    document.getElementById("admin-delete-package").disabled = !selectedId;
    document.getElementById("admin-editor-wrap").hidden = !selectedId && !p._isNew;
    if (selectedId) refreshUploadStatus();
  }

  function renderProductGrid() {
    const grid = document.getElementById("admin-product-grid");
    grid.innerHTML = packages
      .map(
        (p) => `
      <article class="admin-product-card${p.id === selectedId ? " is-active" : ""}" data-id="${p.id}">
        <h3>${p.name}</h3>
        <p class="meta">${p.category} · ${p.priceAmount} ${p.currency}${p.published === false ? " · hidden" : ""}</p>
        <p class="meta">${p.protectionMode || "partial"} protection</p>
      </article>`
      )
      .join("");
    grid.querySelectorAll(".admin-product-card").forEach((card) => {
      card.addEventListener("click", () => {
        fillEditor(packages.find((x) => x.id === card.dataset.id));
        renderProductGrid();
      });
    });
  }

  async function loadPackages() {
    const data = await api("/packages");
    packages = data.packages || [];
    renderProductGrid();
  }

  async function refreshUploadStatus() {
    const el = document.getElementById("pkg-upload-status");
    if (!selectedId) {
      el.textContent = "";
      return;
    }
    try {
      const base = apiBase();
      const res = await fetch(`${base}/api/admin/uploads/${encodeURIComponent(selectedId)}/source-zip`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.hasSource) {
        el.textContent = `Uploaded: ${data.originalFilename || "source.zip"} (${Math.round(data.byteSize / 1024)} KB)`;
        el.style.color = "#86efac";
      } else {
        el.textContent = "No source ZIP uploaded yet.";
        el.style.color = "#fca5a5";
      }
    } catch {
      el.textContent = "Could not check upload status.";
    }
  }

  async function uploadZip(file) {
    if (!selectedId) {
      showMsg(panelMsg, "Save the product first before uploading ZIP.", "error");
      return;
    }
    const status = document.getElementById("pkg-upload-status");
    status.textContent = "Uploading…";
    const fd = new FormData();
    fd.append("sourceZip", file);
    const base = apiBase();
    const res = await fetch(`${base}/api/admin/uploads/${encodeURIComponent(selectedId)}/source-zip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    status.textContent = `Uploaded ${file.name} (${Math.round(file.size / 1024)} KB)`;
    status.style.color = "#86efac";
    showMsg(panelMsg, "Source ZIP stored in private backend storage.", "success");
  }

  const dropzone = document.getElementById("admin-dropzone");
  const zipInput = document.getElementById("pkg-zip-input");

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadZip(file).catch((err) => showMsg(panelMsg, err.message, "error"));
  });
  zipInput?.addEventListener("change", () => {
    const file = zipInput.files?.[0];
    if (file) uploadZip(file).catch((err) => showMsg(panelMsg, err.message, "error"));
  });

  document.getElementById("admin-editor-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg(panelMsg, "", "");
    try {
      const payload = readEditor();
      if (!selectedId) {
        await api("/packages", { method: "POST", body: JSON.stringify(payload) });
        showMsg(panelMsg, "Product created.", "success");
      } else {
        await api(`/packages/${encodeURIComponent(selectedId)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showMsg(panelMsg, "Product saved.", "success");
      }
      await loadPackages();
      fillEditor(packages.find((p) => p.id === payload.id) || payload);
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
  });

  newBtn?.addEventListener("click", () => {
    switchView("products");
    fillEditor({
      _isNew: true,
      id: "",
      name: "",
      category: "Scripts",
      priceAmount: "9.99",
      protectionMode: "partial",
      escrowIgnore: [],
      published: false,
      featured: false,
      tags: [],
      detailSections: []
    });
    document.getElementById("admin-editor-wrap").hidden = false;
    renderProductGrid();
  });

  document.getElementById("admin-delete-package")?.addEventListener("click", async () => {
    if (!selectedId || !confirm(`Delete product "${selectedId}"?`)) return;
    await api(`/packages/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
    selectedId = null;
    document.getElementById("admin-editor-wrap").hidden = true;
    await loadPackages();
    showMsg(panelMsg, "Product deleted.", "success");
  });

  async function searchLicenses() {
    const q = document.getElementById("license-search")?.value || "";
    const data = await apiLicenses(`/search?q=${encodeURIComponent(q)}`);
    const tbody = document.querySelector("#licenses-table tbody");
    tbody.innerHTML = (data.licenses || [])
      .map(
        (L) => `
      <tr>
        <td><code>${L.license_key}</code></td>
        <td>${L.package_id}</td>
        <td>${L.customer_email || "—"}</td>
        <td>${L.status}</td>
        <td>${L.bound_server_ip || "—"}</td>
        <td class="admin-row-actions">
          <button type="button" data-act="reset" data-id="${L.id}">Reset bind</button>
          <button type="button" data-act="suspend" data-id="${L.id}">Suspend</button>
          <button type="button" data-act="revoke" data-id="${L.id}">Revoke</button>
          <button type="button" data-act="activate" data-id="${L.id}">Activate</button>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        await apiLicenses(`/${id}/${act === "reset" ? "reset-binding" : act}`, { method: "POST" });
        searchLicenses();
      });
    });
  }

  document.getElementById("license-search-btn")?.addEventListener("click", () =>
    searchLicenses().catch((e) => showMsg(panelMsg, e.message, "error"))
  );

  async function loadValidationEvents(failedOnly) {
    const data = await apiLicenses(`/validation-events?failed=${failedOnly ? "1" : "0"}`);
    const tbody = document.querySelector("#validation-table tbody");
    tbody.innerHTML = (data.events || [])
      .map(
        (e) =>
          `<tr><td>${new Date(e.created_at).toLocaleString()}</td><td><code>${e.license_key || ""}</code></td><td>${e.package_id || ""}</td><td>${e.server_ip || ""}</td><td>${e.success ? "yes" : "no"}</td><td>${e.reason || ""}</td></tr>`
      )
      .join("");
  }

  document.getElementById("validation-failed-btn")?.addEventListener("click", () => loadValidationEvents(true));
  document.getElementById("validation-all-btn")?.addEventListener("click", () => loadValidationEvents(false));

  async function loadAuditLogs() {
    const data = await apiLicenses("/audit-logs");
    const tbody = document.querySelector("#audit-table tbody");
    tbody.innerHTML = (data.logs || [])
      .map(
        (r) =>
          `<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${r.admin_username}</td><td>${r.action}</td><td>${r.resource_type || ""} ${r.resource_id || ""}</td></tr>`
      )
      .join("");
  }

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg(loginMsg, "", "");
    try {
      const base = apiBase();
      const res = await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("admin-username").value,
          password: document.getElementById("admin-password").value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");
      setSession(data.token, data.user);
      showApp();
      await loadPackages();
      switchView("dashboard");
    } catch (err) {
      showMsg(loginMsg, err.message, "error");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    clearSession();
    showLogin();
  });

  if (getToken() && getUser()) {
    api("/me")
      .then(async () => {
        showApp();
        await loadPackages();
        switchView("dashboard");
      })
      .catch(() => {
        clearSession();
        showLogin();
      });
  } else {
    showLogin();
  }
})();
