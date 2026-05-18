/**
 * Gstudio-style nav: YouTube, Discord, TikTok + cart link with badge.
 */
(function () {
  const social = window.STORE_CONFIG?.social || {};

  function pagesPrefix() {
    const p = typeof window.STORE_REPO_PREFIX !== "undefined"
      ? String(window.STORE_REPO_PREFIX).trim().replace(/\/+$/, "")
      : "";
    return p === "" ? "" : `${p}/`;
  }

  function href(rel) {
    if (typeof window.storeHref === "function") {
      const clean = String(rel).replace(/\.html$/i, "");
      const [page, query] = clean.split("?");
      return window.storeHref(page, query);
    }
    const slug = String(rel).replace(/\.html$/i, "").replace(/\/$/, "");
    return `${pagesPrefix()}${slug}/`;
  }

  const ICONS = {
    youtube: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37a17.9 17.9 0 0 0-4.35-1.34l-.2.38a16.5 16.5 0 0 0-6.54 0l-.2-.38A17.86 17.86 0 0 0 3.68 4.37 18.1 18.1 0 0 0 .54 16.2a18.2 18.2 0 0 0 5.57 2.8l1.34-2a12.2 12.2 0 0 1-2.12-1 7.6 7.6 0 0 0 3.67-3.17l.01-.02h.01l.01.02a7.6 7.6 0 0 0 3.67 3.17 12.2 12.2 0 0 1-2.12 1l1.34 2a18.2 18.2 0 0 0 5.57-2.8A18.1 18.1 0 0 0 23.46 16.2a18 18 0 0 0-3.14-11.83zM8.02 13.6c-.78 0-1.42-.72-1.42-1.6s.63-1.6 1.42-1.6 1.43.72 1.43 1.6-.64 1.6-1.43 1.6zm7.96 0c-.78 0-1.42-.72-1.42-1.6s.64-1.6 1.42-1.6 1.43.72 1.43 1.6-.65 1.6-1.43 1.6z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zM7.16 14h9.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.01 5H6.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42l.74-1z"/></svg>'
  };

  function enhanceMenu(menu) {
    menu.querySelector(".nav-discord")?.remove();

    const existingCart = menu.querySelector("[data-cart-nav]");
    const cartActive = existingCart?.classList.contains("is-active");

    let actions = menu.querySelector(".nav-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "nav-actions";
      menu.appendChild(actions);
    }

    const yt = social.youtube || "#";
    const dc = social.discord || "#";
    const tt = social.tiktok || "#";

    actions.innerHTML = [
      '<div class="nav-social" aria-label="Social links">',
      `<a class="nav-social-link" href="${yt}" target="_blank" rel="noopener noreferrer" aria-label="YouTube">${ICONS.youtube}</a>`,
      `<a class="nav-social-link" href="${dc}" target="_blank" rel="noopener noreferrer" aria-label="Discord">${ICONS.discord}</a>`,
      `<a class="nav-social-link" href="${tt}" target="_blank" rel="noopener noreferrer" aria-label="TikTok">${ICONS.tiktok}</a>`,
      "</div>",
      '<div class="nav-customer-auth" data-customer-auth aria-label="Account"></div>',
      `<a class="cart-nav-link${cartActive ? " is-active" : ""}" href="${href("cart")}" data-cart-nav>`,
      ICONS.cart,
      "<span>Cart</span>",
      '<span class="cart-badge" aria-hidden="true"></span>',
      "</a>"
    ].join("");

    if (existingCart && existingCart !== actions.querySelector("[data-cart-nav]")) {
      existingCart.remove();
    }
  }

  function syncBadge() {
    const n = window.SlimeeCart?.getCount?.() ?? 0;
    document.querySelectorAll(".cart-badge").forEach((el) => {
      el.textContent = n > 0 ? String(n) : "";
      el.classList.toggle("is-visible", n > 0);
    });
  }

  function customerAuthScriptUrl() {
    const prefix = pagesPrefix();
    return prefix ? `${prefix}/assets/js/customer-auth.js` : "assets/js/customer-auth.js";
  }

  function ensureCustomerAuth(callback) {
    if (window.SlimeeCustomerAuth) {
      callback();
      return;
    }
    const existing = document.querySelector("script[data-slimee-customer-auth]");
    if (existing) {
      existing.addEventListener("load", () => callback(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = customerAuthScriptUrl();
    script.dataset.slimeeCustomerAuth = "1";
    script.onload = () => callback();
    document.head.appendChild(script);
  }

  function refreshCustomerNav() {
    if (!window.SlimeeCustomerAuth) return;
    const auth = window.SlimeeCustomerAuth;
    const run = () => window.dispatchEvent(new CustomEvent("slimee-customer-auth"));
    if (auth.getToken()) {
      auth.fetchProfile().finally(run);
    } else {
      run();
    }
  }

  function init() {
    document.querySelectorAll(".navbar .site-menu, .navbar#site-menu").forEach((menu) => {
      enhanceMenu(menu);
    });
    document.querySelectorAll(".navbar").forEach((nav) => {
      const menu = nav.querySelector("#site-menu") || nav.querySelector(".site-menu");
      if (menu) {
        enhanceMenu(menu);
      }
    });
    syncBadge();
    ensureCustomerAuth(refreshCustomerNav);
  }

  window.addEventListener("slimee-cart-updated", syncBadge);
  document.addEventListener("DOMContentLoaded", init);
})();
