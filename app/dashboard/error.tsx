'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Dashboard Error:', error);
    }, [error]);

    return (
        <div className="p-8 flex items-center justify-center min-h-[50vh]">
            <Card className="w-full max-w-md border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Something went wrong!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {error.message || "An unexpected error occurred."}
                    </p>
                    {error.stack && (
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                            {error.stack}
                        </pre>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Reload Page
                        </Button>
                        <Button onClick={() => reset()}>Try again</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
