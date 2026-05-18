(function () {
  const auth = window.SlimeeCustomerAuth;
  if (!auth) return;

  const loginScreen = document.getElementById("customer-login-screen");
  const app = document.getElementById("customer-app");
  const loginMsg = document.getElementById("customer-login-msg");
  const panelMsg = document.getElementById("customer-panel-msg");
  const discordBtn = document.getElementById("customer-discord-login");
  const logoutBtn = document.getElementById("customer-logout");
  const tbody = document.getElementById("customer-licenses-body");
  const sidebarName = document.getElementById("customer-sidebar-name");
  const sidebarEmail = document.getElementById("customer-sidebar-email");
  const sidebarAvatar = document.getElementById("customer-sidebar-avatar");

  function showLogin(msg) {
    document.body.classList.remove("is-customer-authed");
    if (loginScreen) loginScreen.hidden = false;
    if (app) app.hidden = true;
    if (msg && loginMsg) {
      loginMsg.textContent = msg;
      loginMsg.hidden = false;
    }
  }

  function showApp() {
    document.body.classList.add("is-customer-authed");
    if (loginScreen) loginScreen.hidden = true;
    if (app) app.hidden = false;
  }

  function showPanelMsg(text, type) {
    if (!panelMsg) return;
    panelMsg.textContent = text || "";
    panelMsg.hidden = !text;
    panelMsg.classList.toggle("is-error", type === "error");
    panelMsg.classList.toggle("is-success", type === "success");
  }

  function fillProfile(profile) {
    if (!profile) return;
    if (sidebarName) sidebarName.textContent = profile.displayName || profile.username || "Customer";
    if (sidebarEmail) sidebarEmail.textContent = profile.email || "—";
    if (sidebarAvatar && profile.avatarUrl) {
      sidebarAvatar.src = profile.avatarUrl;
      sidebarAvatar.alt = profile.displayName || "";
    }
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return "customer-status customer-status--active";
    return "customer-status";
  }

  async function loadLicenses() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="customer-empty">Loading…</td></tr>`;
    try {
      const data = await auth.apiFetch("/licenses");
      const licenses = data.licenses || [];
      if (!licenses.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="customer-empty">No purchases linked yet. Use the same email on Discord as checkout, then refresh.</td></tr>`;
        return;
      }
      tbody.innerHTML = licenses
        .map(
          (L) => `<tr>
        <td><code class="customer-key">${escapeHtml(L.licenseKey)}</code></td>
        <td>${escapeHtml(L.packageName || L.packageId)}</td>
        <td>${escapeHtml(L.email || "—")}</td>
        <td><span class="${statusClass(L.status)}">${escapeHtml(L.status)}</span></td>
        <td><button type="button" class="customer-download-btn" data-license-id="${L.id}">Download</button></td>
      </tr>`
        )
        .join("");

      tbody.querySelectorAll(".customer-download-btn").forEach((btn) => {
        btn.addEventListener("click", () => downloadLicense(btn.dataset.licenseId, btn));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="customer-empty">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function downloadLicense(licenseId, btn) {
    if (!licenseId) return;
    const prev = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Preparing…";
    }
    showPanelMsg("", "");
    try {
      const data = await auth.apiFetch(`/licenses/${licenseId}/download`, { method: "POST" });
      const url = data.downloadUrl;
      if (!url) throw new Error("No download URL returned");
      showPanelMsg("Download starting…", "success");
      const statusUrl = data.statusUrl;
      if (statusUrl) {
        try {
          await fetch(statusUrl);
        } catch {
          /* ignore probe errors */
        }
      }
      window.location.href = url;
    } catch (err) {
      showPanelMsg(err.message || "Download failed", "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "Download";
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  if (discordBtn) {
    discordBtn.href = auth.discordLoginUrl();
  }

  logoutBtn?.addEventListener("click", () => {
    auth.clearSession();
    showLogin();
  });

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      showLogin(decodeURIComponent(authError));
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }

    const token = auth.getToken();
    if (!token) {
      showLogin();
      return;
    }

    showApp();
    let profile = auth.getProfile();
    if (!profile) {
      profile = await auth.fetchProfile().catch(() => null);
    }
    fillProfile(profile);
    await loadLicenses();
  }

  init();
})();
