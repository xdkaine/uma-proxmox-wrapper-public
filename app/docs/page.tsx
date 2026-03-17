"use client";

import { useState } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import Link from "next/link";
import useSWR from "swr";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { PausableMedia } from "@/components/ui/pausable-media";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Doc {
    id: string;
    title: string;
    subtitle: string | null;
    author: string;
    content: string;
    coverImage: string | null;
    createdAt: string;
    visitedBy: number;
    published: boolean;
}

const fetcher = (url: string) =>
    fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
    });

export default function PublicDocsPage() {
    const { data: docs, error, isLoading } = useSWR<Doc[]>("/api/docs", fetcher);
    const [searchTerm, setSearchTerm] = useState("");

    // Helper to ensure paths are absolute
    const normalizeSrc = (src: string | null | undefined) => {
        if (!src) return "";
        if (src.startsWith("http") || src.startsWith("/")) return src;
        return `/${src}`;
    };

    if (error) return <div className="p-8 text-center text-destructive">Failed to load documentation</div>;

    const publishedDocs = Array.isArray(docs) ? docs : [];

    // Filter Logic
    const filteredDocs = publishedDocs.filter((doc) => {
        const lowerTerm = searchTerm.toLowerCase();
        return (
            doc.title.toLowerCase().includes(lowerTerm) ||
            (doc.subtitle && doc.subtitle.toLowerCase().includes(lowerTerm)) ||
            (doc.author && doc.author.toLowerCase().includes(lowerTerm)) ||
            (doc.content && doc.content.toLowerCase().includes(lowerTerm))
        );
    });

    const isSearching = searchTerm.trim().length > 0;
    const featuredDoc = publishedDocs[0];
    const otherDocs = publishedDocs.slice(1);

    // If searching, we display everything in the filtered list.
    // If NOT searching, we display Featured + otherDocs.
    const displayDocs = isSearching ? filteredDocs : otherDocs;

    return (
        <div className="w-full space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
                <div className="space-y-4">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
                        Documentation
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl">
                        Guides, references, and resources to help you build.
                    </p>
                </div>
                <div className="relative w-full md:w-72 lg:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search articles..."
                        className="pl-9 bg-muted/50 focus:bg-background transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="overflow-hidden border-none shadow-none bg-muted/20">
                            <Skeleton className="h-48 w-full rounded-xl" />
                            <div className="pt-4 space-y-2">
                                <Skeleton className="h-6 w-2/3" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        </Card>
                    ))}
                </div>
            ) : publishedDocs.length === 0 ? (
                <div className="col-span-full text-center py-24 text-muted-foreground">
                    <p>No articles published yet.</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {/* Featured Article - Only show when NOT searching */}
                    {!isSearching && featuredDoc && (
                        <Link href={`/docs/${featuredDoc.id}`} className="group block">
                            <div className="grid md:grid-cols-5 gap-8 items-start rounded-2xl p-6 bg-gradient-to-br from-muted/50 to-muted/10 border hover:border-sidebar-accent transition-all">
                                <div className="md:col-span-3 aspect-video relative rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all">
                                    {featuredDoc.coverImage ? (
                                        <PausableMedia
                                            src={normalizeSrc(featuredDoc.coverImage)}
                                            alt={featuredDoc.title}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                                            No Cover Image
                                        </div>
                                    )}
                                </div>
                                <div className="md:col-span-2 flex flex-col h-full justify-center space-y-4">
                                    <Badge variant="secondary" className="w-fit">Featured</Badge>
                                    <h2 className="text-3xl font-bold tracking-tight group-hover:text-primary transition-colors">
                                        {featuredDoc.title}
                                    </h2>
                                    {featuredDoc.subtitle && (
                                        <p className="text-lg text-muted-foreground line-clamp-3">
                                            {featuredDoc.subtitle}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            <span>{featuredDoc.author}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            <span>{format(new Date(featuredDoc.createdAt), "MMM d, yyyy")}</span>
                                        </div>
                                    </div>
                                    <div className="pt-4 flex items-center text-primary font-medium opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                        Read Article <ArrowRight className="ml-2 h-4 w-4" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    )}

                    {/* Grid for other articles (or ALL articles if searching) */}
                    <div>
                        {!isSearching && otherDocs.length > 0 && (
                            <h3 className="text-2xl font-bold tracking-tight mb-8">Latest Posts</h3>
                        )}
                        {isSearching && (
                            <h3 className="text-2xl font-bold tracking-tight mb-8">
                                Search Results ({filteredDocs.length})
                            </h3>
                        )}

                        {displayDocs.length > 0 ? (
                            <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
                                {displayDocs.map((doc) => (
                                    <Link key={doc.id} href={`/docs/${doc.id}`} className="group flex flex-col space-y-3">
                                        <div className="aspect-[16/10] overflow-hidden rounded-xl border bg-muted relative shadow-sm transition-all group-hover:shadow-md">
                                            {doc.coverImage ? (
                                                <PausableMedia
                                                    src={normalizeSrc(doc.coverImage)}
                                                    alt={doc.title}
                                                    fill
                                                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                    No Cover Image
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                                                <span>•</span>
                                                <span>{doc.author}</span>
                                            </div>
                                            <h4 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors">
                                                {doc.title}
                                            </h4>
                                            {doc.subtitle && (
                                                <p className="text-muted-foreground line-clamp-2 text-sm">
                                                    {doc.subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            isSearching && (
                                <div className="text-center py-24 text-muted-foreground">
                                    <p className="text-lg">No results found for "{searchTerm}"</p>
                                    <p className="text-sm">Try searching for something else.</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
