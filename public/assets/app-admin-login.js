function showError(message) {
  const node = document.getElementById("login-error");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove("hidden");
}

async function onSubmit(event) {
  event.preventDefault();
  const username = (document.getElementById("username")?.value || "").trim();
  const password = (document.getElementById("password")?.value || "").trim();

  const res = await apiFetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showError(body?.error || `登入失敗：${res.status}`);
    return;
  }
  location.href = (window.__API_BASE || '') + "/admin.html";
}

function bootstrap() {
  const form = document.getElementById("admin-login-form");
  if (form) {
    form.addEventListener("submit", onSubmit);
  }
}

bootstrap();
