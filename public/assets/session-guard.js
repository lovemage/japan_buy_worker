// Unified session expiry handling for admin pages.
//
// Usage:
//   import { handleUnauthorized } from "./session-guard.js";
//   const res = await apiFetch("/api/admin/...");
//   if (handleUnauthorized(res)) return;
//
// It also attaches itself to window.apiFetch so inline scripts in admin.html
// automatically get the session-expired modal without code changes.

const LOGIN_PATH = "/admin-login.html";
const MODAL_ID = "session-expired-modal";
let modalVisible = false;

function injectStyles() {
  if (document.getElementById("session-guard-styles")) return;
  const style = document.createElement("style");
  style.id = "session-guard-styles";
  style.textContent = `
    .session-expired-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: sessionGuardFadeIn 180ms ease-out;
    }
    .session-expired-modal {
      background: #fff;
      border-radius: 14px;
      max-width: 360px;
      width: 100%;
      padding: 26px 24px 22px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
      text-align: center;
      animation: sessionGuardPopIn 220ms cubic-bezier(0.25, 1, 0.5, 1);
    }
    .session-expired-modal__icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #f7f7f7;
      color: #1a1a1a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 14px;
      font-size: 24px;
    }
    .session-expired-modal__title {
      font-size: 17px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 6px;
    }
    .session-expired-modal__body {
      font-size: 14px;
      color: #666;
      margin: 0 0 20px;
      line-height: 1.55;
    }
    .session-expired-modal__btn {
      display: inline-block;
      width: 100%;
      padding: 12px 20px;
      border: none;
      border-radius: 10px;
      background: #1a1a1a;
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 150ms ease;
    }
    .session-expired-modal__btn:hover { background: #333; }
    .session-expired-modal__btn:active { background: #000; }
    @keyframes sessionGuardFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes sessionGuardPopIn {
      from { opacity: 0; transform: translateY(8px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
    }
  `;
  document.head.appendChild(style);
}

function buildLoginUrl() {
  const here = location.pathname + location.search + location.hash;
  if (!here || here === LOGIN_PATH) return LOGIN_PATH;
  return `${LOGIN_PATH}?redirect=${encodeURIComponent(here)}`;
}

function goToLogin() {
  location.href = buildLoginUrl();
}

export function showSessionExpiredModal() {
  if (modalVisible) return;
  modalVisible = true;
  injectStyles();

  const backdrop = document.createElement("div");
  backdrop.id = MODAL_ID;
  backdrop.className = "session-expired-backdrop";
  backdrop.innerHTML = `
    <div class="session-expired-modal" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
      <div class="session-expired-modal__icon" aria-hidden="true">🔒</div>
      <h2 id="session-expired-title" class="session-expired-modal__title">登入已過期</h2>
      <p class="session-expired-modal__body">為了您的帳號安全，系統已自動登出。<br>請重新登入後繼續操作。</p>
      <button type="button" class="session-expired-modal__btn" id="session-expired-confirm">重新登入</button>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const btn = backdrop.querySelector("#session-expired-confirm");
  const confirm = () => {
    document.body.style.overflow = "";
    goToLogin();
  };
  btn?.addEventListener("click", confirm);

  // Keyboard shortcut: Enter / Esc also confirms
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      document.removeEventListener("keydown", onKey);
      confirm();
    }
  };
  document.addEventListener("keydown", onKey);

  setTimeout(() => btn?.focus(), 50);
}

// Returns true if the response was 401 and the modal has been shown.
// Callers should `return` immediately after to stop further processing.
export function handleUnauthorized(res) {
  if (!res || res.status !== 401) return false;
  showSessionExpiredModal();
  return true;
}

// Paths where a 401 does NOT mean "session expired" (e.g. change-password
// returns 401 for "wrong old password"). These are handled by the caller.
const GUARD_IGNORE_PATHS = new Set([
  "/api/admin/change-password",
]);

function shouldGuard(path) {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/api/admin/")) return false;
  if (GUARD_IGNORE_PATHS.has(path.split("?")[0])) return false;
  return true;
}

// Wrap window.apiFetch so every admin API call is auto-guarded.
// Safe to run multiple times (guarded by a flag).
function wrapApiFetch() {
  if (typeof window === "undefined") return;
  if (window.__sessionGuardInstalled) return;
  const orig = window.apiFetch;
  if (typeof orig !== "function") {
    // apiFetch not installed yet; retry on next tick
    setTimeout(wrapApiFetch, 0);
    return;
  }
  window.apiFetch = function guardedApiFetch(path, options) {
    const p = orig.call(this, path, options);
    return Promise.resolve(p).then((res) => {
      if (res && res.status === 401 && shouldGuard(path) && !(options && options.skipSessionGuard)) {
        showSessionExpiredModal();
      }
      return res;
    });
  };
  window.__sessionGuardInstalled = true;
}

wrapApiFetch();
