// Keep a stalled request from leaving a storefront or cart permanently blank.
export async function fetchStoreJson(path, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await window.apiFetch(path, { signal: controller.signal });
    if (!response.ok) throw new Error(`資料載入失敗：${response.status}`);
    const data = await response.json();
    if (!data || data.ok === false) throw new Error(data?.error || "資料載入失敗");
    return data;
  } finally {
    clearTimeout(timer);
  }
}
