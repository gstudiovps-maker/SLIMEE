(function () {
  const TOKEN_KEY = "slimee_admin_token";
  const USER_KEY = "slimee_admin_user";

  const loginView = document.getElementById("admin-login");
  const panelView = document.getElementById("admin-panel");
  const loginForm = document.getElementById("admin-login-form");
  const loginMsg = document.getElementById("admin-login-msg");
  const panelMsg = document.getElementById("admin-panel-msg");
  const userPill = document.getElementById("admin-user-pill");
  const logoutBtn = document.getElementById("admin-logout");
  const packageList = document.getElementById("admin-package-list");
  const editorForm = document.getElementById("admin-editor-form");
  const newBtn = document.getElementById("admin-new-package");
  const deleteBtn = document.getElementById("admin-delete-package");
  const logsPanel = document.getElementById("admin-logs-panel");
  const logsBody = document.getElementById("admin-logs-body");

  let packages = [];
  let selectedId = null;

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
    if (!base) {
      throw new Error("Set apiBaseUrl in assets/js/config.js");
    }
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${base}/api/admin${path}`, {
      ...options,
      headers
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function showLogin() {
    loginView.hidden = false;
    panelView.hidden = true;
  }

  function showPanel() {
    loginView.hidden = true;
    panelView.hidden = false;
    const user = getUser();
    if (userPill && user) {
      userPill.textContent = `${user.username} (${user.role})`;
      userPill.classList.toggle("is-main", user.role === "main");
    }
    logsPanel.hidden = user?.role !== "main";
  }

  function parseTags(value) {
    return String(value || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function tagsToString(tags) {
    return Array.isArray(tags) ? tags.join(", ") : "";
  }

  function readEditor() {
    let detailSections = [];
    try {
      const raw = document.getElementById("pkg-detail-sections").value.trim();
      detailSections = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(detailSections)) {
        throw new Error("detailSections must be a JSON array");
      }
    } catch (err) {
      throw new Error(`Detail sections JSON: ${err.message}`);
    }

    return {
      id: document.getElementById("pkg-id").value.trim(),
      name: document.getElementById("pkg-name").value.trim(),
      category: document.getElementById("pkg-category").value,
      priceAmount: document.getElementById("pkg-price-amount").value.trim(),
      currency: document.getElementById("pkg-currency").value.trim() || "USD",
      description: document.getElementById("pkg-description").value.trim(),
      featured: document.getElementById("pkg-featured").checked,
      published: document.getElementById("pkg-published").checked,
      videoPreviewUrl: document.getElementById("pkg-video").value.trim(),
      cardImage: document.getElementById("pkg-card-image").value.trim(),
      detailIntro: document.getElementById("pkg-detail-intro").value.trim(),
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
    document.getElementById("pkg-featured").checked = Boolean(p.featured);
    document.getElementById("pkg-published").checked = p.published !== false;
    document.getElementById("pkg-video").value = p.videoPreviewUrl || "";
    document.getElementById("pkg-card-image").value = p.cardImage || "";
    document.getElementById("pkg-detail-intro").value = p.detailIntro || "";
    document.getElementById("pkg-tags").value = tagsToString(p.tags);
    document.getElementById("pkg-detail-sections").value = JSON.stringify(
      p.detailSections || [],
      null,
      2
    );
    selectedId = p.id || null;
    deleteBtn.disabled = !selectedId;
  }

  function renderPackageList() {
    packageList.innerHTML = packages
      .map(
        (p) => `
        <li>
          <button type="button" data-id="${p.id}" class="${p.id === selectedId ? "is-active" : ""}">
            <span>${p.name}</span>
            <small>${p.category}${p.published === false ? " · hidden" : ""}</small>
          </button>
        </li>`
      )
      .join("");

    packageList.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pkg = packages.find((x) => x.id === btn.dataset.id);
        fillEditor(pkg);
        renderPackageList();
      });
    });
  }

  async function loadPackages() {
    const data = await api("/packages");
    packages = data.packages || [];
    renderPackageList();
  }

  async function loadLogs() {
    if (getUser()?.role !== "main" || !logsBody) {
      return;
    }
    const data = await api("/logs?limit=100");
    const logs = data.logs || [];
    logsBody.innerHTML = logs
      .map(
        (row) => `
        <tr>
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td>${row.admin_username}</td>
          <td>${row.action}</td>
          <td>${row.resource_type || ""}${row.resource_id ? ` / ${row.resource_id}` : ""}</td>
          <td>${row.ip_address || ""}</td>
        </tr>`
      )
      .join("");
  }

  async function initPanel() {
    showPanel();
    showMsg(panelMsg, "", "");
    await loadPackages();
    if (getUser()?.role === "main") {
      await loadLogs();
    }
    if (!selectedId && packages[0]) {
      fillEditor(packages[0]);
      renderPackageList();
    }
  }

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg(loginMsg, "", "");
    try {
      const username = document.getElementById("admin-username").value;
      const password = document.getElementById("admin-password").value;
      const base = apiBase();
      if (!base) {
        throw new Error("Set apiBaseUrl in config.js first.");
      }
      const res = await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      setSession(data.token, data.user);
      await initPanel();
    } catch (err) {
      showMsg(loginMsg, err.message, "error");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    clearSession();
    showLogin();
    fillEditor(null);
    packages = [];
    selectedId = null;
  });

  newBtn?.addEventListener("click", () => {
    fillEditor({
      id: "",
      name: "",
      category: "Scripts",
      priceAmount: "9.99",
      currency: "USD",
      published: true,
      featured: false,
      tags: [],
      detailSections: []
    });
    renderPackageList();
  });

  editorForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg(panelMsg, "", "");
    try {
      const payload = readEditor();
      const isNew = !selectedId;
      if (isNew) {
        await api("/packages", { method: "POST", body: JSON.stringify(payload) });
        showMsg(panelMsg, "Package created.", "success");
      } else {
        await api(`/packages/${encodeURIComponent(selectedId)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showMsg(panelMsg, "Package saved.", "success");
      }
      await loadPackages();
      const pkg = packages.find((p) => p.id === payload.id);
      fillEditor(pkg || payload);
      renderPackageList();
      if (getUser()?.role === "main") {
        await loadLogs();
      }
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!selectedId || !confirm(`Delete package "${selectedId}"?`)) {
      return;
    }
    showMsg(panelMsg, "", "");
    try {
      await api(`/packages/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      showMsg(panelMsg, "Package deleted.", "success");
      selectedId = null;
      await loadPackages();
      fillEditor(packages[0] || null);
      renderPackageList();
      if (getUser()?.role === "main") {
        await loadLogs();
      }
    } catch (err) {
      showMsg(panelMsg, err.message, "error");
    }
  });

  if (getToken() && getUser()) {
    api("/me")
      .then(() => initPanel())
      .catch(() => {
        clearSession();
        showLogin();
      });
  } else {
    showLogin();
  }
})();
