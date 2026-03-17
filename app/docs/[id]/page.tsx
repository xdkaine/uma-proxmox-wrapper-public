"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, User, Eye, Clock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PausableMedia } from "@/components/ui/pausable-media";
import { Badge } from "@/components/ui/badge";

interface Doc {
    id: string;
    title: string;
    subtitle: string | null;
    author: string;
    content: string;
    coverImage: string | null;
    createdAt: string;
    visitedBy: number;
}

const fetcher = (url: string) =>
    fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
    });

export default function DocDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const { data: doc, error, isLoading } = useSWR<Doc>(id ? `/api/docs/${id}` : null, fetcher);

    if (error) return <div className="text-center py-12 text-destructive">Failed to load article</div>;
    if (isLoading) return <DocSkeleton />;
    if (!doc) return <div className="text-center py-12">Article not found</div>;

    // Helper to ensure paths are absolute
    const normalizeSrc = (src: string | null | undefined) => {
        if (!src) return "";
        if (src.startsWith("http") || src.startsWith("/")) return src;
        return `/${src}`;
    };

    return (
        <article className="min-h-screen pb-20 bg-background font-sans selection:bg-primary/20">
            {/* Hero Section */}
            <div className="relative w-full h-[60vh] min-h-[500px] bg-muted overflow-hidden">
                {/* Background Image */}
                {doc.coverImage ? (
                    <div className="absolute inset-0 w-full h-full animate-in fade-in duration-700">
                        <PausableMedia
                            src={normalizeSrc(doc.coverImage)}
                            alt={doc.title}
                            fill
                            className="object-cover transition-transform duration-[2000ms] hover:scale-105"
                            priority
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />
                )}

                {/* Gradient Overlay (Scrim) */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent/10 pointer-events-none" />

                {/* Top Bar for Back Button */}
                <div className="absolute top-0 left-0 w-full p-6 z-20 pointer-events-none">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="backdrop-blur-md bg-background/30 hover:bg-background/50 border border-white/10 text-white hover:text-white transition-all shadow-sm pointer-events-auto"
                        asChild
                    >
                        <Link href="/docs">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Docs
                        </Link>
                    </Button>
                </div>

                {/* Content Overlay */}
                <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
                    <div className="container max-w-5xl mx-auto px-6 pb-16 animate-in slide-in-from-bottom-6 duration-700 delay-100 pointer-events-auto">
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground border-none px-3 py-1 shadow-shadow">Documentation</Badge>
                                <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground drop-shadow-sm leading-[1.1]">
                                    {doc.title}
                                </h1>
                                {doc.subtitle && (
                                    <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl font-medium">
                                        {doc.subtitle}
                                    </p>
                                )}
                            </div>

                            {/* Metadata Pill */}
                            <div className="flex flex-wrap items-center gap-6 text-sm bg-background/40 backdrop-blur-md w-fit px-6 py-3 rounded-full border border-white/5 shadow-sm text-foreground/90 font-medium">
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-primary" />
                                    <span>{doc.author}</span>
                                </div>
                                <div className="w-px h-4 bg-foreground/20" />
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                                </div>
                                <div className="w-px h-4 bg-foreground/20" />
                                <div className="flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    <span>{doc.visitedBy} Views</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Wrapper */}
            <div className="container max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-1000 delay-300">
                <div className="prose prose-lg prose-gray dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h2:text-3xl prose-p:leading-8 prose-img:rounded-xl prose-img:shadow-md">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ node, ...props }) => <h2 className="text-3xl font-bold mt-12 mb-6 scroll-m-20 border-b pb-2 tracking-tight first:mt-0" {...props} />,
                            h2: ({ node, ...props }) => <h3 className="text-2xl font-semibold mt-10 mb-5 scroll-m-20 tracking-tight" {...props} />,
                            h3: ({ node, ...props }) => <h4 className="text-xl font-semibold mt-8 mb-4 scroll-m-20 tracking-tight" {...props} />,
                            p: ({ node, ...props }) => <p className="leading-7 [&:not(:first-child)]:mt-6 text-muted-foreground" {...props} />,
                            ul: ({ node, ...props }) => <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="mt-6 border-l-2 pl-6 italic text-muted-foreground" {...props} />,
                            code: ({ node, className, children, ...props }) => {
                                const match = /language-(\w+)/.exec(className || "");
                                return match ? (
                                    <code className={className} {...props}>{children}</code>
                                ) : (
                                    <code className="bg-muted px-[0.3rem] py-[0.2rem] rounded text-sm font-mono text-foreground font-medium" {...props}>
                                        {children}
                                    </code>
                                )
                            },
                            pre: ({ node, ...props }) => <pre className="p-4 rounded-lg bg-secondary/30 overflow-x-auto my-6 border" {...props} />,
                            img: ({ node, src, alt, ...props }) => (
                                <div className="my-8">
                                    <PausableMedia
                                        src={normalizeSrc(src as string)}
                                        alt={alt || ""}
                                        {...props}
                                        width={800}
                                        height={400}
                                        className="rounded-xl border shadow-sm w-full object-cover"
                                    />
                                    {alt && <p className="text-sm text-center text-muted-foreground mt-2">{alt}</p>}
                                </div>
                            )
                        }}
                    >
                        {doc.content}
                    </ReactMarkdown>
                </div>
            </div>
        </article>
    );
}

function DocSkeleton() {
    return (
        <div className="min-h-screen pb-20">
            <div className="w-full h-[60vh] bg-muted animate-pulse relative">
                <div className="absolute inset-x-0 bottom-0 p-12 space-y-6 container max-w-5xl mx-auto">
                    <Skeleton className="h-16 w-3/4" />
                    <Skeleton className="h-6 w-1/2" />
                </div>
            </div>
            <div className="container max-w-4xl mx-auto px-6 py-12 space-y-8">
                <div className="space-y-4 pt-8">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        </div>
    );
}
