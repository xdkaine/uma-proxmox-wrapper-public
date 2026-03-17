"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const LinkPreview = ({ url }: { url: string }) => {
    const [data, setData] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        setLoading(true);
        fetch(`/api/metadata?url=${encodeURIComponent(url)}`)
            .then(res => res.json())
            .then(d => {
                if (d.error) throw new Error(d.error);
                setData(d);
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [url]);

    if (error || (!loading && !data?.title)) {
        return <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{url}</a>;
    }

    if (loading) {
        return (
            <div className="flex flex-col gap-2 p-2 border rounded-md my-1 max-w-[300px] bg-muted/20">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </div>
        );
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block my-2 no-underline group">
            <div className="border rounded-md overflow-hidden bg-card hover:bg-muted/50 transition-colors max-w-[300px]">
                {data.image ? (
                    <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={data.image}
                            alt={data.title}
                            className="w-full max-h-[250px] object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 flex items-center gap-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-3 w-3" />
                            <span>Click to open on {new URL(url).hostname}</span>
                        </div>
                    </div>
                ) : (
                    <div className="p-3">
                        <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">{data.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{data.description}</p>
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                            <ExternalLink className="h-3 w-3" />
                            {new URL(url).hostname}
                        </div>
                    </div>
                )}
            </div>
        </a>
    );
};

export const CustomLink = (props: any) => {
    const { href } = props;
    if (!href) return <span {...props} />;

    if (href.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={href} alt="embedded content" className="rounded-md max-w-full my-2 border shadow-sm max-h-[200px] object-contain" />
        );
    }

    return <LinkPreview url={href} />;
};
