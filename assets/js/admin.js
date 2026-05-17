(function () {
  document.body.classList.remove("is-admin-authed");

  const TOKEN_KEY = "slimee_admin_token";
  const USER_KEY = "slimee_admin_user";

  const loginScreen = document.getElementById("admin-login-screen");
  const loginView = document.getElementById("admin-login");
  const appView = document.getElementById("admin-app");
  const loginForm = document.getElementById("admin-login-form");
  const loginMsg = document.getElementById("admin-login-msg");
  const panelMsg = document.getElementById("admin-panel-msg");
  const userPill = document.getElementById("admin-user-pill");
  const logoutBtn = document.getElementById("admin-logout");
  const viewTitle = document.getElementById("admin-view-title");
  const editorWrap = document.getElementById("admin-editor-wrap");
  const btnCreate = document.getElementById("btn-product-create");
  const btnEdit = document.getElementById("btn-product-edit");
  const btnDelete = document.getElementById("btn-product-delete");
  const selectionHint = document.getElementById("products-selection-hint");
  const editorTitle = document.getElementById("admin-editor-title");

  let packages = [];
  let selectedId = null;
  let editorMode = null;
  let productListMode = null;
  let currentView = "dashboard";

  const productGrid = document.getElementById("admin-product-grid");

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
    document.body.classList.remove("is-admin-authed");
    if (appView) {
      appView.setAttribute("aria-hidden", "true");
    }
    if (loginScreen) {
      loginScreen.removeAttribute("hidden");
      loginScreen.setAttribute("aria-hidden", "false");
    }
  }

  function showApp() {
    document.body.classList.add("is-admin-authed");
    if (loginScreen) {
      loginScreen.setAttribute("hidden", "");
      loginScreen.setAttribute("aria-hidden", "true");
    }
    if (appView) {
      appView.removeAttribute("hidden");
      appView.setAttribute("aria-hidden", "false");
    }
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

    if (view === "dashboard" && isMainAdmin()) loadDashboard();
    if (view === "products") {
      resetProductsView();
    }
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

  function slugifyName(name) {
    return (
      String(name || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "package"
    );
  }

  function uniquePackageId(base, ignoreId) {
    const ids = new Set(packages.map((p) => p.id).filter((id) => id !== ignoreId));
    let id = base;
    let n = 2;
    while (ids.has(id)) {
      id = `${base}-${n++}`;
    }
    return id;
  }

  function syncAutoPackageId() {
    if (editorMode !== "create") return;
    const name = document.getElementById("pkg-name").value;
    const base = slugifyName(name || "new-package");
    document.getElementById("pkg-id").value = uniquePackageId(base);
  }

  function closeEditor() {
    editorMode = null;
    if (editorWrap) editorWrap.hidden = true;
  }

  function hideProductGrid() {
    productListMode = null;
    if (productGrid) productGrid.hidden = true;
    updateProductToolbar();
  }

  function showProductGrid(mode) {
    productListMode = mode;
    selectedId = null;
    closeEditor();
    if (productGrid) productGrid.hidden = false;
    renderProductGrid();
    updateProductToolbar();
  }

  function resetProductsView() {
    closeEditor();
    productListMode = null;
    selectedId = null;
    if (productGrid) productGrid.hidden = true;
    updateProductToolbar();
  }

  function openEditor(mode, pkg) {
    editorMode = mode;
    fillEditor(pkg, mode);
    if (editorWrap) editorWrap.hidden = false;
    if (editorTitle) {
      editorTitle.textContent = mode === "create" ? "Create product" : "Product options";
    }
    if (mode === "create") syncAutoPackageId();
    if (mode === "edit" && pkg?.id) refreshUploadStatus();
  }

  function updateProductToolbar() {
    const hasSelection = Boolean(selectedId);
    if (btnEdit) btnEdit.disabled = productListMode === "edit" && !hasSelection;
    if (btnDelete) btnDelete.disabled = productListMode === "delete" && !hasSelection;
    if (!selectionHint) return;
    const pkg = packages.find((p) => p.id === selectedId);
    if (productListMode === "edit") {
      selectionHint.textContent = "Select a product to edit.";
    } else if (productListMode === "delete") {
      selectionHint.textContent = pkg
        ? `Selected: ${pkg.name} — press Delete again to remove it.`
        : "Select a product to delete.";
    } else if (editorMode === "create") {
      selectionHint.textContent = "Creating a new product.";
    } else {
      selectionHint.textContent = "Click Create, Edit, or Delete to manage products.";
    }
  }

  function fillEditor(pkg, mode) {
    const p = pkg || {};
    document.getElementById("pkg-id").value = p.id || "";
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
    if (mode === "edit") {
      selectedId = p.id || null;
    } else if (mode !== "create") {
      selectedId = p.id || selectedId;
    }
  }

  function renderProductGrid() {
    if (!productGrid || productGrid.hidden) return;
    productGrid.innerHTML = packages
      .map(
        (p) => `
      <article class="admin-product-card${p.id === selectedId ? " is-active" : ""}" data-id="${p.id}">
        <h3>${p.name}</h3>
        <p class="meta">${p.category} · ${p.priceAmount} ${p.currency}${p.published === false ? " · hidden" : ""}</p>
        <p class="meta">${p.protectionMode || "partial"} protection</p>
      </article>`
      )
      .join("");
    productGrid.querySelectorAll(".admin-product-card").forEach((card) => {
      card.addEventListener("click", () => {
        selectedId = card.dataset.id;
        renderProductGrid();
        updateProductToolbar();
        if (productListMode === "edit") {
          const pkg = packages.find((p) => p.id === selectedId);
          if (pkg) {
            productListMode = null;
            if (productGrid) productGrid.hidden = true;
            openEditor("edit", pkg);
            updateProductToolbar();
          }
        }
      });
    });
    updateProductToolbar();
  }

  async function loadPackages() {
    const data = await api("/packages");
    packages = data.packages || [];
    if (productGrid && !productGrid.hidden) renderProductGrid();
  }

  async function checkStorageFile() {
    const packageId = selectedId || document.getElementById("pkg-id")?.value?.trim();
    if (!packageId) {
      showMsg(panelMsg, "Select or save a product first.", "error");
      return;
    }
    const status = document.getElementById("pkg-upload-status");
    if (status) {
      status.textContent = "Checking storage…";
      status.style.color = "";
    }
    try {
      const data = await api(`/storage/check/${encodeURIComponent(packageId)}`);
      const key = data.storageKey || data.dbRecord?.storageKey || "—";
      const provider = data.storageProvider || "storage";
      if (data.objectExists && data.getObjectSuccess !== false) {
        const sizeKb = Math.round((data.dbRecord?.byteSize || 0) / 1024);
        const msg = `Storage OK (${provider}): ${key} — ${sizeKb} KB`;
        if (status) {
          status.textContent = msg;
          status.style.color = "#86efac";
        }
        showMsg(panelMsg, msg, "success");
      } else if (data.objectExists) {
        const msg = `File exists but could not be read from ${provider}. Key: ${key}`;
        if (status) {
          status.textContent = msg;
          status.style.color = "#fca5a5";
        }
        showMsg(panelMsg, msg, "error");
      } else {
        const msg = data.dbRecord
          ? `Missing in ${provider}: ${key}`
          : `No upload record for "${packageId}". Upload a ZIP first.`;
        if (status) {
          status.textContent = msg;
          status.style.color = "#fca5a5";
        }
        showMsg(panelMsg, msg, "error");
      }
    } catch (err) {
      if (status) {
        status.textContent = err.message;
        status.style.color = "#fca5a5";
      }
      showMsg(panelMsg, err.message, "error");
    }
  }

  document.getElementById("btn-check-storage")?.addEventListener("click", () => {
    checkStorageFile().catch((err) => showMsg(panelMsg, err.message, "error"));
  });

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

  document.getElementById("pkg-name")?.addEventListener("input", syncAutoPackageId);

  document.getElementById("admin-editor-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg(panelMsg, "", "");
    try {
      if (editorMode === "create") syncAutoPackageId();
      const payload = readEditor();
      if (editorMode === "create") {
        await api("/packages", { method: "POST", body: JSON.stringify(payload) });
        selectedId = payload.id;
        editorMode = "edit";
        showMsg(panelMsg, "Product created.", "success");
      } else if (selectedId) {
        await api(`/packages/${encodeURIComponent(selectedId)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showMsg(panelMsg, "Product saved.", "success");
      }
      await loadPackages();
      openEditor("edit", packages.find((p) => p.id === payload.id) || payload);
      updateProductToolbar();
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
  });

  document.getElementById("admin-editor-cancel")?.addEventListener("click", () => {
    resetProductsView();
  });

  btnCreate?.addEventListener("click", () => {
    hideProductGrid();
    selectedId = null;
    openEditor("create", {
      name: "New Package",
      category: "Scripts",
      priceAmount: "9.99",
      currency: "USD",
      protectionMode: "partial",
      escrowIgnore: [],
      published: false,
      featured: false,
      tags: [],
      detailSections: []
    });
    updateProductToolbar();
  });

  btnEdit?.addEventListener("click", () => {
    if (productListMode !== "edit") {
      showProductGrid("edit");
      return;
    }
    if (!selectedId) return;
    const pkg = packages.find((p) => p.id === selectedId);
    if (pkg) {
      productListMode = null;
      if (productGrid) productGrid.hidden = true;
      openEditor("edit", pkg);
      updateProductToolbar();
    }
  });

  btnDelete?.addEventListener("click", async () => {
    if (productListMode !== "delete") {
      showProductGrid("delete");
      return;
    }
    if (!selectedId) return;
    const pkg = packages.find((p) => p.id === selectedId);
    if (!confirm(`Delete "${pkg?.name || selectedId}"? This cannot be undone.`)) return;
    try {
      await api(`/packages/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      resetProductsView();
      await loadPackages();
      showMsg(panelMsg, "Product deleted.", "success");
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
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
          <button type="button" data-act="setip" data-id="${L.id}" data-ip="${L.bound_server_ip || ""}">Set IP</button>
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
        if (act === "setip") {
          const current = btn.dataset.ip || "";
          const serverIp = window.prompt(
            "Lock this license to server IPv4 (customer cannot change — use Reset bind to move):",
            current
          );
          if (!serverIp) return;
          await apiLicenses(`/${id}/set-bound-ip`, {
            method: "POST",
            body: JSON.stringify({ serverIp: serverIp.trim() })
          });
          showMsg(panelMsg, `License locked to IP ${serverIp.trim()}`, "success");
        } else {
          await apiLicenses(`/${id}/${act === "reset" ? "reset-binding" : act}`, { method: "POST" });
        }
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

  showLogin();

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
  }
})();
