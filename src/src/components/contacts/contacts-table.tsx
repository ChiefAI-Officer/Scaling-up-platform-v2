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

interface ContactsTableProps {
    data: Contact[];
}

export function ContactsTable({ data }: ContactsTableProps) {
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

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-lg border">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Segments</span>
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Contacts..."
                        className="pl-8 bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                </Button>
            </div>

            <div className="bg-card rounded-md border shadow-sm">
                <div className="p-4 text-sm text-muted-foreground border-b">
                    Displaying {filteredData.length} of {data.length} contacts
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox />
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
                                    <Checkbox />
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
                                            ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20"
                                            : "bg-muted text-muted-foreground ring-1 ring-inset ring-gray-500/10"
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
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem>View details</DropdownMenuItem>
                                            <DropdownMenuItem>Edit contact</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
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
        </div>
    );
}
