import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";

describe("ServiceWorkerUpdatePrompt", () => {
  it("waits for explicit user activation before applying and reloading", async () => {
    const applyUpdate = vi.fn().mockResolvedValue(undefined);
    const onApplied = vi.fn();
    render(<ServiceWorkerUpdatePrompt applyUpdate={applyUpdate} onApplied={onApplied} onDismiss={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Update ready" })).toHaveTextContent("finished downloading");
    expect(applyUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    await waitFor(() => expect(applyUpdate).toHaveBeenCalledOnce());
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("keeps the current version available and reports an activation failure", async () => {
    const applyUpdate = vi.fn().mockRejectedValue(new Error("activation failed"));
    const onApplied = vi.fn();
    render(<ServiceWorkerUpdatePrompt applyUpdate={applyUpdate} onApplied={onApplied} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("current version is still available");
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
  });
});
