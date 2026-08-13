"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpDown, Search, Filter } from "lucide-react";
import { Contact } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
    ResponsiveRecord,
    ResponsiveRecordActions,
    ResponsiveRecordHeader,
    ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";

interface ContactsTableProps {
    data: Contact[];
    responsiveEnabled?: boolean;
}

export function ContactsTable({ data, responsiveEnabled = false }: ContactsTableProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<keyof Contact>("addedAt");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

    // Filtering & Sorting
    const filteredData = data
        .filter((contact) => {
            const searchLower = searchTerm.toLowerCase();
            return (
                contact.name.toLowerCase().includes(searchLower) ||
                contact.email.toLowerCase().includes(searchLower)
            );
        })
        .sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];

            if (!valA && !valB) return 0;
            if (!valA) return 1;
            if (!valB) return -1;

            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });

    const handleSort = (field: keyof Contact) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    const wideTable = (
        <div className="bg-card rounded-md border shadow-sm">
            <div className="p-4 text-sm text-muted-foreground border-b">
                Displaying {filteredData.length} of {data.length} contacts
            </div>
            <Table
                responsiveEnabled={responsiveEnabled}
                regionLabel="Contacts table"
            >
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px]">
                            {responsiveEnabled ? (
                                <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                                    <Checkbox aria-label="Select all contacts" />
                                </label>
                            ) : <Checkbox />}
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                            Name {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("email")}>
                            Email {sortField === "email" && (sortDirection === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead>Email Marketing</TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("lifetimeValue")}>
                            Lifetime Value
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("addedAt")}>
                            Added date
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("lastActivityAt")}>
                            Last activity
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredData.map((contact) => (
                        <TableRow key={contact.id}>
                            <TableCell>
                                {responsiveEnabled ? (
                                    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                                        <Checkbox aria-label={`Select ${contact.name}`} />
                                    </label>
                                ) : <Checkbox />}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary uppercase">
                                        {contact.name.substring(0, 2)}
                                    </div>
                                    <span className="font-medium text-foreground">{contact.name}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{contact.email}</TableCell>
                            <TableCell>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${contact.emailMarketing === "Subscribed"
                                    ? "bg-success/10 text-success ring-1 ring-inset ring-success/20"
                                    : "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                                    }`}>
                                    {contact.emailMarketing}
                                </span>
                            </TableCell>
                            <TableCell>${contact.lifetimeValue.toFixed(2)}</TableCell>
                            <TableCell>{format(new Date(contact.addedAt), "MMM d, yyyy")}</TableCell>
                            <TableCell>
                                {contact.lastActivityAt
                                    ? format(new Date(contact.lastActivityAt), "MMM d, yyyy")
                                    : "—"}
                            </TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            className={responsiveEnabled ? "h-8 min-h-11 w-8 min-w-11 p-0" : "h-8 w-8 p-0"}
                                            aria-label={responsiveEnabled ? `More actions for ${contact.name}` : undefined}
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem className={responsiveEnabled ? "min-h-11" : undefined}>View details</DropdownMenuItem>
                                        <DropdownMenuItem className={responsiveEnabled ? "min-h-11" : undefined}>Edit contact</DropdownMenuItem>
                                        <DropdownMenuItem className={responsiveEnabled ? "min-h-11 text-destructive" : "text-destructive"}>Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                    {filteredData.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center">
                                No contacts found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );

    const compactRecords = (
        <div className="space-y-3">
            {filteredData.map((contact) => (
                <ResponsiveRecord key={contact.id}>
                    <ResponsiveRecordHeader
                        title={contact.name}
                        status={
                            <span className={cn(
                                "shrink-0 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                contact.emailMarketing === "Subscribed"
                                    ? "bg-success/10 text-success ring-success/20"
                                    : "bg-muted text-muted-foreground ring-border",
                            )}>
                                {contact.emailMarketing}
                            </span>
                        }
                    />
                    <ResponsiveRecordMeta
                        items={[
                            { label: "Email", value: contact.email },
                            { label: "Lifetime value", value: contact.lifetimeValue.toLocaleString("en-US", { style: "currency", currency: "USD" }) },
                            { label: "Added", value: format(new Date(contact.addedAt), "MMM d, yyyy") },
                            { label: "Last activity", value: contact.lastActivityAt ? format(new Date(contact.lastActivityAt), "MMM d, yyyy") : "—" },
                        ]}
                    />
                    <ResponsiveRecordActions
                        primary={<Button type="button" variant="outline">View details</Button>}
                        menuLabel={`More actions for ${contact.name}`}
                        secondary={
                            <>
                                <ResponsiveActionsItem asChild>
                                    <button type="button" className="flex min-h-11 w-full items-center px-3 text-sm">Edit contact</button>
                                </ResponsiveActionsItem>
                                <ResponsiveActionsItem asChild>
                                    <button type="button" className="flex min-h-11 w-full items-center px-3 text-sm text-destructive">Delete</button>
                                </ResponsiveActionsItem>
                            </>
                        }
                    />
                </ResponsiveRecord>
            ))}
            {filteredData.length === 0 ? (
                <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No contacts found.</p>
            ) : null}
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className={responsiveEnabled ? "flex flex-col items-stretch gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between gap-4 bg-card p-4 rounded-lg border"}>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Segments</span>
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className={responsiveEnabled ? "relative min-w-0 flex-1 sm:max-w-md" : "relative flex-1 max-w-md"}>
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Contacts..."
                        className={responsiveEnabled ? "min-h-11 bg-background pl-8" : "pl-8 bg-background"}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Button variant="outline" className={responsiveEnabled ? "min-h-11 gap-2" : "gap-2"}>
                    <Filter className="w-4 h-4" />
                    Filters
                </Button>
            </div>

            <ResponsiveDataView
                enabled={responsiveEnabled}
                label="Contacts"
                compact={compactRecords}
                wide={wideTable}
                wideFrom="md"
            />
        </div>
    );
}
