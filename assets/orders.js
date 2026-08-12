(function () {
  "use strict";

  const Store = window.PaperStudio;
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  let data = Store.load();

  function phoneTail(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-4);
  }

  function renderTimeline(order) {
    if (!(order.timeline || []).length) return "";
    return `<div class="timeline-list">${order.timeline.map(function (item) {
      return `<div class="timeline-item"><div><strong>${Store.escapeHTML(item.note || Store.statusText(item.status))}</strong><small>${Store.escapeHTML(Store.formatDate(item.at))}</small></div></div>`;
    }).join("")}</div>`;
  }

  function renderOrder(order, compact) {
    const shipping = order.shipping || {};
    const selections = (order.selections || []).map(function (selection) {
      return `<div class="selection-line"><b>${Store.escapeHTML(selection.groupName)}</b>：${Store.escapeHTML(Store.selectedText(selection))}</div>`;
    }).join("");
    return `<article class="order-card" data-order-id="${Store.escapeHTML(order.id)}">
      <div class="order-head">
        <div><h3>${Store.escapeHTML(order.code)}</h3><time>${Store.escapeHTML(Store.formatDate(order.createdAt))}</time></div>
        <span class="status-badge ${Store.escapeHTML(order.status)}">${Store.statusText(order.status)}</span>
      </div>
      <div class="order-body">
        <div>
          <div class="selection-lines">${selections || '<div class="empty-state">订单没有保存定制选项。</div>'}</div>
          ${shipping.trackingNo ? `<div class="shipping-box"><b>物流信息</b><span>${Store.escapeHTML(shipping.company || "–")} ${Store.escapeHTML(shipping.trackingNo)}</span></div>` : ""}
          ${compact ? "" : renderTimeline(order)}
          <div class="order-actions">
            <button class="button button-quiet" type="button" data-copy-order>复制摘要</button>
            ${order.status === "shipped" ? '<button class="button button-primary" type="button" data-confirm-receipt>确认收货</button>' : ""}
          </div>
        </div>
        <div class="kv-list">
          <span><b>收货人：</b>${Store.escapeHTML(order.buyer.name)}</span>
          <span><b>电话：</b>${Store.escapeHTML(order.buyer.phone)}</span>
          <span><b>地址：</b>${Store.escapeHTML(order.buyer.address)}</span>
          ${order.buyer.deadline ? `<span><b>期望交付：</b>${Store.escapeHTML(order.buyer.deadline)}</span>` : ""}
          ${order.buyer.remark ? `<span><b>备注：</b>${Store.escapeHTML(order.buyer.remark)}</span>` : ""}
          <span><b>数量：</b>${Store.escapeHTML(order.pricing.quantity)}${Store.escapeHTML(order.pricing.unit || data.merchant.unit)}</span>
          <span><b>预计合计：</b>${Store.formatMoney(order.pricing.total || 0)}</span>
        </div>
      </div>
    </article>`;
  }

  function findOrder(code) {
    const target = String(code || "").trim().toUpperCase();
    if (!target) return null;
    data = Store.load();
    return data.orders.find(function (order) { return String(order.code).toUpperCase() === target; }) || null;
  }

  function bindCardActions(root) {
    root.querySelectorAll("[data-copy-order]").forEach(function (button) {
      button.addEventListener("click", function () {
        data = Store.load();
        const card = button.closest(".order-card");
        const order = data.orders.find(function (item) { return item.id === card.dataset.orderId; });
        if (!order) return;
        Store.copyText(Store.orderPlainText(order)).then(function () {
          button.textContent = "已复制";
          window.setTimeout(function () { button.textContent = "复制摘要"; }, 1400);
        }).catch(function () { window.prompt("请复制订单摘要：", Store.orderPlainText(order)); });
      });
    });

    root.querySelectorAll("[data-confirm-receipt]").forEach(function (button) {
      button.addEventListener("click", function () {
        data = Store.load();
        const card = button.closest(".order-card");
        const order = data.orders.find(function (item) { return item.id === card.dataset.orderId; });
        if (!order || order.status !== "shipped") return;
        const now = new Date().toISOString();
        order.status = "completed";
        order.updatedAt = now;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.push({ status: "completed", at: now, note: "买家确认收货" });
        const result = Store.save(data);
        if (!result.ok) return window.alert("保存失败：浏览器本地存储空间可能已满。");
        data = result.data;
        const updated = data.orders.find(function (item) { return item.id === order.id; });
        renderResult(updated);
        renderRecent();
      });
    });
  }

  function renderResult(order, message) {
    const root = $("#orderResult");
    if (!order) {
      root.innerHTML = `<div class="empty-state">${Store.escapeHTML(message || "请输入订单号查询。")}</div>`;
      return;
    }
    root.innerHTML = renderOrder(order, false);
    bindCardActions(root);
  }

  function renderRecent() {
    const root = $("#recentOrders");
    data = Store.load();
    const recent = data.orders.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);
    if (!recent.length) {
      root.innerHTML = '<div class="empty-state">当前浏览器还没有订单。先前往买家页面提交一笔演示订单。</div>';
      return;
    }
    root.innerHTML = recent.map(function (order) { return renderOrder(order, true); }).join("");
    bindCardActions(root);
  }

  function queryOrder(event) {
    event.preventDefault();
    const code = $("#orderCodeInput").value.trim();
    const tail = $("#phoneTailInput").value.trim().replace(/\D/g, "");
    if (!code) return renderResult(null, "请输入订单号。");
    if (tail && tail.length !== 4) return renderResult(null, "联系电话后四位应为 4 位数字，或留空不填。");
    const order = findOrder(code);
    if (!order) return renderResult(null, `没有找到订单：${code}`);
    if (tail && phoneTail(order.buyer.phone) !== tail) return renderResult(null, "联系电话后四位不匹配，请检查后重试。");
    renderResult(order);
  }

  function loadLatestOrder() {
    data = Store.load();
    const order = data.orders.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
    if (!order) return renderResult(null, "当前浏览器还没有订单。");
    $("#orderCodeInput").value = order.code;
    $("#phoneTailInput").value = phoneTail(order.buyer.phone);
    renderResult(order);
  }

  function init() {
    $("#orderLookupForm").addEventListener("submit", queryOrder);
    $("#loadLatestOrderBtn").addEventListener("click", loadLatestOrder);
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      $("#orderCodeInput").value = code;
      renderResult(findOrder(code), `没有找到订单：${code}`);
    } else {
      renderResult(null, "请输入订单号，或点击“填入最近订单”。");
    }
    renderRecent();
    window.addEventListener("storage", function (event) {
      if (event.key !== Store.STORAGE_KEY) return;
      data = Store.load();
      const currentCode = $("#orderCodeInput").value.trim();
      if (currentCode) renderResult(findOrder(currentCode), `没有找到订单：${currentCode}`);
      renderRecent();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
