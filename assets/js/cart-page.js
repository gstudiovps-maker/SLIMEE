(function () {
  const emptyEl = document.getElementById("cart-empty");
  const filledEl = document.getElementById("cart-filled");
  const linesEl = document.getElementById("cart-lines");
  const totalEl = document.getElementById("cart-total-display");
  const subtotalEl = document.getElementById("cart-subtotal");
  const countEl = document.getElementById("cart-item-count");
  const checkoutBtn = document.getElementById("cart-checkout-btn");
  const clearBtn = document.getElementById("cart-clear-btn");
  const msgEl = document.getElementById("cart-checkout-msg");

  function parseAmount(pkg) {
    const n = parseFloat(String(pkg?.priceAmount || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatPrice(pkg) {
    const amount = pkg?.priceAmount || pkg?.price?.replace(/[^0-9.]/g, "") || "0";
    const currency = (pkg?.currency || "USD").toUpperCase();
    return `${parseFloat(amount).toFixed(2)} ${currency}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function thumbHtml(pkg, id, index) {
    if (pkg?.cardImage) {
      const pkgUrl =
        typeof window.storeHref === "function"
          ? window.storeHref("package", `id=${encodeURIComponent(id)}`)
          : `../package/?id=${encodeURIComponent(id)}`;
      return `<a class="cart-tebex-thumb" href="${pkgUrl}"><img src="${escapeHtml(pkg.cardImage)}" alt="" loading="lazy" decoding="async" /></a>`;
    }
    const hue = 200 + (index % 4) * 18;
    const pkgUrl =
      typeof window.storeHref === "function"
        ? window.storeHref("package", `id=${encodeURIComponent(id)}`)
        : `../package/?id=${encodeURIComponent(id)}`;
    return `<a class="cart-tebex-thumb cart-tebex-thumb--placeholder" href="${pkgUrl}" style="--thumb-hue:${hue}" aria-hidden="true"></a>`;
  }

  function render() {
    const ids = window.SlimeeCart?.getCartIds?.() ?? [];
    const catalog = window.PACKAGES_CATALOG || [];

    if (!ids.length) {
      emptyEl.hidden = false;
      filledEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    filledEl.hidden = false;

    let sum = 0;

    linesEl.innerHTML = ids
      .map((id, index) => {
        const pkg = catalog.find((p) => p.id === id);
        const name = pkg?.name || id;
        const priceDisplay = formatPrice(pkg);
        sum += parseAmount(pkg);
        return `
          <li class="cart-tebex-line" data-package-id="${escapeHtml(id)}">
            ${thumbHtml(pkg, id, index)}
            <div class="cart-tebex-line-body">
              <a class="cart-tebex-name" href="${typeof window.storeHref === "function" ? window.storeHref("package", `id=${encodeURIComponent(id)}`) : `../package/?id=${encodeURIComponent(id)}`}">${escapeHtml(name)}</a>
              <span class="cart-tebex-category">${escapeHtml(pkg?.category || "Package")}</span>
            </div>
            <span class="cart-tebex-price">${escapeHtml(priceDisplay)}</span>
            <button type="button" class="cart-tebex-remove" aria-label="Remove ${escapeHtml(name)}">Remove</button>
          </li>`;
      })
      .join("");

    const formatted = `$${sum.toFixed(2)}`;
    subtotalEl.textContent = formatted;
    totalEl.textContent = `${formatted} USD`;
    countEl.textContent = String(ids.length);

    linesEl.querySelectorAll(".cart-tebex-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".cart-tebex-line");
        window.SlimeeCart?.removeFromCart?.(row?.dataset.packageId);
        render();
      });
    });
  }

  clearBtn?.addEventListener("click", () => {
    window.SlimeeCart?.clearCart?.();
    render();
    msgEl.textContent = "";
  });

  checkoutBtn?.addEventListener("click", async () => {
    msgEl.textContent = "";
    const ids = window.SlimeeCart?.getCartIds?.() ?? [];
    if (!ids.length) {
      return;
    }

    if (typeof window.startCartCheckout !== "function") {
      msgEl.textContent = "Checkout script missing.";
      return;
    }

    checkoutBtn.disabled = true;
    const result = await window.startCartCheckout(ids);
    checkoutBtn.disabled = false;

    if (result?.redirecting) {
      return;
    }

    msgEl.textContent = result?.message || "Could not start checkout.";
  });

  window.addEventListener("slimee-cart-updated", render);

  if (typeof window.ensureCatalogLoaded === "function") {
    window.ensureCatalogLoaded().then(render).catch(render);
  } else {
    render();
  }
})();
