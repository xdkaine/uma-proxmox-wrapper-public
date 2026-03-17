"use client";

import { useSWRConfig } from "swr";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const formSchema = z.object({
    username: z.string().min(2, {
        message: "Username must be at least 2 characters.",
    }),
    password: z.string().min(1, {
        message: "Password is required.",
    }),
});

export default function LoginPage() {
    const { mutate } = useSWRConfig();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isAnimated, setIsAnimated] = useState(false);

    useEffect(() => {
        const savedMode = localStorage.getItem('uma-icon-mode');
        if (savedMode === 'animated') {
            setIsAnimated(true);
        }
    }, []);

    const toggleIconMode = () => {
        const newMode = !isAnimated;
        setIsAnimated(newMode);
        localStorage.setItem('uma-icon-mode', newMode ? 'animated' : 'static');
    };

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Login failed");
            }

            // Successful login
            await mutate("/api/user"); // Force revalidation of user session
            router.push("/dashboard");
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-[350px]">
                <CardHeader className="text-center">
                    <div
                        className="flex justify-center mb-2 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                        onClick={toggleIconMode}
                        title="Click for a surprise!"
                    >
                        {isAnimated ? (
                            <Image
                                src="/uma.gif"
                                alt="Uma Server"
                                width={48}
                                height={48}
                                unoptimized
                            />
                        ) : (
                            <Server className="h-12 w-12 text-primary" />
                        )}
                    </div>
                    <CardTitle className="text-3xl">Uma</CardTitle>
                    <CardDescription>Enter your SDC.CPP credentials to access Uma.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            <FormField
                                control={form.control}
                                name="username"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Username</FormLabel>
                                        <FormControl>
                                            <Input placeholder="kitasanblack" autoComplete="username" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {error && (
                                <div className="text-sm font-medium text-destructive">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Signing in..." : "Sign In"}
                            </Button>

                            <div className="flex flex-col items-center space-y-2 mt-4 text-sm text-muted-foreground">
                                <p>
                                    Don't have an account?{" "}
                                    <a href="https://portal.sdc.cpp/" className="underline hover:text-primary">
                                        Request Access
                                    </a>
                                </p>
                                <a href="https://portal.sdc.cpp/forgot-password" className="underline hover:text-primary">
                                    Forgot your password?
                                </a>
                                <p>
                                    Need help? Contact{" "}
                                    <a href="mailto:soc@cpp.edu" className="underline hover:text-primary">
                                        soc@cpp.edu
                                    </a>
                                </p>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
