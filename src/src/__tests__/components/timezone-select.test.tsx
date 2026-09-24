import { fireEvent, render, screen } from "@testing-library/react";
import { TimezoneSelect } from "@/components/ui/timezone-select";

describe("TimezoneSelect", () => {
  it("searches the full timezone catalogue and selects a zone", () => {
    const onChange = jest.fn();
    render(
      <TimezoneSelect
        value="America/New_York"
        onChange={onChange}
        at={new Date("2026-10-16T06:00:00.000Z")}
        helperText="Detected from your browser."
      />,
    );

    expect(screen.getByRole("button", { name: /time zone/i })).toHaveTextContent(
      /New York.*UTC−4.*EDT/,
    );
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }));
    expect(screen.getByRole("listbox", { name: /time zones/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /search time zones/i }), {
      target: { value: "sydney" },
    });
    fireEvent.click(screen.getAllByRole("option", { name: /Sydney.*UTC\+11.*AEDT/i })[0]);

    expect(onChange).toHaveBeenCalledWith("Australia/Sydney");
  });

  it("matches country aliases for the pinned common zones", () => {
    render(
      <TimezoneSelect
        value="America/New_York"
        onChange={jest.fn()}
        at={new Date("2026-10-16T06:00:00.000Z")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /search time zones/i }), {
      target: { value: "Canada" },
    });
    expect(screen.getAllByRole("option", { name: /Toronto|Vancouver/i })).not.toHaveLength(0);
  });

  it("derives country search for zones outside the pinned list", async () => {
    render(
      <TimezoneSelect
        value="America/New_York"
        onChange={jest.fn()}
        at={new Date("2026-10-16T06:00:00.000Z")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /search time zones/i }), {
      target: { value: "France" },
    });
    expect(await screen.findByRole("option", { name: /Paris/i })).toBeInTheDocument();
  });

  it("supports Arrow-key navigation and Enter selection from the combobox", () => {
    const onChange = jest.fn();
    render(<TimezoneSelect value="America/New_York" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }));
    const search = screen.getByRole("combobox", { name: /search time zones/i });
    fireEvent.change(search, { target: { value: "Sydney" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Australia/Sydney");
  });
});
