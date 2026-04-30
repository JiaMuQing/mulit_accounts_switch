import extensionLogo from "../../icons/icon128.png?url";
import { applyDataI18n, setDocumentLang, syncI18nLocale, t } from "../lib/i18n";
import { bg } from "../lib/messages";
import { sortProfilesByGroupOrder, sortedUserGroups } from "../lib/groupsUi";
import { ensureOriginPermissionFromGesture, getActiveHttpTabUrlFromGesture } from "../lib/permissions";
import type { Profile, ProfileGroup } from "../lib/types";
import { showConfirm } from "../lib/dialog";

const el = (id: string) => document.getElementById(id)!;

function showError(msg: string) {
  const n = el("error") as HTMLParagraphElement;
  n.textContent = msg;
  n.className = msg ? "error" : "error hidden";
}

function showSuccess(msg: string) {
  const n = el("error") as HTMLParagraphElement;
  n.textContent = msg;
  n.className = "feedback success";
}

async function refresh() {
  showError("");
  const state = await bg.getState();
  el("popup-brand").textContent = t("popupTitle");
  const heading = el("popup-heading");
  if (state.limits.isPro) {
    heading.textContent = t("hintPro");
  } else {
    heading.textContent = t("hintFree", [
      String(state.profiles.length),
      String(state.limits.maxProfiles ?? 0),
    ]);
  }

  const sel = el("new-group") as HTMLSelectElement;
  sel.innerHTML = "";
  const orderedGroups = sortedUserGroups(state.groups);
  for (const g of orderedGroups) {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  }
  const builtinUngrouped = document.createElement("option");
  builtinUngrouped.value = "";
  builtinUngrouped.textContent = t("ungrouped");
  sel.appendChild(builtinUngrouped);
  if (orderedGroups.length > 0) {
    sel.value = orderedGroups[0]!.id;
  } else {
    sel.value = "";
  }

  const list = el("profile-list");
  list.innerHTML = "";
  const orderedProfiles = sortProfilesByGroupOrder(state.profiles, state.groups);
  const resolved = orderedProfiles.map((p) => ({
    profile: p,
    groupLabel: resolveGroupLabel(p, state.groups),
  }));

  for (const { profile: p, groupLabel } of resolved) {
    list.appendChild(renderProfile(p, groupLabel));
  }

  if (!state.profiles.length) {
    const empty = document.createElement("li");
    empty.className = "meta";
    empty.textContent = t("emptyProfiles");
    list.appendChild(empty);
  }

  const saveBtn = el("btn-save") as HTMLButtonElement;
  const upgradeBtn = el("btn-upgrade") as HTMLButtonElement;
  const saveFields = el("save-fields");
  const atLimit = !state.limits.isPro && state.profiles.length >= (state.limits.maxProfiles ?? 0);
  if (atLimit) {
    saveFields.classList.add("hidden");
    saveBtn.classList.add("hidden");
    upgradeBtn.classList.remove("hidden");
    upgradeBtn.textContent = t("btnUpgradeAccounts");
  } else {
    saveFields.classList.remove("hidden");
    saveBtn.classList.remove("hidden");
    upgradeBtn.classList.add("hidden");
    saveBtn.disabled = false;
    const nameInput = el("new-name") as HTMLInputElement;
    if (!nameInput.value.trim()) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const title = tab?.title?.trim();
        if (title) {
          nameInput.value = title.slice(0, 120);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

function resolveGroupLabel(p: Profile, groups: ProfileGroup[]): string {
  if (!p.groupId) return t("ungrouped");
  const g = groups.find((x) => x.id === p.groupId);
  return g ? g.name : t("unknownGroup");
}

function renderProfile(p: Profile, groupLabel: string): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "item";
  li.innerHTML = `
    <div class="item-top">
      <div>
        <div class="item-title"></div>
        <div class="meta"></div>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn primary btn-switch"></button>
      <button type="button" class="btn danger btn-del"></button>
    </div>
  `;
  li.querySelector(".item-title")!.textContent = p.name;
  li.querySelector(".meta")!.textContent = t("profileMeta", [
    groupLabel,
    p.hostname,
    String(p.cookies.length),
  ]);
  li.querySelector(".btn-switch")!.textContent = t("switchBtn");
  li.querySelector(".btn-del")!.textContent = t("deleteBtn");
  li.querySelector(".btn-switch")!.addEventListener("click", () => {
    showError("");
    ensureOriginPermissionFromGesture(p.url, (granted) => {
      if (!granted) {
        showError(t("errHostDeniedSwitch"));
        return;
      }
      void (async () => {
        try {
          await bg.switchProfile(p.id, true);
          window.close();
        } catch (e) {
          showError(e instanceof Error ? e.message : String(e));
        }
      })();
    });
  });
  li.querySelector(".btn-del")!.addEventListener("click", async () => {
    if (!(await showConfirm(t("confirmDeleteProfile", [p.name]), { danger: true }))) return;
    showError("");
    try {
      await bg.deleteProfile(p.id);
      await refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  });
  return li;
}

function init() {
  setDocumentLang();
  document.title = t("popupTitle");
  applyDataI18n();
  el("popup-brand").textContent = t("popupTitle");
  const logo = document.getElementById("popup-logo") as HTMLImageElement | null;
  if (logo) {
    logo.src = extensionLogo;
    logo.alt = t("popupTitle");
  }
}

async function main() {
  await syncI18nLocale();
  init();

  el("open-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  el("btn-upgrade").addEventListener("click", () => {
    void chrome.storage.local.set({ openOptionsPanel: "license" });
    chrome.runtime.openOptionsPage();
    window.close();
  });

  el("btn-save").addEventListener("click", () => {
  showError("");
  const name = (el("new-name") as HTMLInputElement).value;
  const groupId = (el("new-group") as HTMLSelectElement).value || null;
  getActiveHttpTabUrlFromGesture((url) => {
    if (!url) {
      showError(t("errNoHttpTab"));
      return;
    }
    ensureOriginPermissionFromGesture(url, (granted) => {
      if (!granted) {
        showError(t("errHostDeniedSave"));
        return;
      }
      void (async () => {
        try {
          await bg.captureCurrentTab(name, groupId);
          (el("new-name") as HTMLInputElement).value = "";
          await refresh();
        } catch (e) {
          showError(e instanceof Error ? e.message : String(e));
        }
      })();
    });
  });
  });

  el("btn-clear-site").addEventListener("click", () => {
  showError("");
  getActiveHttpTabUrlFromGesture((url) => {
    if (!url) {
      showError(t("errNoHttpTab"));
      return;
    }
    const host = new URL(url).hostname;
    ensureOriginPermissionFromGesture(url, (granted) => {
      if (!granted) {
        showError(t("errHostDeniedSave"));
        return;
      }
      void (async () => {
        if (!(await showConfirm(t("confirmClearSiteCookies", [host]), { danger: true }))) return;
        try {
          const r = await bg.clearSiteCookies(url);
          let msg = t("clearSiteCookiesDone");
          if (r.errors.length) {
            msg += " " + t("clearSiteCookiesSomeFailed", [String(r.errors.length)]);
          }
          showSuccess(msg);
        } catch (e) {
          showError(e instanceof Error ? e.message : String(e));
        }
      })();
    });
  });
  });

  void refresh();
}

void main();
