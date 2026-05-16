(function () {
  const STORAGE_KEY = "slimee_cart_v1";

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRaw(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("slimee-cart-updated", { detail: { count: ids.length } }));
  }

  /** @returns {string[]} unique package ids in cart order */
  function getCartIds() {
    const raw = readRaw();
    const seen = new Set();
    const out = [];
    for (const entry of raw) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function addToCart(packageId) {
    const id = String(packageId || "").trim();
    if (!id) return false;
    const raw = readRaw();
    const ids = getCartIds();
    if (ids.includes(id)) {
      writeRaw(raw);
      return false;
    }
    raw.push({ id, addedAt: Date.now() });
    writeRaw(raw);
    return true;
  }

  function removeFromCart(packageId) {
    const id = String(packageId || "").trim();
    const raw = readRaw().filter((e) => {
      const rid = typeof e === "string" ? e : e?.id;
      return rid !== id;
    });
    writeRaw(raw);
  }

  function clearCart() {
    writeRaw([]);
  }

  function getCount() {
    return getCartIds().length;
  }

  window.SlimeeCart = {
    getCartIds,
    addToCart,
    removeFromCart,
    clearCart,
    getCount
  };
})();
