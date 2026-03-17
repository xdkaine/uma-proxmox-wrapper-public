"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Plus,
    Search,
    MoreHorizontal,
    Pin,
    PinOff,
    Filter,
    Pencil,
    Trash2,
    FileText,
} from "lucide-react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Doc {
    id: string;
    title: string;
    subtitle: string | null;
    author: string;
    content: string;
    createdAt: string;
    visitedBy: number;
    published: boolean;
    pinned: boolean; // Field added to schema
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DocsPage() {
    const { data: docs, error, isLoading } = useSWR<Doc[]>("/api/admin/docs", fetcher);
    const [searchTerm, setSearchTerm] = useState("");
    const [authorFilter, setAuthorFilter] = useState<string | "all">("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

    // Client-side filtering logic
    const filteredDocs = docs?.filter((doc) => {
        // Search Filter (Title, Subtitle, Content)
        const matchesSearch =
            doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (doc.subtitle && doc.subtitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
            doc.content.toLowerCase().includes(searchTerm.toLowerCase()); // Full text search

        // Author Filter
        const matchesAuthor = authorFilter === "all" || doc.author === authorFilter;

        // Status Filter
        const matchesStatus =
            statusFilter === "all" || (statusFilter === "published" ? doc.published : !doc.published);

        return matchesSearch && matchesAuthor && matchesStatus;
    });

    // Unique Authors for Dropdown
    const authors = Array.from(new Set(docs?.map((d) => d.author) || [])).sort();

    // Toggle Pin Logic
    const handleTogglePin = async (doc: Doc) => {
        // Optimistic UI update
        const updatedDocs = docs?.map((d) =>
            d.id === doc.id ? { ...d, pinned: !d.pinned } : d
        );
        mutate("/api/admin/docs", updatedDocs, false);

        try {
            const res = await fetch(`/api/admin/docs/${doc.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: !doc.pinned }),
            });

            if (!res.ok) throw new Error("Failed to update pin status");
            toast.success(doc.pinned ? "Unpinned article" : "Pinned article");
        } catch (error) {
            toast.error("Failed to update pin status");
            mutate("/api/admin/docs"); // Revert
        }
    };

    // Delete Logic
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this document?")) return;

        try {
            const res = await fetch(`/api/admin/docs/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete");
            toast.success("Document deleted");
            mutate("/api/admin/docs");
        } catch (error) {
            toast.error("Failed to delete document");
        }
    };

    if (error) return <div className="p-8 text-center text-red-500">Failed to load docs</div>;

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
                    <p className="text-muted-foreground">
                        Manage documentation articles, guides, and resources.
                    </p>
                </div>
                <Button asChild className="shrink-0">
                    <Link href="/admin/docs/create">
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Doc
                    </Link>
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search title, content, or keywords..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Status Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-1">
                                <Filter className="h-3.5 w-3.5" />
                                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                    Status: {statusFilter === 'all' ? 'All' : statusFilter === 'published' ? 'Published' : 'Draft'}
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem checked={statusFilter === "all"} onCheckedChange={() => setStatusFilter("all")}>
                                All
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={statusFilter === "published"} onCheckedChange={() => setStatusFilter("published")}>
                                Published
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={statusFilter === "draft"} onCheckedChange={() => setStatusFilter("draft")}>
                                Draft
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Author Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-1">
                                <UserIcon className="h-3.5 w-3.5" />
                                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                    Author: {authorFilter === 'all' ? 'All' : authorFilter}
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Filter by Author</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem checked={authorFilter === "all"} onCheckedChange={() => setAuthorFilter("all")}>
                                All Authors
                            </DropdownMenuCheckboxItem>
                            {authors.map(author => (
                                <DropdownMenuCheckboxItem key={author} checked={authorFilter === author} onCheckedChange={() => setAuthorFilter(author)}>
                                    {author}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Data Table */}
            <div className="rounded-md border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[40%]">Article</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden md:table-cell">Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : filteredDocs?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No documents found matching your criteria.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredDocs?.map((doc) => (
                                <TableRow key={doc.id} className="group">
                                    <TableCell className="font-medium">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 p-2 rounded bg-primary/10 text-primary">
                                                <FileText className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {doc.pinned && <Pin className="h-3 w-3 text-primary fill-primary rotate-45" />}
                                                    <Link href={`/docs/${doc.id}`} target="_blank" className="hover:underline hover:text-primary transition-colors cursor-pointer block text-base font-semibold">
                                                        {doc.title}
                                                    </Link>
                                                </div>
                                                {doc.subtitle && (
                                                    <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                                                        {doc.subtitle}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm font-medium">{doc.author}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={doc.published ? "default" : "secondary"} className={doc.published ? "bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25 border-0" : ""}>
                                            {doc.published ? "Published" : "Draft"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                                        {format(new Date(doc.createdAt), "MMM d, yyyy")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" onClick={() => handleTogglePin(doc)} title={doc.pinned ? "Unpin" : "Pin to top"}>
                                                {doc.pinned ? <PinOff className="h-4 w-4 text-muted-foreground" /> : <Pin className="h-4 w-4 text-muted-foreground" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" asChild title="Edit" className="text-muted-foreground hover:text-foreground">
                                                <Link href={`/admin/docs/${doc.id}`}>
                                                    <Pencil className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)} title="Delete" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="text-xs text-muted-foreground text-center">
                Showing {filteredDocs?.length || 0} documents
            </div>
        </div>
    );
}

function UserIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    )
}
