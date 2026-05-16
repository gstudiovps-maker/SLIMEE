(async function () {
  if (typeof window.ensureCatalogLoaded === "function") {
    await window.ensureCatalogLoaded();
  }
  const packages = window.PACKAGES_CATALOG || [];
  const root = document.getElementById("package-detail-root");
  const checkoutToast = document.getElementById("checkout-toast");
  let toastTimeout;

  function escapeHtml(value) {
    if (value == null) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function youTubeVideoId(url) {
    if (!url || typeof url !== "string") {
      return null;
    }
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?/\s]+)/
    );
    return match ? match[1] : null;
  }

  function youTubeWatchUrl(id) {
    return `https://www.youtube.com/watch?v=${id}`;
  }

  function youTubeEmbedUrl(id) {
    return `https://www.youtube.com/embed/${id}?rel=0`;
  }

  function showToast(message) {
    if (!checkoutToast) {
      return;
    }
    clearTimeout(toastTimeout);
    checkoutToast.textContent = message;
    checkoutToast.classList.add("is-visible");
    toastTimeout = setTimeout(() => checkoutToast.classList.remove("is-visible"), 4200);
  }

  function defaultGalleryImages(item, index) {
    const hue = 160 + (index % 5) * 28;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsla(${hue},85%,45%,0.35)"/>
        <stop offset="100%" stop-color="hsla(${hue + 40},70%,30%,0.5)"/>
      </linearGradient></defs>
      <rect width="800" height="450" fill="#0a0f1a"/>
      <rect width="800" height="450" fill="url(#g)"/>
      <text x="400" y="230" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-family="system-ui,sans-serif" font-size="22" font-weight="700">${escapeHtml(item.name).slice(0, 42)}</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function buildGalleryList(item, index) {
    const raw = Array.isArray(item.gallery) ? item.gallery.filter(Boolean) : [];
    if (raw.length > 0) {
      return raw;
    }
    const placeholder = defaultGalleryImages(item, index);
    return [placeholder, placeholder];
  }

  function buildDetailSections(item) {
    if (Array.isArray(item.detailSections) && item.detailSections.length > 0) {
      return item.detailSections;
    }
    const bullets = (item.tags || []).map((t) => `${t} integration and configuration hooks (template copy).`);
    const sections = [
      {
        title: "About this resource",
        paragraphs: [item.description]
      }
    ];
    if (bullets.length) {
      sections.push({ title: "Key features", bullets });
    }
    return sections;
  }

  function renderSection(section, i) {
    const title = escapeHtml(section.title);
    const body = (section.paragraphs || [])
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
    const bullets = (section.bullets || [])
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join("");
    const listBlock = bullets ? `<ul class="product-desc-list">${bullets}</ul>` : "";
    const icon = i === 0 ? "&#128266;" : "&#128293;";
    return `
      <div class="product-desc-block">
        <h3 class="product-desc-subtitle"><span class="product-desc-icon" aria-hidden="true">${icon}</span>${title}</h3>
        ${body}
        ${listBlock}
      </div>
    `;
  }

  function renderProduct(pkg) {
    const idx = packages.indexOf(pkg);
    const images = buildGalleryList(pkg, idx);
    const videoId = youTubeVideoId(pkg.videoPreviewUrl);
    const watchUrl = videoId ? youTubeWatchUrl(videoId) : "";
    const embedUrl = videoId ? youTubeEmbedUrl(videoId) : "";
    const priceLine = `${escapeHtml(pkg.priceAmount || pkg.price.replace(/[^0-9.]/g, "") || "0")} ${escapeHtml(pkg.currency || "USD")}`;
    const categorySlugs = {
      Scripts: "scripts",
      Maps: "maps",
      MLO: "mlo",
      Clothing: "clothing",
      Weapons: "weapons"
    };
    const pageHref = (slug) =>
      typeof window.storeHref === "function"
        ? window.storeHref(slug)
        : `../${slug}/`;
    const categoryHref = pageHref(categorySlugs[pkg.category] || "store");
    const sections = buildDetailSections(pkg);
    const intro = pkg.detailIntro
      ? `<p class="product-desc-lead">${escapeHtml(pkg.detailIntro)}</p>`
      : "";

    root.innerHTML = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="${pageHref("store")}">Shop</a>
        <span aria-hidden="true">/</span>
        <a href="${escapeHtml(categoryHref)}">${escapeHtml(pkg.category)}</a>
        <span aria-hidden="true">/</span>
        <span class="breadcrumb-current">${escapeHtml(pkg.name)}</span>
      </nav>

      <div class="product-detail-grid">
        <div class="product-gallery" data-active="0">
          <div class="product-gallery-main">
            <button type="button" class="product-gallery-nav product-gallery-prev" aria-label="Previous image">&#8249;</button>
            <button type="button" class="product-gallery-nav product-gallery-next" aria-label="Next image">&#8250;</button>
            <div class="product-gallery-frame">
              <img class="product-gallery-image" src="${escapeHtml(images[0])}" alt="" width="960" height="540" decoding="async" />
              ${videoId ? `
              <button type="button" class="product-video-play" aria-label="Play video preview in page">
                <span class="product-video-play-icon" aria-hidden="true">&#9654;</span>
              </button>
              <a class="product-video-yt-link" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
              ` : ""}
            </div>
            ${videoId ? `<div class="product-video-embed-wrap" hidden><iframe class="product-video-iframe" title="Video preview" width="960" height="540" src="" data-embed-src="${escapeHtml(embedUrl)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe><button type="button" class="product-video-close button button-secondary">Close video</button></div>` : ""}
          </div>
          <div class="product-gallery-thumbs" role="tablist" aria-label="Gallery images">
            ${images
        .slice(0, 6)
        .map(
          (src, i) => `
              <button type="button" class="product-thumb${i === 0 ? " is-active" : ""}" data-index="${i}" aria-label="Show image ${i + 1}">
                <img src="${escapeHtml(src)}" alt="" width="160" height="90" loading="lazy" decoding="async" />
              </button>`
        )
        .join("")}
          </div>
        </div>

        <div class="product-buy-panel glass-card">
          <h1 class="product-title">${escapeHtml(pkg.name)}</h1>
          <p class="product-price-line"><span class="product-price">${priceLine}</span></p>
          <div class="product-buy-actions">
            <button type="button" class="tebex-btn-add-cart buy-button product-add-cart" data-package-id="${escapeHtml(pkg.id)}">
              Add to Cart
            </button>
            <button type="button" class="button product-gift-btn" data-gift-for="${escapeHtml(pkg.id)}">
              <span aria-hidden="true">&#127873;</span> Gift
            </button>
          </div>
          <p class="product-buy-hint">Add to cart, then open <strong>Cart</strong> in the nav to pay with Stripe.</p>
        </div>
      </div>

      <section class="product-description glass-card" aria-labelledby="resource-desc-heading">
        <h2 id="resource-desc-heading" class="product-desc-heading">Resource description</h2>
        <div class="product-desc-inner">
          ${intro}
          ${sections.map((s, i) => renderSection(s, i)).join('<hr class="product-desc-rule" />')}
        </div>
      </section>
    `;

    const gallery = root.querySelector(".product-gallery");
    const mainImg = root.querySelector(".product-gallery-image");
    const thumbs = [...root.querySelectorAll(".product-thumb")];
    const prevBtn = root.querySelector(".product-gallery-prev");
    const nextBtn = root.querySelector(".product-gallery-next");
    const playBtn = root.querySelector(".product-video-play");
    const embedWrap = root.querySelector(".product-video-embed-wrap");
    const iframe = root.querySelector(".product-video-iframe");
    const closeVideo = root.querySelector(".product-video-close");

    function setActive(i) {
      const n = images.length;
      const index = ((i % n) + n) % n;
      gallery.dataset.active = String(index);
      mainImg.src = images[index];
      thumbs.forEach((btn, j) => btn.classList.toggle("is-active", j === index));
    }

    prevBtn?.addEventListener("click", () => setActive(Number(gallery.dataset.active || 0) - 1));
    nextBtn?.addEventListener("click", () => setActive(Number(gallery.dataset.active || 0) + 1));
    thumbs.forEach((btn) => {
      btn.addEventListener("click", () => setActive(Number(btn.dataset.index)));
    });

    playBtn?.addEventListener("click", () => {
      if (!embedWrap || !iframe) {
        return;
      }
      const src = iframe.dataset.embedSrc;
      if (src) {
        iframe.src = src + (src.includes("?") ? "&" : "?") + "autoplay=1";
      }
      embedWrap.hidden = false;
    });

    closeVideo?.addEventListener("click", () => {
      if (iframe) {
        iframe.src = "";
      }
      if (embedWrap) {
        embedWrap.hidden = true;
      }
    });

    root.querySelector(".product-add-cart")?.addEventListener("click", async () => {
      if (typeof window.SlimeeCart?.addToCart === "function") {
        const added = window.SlimeeCart.addToCart(pkg.id);
        if (added) {
          showToast(`Added “${pkg.name}” to cart.`);
        } else {
          showToast(`“${pkg.name}” is already in your cart.`);
        }
        return;
      }
      showToast("Cart could not load. Refresh the page.");
    });

    root.querySelector(".product-gift-btn")?.addEventListener("click", () => {
      showToast(`Gift checkout for "${pkg.name}" — wire your Tebex gift URL when ready.`);
    });
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const pkg = id ? packages.find((p) => p.id === id) : null;

  if (!root) {
    return;
  }

  if (!pkg) {
    root.innerHTML = `
      <div class="product-missing glass-card">
        <h1>Package not found</h1>
        <p>No product matches this link. Return to the shop and pick a package.</p>
        <a class="button button-primary" href="${pageHref("store")}">Back to shop</a>
      </div>
    `;
    document.title = "Not found | Slimee Store";
    return;
  }

  document.title = `${pkg.name} | Slimee Store`;
  renderProduct(pkg);
})();
