import { t } from "./i18n";

type DialogKind = "alert" | "confirm";

export type DialogOptions = {
  okText?: string;
  cancelText?: string;
  danger?: boolean;
};

function ensureStage(): HTMLDivElement {
  let stage = document.getElementById("app-dialog-stage") as HTMLDivElement | null;
  if (stage) return stage;
  stage = document.createElement("div");
  stage.id = "app-dialog-stage";
  document.body.appendChild(stage);
  return stage;
}

function openDialog(
  kind: DialogKind,
  message: string,
  opts: DialogOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const stage = ensureStage();

    const backdrop = document.createElement("div");
    backdrop.className = "app-dlg-backdrop";

    const dlg = document.createElement("div");
    dlg.className = "app-dlg";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");

    const body = document.createElement("div");
    body.className = "app-dlg-body";
    body.id = "app-dlg-body-" + Math.random().toString(36).slice(2, 9);
    body.textContent = message;
    dlg.setAttribute("aria-describedby", body.id);

    const actions = document.createElement("div");
    actions.className = "app-dlg-actions";

    let cancelBtn: HTMLButtonElement | null = null;
    if (kind === "confirm") {
      cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn";
      cancelBtn.textContent = opts.cancelText ?? t("dialogCancel");
      actions.appendChild(cancelBtn);
    }

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = opts.danger ? "btn danger" : "btn primary";
    okBtn.textContent = opts.okText ?? t("dialogOk");
    actions.appendChild(okBtn);

    dlg.appendChild(body);
    dlg.appendChild(actions);
    backdrop.appendChild(dlg);
    stage.appendChild(backdrop);

    const prevFocus = document.activeElement as HTMLElement | null;
    okBtn.focus();

    function close(result: boolean) {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
      resolve(result);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    }

    okBtn.addEventListener("click", () => close(true));
    cancelBtn?.addEventListener("click", () => close(false));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey);
  });
}

export async function showAlert(message: string, opts: DialogOptions = {}): Promise<void> {
  await openDialog("alert", message, opts);
}

export function showConfirm(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return openDialog("confirm", message, opts);
}
