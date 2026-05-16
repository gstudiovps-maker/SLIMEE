/**
 * Stripe Checkout — single package or full cart.
 */
async function postCheckout(body) {
  const base = (window.STORE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

  if (!base) {
    return { ok: false, reason: "no_api", message: "Payment API is not configured yet." };
  }

  try {
    const res = await fetch(`${base}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        reason: "api_error",
        message: data.error || `Checkout failed (${res.status})`
      };
    }

    if (data.url) {
      window.location.href = data.url;
      return { ok: true, redirecting: true };
    }

    return { ok: false, reason: "no_url", message: "No checkout URL returned." };
  } catch {
    return {
      ok: false,
      reason: "network",
      message: `Could not reach the store API. Is it running at ${base}?`
    };
  }
}

async function startPackageCheckout(packageId) {
  return postCheckout({ packageId });
}

async function startCartCheckout(packageIds) {
  const unique = [...new Set((packageIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) {
    return { ok: false, reason: "empty", message: "Your cart is empty." };
  }
  return postCheckout({ packageIds: unique });
}

window.startPackageCheckout = startPackageCheckout;
window.startCartCheckout = startCartCheckout;
