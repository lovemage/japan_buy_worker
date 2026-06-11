// 啟動 PAYUNi 結帳：POST checkout 取得 UPP 欄位 → 動態 form 跳轉
// 用法：startPlanCheckout("pro", 12)
function startPlanCheckout(plan, months, button) {
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = "<span>建立付款中...</span><strong>請稍候</strong>";
  }
  function resetButton() {
    if (!button) return;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
  }
  return fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: plan, months: months }),
  })
    .then(function (r) {
      if (r.status === 401) {
        window.location.href = "/login.html";
        return null;
      }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.ok) {
        resetButton();
        alert(d.error || "建立訂單失敗，請稍後再試");
        return;
      }
      var form = document.createElement("form");
      form.method = "POST";
      form.action = d.action;
      Object.keys(d.fields).forEach(function (k) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = d.fields[k];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    })
    .catch(function () {
      resetButton();
      alert("連線失敗，請稍後再試");
    });
}
window.startPlanCheckout = startPlanCheckout;
