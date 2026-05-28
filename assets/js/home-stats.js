/**
 * Populates the homepage live stats:
 *  - Top customer name
 *  - Discord online member count + invite links
 *  - "Connect to server" FiveM link (+ live player count when available)
 *  - Recent payments list
 *
 * Data comes from the store API (/api/stats). Placeholders in the HTML stay
 * visible as a fallback if the API is unreachable.
 */
(function () {
  const config = window.STORE_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const serverConnectUrl = config.serverConnectUrl || "https://cfx.re/join/amor5e";

  function formatCount(n) {
    if (typeof n !== "number" || !isFinite(n)) {
      return null;
    }
    return n.toLocaleString("en-US");
  }

  function timeAgo(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return "";
    }
    const diff = Date.now() - date.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setConnectLinks() {
    document.querySelectorAll("[data-server-connect]").forEach((el) => {
      el.setAttribute("href", serverConnectUrl);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    });
  }

  function applyTopCustomer(top) {
    if (!top || !top.name) {
      return;
    }
    document.querySelectorAll("[data-top-customer]").forEach((el) => {
      el.textContent = top.name;
    });
  }

  function applyDiscord(discord, links) {
    if (discord) {
      const count = formatCount(discord.onlineCount) || formatCount(discord.memberCount);
      if (count) {
        document.querySelectorAll("[data-discord-online]").forEach((el) => {
          el.textContent = `${count} ${discord.onlineCount != null ? "users online" : "members"}`;
        });
      }
    }
    const invite = links?.discordInvite || discord?.inviteUrl;
    if (invite) {
      document.querySelectorAll("[data-discord-invite]").forEach((el) => {
        el.setAttribute("href", invite);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      });
    }
  }

  function applyServer(server, links) {
    const connect = links?.serverConnect || server?.connectUrl || serverConnectUrl;
    document.querySelectorAll("[data-server-connect]").forEach((el) => {
      el.setAttribute("href", connect);
    });
    if (server && server.online && typeof server.clients === "number") {
      const label = server.maxClients
        ? `${server.clients}/${server.maxClients} online`
        : `${server.clients} online`;
      document.querySelectorAll("[data-server-players]").forEach((el) => {
        el.textContent = label;
        el.removeAttribute("hidden");
      });
    }
  }

  function applyRecentPayments(payments) {
    const list = document.querySelector("[data-recent-payments]");
    if (!list || !Array.isArray(payments) || payments.length === 0) {
      return;
    }
    list.innerHTML = payments
      .map(
        (p) => `
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.packageName)}</span>
          <small>${escapeHtml(timeAgo(p.createdAt))}</small>
        </div>`
      )
      .join("");
  }

  async function loadStats() {
    setConnectLinks();
    if (!apiBase) {
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/stats`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      applyTopCustomer(data.topCustomer);
      applyDiscord(data.discord, data.links);
      applyServer(data.server, data.links);
      applyRecentPayments(data.recentPayments);
    } catch (err) {
      console.warn("[home-stats] Could not load live stats", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadStats);
  } else {
    loadStats();
  }
})();
