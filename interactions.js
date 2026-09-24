(function () {
  "use strict";

  const root = document.getElementById("modal-root");
  const dialog = document.getElementById("modal-dialog");
  const closeButton = document.getElementById("modal-close");
  const icon = document.getElementById("modal-icon");
  const title = document.getElementById("modal-title");
  const message = document.getElementById("modal-message");
  const extra = document.getElementById("modal-extra");
  const actions = document.getElementById("modal-actions");
  const busyOverlay = document.getElementById("busy-overlay");
  const busySpinner = document.getElementById("busy-spinner");
  const busyCheck = document.getElementById("busy-check");
  const busyText = document.getElementById("busy-text");
  const toast = document.getElementById("toast");
  let resolveModal = null;
  let previousFocus = null;
  let toastTimer = null;

  function showModal(options) {
    if (resolveModal) closeModal(null);
    previousFocus = document.activeElement;
    icon.textContent = options.icon || "";
    title.textContent = options.title || "";
    message.textContent = options.message || "";
    extra.replaceChildren();
    actions.replaceChildren();
    closeButton.hidden = options.dismissible === false;

    if (options.extra instanceof Node) extra.appendChild(options.extra);
    (options.actions || [{ label: "知道了", value: true }]).forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.className || "modal-button";
      button.textContent = action.label;
      button.addEventListener("click", () => closeModal(action.value));
      actions.appendChild(button);
    });

    root.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      const firstFocusable = dialog.querySelector("textarea, input, button:not([hidden])");
      if (firstFocusable) firstFocusable.focus();
    }, 0);

    return new Promise((resolve) => {
      resolveModal = resolve;
    });
  }

  function closeModal(value) {
    if (root.hidden) return;
    root.hidden = true;
    document.body.style.overflow = "";
    const resolver = resolveModal;
    resolveModal = null;
    if (resolver) resolver(value);
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  function showBusy(text) {
    busyText.textContent = text;
    busySpinner.hidden = false;
    busyCheck.hidden = true;
    busyOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function showBusyDone(text) {
    busyText.textContent = text;
    busySpinner.hidden = true;
    busyCheck.hidden = false;
  }

  function hideBusy() {
    busyOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  function showToast(text, duration) {
    window.clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, duration || 2200);
  }

  closeButton.addEventListener("click", () => closeModal(null));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !root.hidden && !closeButton.hidden) closeModal(null);
  });

  window.VolyUI = {
    showModal,
    closeModal,
    showBusy,
    showBusyDone,
    hideBusy,
    showToast
  };
})();
