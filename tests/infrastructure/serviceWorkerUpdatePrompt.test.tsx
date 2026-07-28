import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";
import { COPY } from "@/src/copy";

describe("ServiceWorkerUpdatePrompt", () => {
  it("uses centralized copy and unique accessible relationships", () => {
    const first = render(<ServiceWorkerUpdatePrompt applyUpdate={vi.fn()} onApplied={vi.fn()} onDismiss={vi.fn()} />);
    const firstDialog = screen.getByRole("dialog", { name: COPY.pwa.updateTitle });
    expect(firstDialog).toHaveAccessibleDescription(COPY.pwa.updateDescription);
    const firstLabel = firstDialog.getAttribute("aria-labelledby");
    first.unmount();
    render(<ServiceWorkerUpdatePrompt applyUpdate={vi.fn()} onApplied={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: COPY.pwa.updateTitle }).getAttribute("aria-labelledby")).not.toBe(firstLabel);
  });

  it("waits for explicit user activation before applying and reloading", async () => {
    const applyUpdate = vi.fn().mockResolvedValue(undefined);
    const onApplied = vi.fn();
    render(<ServiceWorkerUpdatePrompt applyUpdate={applyUpdate} onApplied={onApplied} onDismiss={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: COPY.pwa.updateTitle })).toHaveTextContent("finished downloading");
    expect(applyUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: COPY.pwa.updateApply }));
    await waitFor(() => expect(applyUpdate).toHaveBeenCalledOnce());
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("keeps the current version available and reports an activation failure", async () => {
    const applyUpdate = vi.fn().mockRejectedValue(new Error("activation failed"));
    const onApplied = vi.fn();
    render(<ServiceWorkerUpdatePrompt applyUpdate={applyUpdate} onApplied={onApplied} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.pwa.updateApply }));
    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.pwa.updateError);
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: COPY.pwa.updateApply })).toBeEnabled();
  });
});
