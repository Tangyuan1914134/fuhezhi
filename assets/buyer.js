(function () {
  "use strict";

  const Store = window.PaperStudio;
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  let data = Store.load();
  let lastOrderText = "";

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function visibleGroups() {
    return data.groups.filter(function (group) { return group.active !== false; }).slice().sort(function (a, b) { return Number(a.sort) - Number(b.sort); });
  }

  function visibleOptions(group) {
    return (group.options || []).filter(function (option) { return option.active !== false; });
  }

  function optionPriceLabel(price) {
    const value = Number(price) || 0;
    return value > 0 ? `+${Store.formatMoney(value)}` : "已含";
  }

  function getQuantity() {
    const minimum = Math.max(1, Number(data.merchant.minQty) || 1);
    const value = Number($("#quantity").value);
    return Number.isFinite(value) && value >= 1 ? Math.round(value) : minimum;
  }

  function setFormMessage(messages, success) {
    const box = $("#formMessage");
    if (!box) return;
    const items = Array.isArray(messages) ? messages : [messages];
    const clean = items.filter(Boolean);
    if (!clean.length) {
      box.hidden = true;
      box.textContent = "";
      box.classList.remove("success");
      return;
    }
    box.classList.toggle("success", Boolean(success));
    box.innerHTML = clean.length > 1
      ? `<strong>请检查以下内容：</strong><ul>${clean.map(function (item) { return `<li>${Store.escapeHTML(item)}</li>`; }).join("")}</ul>`
      : Store.escapeHTML(clean[0]);
    box.hidden = false;
  }

  function renderShop() {
    const merchant = data.merchant;
    $("#buyerShopNameTop").textContent = merchant.shopName;
    $("#shopName").textContent = merchant.shopName;
    $("#shopSlogan").textContent = merchant.slogan || "复合纸在线定制演示";
    $("#leadTime").textContent = merchant.leadTime || "待确认";
    $("#minQty").textContent = `${merchant.minQty}${merchant.unit} 起订`;
    $("#contact").textContent = merchant.contact || "待填写";
    $("#shopNotice").innerHTML = `<strong>商家提示：</strong>${Store.escapeHTML(merchant.announcement || "暂无公告")}`;
    const cover = $("#shopCover");
    cover.src = Store.safeImageUrl(merchant.coverImage, "复合纸样");
    cover.onerror = function () { cover.onerror = null; cover.src = Store.svgThumb("复合纸样", "#d9c59e", "#365646", "wave"); };

    const quantity = $("#quantity");
    const minimum = Math.max(1, Number(merchant.minQty) || 1);
    quantity.min = String(minimum);
    if (!quantity.value || Number(quantity.value) < minimum) quantity.value = String(minimum);

    const deadline = $("#deadline");
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    deadline.min = localDate;
  }

  function renderGroups() {
    const container = $("#groupsContainer");
    const groups = visibleGroups();
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">商家尚未启用定制分类。请先进入商家后台添加纸张种类和细节。</div>';
      return;
    }

    container.innerHTML = groups.map(function (group) {
      const requirement = group.required
        ? '<span class="choice-requirement">必选</span>'
        : '<span class="choice-requirement optional">可选</span>';
      let body = "";

      if (group.type === "text") {
        body = `<div class="text-choice"><textarea name="text_${Store.escapeHTML(group.id)}" rows="3" maxlength="1000" placeholder="填写${Store.escapeHTML(group.name)}"></textarea></div>`;
      } else {
        const options = visibleOptions(group);
        if (!options.length) {
          body = '<div class="empty-state">这个分类暂时没有可用选项。</div>';
        } else {
          body = `<div class="choice-grid">${options.map(function (option, index) {
            const type = group.type === "multi" ? "checkbox" : "radio";
            const checked = group.type === "single" && group.required && index === 0 ? "checked" : "";
            const name = `group_${group.id}`;
            return `<label class="choice-card">
              <input type="${type}" name="${Store.escapeHTML(name)}" value="${Store.escapeHTML(option.id)}" ${checked}>
              <span class="choice-inner">
                <img class="choice-thumb" src="${Store.escapeHTML(Store.safeImageUrl(option.image, option.name))}" alt="${Store.escapeHTML(option.name)}" loading="lazy">
                <span class="choice-title"><span>${Store.escapeHTML(option.name)}</span><span class="choice-price">${optionPriceLabel(option.price)}</span></span>
                ${option.desc ? `<span class="choice-desc">${Store.escapeHTML(option.desc)}</span>` : '<span class="choice-desc">暂无说明</span>'}
                ${option.tag ? `<span class="choice-tag">${Store.escapeHTML(option.tag)}</span>` : ""}
              </span>
            </label>`;
          }).join("")}</div>`;
        }
      }

      return `<section class="choice-group" data-group-id="${Store.escapeHTML(group.id)}">
        <div class="choice-group-header">
          <div><h3>${Store.escapeHTML(group.name)}</h3>${group.helpText ? `<p>${Store.escapeHTML(group.helpText)}</p>` : ""}</div>
          ${requirement}
        </div>
        ${body}
      </section>`;
    }).join("");

    $$(".choice-thumb", container).forEach(function (image) {
      image.addEventListener("error", function () {
        image.src = Store.svgThumb(image.alt || "纸样", "#d9c7a8", "#536b5d", "wave");
      }, { once: true });
    });
  }

  function collectSelections() {
    const selections = [];
    const errors = [];
    let extra = 0;

    visibleGroups().forEach(function (group) {
      if (group.type === "text") {
        const input = $(`[name="text_${cssEscape(group.id)}"]`);
        const text = input ? input.value.trim() : "";
        if (group.required && !text) errors.push(`请填写“${group.name}”`);
        selections.push({ groupId: group.id, groupName: group.name, type: "text", text, options: [] });
        return;
      }

      const options = visibleOptions(group);
      const selectedInputs = $$(`[name="group_${cssEscape(group.id)}"]:checked`);
      const selectedOptions = selectedInputs.map(function (input) {
        return options.find(function (option) { return option.id === input.value; });
      }).filter(Boolean);

      if (group.required && !options.length) errors.push(`“${group.name}”暂无可选内容，请联系商家`);
      else if (group.required && !selectedOptions.length) errors.push(`请选择“${group.name}”`);

      extra += selectedOptions.reduce(function (sum, option) { return sum + (Number(option.price) || 0); }, 0);
      selections.push({
        groupId: group.id,
        groupName: group.name,
        type: group.type,
        text: "",
        options: selectedOptions.map(function (option) {
          return { id: option.id, name: option.name, price: Number(option.price) || 0, tag: option.tag || "" };
        })
      });
    });

    return { selections, errors, extra };
  }

  function renderSummary() {
    const result = collectSelections();
    const merchant = data.merchant;
    const quantity = getQuantity();
    const base = Number(merchant.basePrice) || 0;
    const extra = result.extra;
    const unitPrice = base + extra;
    const shipping = Number(merchant.shippingFee) || 0;
    const total = unitPrice * quantity + shipping;

    $("#basePrice").textContent = Store.formatMoney(base);
    $("#extraPrice").textContent = Store.formatMoney(extra);
    $("#qtyPreview").textContent = `${quantity}${merchant.unit}`;
    $("#shippingFee").textContent = Store.formatMoney(shipping);
    $("#totalPrice").textContent = Store.formatMoney(total);
    $("#summaryList").innerHTML = result.selections.length
      ? result.selections.map(function (selection) {
          return `<div class="summary-row"><span>${Store.escapeHTML(selection.groupName)}</span><strong>${Store.escapeHTML(Store.selectedText(selection))}</strong></div>`;
        }).join("")
      : '<div class="empty-state">暂无可用分类。</div>';

    return { selections: result.selections, errors: result.errors, base, extra, unitPrice, shipping, total, quantity };
  }

  function validateBuyer(summary) {
    const errors = summary.errors.slice();
    const minimum = Math.max(1, Number(data.merchant.minQty) || 1);
    const quantityRaw = $("#quantity").value.trim();
    const quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < minimum) errors.push(`定制数量不能低于 ${minimum}${data.merchant.unit}，且必须为整数`);

    const name = $("#buyerName").value.trim();
    const phone = $("#buyerPhone").value.trim();
    const address = $("#address").value.trim();
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name) errors.push("请填写收货人");
    if (!phone) errors.push("请填写联系电话");
    else if (phoneDigits.length < 6) errors.push("联系电话格式过短，请检查");
    if (!address) errors.push("请填写完整收货地址");
    return errors;
  }

  function openOrderDialog(order) {
    lastOrderText = Store.orderPlainText(order);
    $("#orderDialogBody").innerHTML = `<div class="order-ticket">
      <span>订单号</span><code>${Store.escapeHTML(order.code)}</code>
      <span>预计合计：<strong>${Store.formatMoney(order.pricing.total)}</strong></span>
      <span>当前状态：${Store.statusText(order.status)}</span>
    </div>`;
    $("#viewOrderLink").href = `../orders/?code=${encodeURIComponent(order.code)}`;
    const dialog = $("#orderDialog");
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      document.body.classList.add("dialog-open");
    } else {
      window.alert(`订单已生成：${order.code}`);
    }
  }

  function closeOrderDialog() {
    const dialog = $("#orderDialog");
    if (dialog && dialog.open) dialog.close();
    document.body.classList.remove("dialog-open");
  }

  function submitOrder(event) {
    event.preventDefault();
    setFormMessage([]);
    const summary = renderSummary();
    const errors = validateBuyer(summary);
    if (errors.length) {
      setFormMessage(errors);
      $("#formMessage").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    data = Store.load();
    const now = new Date().toISOString();
    const order = {
      id: Store.uid("order"),
      code: Store.orderCode(data.orders.map(function (item) { return item.code; })),
      createdAt: now,
      updatedAt: now,
      status: "pending",
      buyer: {
        name: $("#buyerName").value.trim(),
        phone: $("#buyerPhone").value.trim(),
        address: $("#address").value.trim(),
        deadline: $("#deadline").value,
        remark: $("#remark").value.trim()
      },
      selections: summary.selections,
      pricing: {
        basePrice: summary.base,
        optionExtra: summary.extra,
        unitPrice: summary.unitPrice,
        quantity: summary.quantity,
        unit: data.merchant.unit,
        shippingFee: summary.shipping,
        total: summary.total
      },
      shipping: { company: "", trackingNo: "" },
      timeline: [{ status: "pending", at: now, note: "买家提交订单" }]
    };

    data.orders.unshift(order);
    const saved = Store.save(data);
    if (!saved.ok) {
      setFormMessage("订单保存失败：浏览器本地存储空间可能已满。请让商家减少上传图片大小或先导出备份。");
      return;
    }
    data = saved.data;
    const savedOrder = data.orders.find(function (item) { return item.id === order.id; }) || order;
    openOrderDialog(savedOrder);
  }

  function resetChoices() {
    renderGroups();
    renderSummary();
    setFormMessage([]);
  }

  function bindEvents() {
    const form = $("#buyerForm");
    form.addEventListener("change", renderSummary);
    form.addEventListener("input", renderSummary);
    form.addEventListener("submit", submitOrder);
    $("#resetChoiceBtn").addEventListener("click", resetChoices);
    $("#closeOrderDialog").addEventListener("click", closeOrderDialog);
    $("#okOrderBtn").addEventListener("click", closeOrderDialog);
    $("#orderDialog").addEventListener("close", function () { document.body.classList.remove("dialog-open"); });
    $("#copyOrderBtn").addEventListener("click", function () {
      const button = $("#copyOrderBtn");
      Store.copyText(lastOrderText).then(function () {
        const original = "复制订单摘要";
        button.textContent = "已复制";
        window.setTimeout(function () { button.textContent = original; }, 1400);
      }).catch(function () { window.prompt("请复制以下订单摘要：", lastOrderText); });
    });

    window.addEventListener("storage", function (event) {
      if (event.key !== Store.STORAGE_KEY) return;
      data = Store.load();
      renderShop();
      renderGroups();
      renderSummary();
      setFormMessage("商家配置已更新，当前选择已重置。", true);
    });
  }

  function init() {
    renderShop();
    renderGroups();
    renderSummary();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
