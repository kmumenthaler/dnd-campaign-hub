export type EmptyStateAction = {
  label: string;
  onClick: () => void | Promise<void>;
  cta?: boolean;
};

/** Shared empty-state rendering for primary campaign workflows. */
export function renderActionableEmptyState(
  container: HTMLElement,
  title: string,
  description: string,
  actions: EmptyStateAction[] = [],
): HTMLElement {
  const empty = container.createEl("div", { cls: "actionable-empty-state dashboard-empty-state" });
  empty.createEl("strong", { text: title });
  empty.createEl("p", { text: description });
  if (actions.length > 0) {
    const actionRow = empty.createEl("div", { cls: "dashboard-empty-actions" });
    for (const action of actions) {
      const button = actionRow.createEl("button", {
        text: action.label,
        cls: action.cta ? "mod-cta" : "",
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void action.onClick();
      });
    }
  }
  return empty;
}
