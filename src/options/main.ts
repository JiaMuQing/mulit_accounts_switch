import extensionLogo from "../../icons/icon128.png?url";
import { applyDataI18n, getActivePackLocale, setDocumentLang, syncI18nLocale, t } from "../lib/i18n";
import { WEBSITE_URL } from "../lib/site";
import { bg } from "../lib/messages";
import { FREE_MAX_PROFILES, isPro } from "../lib/limits";
import { loadStorage, saveStorage } from "../lib/storage";
import type { ExtensionStorage, Profile, ProfileGroup, UiLanguagePreference } from "../lib/types";
import { sortProfilesByGroupOrder, sortedUserGroups } from "../lib/groupsUi";
import {
  ensureOriginPermission,
  ensureOriginPermissionFromGesture,
  originToPattern,
} from "../lib/permissions";
import {
  apiRequestJson,
  getApiBase,
  getExtensionProductKey,
} from "../lib/accountApi";
import { showAlert, showConfirm } from "../lib/dialog";

const el = (id: string) => document.getElementById(id)!;

/** 站点列表筛选用的最新数据（在 refresh 中更新） */
let cachedProfiles: Profile[] = [];
let cachedGroups: ProfileGroup[] = [];

const FILTER_UNGROUPED = "__none__";

let bulkSelecting = false;
const bulkSelected = new Set<string>();

function updateBulkRowVisibility(pro: boolean) {
  const row = el("sites-bulk-row");
  if (!pro) {
    row.classList.add("hidden");
    exitBulkMode();
    return;
  }
  row.classList.remove("hidden");
  el("btn-bulk-enter").classList.toggle("hidden", bulkSelecting);
  el("bulk-actions").classList.toggle("hidden", !bulkSelecting);
  el("bulk-selection-count").classList.toggle("hidden", !bulkSelecting);
  if (bulkSelecting) {
    el("bulk-selection-count").textContent = t("bulkSelectionCount", [String(bulkSelected.size)]);
    (el("btn-bulk-delete") as HTMLButtonElement).textContent = t("bulkDeleteSelected", [
      String(bulkSelected.size),
    ]);
    (el("btn-bulk-delete") as HTMLButtonElement).disabled = bulkSelected.size === 0;
  }
  row.classList.toggle("selecting", bulkSelecting);
}

function enterBulkMode() {
  bulkSelecting = true;
  bulkSelected.clear();
}

function exitBulkMode() {
  bulkSelecting = false;
  bulkSelected.clear();
}

const PANEL_IDS = ["sites", "groups", "settings", "license"] as const;
type PanelId = (typeof PANEL_IDS)[number];

function isPanelId(s: string | null): s is PanelId {
  return s !== null && (PANEL_IDS as readonly string[]).includes(s);
}

function showPanel(id: PanelId) {
  for (const k of PANEL_IDS) {
    el(`panel-${k}`).classList.toggle("panel-active", k === id);
    document.querySelectorAll<HTMLButtonElement>(`.nav-btn[data-panel="${k}"]`).forEach((b) => {
      b.classList.toggle("active", k === id);
    });
  }
}

function updateTopBar(pro: boolean) {
  const freeBtn = el("topbar-tier-free");
  const proLabel = el("topbar-tier-pro");
  if (pro) {
    freeBtn.classList.add("hidden");
    proLabel.classList.remove("hidden");
  } else {
    freeBtn.classList.remove("hidden");
    proLabel.classList.add("hidden");
  }
}

type EntitlementApiData = {
  has_entitlement: boolean;
  is_pro: boolean;
  expires_at: number | null;
  device_bound: boolean;
  device_limit_reached: boolean;
};

function updateLicenseStatusText(s: ExtensionStorage, pro: boolean) {
  const lic = el("license-status");
  if (s.entitlement.fetchedAt != null) {
    if (s.entitlement.isPro) {
      if (s.entitlement.expiresAt != null) {
        lic.textContent = t("licenseStatusPro", [
          new Date(s.entitlement.expiresAt * 1000).toLocaleString(),
        ]);
      } else {
        lic.textContent = t("entitlementProPerpetual");
      }
    } else if (s.entitlement.hasEntitlement && s.entitlement.deviceLimitReached) {
      lic.textContent = t("entitlementDeviceLimit");
    } else if (s.entitlement.hasEntitlement && !s.entitlement.deviceBound) {
      lic.textContent = t("entitlementNeedBind");
    } else {
      lic.textContent = t("licenseStatusFree");
    }
    return;
  }
  if (pro && s.license.validUntil) {
    lic.textContent = t("licenseStatusPro", [new Date(s.license.validUntil).toLocaleString()]);
  } else if (pro) {
    lic.textContent = t("entitlementProPerpetual");
  } else {
    lic.textContent = t("licenseStatusFree");
  }
}

function renderAccountChrome(s: ExtensionStorage) {
  const warn = document.getElementById("account-api-warning");
  const guest = document.getElementById("account-guest");
  const user = document.getElementById("account-user");
  if (!warn || !guest || !user) {
    return;
  }

  const base = getApiBase();
  const pk = getExtensionProductKey();
  if (!base || !pk) {
    warn.classList.remove("hidden");
    warn.textContent = t("accountEnvMissing");
    guest.classList.add("hidden");
    user.classList.add("hidden");
    return;
  }

  warn.classList.add("hidden");
  if (s.account.accessToken && s.account.email) {
    guest.classList.add("hidden");
    user.classList.remove("hidden");
    const em = document.getElementById("account-signed-email");
    if (em) {
      em.textContent = s.account.email;
    }

    const hasEntitlement = s.entitlement.hasEntitlement === true;
    const deviceBound = s.entitlement.deviceBound === true;
    const deviceLimitReached = s.entitlement.deviceLimitReached === true;

    el("order-section").classList.toggle("hidden", hasEntitlement);
    const showBind = hasEntitlement && !deviceBound && !deviceLimitReached;
    el("bind-section").classList.toggle("hidden", !showBind);

    void refreshDevicesList();
  } else {
    user.classList.add("hidden");
    guest.classList.remove("hidden");
    el("devices-section").classList.add("hidden");
  }
}

async function pullEntitlementFromApi(): Promise<void> {
  const s0 = await loadStorage();
  const token = s0.account.accessToken;
  if (!token) {
    return;
  }
  const pk = getExtensionProductKey();
  if (!pk) {
    return;
  }
  const path = `/api/v1/me/extension-entitlement?device_id=${encodeURIComponent(s0.deviceId)}&product_key=${encodeURIComponent(pk)}`;
  const d = await apiRequestJson<EntitlementApiData>(path, {
    method: "GET",
    accessToken: token,
  });
  const s = await loadStorage();
  await saveStorage({
    ...s,
    entitlement: {
      hasEntitlement: d.has_entitlement,
      isPro: d.is_pro,
      expiresAt: d.expires_at,
      deviceBound: d.device_bound,
      deviceLimitReached: d.device_limit_reached,
      fetchedAt: Date.now(),
    },
    license: {
      ...s.license,
      tier: d.is_pro ? "pro" : "free",
      validUntil:
        d.is_pro && d.expires_at != null ? new Date(d.expires_at * 1000).toISOString() : null,
    },
  });
}

async function autoBindCurrentDeviceIfNeeded(): Promise<boolean> {
  const s = await loadStorage();
  const token = s.account.accessToken;
  if (!token) return false;
  if (!s.entitlement.hasEntitlement) return false;
  if (s.entitlement.deviceBound) return false;
  if (s.entitlement.deviceLimitReached) return false;
  const pk = getExtensionProductKey();
  if (!pk) return false;
  try {
    await apiRequestJson("/api/v1/me/device-bind", {
      method: "POST",
      accessToken: token,
      body: JSON.stringify({ device_id: s.deviceId, product_key: pk }),
    });
    return true;
  } catch (e) {
    console.warn("auto-bind failed", e);
    return false;
  }
}

type DeviceItem = {
  id: number;
  entitlement_id: number;
  device_id: string;
  bound_at: number;
};

function formatBoundAt(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function refreshDevicesList(): Promise<void> {
  const section = el("devices-section");
  const list = el("bound-devices-list");
  const cur = el("current-device-id");
  const s = await loadStorage();
  const token = s.account.accessToken;
  if (!token || !s.entitlement.hasEntitlement) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  cur.textContent = t("accountCurrentDeviceId", [s.deviceId]);
  list.innerHTML = "";
  try {
    const d = await apiRequestJson<{ items: DeviceItem[] }>("/api/v1/me/devices", {
      method: "GET",
      accessToken: token,
    });
    if (!d.items.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = t("accountDevicesEmpty");
      list.appendChild(li);
      return;
    }
    for (const it of d.items) {
      const li = document.createElement("li");
      if (it.device_id === s.deviceId) li.classList.add("current");
      const head = document.createElement("div");
      head.className = "device-id";
      head.textContent = it.device_id;
      if (it.device_id === s.deviceId) {
        const tag = document.createElement("span");
        tag.className = "badge device-current-tag";
        tag.textContent = t("accountDeviceCurrent");
        head.appendChild(tag);
      }
      const meta = document.createElement("div");
      meta.className = "device-meta";
      meta.textContent = t("accountDeviceBoundAt", [formatBoundAt(it.bound_at)]);
      li.appendChild(head);
      li.appendChild(meta);
      list.appendChild(li);
    }
  } catch (e) {
    console.warn("refreshDevicesList failed", e);
    section.classList.add("hidden");
  }
}

let currentPollSeq = 0;

/** 下单成功后自动轮询订单状态；paid 命中自动绑设备+刷权益+弹成功，超时恢复手动查询按钮 */
async function autoPollOrderPaid(orderId: number, token: string): Promise<void> {
  const mySeq = ++currentPollSeq;
  const pollBtn = document.getElementById("btn-poll-order");
  if (pollBtn) pollBtn.classList.add("hidden");
  const maxAttempts = 90; // 2s × 90 = 180s
  const maxConsecutiveErrors = 5; // 连续网络失败上限，超过就短路
  let consecutiveErrors = 0;
  try {
    for (let i = 0; i < maxAttempts; i++) {
      if (mySeq !== currentPollSeq) return;
      try {
        const d = await apiRequestJson<{ order: { status: string } }>(
          `/api/v1/orders/${orderId}`,
          { method: "GET", accessToken: token },
        );
        if (mySeq !== currentPollSeq) return;
        consecutiveErrors = 0;
        if (d.order.status === "paid") {
          await pullEntitlementFromApi();
          const autoBound = await autoBindCurrentDeviceIfNeeded();
          if (autoBound) await pullEntitlementFromApi();
          await refresh();
          await showAlert(t("accountPaymentConfirmed"));
          return;
        }
        if (d.order.status === "closed") {
          await showAlert(t("orderStatusClosed"));
          return;
        }
      } catch (e) {
        console.warn("autoPollOrderPaid request failed", e);
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          break;
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }
    if (pollBtn && mySeq === currentPollSeq) pollBtn.classList.remove("hidden");
    await showAlert(t("accountPollTimeout"));
  } catch (e) {
    console.warn("autoPollOrderPaid fatal", e);
    if (pollBtn && mySeq === currentPollSeq) pollBtn.classList.remove("hidden");
  }
}

async function pollCurrentOrderPaid(): Promise<void> {
  const s = await loadStorage();
  const token = s.account.accessToken;
  const idRaw = el("order-pending-id").textContent?.trim() ?? "";
  if (!token || !idRaw) {
    return;
  }
  const orderId = parseInt(idRaw, 10);
  if (!orderId) {
    return;
  }
  const maxAttempts = 45;
  for (let i = 0; i < maxAttempts; i++) {
    const d = await apiRequestJson<{ order: { status: string } }>(`/api/v1/orders/${orderId}`, {
      method: "GET",
      accessToken: token,
    });
    if (d.order.status === "paid") {
      await showAlert(t("accountPaymentConfirmed"));
      await pullEntitlementFromApi();
      const autoBound = await autoBindCurrentDeviceIfNeeded();
      if (autoBound) {
        await pullEntitlementFromApi();
      }
      await refresh();
      if (autoBound) {
        await showAlert(t("accountAutoBoundHint"));
      }
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
  await showAlert(t("accountPollTimeout"));
}

async function refresh() {
  const s = await loadStorage();
  const pro = isPro(s);

  updateTopBar(pro);

  updateLicenseStatusText(s, pro);
  renderAccountChrome(s);

  el("group-limit").textContent = pro ? t("unlimited") : String(s.groups.length);
  el("profile-limit").textContent = pro ? t("unlimited") : `${s.profiles.length}/${FREE_MAX_PROFILES}`;

  const addGroupBtn = el("btn-add-group") as HTMLButtonElement;
  addGroupBtn.disabled = false;
  (el("new-group-name") as HTMLInputElement).disabled = false;

  const gList = el("group-list");
  gList.innerHTML = "";
  for (const g of sortedUserGroups(s.groups)) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "group-name";
    span.textContent = g.name;
    const actions = document.createElement("div");
    actions.className = "group-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "btn btn-sm";
    renameBtn.textContent = t("renameGroup");
    renameBtn.addEventListener("click", async () => {
      const next = prompt(t("renameGroupPrompt", [g.name]), g.name);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === g.name) return;
      const cur = await loadStorage();
      const groups = cur.groups.map((x) => (x.id === g.id ? { ...x, name: trimmed } : x));
      await saveStorage({ ...cur, groups });
      await refresh();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-sm btn-del-group";
    delBtn.dataset.id = g.id;
    delBtn.textContent = t("delete");
    delBtn.addEventListener("click", async () => {
      if (!(await showConfirm(t("confirmDeleteGroup", [g.name]), { danger: true }))) return;
      const cur = await loadStorage();
      const groups = cur.groups.filter((x) => x.id !== g.id);
      const profiles = cur.profiles.map((p) => (p.groupId === g.id ? { ...p, groupId: null } : p));
      await saveStorage({ ...cur, groups, profiles });
      await refresh();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    li.appendChild(span);
    li.appendChild(actions);
    gList.appendChild(li);
  }

  const granted = el("granted-list");
  granted.innerHTML = "";
  if (!s.grantedOrigins.length) {
    const li = document.createElement("li");
    li.textContent = t("noneGranted");
    granted.appendChild(li);
  } else {
    for (const o of s.grantedOrigins) {
      const li = document.createElement("li");
      li.textContent = o;
      granted.appendChild(li);
    }
  }

  cachedProfiles = s.profiles;
  cachedGroups = s.groups;
  updateSitesFilterDropdown(s.groups);
  updateBulkRowVisibility(pro);
  renderProfiles(cachedProfiles, cachedGroups);
}

function updateSitesFilterDropdown(groups: ProfileGroup[]) {
  const sel = el("sites-filter-group") as HTMLSelectElement;
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t("filterGroupAll");
  sel.appendChild(all);
  const ung = document.createElement("option");
  ung.value = FILTER_UNGROUPED;
  ung.textContent = t("ungrouped");
  sel.appendChild(ung);
  for (const g of sortedUserGroups(groups)) {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  }
  const ok = prev && Array.from(sel.options).some((o) => o.value === prev);
  sel.value = ok ? prev : "";
}

function renderProfiles(profiles: Profile[], groups: ProfileGroup[]) {
  const wrap = el("profiles-wrap");
  wrap.innerHTML = "";

  const qRaw = (el("sites-filter-q") as HTMLInputElement).value.trim().toLowerCase();
  const gFilter = (el("sites-filter-group") as HTMLSelectElement).value;

  let list = profiles;
  if (gFilter === FILTER_UNGROUPED) {
    list = list.filter((p) => !p.groupId);
  } else if (gFilter) {
    list = list.filter((p) => p.groupId === gFilter);
  }
  if (qRaw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(qRaw) ||
        p.hostname.toLowerCase().includes(qRaw) ||
        p.url.toLowerCase().includes(qRaw),
    );
  }

  if (!list.length) {
    wrap.textContent = profiles.length ? t("sitesFilterNoMatch") : t("profileEmpty");
    return;
  }
  const sorted = sortProfilesByGroupOrder(list, groups);
  for (const p of sorted) {
    wrap.appendChild(profileEditor(p, groups));
  }
}

function profileEditor(p: Profile, groups: ProfileGroup[]): HTMLElement {
  const div = document.createElement("div");
  div.className = "profile-row";
  if (bulkSelecting) {
    div.classList.add("selectable");
    if (bulkSelected.has(p.id)) div.classList.add("selected");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "pf-select";
    cb.checked = bulkSelected.has(p.id);
    const toggle = () => {
      if (cb.checked) bulkSelected.add(p.id);
      else bulkSelected.delete(p.id);
      div.classList.toggle("selected", cb.checked);
      updateBulkRowVisibility(true);
    };
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", toggle);
    div.addEventListener("click", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      cb.checked = !cb.checked;
      toggle();
    });
    div.appendChild(cb);
  }

  const nameLabel = document.createElement("label");
  nameLabel.textContent = t("fieldName");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "pf-name";
  nameInput.value = p.name;
  nameLabel.appendChild(nameInput);

  const urlLabel = document.createElement("label");
  urlLabel.textContent = t("fieldEntryUrl");
  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "pf-url";
  urlInput.value = p.url;
  urlLabel.appendChild(urlInput);

  const groupLabel = document.createElement("label");
  groupLabel.textContent = t("fieldGroup");
  const sel = document.createElement("select");
  sel.className = "pf-group";
  const sorted = sortedUserGroups(groups);
  for (const g of sorted) {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  }
  const optUngrouped = document.createElement("option");
  optUngrouped.value = "";
  optUngrouped.textContent = t("ungrouped");
  sel.appendChild(optUngrouped);
  if (p.groupId && sorted.some((g) => g.id === p.groupId)) {
    sel.value = p.groupId;
  } else {
    sel.value = "";
  }
  groupLabel.appendChild(sel);

  const actions = document.createElement("div");
  actions.className = "profile-actions";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "btn profile-action-btn";
  switchBtn.textContent = t("switchBtn");
  switchBtn.addEventListener("click", () => {
    ensureOriginPermissionFromGesture(p.url, (granted) => {
      if (!granted) {
        void showAlert(t("errHostDeniedSwitch"));
        return;
      }
      void (async () => {
        try {
          await bg.switchProfile(p.id);
        } catch (e) {
          await showAlert(e instanceof Error ? e.message : String(e));
        }
      })();
    });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn danger profile-action-btn";
  deleteBtn.textContent = t("deleteBtn");
  deleteBtn.addEventListener("click", () => {
    void (async () => {
      if (!(await showConfirm(t("confirmDeleteProfile", [p.name]), { danger: true }))) return;
      try {
        await bg.deleteProfile(p.id);
        await refresh();
      } catch (e) {
        await showAlert(e instanceof Error ? e.message : String(e));
      }
    })();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn primary profile-action-btn pf-save";
  saveBtn.textContent = t("saveChanges");
  actions.appendChild(switchBtn);
  actions.appendChild(deleteBtn);
  actions.appendChild(saveBtn);

  div.appendChild(nameLabel);
  div.appendChild(urlLabel);
  div.appendChild(groupLabel);
  div.appendChild(actions);
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim() || p.name;
    let urlStr = urlInput.value.trim();
    try {
      const u = new URL(urlStr);
      urlStr = u.href;
    } catch {
      await showAlert(t("invalidUrl"));
      return;
    }
    const gid = sel.value || null;
    const granted = await ensureOriginPermission(urlStr);
    if (!granted) {
      await showAlert(t("hostPermissionDenied"));
      return;
    }
    const cur = await loadStorage();
    const hostname = new URL(urlStr).hostname;
    const profiles = cur.profiles.map((x) =>
      x.id === p.id
        ? {
            ...x,
            name,
            url: urlStr,
            hostname,
            groupId: gid,
            updatedAt: Date.now(),
          }
        : x
    );
    const origin = originToPattern(new URL(urlStr).origin);
    const grantedOrigins = cur.grantedOrigins.includes(origin)
      ? cur.grantedOrigins
      : [...cur.grantedOrigins, origin];
    await saveStorage({ ...cur, profiles, grantedOrigins });
    await refresh();
  });
  return div;
}

function init() {
  setDocumentLang();
  document.title = t("optionsTitle");
  applyDataI18n();
  el("options-nav").setAttribute("aria-label", t("navAriaOptions"));
  const logo = document.getElementById("options-logo") as HTMLImageElement | null;
  if (logo) {
    logo.src = extensionLogo;
    logo.alt = t("pageTitle");
  }
  const site = document.getElementById("open-website") as HTMLAnchorElement | null;
  if (site) site.href = WEBSITE_URL;
}

function populateLanguageSelect(current: UiLanguagePreference) {
  const sel = el("ui-language") as HTMLSelectElement;
  const opts: { v: UiLanguagePreference; k: string }[] = [
    { v: "auto", k: "langAuto" },
    { v: "en", k: "langEnglish" },
    { v: "zh_CN", k: "langZhCn" },
  ];
  sel.innerHTML = "";
  for (const o of opts) {
    const op = document.createElement("option");
    op.value = o.v;
    op.textContent = t(o.k);
    sel.appendChild(op);
  }
  sel.value = current;
}

async function start() {
  await syncI18nLocale();
  init();

  try {
    el("ext-version").textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    el("ext-version").textContent = "";
  }

  showPanel("sites");
  const panelFlag = await chrome.storage.local.get("openOptionsPanel");
  if (panelFlag.openOptionsPanel === "license") {
    await chrome.storage.local.remove("openOptionsPanel");
    showPanel("license");
  }

  el("sites-filter-q").addEventListener("input", () => {
    renderProfiles(cachedProfiles, cachedGroups);
  });
  el("sites-filter-group").addEventListener("change", () => {
    renderProfiles(cachedProfiles, cachedGroups);
  });

  el("btn-bulk-enter").addEventListener("click", async () => {
    if (!isPro(await loadStorage())) return;
    enterBulkMode();
    updateBulkRowVisibility(true);
    renderProfiles(cachedProfiles, cachedGroups);
  });
  el("btn-bulk-cancel").addEventListener("click", async () => {
    exitBulkMode();
    updateBulkRowVisibility(isPro(await loadStorage()));
    renderProfiles(cachedProfiles, cachedGroups);
  });
  el("btn-bulk-delete").addEventListener("click", async () => {
    if (!isPro(await loadStorage())) return;
    if (bulkSelected.size === 0) return;
    const ok = await showConfirm(
      t("confirmBulkDeleteProfiles", [String(bulkSelected.size)]),
      { danger: true },
    );
    if (!ok) return;
    const ids = [...bulkSelected];
    let done = 0;
    const errs: string[] = [];
    for (const id of ids) {
      try {
        await bg.deleteProfile(id);
        done++;
      } catch (e) {
        errs.push(e instanceof Error ? e.message : String(e));
      }
    }
    exitBulkMode();
    await refresh();
    if (errs.length) {
      await showAlert(`${t("bulkDeleteDone", [String(done)])}\n${errs.join("\n")}`);
    } else {
      await showAlert(t("bulkDeleteDone", [String(done)]));
    }
  });

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-panel");
      if (!isPanelId(p)) return;
      if (bulkSelecting && p !== "sites") {
        exitBulkMode();
        void refresh();
      }
      showPanel(p);
    });
  });

  el("topbar-tier-free").addEventListener("click", () => showPanel("license"));

  const s0 = await loadStorage();
  populateLanguageSelect(s0.uiLanguage);
  void loadPayChannels();

  el("ui-language").addEventListener("change", async () => {
    const sel = el("ui-language") as HTMLSelectElement;
    const cur = await loadStorage();
    const v = sel.value as UiLanguagePreference;
    if (v !== "auto" && v !== "en" && v !== "zh_CN") return;
    await saveStorage({ ...cur, uiLanguage: v });
    await syncI18nLocale();
    setDocumentLang();
    document.title = t("optionsTitle");
    applyDataI18n();
    el("options-nav").setAttribute("aria-label", t("navAriaOptions"));
    const logoEl = document.getElementById("options-logo") as HTMLImageElement | null;
    if (logoEl) logoEl.alt = t("pageTitle");
    populateLanguageSelect(v);
    renderChannelSelect();
    if (lastOrderItems) {
      renderOrderHistory(lastOrderItems, cur.account.email || "");
    }
    await refresh();
  });

  el("btn-add-group").addEventListener("click", async () => {
    const name = (el("new-group-name") as HTMLInputElement).value.trim();
    if (!name) return;
    const cur = await loadStorage();
    const g: ProfileGroup = {
      id: crypto.randomUUID(),
      name,
      order: cur.groups.length,
    };
    await saveStorage({ ...cur, groups: [...cur.groups, g] });
    (el("new-group-name") as HTMLInputElement).value = "";
    await refresh();
  });

  el("btn-account-login").addEventListener("click", async () => {
    const email = (el("account-email") as HTMLInputElement).value.trim();
    const password = (el("account-password") as HTMLInputElement).value;
    if (!email || !password) {
      return;
    }
    try {
      const d = await apiRequestJson<{
        user: { id: number; email: string };
        access_token?: string;
      }>("/api/v1/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!d.access_token) {
        throw new Error(
          "No access_token returned. Set EXTENSION_API_JWT_SECRET on the server and restart.",
        );
      }
      const cur = await loadStorage();
      await saveStorage({
        ...cur,
        account: { accessToken: d.access_token, email: d.user.email },
      });
      await pullEntitlementFromApi();
      await refresh();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  el("btn-account-register").addEventListener("click", async () => {
    const email = (el("account-email") as HTMLInputElement).value.trim();
    const password = (el("account-password") as HTMLInputElement).value;
    if (!email || !password) {
      return;
    }
    try {
      const d = await apiRequestJson<{
        user: { id: number; email: string };
        access_token?: string;
      }>("/api/v1/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!d.access_token) {
        throw new Error(
          "No access_token returned. Set EXTENSION_API_JWT_SECRET on the server and restart.",
        );
      }
      const cur = await loadStorage();
      await saveStorage({
        ...cur,
        account: { accessToken: d.access_token, email: d.user.email },
      });
      await pullEntitlementFromApi();
      await refresh();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  let pendingAlipayFormHtml: string | null = null;

  el("btn-account-logout").addEventListener("click", async () => {
    // 登出前废弃任何进行中的轮询，避免 paid 命中时弹出莫名其妙的成功提示
    currentPollSeq++;
    await bg.clearLicense();
    el("order-pending").classList.add("hidden");
    el("order-pending-id").textContent = "";
    (el("order-code-url") as HTMLTextAreaElement).value = "";
    el("order-pay-jump-row").classList.add("hidden");
    pendingAlipayFormHtml = null;
    for (const k of [
      "order-summary-platform",
      "order-summary-account",
      "order-summary-product",
      "order-summary-amount",
      "order-summary-created-at",
    ]) {
      el(k).textContent = "—";
    }
    await refresh();
  });

  el("btn-refresh-entitlement").addEventListener("click", async () => {
    try {
      await pullEntitlementFromApi();
      await refresh();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  el("btn-place-order").addEventListener("click", async () => {
    const cur = await loadStorage();
    const token = cur.account.accessToken;
    if (!token) {
      return;
    }
    const pk = getExtensionProductKey();
    const channel = (el("account-order-channel") as HTMLSelectElement).value;
    if (!channel) {
      await showAlert(t("accountChannelLoading"));
      return;
    }
    const btnPlace = el("btn-place-order") as HTMLButtonElement;
    btnPlace.disabled = true;
    try {
      const d = await apiRequestJson<{
        order: {
          id: number;
          code_url: string | null;
          channel: string;
          amount_cent: number;
          currency: string;
          product_key: string | null;
          product_name: string | null;
          created_at: number;
          ext_info?: { alipay_page_pay?: { form_html?: string | null } | null } | null;
        };
      }>(
        "/api/v1/orders",
        {
          method: "POST",
          accessToken: token,
          body: JSON.stringify({ product_key: pk, channel }),
        },
      );
      const o = d.order;
      el("order-pending-id").textContent = String(o.id);
      const codeUrl = o.code_url ?? "";
      const aliFormHtml = o.ext_info?.alipay_page_pay?.form_html ?? "";
      const mode = channelMode(o.channel);
      const ta = el("order-code-url") as HTMLTextAreaElement;
      const jumpRow = el("order-pay-jump-row") as HTMLDivElement;
      const payHint = el("order-pay-hint");
      pendingAlipayFormHtml = mode === "redirect" ? aliFormHtml || null : null;

      if (mode === "redirect" && aliFormHtml) {
        // 跳转式（支付宝电脑网站支付）：直接打开新 tab 自动提交到支付宝
        ta.value = "";
        ta.classList.add("hidden");
        const opened = openRedirectForm(aliFormHtml);
        if (opened) {
          // 打开成功：按钮作为"弹窗被关掉重来"的兜底，保持可见
          jumpRow.classList.remove("hidden");
          payHint.setAttribute("data-i18n", "accountPayWaitingHint");
          payHint.textContent = t("accountPayWaitingHint");
        } else {
          // 弹窗被拦：必须让用户手动点按钮
          jumpRow.classList.remove("hidden");
          payHint.setAttribute("data-i18n", "accountAlipayPageHint");
          payHint.textContent = t("accountAlipayPageHint");
        }
      } else if (mode === "test") {
        // 线下支付：等待 Admin 手动置 paid，自动轮询一样启动
        ta.value = "";
        ta.classList.add("hidden");
        jumpRow.classList.add("hidden");
        payHint.setAttribute("data-i18n", "accountOfflinePayHint");
        payHint.textContent = t("accountOfflinePayHint");
      } else {
        // 扫码式（默认）：微信 Native / 支付宝当面付等，展示 code_url 供用户扫码
        ta.value = codeUrl;
        ta.classList.remove("hidden");
        jumpRow.classList.add("hidden");
        payHint.setAttribute("data-i18n", "accountPayQrHint");
        payHint.textContent = t("accountPayQrHint");
      }

      el("order-summary-platform").textContent = channelLabel(o.channel);
      el("order-summary-account").textContent = cur.account.email || "—";
      el("order-summary-product").textContent = o.product_name || o.product_key || "—";
      el("order-summary-amount").textContent = `${(o.amount_cent / 100).toFixed(2)} ${o.currency}`;
      el("order-summary-created-at").textContent = o.created_at
        ? new Date(o.created_at * 1000).toLocaleString()
        : "—";
      el("order-pending").classList.remove("hidden");

      // 所有 mode 统一启动自动轮询；paid 命中自动发放权益、弹成功
      void autoPollOrderPaid(o.id, token);
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    } finally {
      btnPlace.disabled = false;
    }
  });

  /**
   * 打开新 tab 并自动 submit 支付 form（支付宝电脑网站支付等 redirect 模式）
   * - 返回 true：新 tab 成功打开并触发 submit
   * - 返回 false：被浏览器弹窗拦截
   * Chrome 禁止顶级 data: 导航；开空白 tab 再 document.write 塞入 form HTML；
   * inline <script> 在扩展 CSP 下不执行，由 opener 主动触发 form.submit。
   */
  function openRedirectForm(html: string): boolean {
    const w = window.open("about:blank", "_blank");
    if (!w) return false;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      const form = w.document.forms.namedItem("alipaysubmit")
        || w.document.getElementsByTagName("form")[0];
      if (form) form.submit();
      return true;
    } catch (e) {
      console.warn("openRedirectForm failed", e);
      return false;
    }
  }

  el("btn-open-alipay").addEventListener("click", async () => {
    const html = pendingAlipayFormHtml;
    if (!html) return;
    if (!openRedirectForm(html)) {
      await showAlert(t("accountAlipayPopupBlocked"));
    }
  });

  el("btn-poll-order").addEventListener("click", async () => {
    try {
      await pollCurrentOrderPaid();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  el("btn-bind-device").addEventListener("click", async () => {
    const cur = await loadStorage();
    const token = cur.account.accessToken;
    if (!token) {
      return;
    }
    try {
      await apiRequestJson("/api/v1/me/device-bind", {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          device_id: cur.deviceId,
          product_key: getExtensionProductKey(),
        }),
      });
      await showAlert(t("accountBindOk"));
      await pullEntitlementFromApi();
      await refresh();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  type OrderRow = {
    id: number;
    status: string;
    channel: string;
    amount_cent: number;
    currency: string;
    merchant_order_no: string;
    paid_at: number | null;
    refunded_at: number | null;
    refund_amount_cent: number | null;
    created_at: number;
    product_key: string | null;
    product_name: string | null;
  };
  let lastOrderItems: OrderRow[] | null = null;

  const ORDER_STATUS_KEY: Record<string, string> = {
    pending: "orderStatusPending",
    paid: "orderStatusPaid",
    closed: "orderStatusClosed",
    refunded: "orderStatusRefunded",
  };

  type PayChannelMode = "qrcode" | "redirect" | "test";
  type PayChannelItem = {
    code: string;
    name_zh_cn: string;
    name_en: string;
    mode: PayChannelMode | string;
    enabled: boolean;
  };
  let payChannels: PayChannelItem[] = [];

  function channelLabel(channel: string | undefined | null): string {
    if (!channel) return "—";
    const found = payChannels.find((c) => c.code === channel);
    if (!found) return channel;
    return getActivePackLocale() === "zh_CN" ? found.name_zh_cn : found.name_en;
  }

  function channelMode(channel: string | undefined | null): string {
    if (!channel) return "";
    const found = payChannels.find((c) => c.code === channel);
    return found ? found.mode : "";
  }

  async function loadPayChannels(): Promise<void> {
    try {
      const d = await apiRequestJson<{ items: PayChannelItem[] }>(
        "/api/v1/pay/channels",
        { method: "GET" },
      );
      payChannels = Array.isArray(d.items) ? d.items : [];
      renderChannelSelect();
    } catch (e) {
      console.warn("loadPayChannels failed", e);
    }
  }

  function renderChannelSelect(): void {
    const sel = el("account-order-channel") as HTMLSelectElement;
    const prev = sel.value;
    sel.innerHTML = "";
    const available = payChannels.filter((c) => c.enabled);
    if (available.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = t("accountChannelUnavailable");
      sel.appendChild(o);
      return;
    }
    for (const c of available) {
      const o = document.createElement("option");
      o.value = c.code;
      o.textContent = getActivePackLocale() === "zh_CN" ? c.name_zh_cn : c.name_en;
      sel.appendChild(o);
    }
    if (prev && available.some((c) => c.code === prev)) {
      sel.value = prev;
    }
  }

  function renderOrderHistory(items: OrderRow[], accountEmail: string): void {
    const tbody = el("order-history");
    const table = el("order-history-table");
    tbody.innerHTML = "";
    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "order-history-empty";
      td.textContent = t("orderHistoryEmpty");
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      const fmtTime = (ts: number | null | undefined): string =>
        ts ? new Date(ts * 1000).toLocaleString() : t("orderPaidAtNone");
      const dash = "—";
      for (const o of items) {
        const tr = document.createElement("tr");
        const amt = (o.amount_cent / 100).toFixed(2);
        const statusKey = ORDER_STATUS_KEY[o.status];
        const statusText = statusKey ? t(statusKey) : o.status;
        const platform = channelLabel(o.channel);
        const product = o.product_name || o.product_key || dash;

        const tdPlatform = document.createElement("td");
        tdPlatform.textContent = platform;
        const tdAccount = document.createElement("td");
        tdAccount.textContent = accountEmail || dash;
        const tdProduct = document.createElement("td");
        tdProduct.textContent = product;

        const tdAmount = document.createElement("td");
        tdAmount.className = "order-amount-cell";
        const amtSpan = document.createElement("span");
        amtSpan.className = "order-amount";
        amtSpan.textContent = `${amt} ${o.currency}`;
        const statusBadge = document.createElement("span");
        statusBadge.className = `order-status-badge order-status-${o.status}`;
        statusBadge.textContent = statusText;
        tdAmount.appendChild(amtSpan);
        tdAmount.appendChild(statusBadge);

        const tdInfo = document.createElement("td");
        tdInfo.className = "order-info-cell";
        const noDiv = document.createElement("div");
        noDiv.className = "order-no";
        noDiv.textContent = o.merchant_order_no;
        tdInfo.appendChild(noDiv);

        // 按状态逐行展示相关时间：下单 / 支付（如已付）/ 退款（如已退）
        const timeLines: string[] = [];
        timeLines.push(`${t("orderTimeCreated")}: ${fmtTime(o.created_at)}`);
        if (o.paid_at) {
          timeLines.push(`${t("orderTimePaid")}: ${fmtTime(o.paid_at)}`);
        }
        if (o.refunded_at) {
          timeLines.push(`${t("orderTimeRefunded")}: ${fmtTime(o.refunded_at)}`);
        }
        for (const line of timeLines) {
          const d = document.createElement("div");
          d.className = "order-time";
          d.textContent = line;
          tdInfo.appendChild(d);
        }

        tr.appendChild(tdPlatform);
        tr.appendChild(tdAccount);
        tr.appendChild(tdProduct);
        tr.appendChild(tdAmount);
        tr.appendChild(tdInfo);
        tbody.appendChild(tr);
      }
    }
    table.classList.remove("hidden");
  }

  el("btn-load-orders").addEventListener("click", async () => {
    const cur = await loadStorage();
    const token = cur.account.accessToken;
    if (!token) {
      return;
    }
    try {
      const d = await apiRequestJson<{ items: OrderRow[] }>(
        "/api/v1/me/orders?page=1&page_size=50",
        { method: "GET", accessToken: token },
      );
      lastOrderItems = d.items;
      renderOrderHistory(d.items, cur.account.email || "");
    } catch (e) {
      lastOrderItems = null;
      const tbody = el("order-history");
      const table = el("order-history-table");
      tbody.innerHTML = "";
      table.classList.add("hidden");
      await showAlert(e instanceof Error ? e.message : String(e));
    }
  });

  el("btn-grant-all").addEventListener("click", async () => {
    const ok = await chrome.permissions.request({ origins: ["*://*/*"] });
    if (ok) {
      const cur = await loadStorage();
      const grantedOrigins = cur.grantedOrigins.includes("*://*/*")
        ? cur.grantedOrigins
        : [...cur.grantedOrigins, "*://*/*"];
      await saveStorage({ ...cur, grantedOrigins });
    }
    await refresh();
  });

  el("btn-export").addEventListener("click", async () => {
    const json = await bg.exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `account-switch-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    const msg = el("backup-msg") as HTMLParagraphElement;
    msg.className = "msg";
    msg.textContent = t("exportStarted");
  });

  el("import-file").addEventListener("change", async (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const msg = el("backup-msg") as HTMLParagraphElement;
    if (!file) return;
    try {
      const text = await file.text();
      await bg.importBackup(text);
      msg.className = "msg";
      msg.textContent = t("importCompleted");
      await refresh();
    } catch (e) {
      msg.className = "msg err";
      msg.textContent = e instanceof Error ? e.message : String(e);
    }
  });

  await refresh();
}

void start();
