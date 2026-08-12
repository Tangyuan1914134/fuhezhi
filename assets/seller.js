(function () {
  "use strict";

  const Store = window.PaperStudio;
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  let data = Store.load();
  let coverDraft = "";

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function setMessage(element, message, success) {
    if (!element) return;
    if (!message) {
      element.hidden = true;
      element.textContent = "";
      element.classList.remove("success");
      return;
    }
    element.textContent = message;
    element.classList.toggle("success", Boolean(success));
    element.hidden = false;
  }

  function saveAndRender(message) {
    const result = Store.save(data);
    if (!result.ok) {
      showToast("保存失败：浏览器存储空间可能已满，请减少图片数量或先导出备份。");
      data = Store.load();
      return false;
    }
    data = result.data;
    renderAll();
    if (message) showToast(message);
    return true;
  }

  function isAuthed() {
    try { return sessionStorage.getItem(Store.AUTH_KEY) === "1"; } catch (error) { return false; }
  }

  function setAuthed(value) {
    try {
      if (value) sessionStorage.setItem(Store.AUTH_KEY, "1");
      else sessionStorage.removeItem(Store.AUTH_KEY);
    } catch (error) { /* sessionStorage unavailable */ }
  }

  function showLogin() {
    $("#loginView").hidden = false;
    $("#sellerApp").hidden = true;
    $("#sellerPassword").value = "";
    setMessage($("#loginMessage"), "");
  }

  function showApp() {
    $("#loginView").hidden = true;
    $("#sellerApp").hidden = false;
    renderAll();
  }

  function sortedGroups() {
    return data.groups.slice().sort(function (a, b) { return Number(a.sort) - Number(b.sort); });
  }

  function groupTypeText(type) {
    return ({ single: "单选", multi: "多选", text: "文本说明" })[type] || "单选";
  }

  function optionPriceLabel(price) {
    const value = Number(price) || 0;
    return value > 0 ? `+${Store.formatMoney(value)}` : "已含基础价";
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("请选择 JSON 文件"));
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error("文件读取失败")); };
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.readAsText(file, "utf-8");
    });
  }

  function imageToDataUrl(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve("");
      if (!file.type || !file.type.startsWith("image/")) return reject(new Error("请选择 PNG、JPEG、WebP 或 GIF 图片"));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("单张图片不能超过 8 MB"));

      const reader = new FileReader();
      reader.onerror = function () { reject(new Error("图片读取失败")); };
      reader.onload = function () {
        const image = new Image();
        image.onerror = function () { reject(new Error("图片解析失败")); };
        image.onload = function () {
          const limit = Math.max(320, maxSide || 1000);
          const ratio = Math.min(1, limit / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
          const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
          const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) return reject(new Error("当前浏览器无法处理图片"));
          context.fillStyle = "#f6f2e8";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          let result = canvas.toDataURL("image/webp", 0.8);
          if (!result.startsWith("data:image/webp")) result = canvas.toDataURL("image/jpeg", 0.8);
          if (result.length > 1_200_000) {
            const smaller = document.createElement("canvas");
            const shrink = Math.min(1, 720 / Math.max(width, height));
            smaller.width = Math.max(1, Math.round(width * shrink));
            smaller.height = Math.max(1, Math.round(height * shrink));
            const smallerContext = smaller.getContext("2d", { alpha: false });
            smallerContext.fillStyle = "#f6f2e8";
            smallerContext.fillRect(0, 0, smaller.width, smaller.height);
            smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
            result = smaller.toDataURL("image/jpeg", 0.68);
          }
          resolve(result);
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function openDialog(markup, onReady) {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog-shell";
    dialog.innerHTML = markup;
    document.body.appendChild(dialog);

    function close() { if (dialog.open) dialog.close(); else dialog.remove(); }
    $$("[data-dialog-close]", dialog).forEach(function (button) { button.addEventListener("click", close); });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("dialog-open");
      dialog.remove();
    });
    if (onReady) onReady(dialog, close);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      document.body.classList.add("dialog-open");
      const focusTarget = $("input:not([type='file']), textarea, select, button", dialog);
      if (focusTarget) window.setTimeout(function () { focusTarget.focus(); }, 0);
    } else {
      dialog.setAttribute("open", "");
    }
    return dialog;
  }

  function renderSettings() {
    const merchant = data.merchant;
    $("#adminShopName").textContent = merchant.shopName;
    $("#adminShopMeta").textContent = `${merchant.minQty}${merchant.unit} 起订 · ${merchant.leadTime || "交期待确认"}`;
    $("#shopNameInput").value = merchant.shopName;
    $("#contactInput").value = merchant.contact;
    $("#sloganInput").value = merchant.slogan;
    $("#announcementInput").value = merchant.announcement;
    $("#basePriceInput").value = String(merchant.basePrice);
    $("#unitInput").value = merchant.unit;
    $("#minQtyInput").value = String(merchant.minQty);
    $("#shippingFeeInput").value = String(merchant.shippingFee);
    $("#leadTimeInput").value = merchant.leadTime;
    $("#passwordInput").value = merchant.password;
    $("#addressInput").value = merchant.address;
    const preview = $("#coverPreview");
    preview.src = Store.safeImageUrl(coverDraft || merchant.coverImage, "复合纸样");
    preview.onerror = function () { preview.onerror = null; preview.src = Store.svgThumb("复合纸样", "#d9c59e", "#365646", "wave"); };
  }

  function renderMetrics() {
    const optionCount = data.groups.reduce(function (sum, group) { return sum + (group.options || []).length; }, 0);
    const pendingCount = data.orders.filter(function (order) { return ["pending", "accepted", "making"].includes(order.status); }).length;
    $("#metricGroups").textContent = String(data.groups.length);
    $("#metricOptions").textContent = String(optionCount);
    $("#metricOrders").textContent = String(data.orders.length);
    $("#metricPending").textContent = String(pendingCount);
  }

  function renderCatalog() {
    const container = $("#groupEditorList");
    const groups = sortedGroups();
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">还没有分类。点击“新增分类”配置厚度、材质、层数、颜色、纹路或其他细节。</div>';
      return;
    }

    container.innerHTML = groups.map(function (group) {
      const options = (group.options || []).map(function (option) {
        return `<article class="option-editor">
          <img class="option-editor-thumb" src="${Store.escapeHTML(Store.safeImageUrl(option.image, option.name))}" alt="${Store.escapeHTML(option.name)}" loading="lazy">
          <div class="option-copy">
            <strong>${Store.escapeHTML(option.name)}</strong>
            <span class="option-meta">${Store.escapeHTML(optionPriceLabel(option.price))}${option.tag ? ` · ${Store.escapeHTML(option.tag)}` : ""}${option.active === false ? " · 已隐藏" : ""}</span>
            <p>${Store.escapeHTML(option.desc || "暂无简要介绍")}</p>
          </div>
          <div class="option-actions">
            <button class="action-button" type="button" data-action="edit-option" data-group-id="${Store.escapeHTML(group.id)}" data-option-id="${Store.escapeHTML(option.id)}">编辑</button>
            <button class="action-button danger" type="button" data-action="delete-option" data-group-id="${Store.escapeHTML(group.id)}" data-option-id="${Store.escapeHTML(option.id)}">删除</button>
          </div>
        </article>`;
      }).join("");

      return `<article class="group-editor-card" data-group-id="${Store.escapeHTML(group.id)}">
        <div class="group-editor-head">
          <div class="group-editor-title">
            <h3>${Store.escapeHTML(group.name)}</h3>
            <p>${Store.escapeHTML(group.helpText || "暂无辅助说明")}</p>
            <div class="group-badges">
              <span class="mini-badge">${groupTypeText(group.type)}</span>
              <span class="mini-badge ${group.required ? "" : "muted-badge"}">${group.required ? "必选" : "可选"}</span>
              <span class="mini-badge ${group.active === false ? "muted-badge" : ""}">${group.active === false ? "买家页隐藏" : "买家页显示"}</span>
            </div>
          </div>
          <div class="group-actions">
            <button class="action-button" type="button" data-action="move-up" data-group-id="${Store.escapeHTML(group.id)}">上移</button>
            <button class="action-button" type="button" data-action="move-down" data-group-id="${Store.escapeHTML(group.id)}">下移</button>
            <button class="action-button" type="button" data-action="edit-group" data-group-id="${Store.escapeHTML(group.id)}">编辑分类</button>
            <button class="action-button danger" type="button" data-action="delete-group" data-group-id="${Store.escapeHTML(group.id)}">删除</button>
          </div>
        </div>
        <div class="group-editor-body">
          <div class="group-editor-toolbar">
            <span>${group.type === "text" ? "文本说明分类无需添加选项" : `${(group.options || []).length} 个选项`}</span>
            ${group.type === "text" ? "" : `<button class="button button-secondary" type="button" data-action="add-option" data-group-id="${Store.escapeHTML(group.id)}">添加选项</button>`}
          </div>
          <div class="option-editor-list">${group.type === "text" ? '<div class="empty-state">买家将在此分类下填写文字说明。</div>' : (options || '<div class="empty-state">暂无选项，点击“添加选项”开始配置。</div>')}</div>
        </div>
      </article>`;
    }).join("");

    $$(".option-editor-thumb", container).forEach(function (image) {
      image.addEventListener("error", function () { image.src = Store.svgThumb(image.alt || "纸样", "#d9c7a8", "#536b5d", "wave"); }, { once: true });
    });
  }

  function openGroupDialog(group) {
    const editing = Boolean(group);
    const maxSort = Math.max(0, ...data.groups.map(function (item) { return Number(item.sort) || 0; }));
    const current = group || { id: "", name: "", type: "single", required: true, active: true, sort: maxSort + 10, helpText: "", options: [] };
    openDialog(`<form id="groupDialogForm" class="dialog-card" novalidate>
      <button class="dialog-close" type="button" data-dialog-close aria-label="关闭">×</button>
      <p class="kicker">${editing ? "EDIT CATEGORY" : "NEW CATEGORY"}</p>
      <h2>${editing ? "编辑分类" : "新增分类"}</h2>
      <p class="dialog-lead">例如纸张厚度、复合材质、环保认证、表面触感或包装方式。</p>
      <div class="field-grid two-columns">
        <label class="field"><span>分类名称 <em>*</em></span><input name="name" type="text" maxlength="120" value="${Store.escapeHTML(current.name)}" required></label>
        <label class="field"><span>分类类型</span><select name="type"><option value="single" ${current.type === "single" ? "selected" : ""}>单选</option><option value="multi" ${current.type === "multi" ? "selected" : ""}>多选</option><option value="text" ${current.type === "text" ? "selected" : ""}>文本说明</option></select></label>
        <label class="field"><span>排序值</span><input name="sort" type="number" step="1" value="${Store.escapeHTML(current.sort)}"></label>
        <label class="checkbox-field"><input name="required" type="checkbox" ${current.required ? "checked" : ""}> 买家必须选择或填写</label>
        <label class="checkbox-field"><input name="active" type="checkbox" ${current.active !== false ? "checked" : ""}> 在买家页面显示</label>
        <label class="field span-two"><span>辅助说明</span><textarea name="helpText" rows="3" maxlength="500">${Store.escapeHTML(current.helpText || "")}</textarea></label>
      </div>
      <div class="dialog-actions"><button class="button button-quiet" type="button" data-dialog-close>取消</button><button class="button button-primary" type="submit">保存分类</button></div>
    </form>`, function (dialog, close) {
      const form = $("#groupDialogForm", dialog);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        const name = String(fields.get("name") || "").trim();
        if (!name) return;
        const next = {
          id: current.id || Store.uid("grp"),
          name,
          type: String(fields.get("type") || "single"),
          sort: Number(fields.get("sort")) || maxSort + 10,
          required: form.elements.required.checked,
          active: form.elements.active.checked,
          helpText: String(fields.get("helpText") || "").trim(),
          options: current.options || []
        };
        if (editing) data.groups = data.groups.map(function (item) { return item.id === current.id ? next : item; });
        else data.groups.push(next);
        if (saveAndRender("分类已保存")) close();
      });
    });
  }

  function openOptionDialog(group, option) {
    const editing = Boolean(option);
    const current = option || { id: "", name: "", price: 0, tag: "", desc: "", active: true, image: "" };
    let imageDraft = current.image || "";
    openDialog(`<form id="optionDialogForm" class="dialog-card" novalidate>
      <button class="dialog-close" type="button" data-dialog-close aria-label="关闭">×</button>
      <p class="kicker">${editing ? "EDIT OPTION" : "NEW OPTION"}</p>
      <h2>${editing ? "编辑选项" : `为“${Store.escapeHTML(group.name)}”添加选项`}</h2>
      <div class="field-grid two-columns">
        <label class="field"><span>选项名称 <em>*</em></span><input name="name" type="text" maxlength="120" value="${Store.escapeHTML(current.name)}" required></label>
        <label class="field"><span>单价加价</span><input name="price" type="number" min="0" step="0.01" value="${Store.escapeHTML(current.price)}"></label>
        <label class="field"><span>简短标签</span><input name="tag" type="text" maxlength="40" value="${Store.escapeHTML(current.tag || "")}" placeholder="例如 常用 / 环保"></label>
        <label class="checkbox-field"><input name="active" type="checkbox" ${current.active !== false ? "checked" : ""}> 在买家页面显示</label>
        <label class="field span-two"><span>简要介绍</span><textarea name="desc" rows="3" maxlength="500">${Store.escapeHTML(current.desc || "")}</textarea></label>
        <label class="field span-two"><span>${editing ? "替换图片" : "选项图片"}</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
      </div>
      <div class="dialog-preview"><img id="optionPreview" src="${Store.escapeHTML(Store.safeImageUrl(imageDraft, current.name || "新选项"))}" alt="选项图片预览"></div>
      <div class="dialog-actions"><button class="button button-quiet" type="button" data-dialog-close>取消</button><button class="button button-primary" type="submit">保存选项</button></div>
    </form>`, function (dialog, close) {
      const form = $("#optionDialogForm", dialog);
      const fileInput = form.elements.image;
      const preview = $("#optionPreview", dialog);
      fileInput.addEventListener("change", async function () {
        const file = fileInput.files[0];
        if (!file) return;
        fileInput.disabled = true;
        try {
          imageDraft = await imageToDataUrl(file, 900);
          preview.src = imageDraft;
          showToast("图片已压缩并预览");
        } catch (error) {
          showToast(error.message);
          fileInput.value = "";
        } finally {
          fileInput.disabled = false;
        }
      });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        const name = String(fields.get("name") || "").trim();
        const next = {
          id: current.id || Store.uid("opt"),
          name,
          price: Math.max(0, Number(fields.get("price")) || 0),
          tag: String(fields.get("tag") || "").trim(),
          desc: String(fields.get("desc") || "").trim(),
          active: form.elements.active.checked,
          image: imageDraft || Store.svgThumb(name, "#d9c7a8", "#536b5d", "wave")
        };
        group.options = Array.isArray(group.options) ? group.options : [];
        if (editing) group.options = group.options.map(function (item) { return item.id === current.id ? next : item; });
        else group.options.push(next);
        if (saveAndRender(editing ? "选项已更新" : "选项已添加")) close();
      });
    });
  }

  function moveGroup(groupId, direction) {
    const groups = sortedGroups();
    const index = groups.findIndex(function (group) { return group.id === groupId; });
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groups.length) return;
    const temp = groups[index];
    groups[index] = groups[target];
    groups[target] = temp;
    groups.forEach(function (group, order) { group.sort = (order + 1) * 10; });
    data.groups = groups;
    saveAndRender("分类顺序已更新");
  }

  function deleteGroup(groupId) {
    const group = data.groups.find(function (item) { return item.id === groupId; });
    if (!group) return;
    if (!window.confirm(`删除分类“${group.name}”以及其中全部选项？此操作不可撤销。`)) return;
    data.groups = data.groups.filter(function (item) { return item.id !== groupId; });
    saveAndRender("分类已删除");
  }

  function deleteOption(groupId, optionId) {
    const group = data.groups.find(function (item) { return item.id === groupId; });
    if (!group) return;
    const option = (group.options || []).find(function (item) { return item.id === optionId; });
    if (!option || !window.confirm(`删除选项“${option.name}”？`)) return;
    group.options = group.options.filter(function (item) { return item.id !== optionId; });
    saveAndRender("选项已删除");
  }

  function statusBadge(order) {
    return `<span class="status-badge ${Store.escapeHTML(order.status)}">${Store.statusText(order.status)}</span>`;
  }

  function renderTimeline(order) {
    if (!(order.timeline || []).length) return "";
    return `<div class="timeline-list">${order.timeline.map(function (item) {
      return `<div class="timeline-item"><div><strong>${Store.escapeHTML(item.note || Store.statusText(item.status))}</strong><small>${Store.escapeHTML(Store.formatDate(item.at))}</small></div></div>`;
    }).join("")}</div>`;
  }

  function orderActionButtons(order) {
    const buttons = [];
    if (order.status === "pending") buttons.push(["accept-order", "接单", "button-primary"]);
    if (order.status === "accepted") buttons.push(["make-order", "开始制作", "button-primary"]);
    if (order.status === "making") buttons.push(["ship-order", "填写发货", "button-primary"]);
    if (order.status === "shipped") {
      buttons.push(["ship-order", "修改物流", "button-secondary"]);
      buttons.push(["complete-order", "标记完成", "button-primary"]);
    }
    buttons.push(["copy-order", "复制摘要", "button-quiet"]);
    if (!["completed", "cancelled"].includes(order.status)) buttons.push(["cancel-order", "取消订单", "button-quiet danger-text"]);
    return buttons.map(function (item) {
      return `<button class="button ${item[2]}" type="button" data-action="${item[0]}" data-order-id="${Store.escapeHTML(order.id)}">${item[1]}</button>`;
    }).join("");
  }

  function renderOrders() {
    const list = $("#ordersList");
    const filter = $("#statusFilter").value;
    const query = $("#orderSearch").value.trim().toLowerCase();
    const orders = data.orders.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).filter(function (order) {
      const statusMatch = filter === "all" || order.status === filter;
      const text = [order.code, order.buyer.name, order.buyer.phone, order.buyer.address].join(" ").toLowerCase();
      return statusMatch && (!query || text.includes(query));
    });

    if (!orders.length) {
      list.innerHTML = '<div class="empty-state">暂无匹配订单。买家在同一浏览器提交订单后会显示在这里。</div>';
      return;
    }

    list.innerHTML = orders.map(function (order) {
      const selections = (order.selections || []).map(function (selection) {
        return `<div class="selection-line"><b>${Store.escapeHTML(selection.groupName)}</b>：${Store.escapeHTML(Store.selectedText(selection))}</div>`;
      }).join("");
      const shipping = order.shipping && (order.shipping.company || order.shipping.trackingNo)
        ? `<div class="shipping-box"><b>物流信息</b><span>${Store.escapeHTML(order.shipping.company || "–")} ${Store.escapeHTML(order.shipping.trackingNo || "")}</span></div>`
        : "";
      return `<article class="order-card" data-order-id="${Store.escapeHTML(order.id)}">
        <div class="order-head"><div><h3>${Store.escapeHTML(order.code)}</h3><time>${Store.escapeHTML(Store.formatDate(order.createdAt))}</time></div>${statusBadge(order)}</div>
        <div class="order-body">
          <div>
            <div class="selection-lines">${selections || '<div class="empty-state">无定制明细</div>'}</div>
            ${shipping}${renderTimeline(order)}
            <div class="order-actions">${orderActionButtons(order)}</div>
          </div>
          <div class="kv-list">
            <span><b>收货人：</b>${Store.escapeHTML(order.buyer.name)}</span>
            <span><b>电话：</b>${Store.escapeHTML(order.buyer.phone)}</span>
            <span><b>地址：</b>${Store.escapeHTML(order.buyer.address)}</span>
            <span><b>期望交付：</b>${Store.escapeHTML(order.buyer.deadline || "未填写")}</span>
            <span><b>数量：</b>${Store.escapeHTML(order.pricing.quantity)}${Store.escapeHTML(order.pricing.unit || data.merchant.unit)}</span>
            <span><b>预计单价：</b>${Store.formatMoney(order.pricing.unitPrice || 0)}</span>
            <span><b>预计合计：</b>${Store.formatMoney(order.pricing.total || 0)}</span>
            <span><b>备注：</b>${Store.escapeHTML(order.buyer.remark || "无")}</span>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function updateOrder(orderId, status, note, shipping) {
    const order = data.orders.find(function (item) { return item.id === orderId; });
    if (!order) return;
    const now = new Date().toISOString();
    order.status = status;
    order.updatedAt = now;
    if (shipping) order.shipping = shipping;
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    order.timeline.push({ status, at: now, note: note || Store.statusText(status) });
    saveAndRender("订单状态已更新");
  }

  function openShippingDialog(order) {
    const shipping = order.shipping || {};
    openDialog(`<form id="shippingDialogForm" class="dialog-card" novalidate>
      <button class="dialog-close" type="button" data-dialog-close aria-label="关闭">×</button>
      <p class="kicker">SHIPPING</p><h2>填写物流信息</h2><p class="dialog-lead">订单 ${Store.escapeHTML(order.code)}</p>
      <div class="field-grid">
        <label class="field"><span>快递公司 <em>*</em></span><input name="company" type="text" maxlength="80" value="${Store.escapeHTML(shipping.company || "")}" placeholder="例如 顺丰速运" required></label>
        <label class="field"><span>快递单号 <em>*</em></span><input name="trackingNo" type="text" maxlength="120" value="${Store.escapeHTML(shipping.trackingNo || "")}" required></label>
      </div>
      <div class="dialog-actions"><button class="button button-quiet" type="button" data-dialog-close>取消</button><button class="button button-primary" type="submit">保存并标记发货</button></div>
    </form>`, function (dialog, close) {
      const form = $("#shippingDialogForm", dialog);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        updateOrder(order.id, "shipped", "商家填写物流并发货", {
          company: String(fields.get("company") || "").trim(),
          trackingNo: String(fields.get("trackingNo") || "").trim()
        });
        close();
      });
    });
  }

  function handleOrderAction(action, orderId) {
    const order = data.orders.find(function (item) { return item.id === orderId; });
    if (!order) return;
    if (action === "copy-order") {
      Store.copyText(Store.orderPlainText(order)).then(function () { showToast("订单摘要已复制"); }).catch(function () { window.prompt("请复制订单摘要：", Store.orderPlainText(order)); });
      return;
    }
    if (action === "accept-order") updateOrder(orderId, "accepted", "商家已接单");
    if (action === "make-order") updateOrder(orderId, "making", "商家开始制作");
    if (action === "ship-order") openShippingDialog(order);
    if (action === "complete-order") updateOrder(orderId, "completed", "商家标记订单完成");
    if (action === "cancel-order" && window.confirm(`确认取消订单 ${order.code}？`)) updateOrder(orderId, "cancelled", "商家取消订单");
  }

  function renderAll() {
    renderSettings();
    renderMetrics();
    renderCatalog();
    renderOrders();
  }

  function bindLogin() {
    $("#loginForm").addEventListener("submit", function (event) {
      event.preventDefault();
      data = Store.load();
      if ($("#sellerPassword").value === data.merchant.password) {
        setAuthed(true);
        showApp();
        showToast("已进入商家后台");
      } else {
        setMessage($("#loginMessage"), "密码不正确，请检查后重试。");
      }
    });
    $("#logoutBtn").addEventListener("click", function () { setAuthed(false); showLogin(); });
  }

  function bindTabs() {
    $$(".admin-tabs button").forEach(function (button) {
      button.addEventListener("click", function () {
        $$(".admin-tabs button").forEach(function (item) {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", String(active));
        });
        $$(".tab-view").forEach(function (view) {
          const active = view.id === `tab-${button.dataset.tab}`;
          view.classList.toggle("active", active);
          view.hidden = !active;
        });
      });
    });
  }

  function bindSettings() {
    $("#coverInput").addEventListener("change", async function (event) {
      const input = event.currentTarget;
      const file = input.files[0];
      if (!file) return;
      input.disabled = true;
      try {
        coverDraft = await imageToDataUrl(file, 1400);
        $("#coverPreview").src = coverDraft;
        showToast("封面图已压缩并预览，点击保存后生效");
      } catch (error) {
        showToast(error.message);
        input.value = "";
      } finally {
        input.disabled = false;
      }
    });

    $("#settingsForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      setMessage($("#settingsMessage"), "");
      if (!form.reportValidity()) return;
      data.merchant.shopName = $("#shopNameInput").value.trim() || "复合纸工作室";
      data.merchant.contact = $("#contactInput").value.trim();
      data.merchant.slogan = $("#sloganInput").value.trim();
      data.merchant.announcement = $("#announcementInput").value.trim();
      data.merchant.basePrice = Math.max(0, Number($("#basePriceInput").value) || 0);
      data.merchant.unit = $("#unitInput").value.trim() || "张";
      data.merchant.minQty = Math.max(1, Math.round(Number($("#minQtyInput").value) || 1));
      data.merchant.shippingFee = Math.max(0, Number($("#shippingFeeInput").value) || 0);
      data.merchant.leadTime = $("#leadTimeInput").value.trim();
      data.merchant.password = $("#passwordInput").value.trim() || "demo123";
      data.merchant.address = $("#addressInput").value.trim();
      if (coverDraft) data.merchant.coverImage = coverDraft;
      if (saveAndRender("店铺设置已保存")) {
        coverDraft = "";
        setMessage($("#settingsMessage"), "店铺设置已保存，买家页面将读取新配置。", true);
      }
    });
  }

  function bindCatalog() {
    $("#addGroupBtn").addEventListener("click", function () { openGroupDialog(null); });
    $("#groupEditorList").addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const groupId = button.dataset.groupId;
      const group = data.groups.find(function (item) { return item.id === groupId; });
      if (action === "edit-group" && group) openGroupDialog(group);
      if (action === "delete-group") deleteGroup(groupId);
      if (action === "move-up") moveGroup(groupId, -1);
      if (action === "move-down") moveGroup(groupId, 1);
      if (action === "add-option" && group) openOptionDialog(group, null);
      if (action === "edit-option" && group) {
        const option = (group.options || []).find(function (item) { return item.id === button.dataset.optionId; });
        if (option) openOptionDialog(group, option);
      }
      if (action === "delete-option") deleteOption(groupId, button.dataset.optionId);
    });
  }

  function bindOrders() {
    $("#statusFilter").addEventListener("change", renderOrders);
    $("#orderSearch").addEventListener("input", renderOrders);
    $("#ordersList").addEventListener("click", function (event) {
      const button = event.target.closest("[data-action][data-order-id]");
      if (button) handleOrderAction(button.dataset.action, button.dataset.orderId);
    });
    $("#clearFinishedBtn").addEventListener("click", function () {
      if (!window.confirm("清理全部已完成和已取消订单？")) return;
      data.orders = data.orders.filter(function (order) { return !["completed", "cancelled"].includes(order.status); });
      saveAndRender("已清理终态订单");
    });
  }

  function bindBackup() {
    $("#exportBtn").addEventListener("click", function () {
      Store.download(`fuhezhi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    });
    $("#copyDataBtn").addEventListener("click", function () {
      Store.copyText(JSON.stringify(data, null, 2)).then(function () { showToast("JSON 已复制"); }).catch(function () { showToast("复制失败，请改用下载 JSON"); });
    });
    $("#importFile").addEventListener("change", async function (event) {
      const file = event.currentTarget.files[0];
      if (!file) return;
      try {
        $("#importText").value = await readFileAsText(file);
        showToast("文件已读取，点击“导入并覆盖”生效");
      } catch (error) { showToast(error.message); }
    });
    $("#importBtn").addEventListener("click", function () {
      const text = $("#importText").value.trim();
      if (!text) return showToast("请先粘贴 JSON 或选择备份文件");
      if (!window.confirm("导入会覆盖当前浏览器全部数据，确认继续？")) return;
      try {
        data = Store.importData(text);
        coverDraft = "";
        renderAll();
        showToast("数据已导入");
      } catch (error) { showToast("导入失败：JSON 格式或数据内容不正确"); }
    });
    $("#resetDemoBtn").addEventListener("click", function () {
      if (!window.confirm("恢复默认演示数据会覆盖当前全部配置和订单，确认继续？")) return;
      data = Store.reset();
      coverDraft = "";
      renderAll();
      showToast("已恢复默认演示数据");
    });
    $("#clearOrdersBtn").addEventListener("click", function () {
      if (!window.confirm("清空全部订单？店铺与目录配置会保留。")) return;
      data.orders = [];
      saveAndRender("全部订单已清空");
    });
  }

  function bindStorageSync() {
    window.addEventListener("storage", function (event) {
      if (event.key !== Store.STORAGE_KEY || !isAuthed()) return;
      data = Store.load();
      renderMetrics();
      renderOrders();
      showToast("检测到其他页面的数据更新");
    });
  }

  function init() {
    bindLogin();
    bindTabs();
    bindSettings();
    bindCatalog();
    bindOrders();
    bindBackup();
    bindStorageSync();
    if (isAuthed()) showApp();
    else showLogin();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
