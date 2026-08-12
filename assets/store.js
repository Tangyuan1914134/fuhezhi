(function (window) {
  "use strict";

  const STORAGE_KEY = "fuhezhi.static-demo.v2";
  const LEGACY_KEYS = ["composite-paper-toy.v1"];
  const AUTH_KEY = "fuhezhi.seller.session";
  const SCHEMA_VERSION = 2;

  const STATUS_LABELS = {
    pending: "待接单",
    accepted: "已接单",
    making: "制作中",
    shipped: "已发货",
    completed: "已完成",
    cancelled: "已取消"
  };
  const STATUS_ORDER = ["pending", "accepted", "making", "shipped", "completed", "cancelled"];
  let volatileData = null;

  function uid(prefix) {
    const base = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    return `${prefix}_${Date.now().toString(36)}_${base}`;
  }

  function orderCode(existingCodes) {
    const used = new Set((existingCodes || []).map(function (code) { return String(code).toUpperCase(); }));
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = new Uint8Array(3);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else bytes.forEach(function (_, index) { bytes[index] = Math.floor(Math.random() * 256); });
      const token = Array.from(bytes).map(function (n) { return n.toString(36).padStart(2, "0"); }).join("").slice(0, 5).toUpperCase();
      const code = `CP${date}${token}`;
      if (!used.has(code)) return code;
    }
    return `CP${date}${Date.now().toString(36).slice(-6).toUpperCase()}`;
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char];
    });
  }

  function svgThumb(title, colorA, colorB, motif) {
    const label = xmlEscape(String(title || "纸样").slice(0, 14));
    const a = /^#[0-9a-f]{3,8}$/i.test(colorA || "") ? colorA : "#d9c7a8";
    const b = /^#[0-9a-f]{3,8}$/i.test(colorB || "") ? colorB : "#536b5d";
    const pattern = motif === "fiber"
      ? '<path d="M36 90h568M36 154h568M36 218h568M36 282h568" stroke="rgba(255,255,255,.20)" stroke-width="2" stroke-dasharray="2 13"/>'
      : motif === "plain"
        ? '<circle cx="530" cy="86" r="88" fill="rgba(255,255,255,.12)"/>'
        : '<path d="M-20 286C100 214 188 334 302 263s202-63 374 14" fill="none" stroke="rgba(255,255,255,.40)" stroke-width="14" stroke-linecap="round"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
        <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .14"/></feComponentTransfer></filter>
      </defs>
      <rect width="640" height="400" fill="url(#g)"/>
      <rect width="640" height="400" filter="url(#n)" opacity=".48"/>
      ${pattern}
      <rect x="34" y="32" width="210" height="54" rx="27" fill="rgba(255,255,255,.78)"/>
      <text x="58" y="68" font-family="Arial,'Microsoft YaHei',sans-serif" font-size="24" font-weight="700" fill="rgba(27,42,34,.88)">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function safeImageUrl(value, fallbackLabel) {
    const url = String(value || "").trim();
    if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(url)) return url;
    if (/^(?:\.{0,2}\/|\/[^/])/i.test(url)) return url;
    return svgThumb(fallbackLabel || "纸样", "#d9c7a8", "#536b5d", "wave");
  }

  function defaultData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      merchant: {
        shopName: "云纹复合纸工作室",
        slogan: "小批量复合纸样、包装纸、封面纸与礼盒面纸的在线选型演示。",
        announcement: "当前页面不包含支付。提交后会生成演示订单，真实生产规格、色差与交期请再与商家确认。",
        contact: "微信 / 电话：请在商家后台修改",
        address: "示例地址：广东省东莞市纸样路 88 号",
        password: "demo123",
        basePrice: 3.8,
        unit: "张",
        minQty: 100,
        leadTime: "3–5 个工作日",
        shippingFee: 0,
        coverImage: svgThumb("复合纸样", "#d9c59e", "#365646", "wave")
      },
      groups: [
        {
          id: "grp_thickness", name: "纸张厚度", type: "single", required: true, active: true, sort: 10,
          helpText: "选择复合后的整体克重与挺度。",
          options: [
            { id: "opt_180g", name: "180g 轻薄款", price: 0, tag: "轻量", desc: "适合样册内页、信封衬纸与轻包装。", active: true, image: svgThumb("180g", "#eee4d2", "#b88959", "fiber") },
            { id: "opt_250g", name: "250g 标准款", price: 0.6, tag: "常用", desc: "兼顾挺度和成本，适合多数包装纸。", active: true, image: svgThumb("250g", "#e2cfab", "#91633e", "fiber") },
            { id: "opt_350g", name: "350g 加厚款", price: 1.2, tag: "挺括", desc: "适合封面、吊牌与礼盒面纸。", active: true, image: svgThumb("350g", "#caa77d", "#60422c", "fiber") },
            { id: "opt_450g", name: "450g 高挺款", price: 2.1, tag: "厚实", desc: "手感厚实，适合强调结构感的包装。", active: true, image: svgThumb("450g", "#a8784b", "#302117", "fiber") }
          ]
        },
        {
          id: "grp_material", name: "复合材质", type: "single", required: true, active: true, sort: 20,
          helpText: "材质会影响触感、印刷表现、耐用性与成本。",
          options: [
            { id: "opt_kraft", name: "牛皮纸 + 白卡", price: 0.4, tag: "自然", desc: "自然纤维感明显，背面挺度稳定。", active: true, image: svgThumb("牛皮 + 白卡", "#c6945d", "#f1eadb", "fiber") },
            { id: "opt_art", name: "铜版纸 + 灰板", price: 0.9, tag: "平整", desc: "表面细腻，彩色印刷表现较稳定。", active: true, image: svgThumb("铜版 + 灰板", "#eeeeea", "#77756f", "plain") },
            { id: "opt_special", name: "特种纸 + 黑卡", price: 1.6, tag: "高级", desc: "适合高端封面、礼盒与品牌物料。", active: true, image: svgThumb("特种纸 + 黑卡", "#33332f", "#c09b56", "wave") },
            { id: "opt_water", name: "防水覆膜复合", price: 2.3, tag: "耐用", desc: "增加耐磨与抗污表现，表面略有膜感。", active: true, image: svgThumb("防水覆膜", "#aec5c7", "#52777a", "wave") }
          ]
        },
        {
          id: "grp_layers", name: "纸张层数", type: "single", required: true, active: true, sort: 30,
          helpText: "层数越多，结构与挺度越强，生产成本也会提高。",
          options: [
            { id: "opt_2layers", name: "双层复合", price: 0, tag: "基础", desc: "常规两层纸材复合。", active: true, image: svgThumb("双层", "#eee7d8", "#b89a73", "plain") },
            { id: "opt_3layers", name: "三层夹芯", price: 1.1, tag: "稳固", desc: "中间可加入灰板或功能层。", active: true, image: svgThumb("三层", "#d3bea0", "#66503b", "plain") },
            { id: "opt_4layers", name: "四层高挺", price: 2.4, tag: "高挺", desc: "适合强调硬挺手感与结构的包装。", active: true, image: svgThumb("四层", "#a88963", "#34271c", "plain") }
          ]
        },
        {
          id: "grp_front_color", name: "正面颜色", type: "single", required: true, active: true, sort: 40,
          helpText: "选择面纸的主视觉颜色。",
          options: [
            { id: "opt_front_white", name: "本白", price: 0, tag: "干净", desc: "自然偏暖的白色，适配范围广。", active: true, image: svgThumb("本白", "#fffdf6", "#e4dcc9", "plain") },
            { id: "opt_front_cream", name: "暖米", price: 0.3, tag: "柔和", desc: "温暖低饱和，适合生活方式品牌。", active: true, image: svgThumb("暖米", "#f2dfbc", "#c79c62", "plain") },
            { id: "opt_front_green", name: "莫兰迪绿", price: 0.5, tag: "雅致", desc: "低饱和绿色，安静且具有材料感。", active: true, image: svgThumb("雾绿", "#b7c4ad", "#4d6c56", "plain") },
            { id: "opt_front_blue", name: "雾蓝", price: 0.5, tag: "清爽", desc: "偏灰调蓝色，适合清爽克制的视觉。", active: true, image: svgThumb("雾蓝", "#bbc9d8", "#506579", "plain") }
          ]
        },
        {
          id: "grp_back_color", name: "背面颜色", type: "single", required: true, active: true, sort: 50,
          helpText: "选择背面或里纸颜色。",
          options: [
            { id: "opt_back_kraft", name: "原色牛皮", price: 0, tag: "自然", desc: "保留天然牛皮纸的纤维与色泽。", active: true, image: svgThumb("原色牛皮", "#c08a55", "#6f4b2b", "fiber") },
            { id: "opt_back_white", name: "纯白", price: 0.2, tag: "通用", desc: "背面干净，便于书写和印刷。", active: true, image: svgThumb("纯白", "#ffffff", "#d9d8d1", "plain") },
            { id: "opt_back_black", name: "黑卡色", price: 0.8, tag: "沉稳", desc: "对比强，适合高端包装与封面。", active: true, image: svgThumb("黑卡", "#2d2b27", "#080807", "plain") },
            { id: "opt_back_same", name: "同正面", price: 0.4, tag: "统一", desc: "前后颜色保持一致。", active: true, image: svgThumb("同色", "#d7c5a8", "#8d6d48", "plain") }
          ]
        },
        {
          id: "grp_texture", name: "染色纹路", type: "single", required: true, active: true, sort: 60,
          helpText: "自然染色与纤维纹理会产生适度批次差异。",
          options: [
            { id: "opt_plain", name: "无纹纯色", price: 0, tag: "稳定", desc: "颜色均一，适合大面积统一视觉。", active: true, image: svgThumb("纯色", "#e5d8c3", "#9d7e58", "plain") },
            { id: "opt_cloud", name: "云染纹", price: 1.2, tag: "自然", desc: "呈现云雾扩散般的手工染色感。", active: true, image: svgThumb("云染", "#d9c3ad", "#687b6a", "wave") },
            { id: "opt_fiber", name: "纤维点纹", price: 0.9, tag: "纸感", desc: "保留细小纤维与颗粒变化。", active: true, image: svgThumb("纤维点纹", "#eee3cc", "#6b5a42", "fiber") },
            { id: "opt_wave", name: "山形水纹", price: 1.8, tag: "特别", desc: "水波与山形纹理更明显。", active: true, image: svgThumb("山形水纹", "#9fb2ac", "#394d47", "wave") }
          ]
        },
        {
          id: "grp_notes", name: "特殊规格说明", type: "text", required: false, active: true, sort: 70,
          helpText: "可填写潘通色号、样纸编号、克重公差、环保认证或包装要求。",
          options: []
        }
      ],
      orders: []
    };
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeOption(option) {
    const source = option && typeof option === "object" ? option : {};
    const name = String(source.name || "未命名选项").slice(0, 120);
    return {
      id: String(source.id || uid("opt")),
      name,
      price: Math.max(0, toNumber(source.price, 0)),
      tag: String(source.tag || "").slice(0, 40),
      desc: String(source.desc || "").slice(0, 500),
      image: safeImageUrl(source.image, name),
      active: source.active !== false
    };
  }

  function normalizeGroup(group, index) {
    const source = group && typeof group === "object" ? group : {};
    const type = ["single", "multi", "text"].includes(source.type) ? source.type : "single";
    return {
      id: String(source.id || uid("grp")),
      name: String(source.name || "未命名分类").slice(0, 120),
      type,
      required: Boolean(source.required),
      active: source.active !== false,
      sort: toNumber(source.sort, (index + 1) * 10),
      helpText: String(source.helpText || "").slice(0, 500),
      options: Array.isArray(source.options) ? source.options.map(normalizeOption) : []
    };
  }

  function normalizeSelection(selection) {
    const source = selection && typeof selection === "object" ? selection : {};
    return {
      groupId: String(source.groupId || ""),
      groupName: String(source.groupName || "未命名分类").slice(0, 120),
      type: ["single", "multi", "text"].includes(source.type) ? source.type : "single",
      text: String(source.text || "").slice(0, 1000),
      options: Array.isArray(source.options) ? source.options.map(function (option) {
        return {
          id: String(option && option.id || ""),
          name: String(option && option.name || "未命名选项").slice(0, 120),
          price: Math.max(0, toNumber(option && option.price, 0)),
          tag: String(option && option.tag || "").slice(0, 40)
        };
      }) : []
    };
  }

  function normalizeOrder(order) {
    const source = order && typeof order === "object" ? order : {};
    const status = STATUS_ORDER.includes(source.status) ? source.status : "pending";
    const createdAt = source.createdAt || new Date().toISOString();
    const buyer = source.buyer && typeof source.buyer === "object" ? source.buyer : {};
    const pricing = source.pricing && typeof source.pricing === "object" ? source.pricing : {};
    const shipping = source.shipping && typeof source.shipping === "object" ? source.shipping : {};
    return {
      id: String(source.id || uid("order")),
      code: String(source.code || orderCode()).slice(0, 80),
      createdAt,
      updatedAt: source.updatedAt || createdAt,
      status,
      buyer: {
        name: String(buyer.name || "").slice(0, 80),
        phone: String(buyer.phone || "").slice(0, 50),
        address: String(buyer.address || "").slice(0, 400),
        deadline: String(buyer.deadline || "").slice(0, 40),
        remark: String(buyer.remark || "").slice(0, 1000)
      },
      selections: Array.isArray(source.selections) ? source.selections.map(normalizeSelection) : [],
      pricing: {
        basePrice: Math.max(0, toNumber(pricing.basePrice, 0)),
        optionExtra: Math.max(0, toNumber(pricing.optionExtra, 0)),
        unitPrice: Math.max(0, toNumber(pricing.unitPrice, 0)),
        quantity: Math.max(0, Math.round(toNumber(pricing.quantity, 0))),
        unit: String(pricing.unit || "张").slice(0, 20),
        shippingFee: Math.max(0, toNumber(pricing.shippingFee, 0)),
        total: Math.max(0, toNumber(pricing.total, 0))
      },
      shipping: {
        company: String(shipping.company || "").slice(0, 80),
        trackingNo: String(shipping.trackingNo || "").slice(0, 120)
      },
      timeline: Array.isArray(source.timeline) ? source.timeline.map(function (item) {
        return {
          status: STATUS_ORDER.includes(item && item.status) ? item.status : status,
          at: item && item.at || createdAt,
          note: String(item && item.note || "").slice(0, 240)
        };
      }) : []
    };
  }

  function normalizeData(input) {
    const fallback = defaultData();
    const source = input && typeof input === "object" ? input : fallback;
    const merchantSource = source.merchant && typeof source.merchant === "object" ? source.merchant : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: source.updatedAt || new Date().toISOString(),
      merchant: {
        shopName: String(merchantSource.shopName || fallback.merchant.shopName).slice(0, 120),
        slogan: String(merchantSource.slogan == null ? fallback.merchant.slogan : merchantSource.slogan).slice(0, 500),
        announcement: String(merchantSource.announcement == null ? fallback.merchant.announcement : merchantSource.announcement).slice(0, 1000),
        contact: String(merchantSource.contact == null ? fallback.merchant.contact : merchantSource.contact).slice(0, 160),
        address: String(merchantSource.address == null ? fallback.merchant.address : merchantSource.address).slice(0, 500),
        password: String(merchantSource.password || fallback.merchant.password).slice(0, 120),
        basePrice: Math.max(0, toNumber(merchantSource.basePrice, fallback.merchant.basePrice)),
        unit: String(merchantSource.unit || fallback.merchant.unit).slice(0, 20),
        minQty: Math.max(1, Math.round(toNumber(merchantSource.minQty, fallback.merchant.minQty))),
        leadTime: String(merchantSource.leadTime == null ? fallback.merchant.leadTime : merchantSource.leadTime).slice(0, 120),
        shippingFee: Math.max(0, toNumber(merchantSource.shippingFee, fallback.merchant.shippingFee)),
        coverImage: safeImageUrl(merchantSource.coverImage, "复合纸样")
      },
      groups: Array.isArray(source.groups) ? source.groups.map(normalizeGroup) : fallback.groups.map(normalizeGroup),
      orders: Array.isArray(source.orders) ? source.orders.map(normalizeOrder) : []
    };
  }

  function readRawStorage() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return { raw: current, legacy: false };
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return { raw: legacy, legacy: true };
      }
    } catch (error) {
      return { raw: "", error };
    }
    return { raw: "" };
  }

  function load() {
    const stored = readRawStorage();
    if (stored.raw) {
      try {
        const normalized = normalizeData(JSON.parse(stored.raw));
        volatileData = deepClone(normalized);
        if (stored.legacy) save(normalized);
        return normalized;
      } catch (error) {
        console.warn("本地数据解析失败，已恢复默认演示数据。", error);
      }
    }
    if (volatileData) return deepClone(volatileData);
    const seeded = normalizeData(defaultData());
    const result = save(seeded);
    return result.ok ? result.data : seeded;
  }

  function save(input) {
    const normalized = normalizeData(input);
    normalized.updatedAt = new Date().toISOString();
    const previousVolatile = volatileData ? deepClone(volatileData) : null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      volatileData = deepClone(normalized);
      return { ok: true, data: deepClone(normalized) };
    } catch (error) {
      console.error("本地数据保存失败。", error);
      if (!previousVolatile) volatileData = deepClone(normalized);
      else volatileData = previousVolatile;
      return { ok: false, data: deepClone(normalized), error };
    }
  }

  function reset() {
    const result = save(defaultData());
    return result.ok ? result.data : load();
  }

  function importData(text) {
    const parsed = JSON.parse(text);
    const result = save(parsed);
    if (!result.ok) throw result.error;
    return result.data;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(toNumber(value, 0));
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function formatDate(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function statusText(status) {
    return STATUS_LABELS[status] || "未知状态";
  }

  function selectedText(selection) {
    if (!selection) return "未选择";
    if (selection.type === "text") return selection.text || "未填写";
    const names = (selection.options || []).map(function (item) { return item.name; }).filter(Boolean);
    return names.length ? names.join("、") : "未选择";
  }

  function orderPlainText(order) {
    const lines = [
      `订单号：${order.code}`,
      `状态：${statusText(order.status)}`,
      `下单时间：${formatDate(order.createdAt)}`,
      `收货人：${order.buyer.name}`,
      `联系电话：${order.buyer.phone}`,
      `收货地址：${order.buyer.address}`
    ];
    if (order.buyer.deadline) lines.push(`期望交付：${order.buyer.deadline}`);
    lines.push("定制内容：");
    (order.selections || []).forEach(function (selection) { lines.push(`- ${selection.groupName}：${selectedText(selection)}`); });
    lines.push(`数量：${order.pricing.quantity || 0}${order.pricing.unit || ""}`);
    lines.push(`预计合计：${formatMoney(order.pricing.total || 0)}`);
    if (order.buyer.remark) lines.push(`备注：${order.buyer.remark}`);
    if (order.shipping && (order.shipping.company || order.shipping.trackingNo)) lines.push(`快递：${order.shipping.company || "–"} ${order.shipping.trackingNo || ""}`.trim());
    return lines.join("\n");
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(String(text));
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = String(text);
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("复制失败");
  }

  function storageSize(data) {
    try { return new Blob([JSON.stringify(data)]).size; } catch (error) { return 0; }
  }

  window.PaperStudio = {
    STORAGE_KEY,
    LEGACY_KEYS,
    AUTH_KEY,
    SCHEMA_VERSION,
    STATUS_LABELS,
    STATUS_ORDER,
    uid,
    orderCode,
    svgThumb,
    safeImageUrl,
    defaultData,
    deepClone,
    normalizeData,
    load,
    save,
    reset,
    importData,
    formatMoney,
    escapeHTML,
    formatDate,
    statusText,
    selectedText,
    orderPlainText,
    download,
    copyText,
    storageSize
  };
})(window);
