import { memberGreeting } from "@/lib/members/greeting";

describe("memberGreeting", () => {
  it("prefixes CEO only for the canonical CEO family", () => {
    expect(memberGreeting({ firstName: "John", lastName: "Adams", roleType: "ceofounder", hour: 9 }))
      .toBe("Good morning, CEO John Adams");
    expect(memberGreeting({ firstName: "Jane", lastName: "Lee", roleType: "employee", hour: 9 }))
      .toBe("Good morning, Jane Lee");
    expect(memberGreeting({ firstName: "Legacy", roleType: "CEO", hour: 14 }))
      .toBe("Good afternoon, Legacy");
  });
});
