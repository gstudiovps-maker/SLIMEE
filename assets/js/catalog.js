/**
 * Loads store catalog from content/packages.json.
 * From subpaths (e.g. home/), set window.STORE_REPO_PREFIX = "../" before this script loads.
 */
(function () {
  let loadPromise = null;

  function catalogUrl() {
    const apiBase = (window.STORE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
    if (apiBase) {
      return `${apiBase}/api/packages`;
    }
    const prefix = typeof window.STORE_REPO_PREFIX !== "undefined"
      ? String(window.STORE_REPO_PREFIX).trim().replace(/\/+$/, "")
      : "";
    return prefix === "" ? "content/packages.json" : `${prefix}/content/packages.json`;
  }

  function normalizeDetailSection(section) {
    if (!section || typeof section !== "object") {
      return null;
    }
    const out = { title: section.title || "" };
    if (Array.isArray(section.paragraphs)) {
      out.paragraphs = section.paragraphs.map((p) => (typeof p === "string" ? p : p?.p || "")).filter(Boolean);
    }
    if (Array.isArray(section.bullets)) {
      out.bullets = section.bullets.map((b) => (typeof b === "string" ? b : b?.b || "")).filter(Boolean);
    }
    if (!out.title && !(out.paragraphs && out.paragraphs.length) && !(out.bullets && out.bullets.length)) {
      return null;
    }
    return out;
  }

  function normalizePackage(raw, index) {
    const p = raw && typeof raw === "object" ? raw : {};
    const tags = Array.isArray(p.tags)
      ? p.tags.map((t) => (typeof t === "string" ? t : t?.tag || "")).filter(Boolean)
      : [];
    const priceAmount = String(p.priceAmount ?? "").trim() || "0";
    const currency = String(p.currency || "USD").trim() || "USD";
    const price = String(p.price || "").trim() || `$${priceAmount}`;
    let gallery = [];
    if (Array.isArray(p.gallery)) {
      gallery = p.gallery
        .map((g) => {
          if (typeof g === "string") {
            return g.trim();
          }
          if (g && typeof g === "object") {
            return String(g.image || g.url || g.src || "").trim();
          }
          return "";
        })
        .filter(Boolean);
    }
    const detailSections = Array.isArray(p.detailSections)
      ? p.detailSections.map(normalizeDetailSection).filter(Boolean)
      : [];

    return {
      ...p,
      id: String(p.id || `pkg-${index}`).trim() || `pkg-${index}`,
      name: String(p.name || "Untitled").trim() || "Untitled",
      category: String(p.category || "Scripts").trim() || "Scripts",
      description: String(p.description || "").trim(),
      price,
      priceAmount,
      currency,
      tags,
      featured: Boolean(p.featured),
      checkoutUrl: String(p.checkoutUrl || "").trim(),
      videoPreviewUrl: String(p.videoPreviewUrl || "").trim(),
      gallery,
      cardImage: String(p.cardImage || "").trim(),
      detailIntro: String(p.detailIntro || "").trim(),
      detailSections
    };
  }

  async function ensureCatalogLoaded() {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      try {
        const res = await fetch(catalogUrl(), { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const rawList = Array.isArray(data.packages) ? data.packages : [];
        const list = rawList.map(normalizePackage);
        window.PACKAGES_CATALOG = list;
        return list;
      } catch (err) {
        console.warn("[catalog] Failed to load store catalog", err);
        window.PACKAGES_CATALOG = [];
        return [];
      }
    })();

    return loadPromise;
  }

  window.ensureCatalogLoaded = ensureCatalogLoaded;
})();
