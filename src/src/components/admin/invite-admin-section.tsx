"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Trash2, UserPlus, RefreshCw, UserX } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";

interface AdminInvite {
  id: string;
  email: string;
  name: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

// Wave Q (#7, ADR-0018): real live ADMIN/STAFF users from /api/admin/admin-users.
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  hasCoachProfile: boolean;
  /** The signed-in admin's own row — never removable. */
  self: boolean;
  /** The canonical ADMIN_EMAIL row — never removable. */
  canonical: boolean;
}

interface InviteAdminSectionProps {
  /**
   * Wave Q flag (capability gate ONLY — enforcement of an already-removed
   * user is unconditional server-side). When false, no Remove buttons render.
   */
  waveQEnabled?: boolean;
  responsiveEnabled?: boolean;
}

export function InviteAdminSection({ waveQEnabled = false, responsiveEnabled = false }: InviteAdminSectionProps) {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/admin-users"),
        fetch("/api/admin/invite"),
      ]);
      const usersData = await usersRes.json();
      const invitesData = await invitesRes.json();
      if (usersData.success) {
        setUsers(usersData.data);
      }
      if (invitesData.success) {
        setInvites(invitesData.data);
      }
    } catch {
      console.error("Failed to fetch admin users/invites");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      toast({
        title: "Invite Sent",
        description: `Admin invitation sent to ${email}`,
      });
      setEmail("");
      setName("");
      fetchAll();
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Failed to send invite",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (inviteId: string, inviteEmail: string) => {
    if (!confirm(`Revoke the pending invite for ${inviteEmail}?`)) return;

    try {
      const res = await fetch(`/api/admin/invite/${inviteId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to revoke invite");
      }

      toast({
        title: "Invite Revoked",
        description: `Invite for ${inviteEmail} has been revoked`,
      });
      fetchAll();
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Failed to revoke invite",
        variant: "destructive",
      });
    }
  };

  // Wave Q (#7, ADR-0018): soft-remove a departed admin. Confirm carries the
  // blast radius: immediate lockout, history kept, email re-invitable.
  const handleRemoveUser = async (user: AdminUser) => {
    if (
      !confirm(
        `Remove ${user.email}? They are locked out immediately. Their history is kept and the email can be re-invited.`
      )
    ) {
      return;
    }

    setRemovingId(user.id);
    try {
      const res = await fetch(`/api/admin/admin-users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove admin");
      }

      toast({
        title: "Admin Removed",
        description: `${user.email} has been removed and locked out`,
      });
      fetchAll();
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Failed to remove admin",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const getStatus = (invite: AdminInvite) => {
    if (invite.acceptedAt) return "active";
    if (new Date(invite.expiresAt) < new Date()) return "expired";
    return "pending";
  };

  // An ACCEPTED invite whose email is already shown as a live user row would
  // be a duplicate — skip it (the user row is the source of truth).
  const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
  const visibleInvites = invites.filter(
    (invite) => !(invite.acceptedAt && userEmails.has(invite.email.toLowerCase()))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Admin Users
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite Form */}
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={responsiveEnabled ? "min-h-11" : undefined}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input
                id="invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={responsiveEnabled ? "min-h-11" : undefined}
                placeholder="Full name"
              />
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} size="sm" className={responsiveEnabled ? "min-h-11 w-full sm:w-auto" : undefined}>
            <Mail className="w-4 h-4 mr-1" />
            {isSubmitting ? "Sending..." : "Send Invite"}
          </Button>
        </form>

        {/* Users + Invites */}
        <div>
          <div className={responsiveEnabled ? "mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between mb-3"}>
            <h4 className="text-sm font-medium text-foreground">Current Admins</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAll}
              disabled={isLoading}
              aria-label={responsiveEnabled ? "Refresh admins" : undefined}
              className={responsiveEnabled ? "min-h-11 min-w-11 self-end sm:self-auto" : undefined}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {isLoading && users.length === 0 && invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading admin users...</p>
          ) : users.length === 0 && visibleInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin users or invitations yet.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  data-testid="admin-user-row"
                  className={responsiveEnabled ? "flex flex-col items-stretch gap-3 p-3 rounded-lg border border-border bg-background sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between p-3 rounded-lg border border-border bg-background"}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {user.email}
                      </span>
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        {user.role}
                      </Badge>
                      {user.hasCoachProfile && (
                        <Badge variant="secondary" className="bg-accent text-accent-foreground">
                          Coach
                        </Badge>
                      )}
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        Active
                      </Badge>
                    </div>
                    {user.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{user.name}</p>
                    )}
                  </div>
                  {waveQEnabled && !user.self && !user.canonical && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveUser(user)}
                      disabled={removingId === user.id}
                      className={responsiveEnabled ? "min-h-11 w-full text-destructive hover:text-destructive hover:bg-destructive/10 sm:ml-2 sm:w-auto" : "text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"}
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      {removingId === user.id ? "Removing..." : "Remove"}
                    </Button>
                  )}
                </div>
              ))}

              {visibleInvites.map((invite) => {
                const status = getStatus(invite);
                return (
                  <div
                    key={invite.id}
                    className={responsiveEnabled ? "flex flex-col items-stretch gap-3 p-3 rounded-lg border border-border bg-background sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between p-3 rounded-lg border border-border bg-background"}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {invite.email}
                        </span>
                        <Badge
                          variant="secondary"
                          className={
                            status === "active"
                              ? "bg-success/10 text-success"
                              : status === "expired"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning"
                          }
                        >
                          {status === "active"
                            ? "Active"
                            : status === "expired"
                            ? "Expired"
                            : "Pending"}
                        </Badge>
                      </div>
                      {invite.name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {invite.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Invited{" "}
                        {formatTimestamp(invite.createdAt)}
                        {status === "pending" &&
                          ` · Expires ${formatTimestamp(invite.expiresAt)}`}
                        {status === "active" &&
                          invite.acceptedAt &&
                          ` · Accepted ${formatTimestamp(invite.acceptedAt)}`}
                      </p>
                    </div>
                    {status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(invite.id, invite.email)}
                        className={responsiveEnabled ? "min-h-11 min-w-11 self-end text-destructive hover:text-destructive hover:bg-destructive/10 sm:ml-2 sm:self-auto" : "text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"}
                        aria-label={`Revoke invite for ${invite.email}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
