import {
  MEMBER_PORTAL_DISCOVERY_ACTION,
  MEMBER_PORTAL_DISCOVERY_COPY,
  MEMBER_PORTAL_SIGN_IN_PATH,
} from "@/lib/members/discovery";

export function MemberPortalLink({ className = "" }: { className?: string }) {
  return (
    <p className={className} data-testid="member-portal-discovery">
      {MEMBER_PORTAL_DISCOVERY_COPY}{" "}
      <a className="font-semibold text-primary underline" href={MEMBER_PORTAL_SIGN_IN_PATH}>
        {MEMBER_PORTAL_DISCOVERY_ACTION}
      </a>
    </p>
  );
}
