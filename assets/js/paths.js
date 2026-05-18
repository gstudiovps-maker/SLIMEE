/**
 * Clean storefront URLs (no .html). Set STORE_REPO_PREFIX before load when not at site root.
 * Example: storeHref("package", "id=advanced-job-system") → ../package/?id=advanced-job-system
 */
(function () {
  function repoPrefix() {
    if (typeof window.STORE_REPO_PREFIX === "undefined") {
      return "";
    }
    return String(window.STORE_REPO_PREFIX).trim().replace(/\/+$/, "");
  }

  window.storeHref = function storeHref(page, query) {
    const prefix = repoPrefix();
    const slug = String(page || "")
      .replace(/^\//, "")
      .replace(/\.html$/i, "")
      .replace(/\/$/, "");

    if (!slug || slug === "home") {
      return prefix ? `${prefix}/` : "/";
    }

    let url;
    if (prefix) {
      url = `${prefix}/${slug}/`;
    } else {
      url = `/${slug}/`;
    }

    if (query) {
      url += `?${String(query).replace(/^\?/, "")}`;
    }
    return url;
  };
})();
