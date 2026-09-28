import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vite-plus/test";
import StorageSettings from "./StorageSettings";

describe("StorageSettings", () => {
  it("names the browser's storage and shows only how much it uses", async () => {
    render(() => <StorageSettings usage={async () => ({ usage: 12_345, quota: 1e9 })} />);
    expect(screen.getByTestId("storage-location")).toHaveTextContent("This browser");
    expect(screen.queryByText(/plain Markdown files/)).toBeNull();
    expect(await screen.findByTestId("storage-usage")).toHaveTextContent("12 KB used");
  });

  it("omits the usage line when the browser reports no estimate", async () => {
    render(() => <StorageSettings usage={async () => null} />);
    expect(await screen.findByTestId("storage-location")).toBeInTheDocument();
    expect(screen.queryByTestId("storage-usage")).toBeNull();
  });
});
