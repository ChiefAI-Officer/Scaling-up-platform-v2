"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Trash2, UserPlus, RefreshCw } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";

interface AdminInvite {
  id: string;
  email: string;
  name: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export function InviteAdminSection() {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invite");
      const data = await res.json();
      if (data.success) {
        setInvites(data.data);
      }
    } catch {
      console.error("Failed to fetch invites");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

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
      fetchInvites();
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
      fetchInvites();
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Failed to revoke invite",
        variant: "destructive",
      });
    }
  };

  const getStatus = (invite: AdminInvite) => {
    if (invite.acceptedAt) return "active";
    if (new Date(invite.expiresAt) < new Date()) return "expired";
    return "pending";
  };

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
                placeholder="Full name"
              />
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} size="sm">
            <Mail className="w-4 h-4 mr-1" />
            {isSubmitting ? "Sending..." : "Send Invite"}
          </Button>
        </form>

        {/* Invites Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground">Invited Admins</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchInvites}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {isLoading && invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading invitations...</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin invitations yet.
            </p>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => {
                const status = getStatus(invite);
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-background"
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
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
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
