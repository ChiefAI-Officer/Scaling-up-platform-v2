import { render } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

let contactsProps: Record<string, unknown> | null = null;
jest.mock("@/components/contacts/contacts-table", () => ({
  ContactsTable: (props: Record<string, unknown>) => {
    contactsProps = props;
    return <div data-testid="contacts-table" />;
  },
}));

let newCoachProps: Record<string, unknown> | null = null;
jest.mock("@/app/(dashboard)/coaches/new/new-coach-form", () => ({
  NewCoachForm: (props: Record<string, unknown>) => {
    newCoachProps = props;
    return <div data-testid="new-coach-form" />;
  },
}));

let partnersProps: Record<string, unknown> | null = null;
jest.mock("@/app/(dashboard)/partners/partners-client", () => ({
  PartnersClient: (props: Record<string, unknown>) => {
    partnersProps = props;
    return <div data-testid="partners-client" />;
  },
}));

jest.mock("@/lib/db", () => ({
  db: { contact: { findMany: jest.fn().mockResolvedValue([]) } },
}));

import ContactsPage from "@/app/(dashboard)/contacts/page";
import NewCoachPage from "@/app/(dashboard)/coaches/new/page";
import PartnersPage from "@/app/(dashboard)/partners/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(false);
  contactsProps = null;
  newCoachProps = null;
  partnersProps = null;
});

it.each([
  ["contacts", async () => render(await ContactsPage()), () => contactsProps],
  ["new coach", async () => render(<NewCoachPage />), () => newCoachProps],
  ["partners", async () => render(<PartnersPage />), () => partnersProps],
] as const)("passes an explicit default-off responsive boundary to %s", async (_name, mount, props) => {
  await mount();
  expect(props()).toMatchObject({ responsiveEnabled: false });
});

it.each([
  ["contacts", async () => render(await ContactsPage()), () => contactsProps],
  ["new coach", async () => render(<NewCoachPage />), () => newCoachProps],
  ["partners", async () => render(<PartnersPage />), () => partnersProps],
] as const)("passes the enabled responsive boundary to %s", async (_name, mount, props) => {
  mockResponsiveFlag.mockReturnValue(true);
  await mount();
  expect(props()).toMatchObject({ responsiveEnabled: true });
});
