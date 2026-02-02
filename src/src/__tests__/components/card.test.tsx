/**
 * Component tests for Card
 */

import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

describe("Card Component", () => {
  it("should render Card with children", () => {
    render(
      <Card>
        <div>Card content</div>
      </Card>
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("should apply default styles", () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-xl");
    expect(card).toHaveClass("border");
  });

  it("should support custom className", () => {
    render(
      <Card className="custom-class" data-testid="card">
        Content
      </Card>
    );
    expect(screen.getByTestId("card")).toHaveClass("custom-class");
  });
});

describe("CardHeader Component", () => {
  it("should render with children", () => {
    render(
      <CardHeader>
        <span>Header content</span>
      </CardHeader>
    );
    expect(screen.getByText("Header content")).toBeInTheDocument();
  });

  it("should apply flex and gap styles", () => {
    render(<CardHeader data-testid="header">Content</CardHeader>);
    const header = screen.getByTestId("header");
    expect(header).toHaveClass("flex");
    expect(header).toHaveClass("flex-col");
  });
});

describe("CardTitle Component", () => {
  it("should render title text", () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("should render as heading element", () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText("Title");
    expect(title).toHaveClass("font-semibold");
  });

  it("should support custom className", () => {
    render(<CardTitle className="text-red-500">Title</CardTitle>);
    expect(screen.getByText("Title")).toHaveClass("text-red-500");
  });
});

describe("CardDescription Component", () => {
  it("should render description text", () => {
    render(<CardDescription>My description</CardDescription>);
    expect(screen.getByText("My description")).toBeInTheDocument();
  });

  it("should apply muted text color", () => {
    render(<CardDescription>Description</CardDescription>);
    const desc = screen.getByText("Description");
    expect(desc).toHaveClass("text-muted-foreground");
  });
});

describe("CardContent Component", () => {
  it("should render content", () => {
    render(
      <CardContent>
        <p>Main content here</p>
      </CardContent>
    );
    expect(screen.getByText("Main content here")).toBeInTheDocument();
  });

  it("should apply padding styles", () => {
    render(<CardContent data-testid="content">Content</CardContent>);
    expect(screen.getByTestId("content")).toHaveClass("p-6");
  });
});

describe("CardFooter Component", () => {
  it("should render footer content", () => {
    render(
      <CardFooter>
        <button>Action</button>
      </CardFooter>
    );
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("should apply flex styles", () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);
    expect(screen.getByTestId("footer")).toHaveClass("flex");
  });
});

describe("Card Composition", () => {
  it("should render complete card structure", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Workshop Details</CardTitle>
          <CardDescription>View and manage your workshop</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Workshop content goes here</p>
        </CardContent>
        <CardFooter>
          <button>Save Changes</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByText("Workshop Details")).toBeInTheDocument();
    expect(screen.getByText("View and manage your workshop")).toBeInTheDocument();
    expect(screen.getByText("Workshop content goes here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("should support accessible card with ARIA attributes", () => {
    render(
      <Card role="article" aria-labelledby="card-title">
        <CardHeader>
          <CardTitle id="card-title">Accessible Card</CardTitle>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>
    );

    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("aria-labelledby", "card-title");
  });
});
