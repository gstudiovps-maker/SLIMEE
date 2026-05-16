let packages = [];

const categoryFilters = document.querySelector("#category-filters");
const packageGrid = document.querySelector("#package-grid");
const checkoutToast = document.querySelector("#checkout-toast");
const menuToggle = document.querySelector(".menu-toggle");
const siteMenu = document.querySelector("#site-menu");
const dropdownToggles = document.querySelectorAll(".dropdown-toggle");
const navDropdowns = document.querySelectorAll(".nav-dropdown");
const revealElements = document.querySelectorAll(".reveal-on-scroll");
const promoButtons = document.querySelectorAll("[data-copy-code]");

let activeCategory = packageGrid?.dataset.categoryPage || "All";
let toastTimeout;

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function getCategories() {
  return ["All", ...new Set(packages.map((item) => item.category))];
}

function renderFilters() {
  if (!categoryFilters) {
    return;
  }

  categoryFilters.innerHTML = getCategories()
    .map((category) => {
      const isActive = category === activeCategory ? " is-active" : "";
      return `<button class="filter-button${isActive}" type="button" data-category="${category}">${category}</button>`;
    })
    .join("");
}

function packageCardTemplate(item, index) {
  const tags = (item.tags || []).map((tag) => `<li>${tag}</li>`).join("");
  const featuredClass = item.featured ? " is-featured" : "";
  const badge = item.featured ? '<span class="badge">Featured</span>' : "";
  const gradientPosition = 35 + (index % 4) * 12;
  const pkgId = item.id || `pkg-${index}`;
  const art = item.cardImage
    ? `<div class="package-art package-art--photo"><img src="${escapeAttr(item.cardImage)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="package-art" style="background-position: ${gradientPosition}% center;"></div>`;

  const priceDisplay = item.priceAmount
    ? `${parseFloat(item.priceAmount).toFixed(2)} ${(item.currency || "USD").toUpperCase()}`
    : item.price;
  const cartIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zM7.16 14h9.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.01 5H6.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42l.74-1z"/></svg>';

  return `
    <article class="package-card package-card--tebex${featuredClass}" data-package-id="${pkgId}">
      ${art}
      <div class="package-content">
        <div class="package-meta">
          <span class="category-pill">${item.category}</span>
          ${badge}
        </div>
        <div class="package-card-head">
          <h3>${item.name}</h3>
          <span class="package-card-price">${priceDisplay}</span>
        </div>
        <p>${item.description}</p>
        <ul class="package-tags" aria-label="${item.name} includes">
          ${tags}
        </ul>
        <button class="tebex-btn-add-cart buy-button" type="button" data-package-id="${pkgId}" aria-label="Add ${item.name} to cart">
          ${cartIcon}
          Add to Cart
        </button>
      </div>
    </article>
  `;
}

function renderPackages() {
  if (!packageGrid) {
    return;
  }

  const visiblePackages = activeCategory === "All"
    ? packages
    : packages.filter((item) => item.category === activeCategory);

  packageGrid.innerHTML = visiblePackages
    .map((item, index) => packageCardTemplate(item, index))
    .join("");
}

function showCheckoutToast(message) {
  if (!checkoutToast) {
    return;
  }

  clearTimeout(toastTimeout);
  checkoutToast.textContent = message;
  checkoutToast.classList.add("is-visible");

  toastTimeout = setTimeout(() => {
    checkoutToast.classList.remove("is-visible");
  }, 4200);
}

function handleFilterClick(event) {
  const button = event.target.closest("[data-category]");

  if (!button) {
    return;
  }

  activeCategory = button.dataset.category;
  renderFilters();
  renderPackages();
}

async function addPackageToCart(packageId) {
  const selectedPackage = packages.find((item) => item.id === packageId);
  const name = selectedPackage?.name || packageId;

  if (typeof window.SlimeeCart?.addToCart === "function") {
    const added = window.SlimeeCart.addToCart(packageId);
    if (added) {
      showCheckoutToast(`Added “${name}” to cart — open Cart when you are ready to pay.`);
      return;
    }
    showCheckoutToast(`“${name}” is already in your cart.`);
    return;
  }

  showCheckoutToast("Cart could not load. Refresh the page.");
}

function handlePackageGridClick(event) {
  const buyButton = event.target.closest(".buy-button");

  if (buyButton) {
    event.preventDefault();
    event.stopPropagation();
    const id = buyButton.dataset.packageId;
    if (id) {
      addPackageToCart(id);
    }
    return;
  }

  const card = event.target.closest("[data-package-id]");
  if (!card?.dataset.packageId) {
    return;
  }

  const pkgId = card.dataset.packageId;
  window.location.href =
    typeof window.storeHref === "function"
      ? window.storeHref("package", `id=${encodeURIComponent(pkgId)}`)
      : `../package/?id=${encodeURIComponent(pkgId)}`;
}

function closeMobileMenu() {
  if (!siteMenu || !menuToggle) {
    return;
  }

  siteMenu.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function closeDropdowns(currentDropdown = null) {
  navDropdowns.forEach((dropdown) => {
    if (dropdown === currentDropdown) {
      return;
    }

    dropdown.classList.remove("is-open");
    dropdown.querySelector(".dropdown-toggle")?.setAttribute("aria-expanded", "false");
  });
}

async function bootStore() {
  if (typeof window.ensureCatalogLoaded === "function") {
    packages = await window.ensureCatalogLoaded();
  } else {
    packages = window.PACKAGES_CATALOG || [];
  }

  renderFilters();
  renderPackages();
}

if (categoryFilters) {
  categoryFilters.addEventListener("click", handleFilterClick);
}

if (packageGrid) {
  packageGrid.addEventListener("click", handlePackageGridClick);
}

if (menuToggle && siteMenu) {
  menuToggle.addEventListener("click", () => {
    const isOpen = siteMenu.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteMenu.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      closeMobileMenu();
      closeDropdowns();
    }
  });
}

dropdownToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const dropdown = toggle.closest(".nav-dropdown");
    const isOpen = dropdown.classList.toggle("is-open");

    closeDropdowns(dropdown);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav-dropdown")) {
    closeDropdowns();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDropdowns();
    closeMobileMenu();
  }
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

promoButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const code = button.dataset.copyCode;
    const originalText = button.textContent;

    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "COPIED";
    } catch {
      button.textContent = code;
    }

    setTimeout(() => {
      button.textContent = originalText;
    }, 1600);
  });
});

window.addPackageToCart = addPackageToCart;

bootStore().catch(() => {
  packages = [];
  renderFilters();
  renderPackages();
});
