"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Terminal, Server, Shield } from "lucide-react"

export function LandingHero() {
    return (
        <div className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden py-10 md:py-20 lg:py-28">
            {/* Background Gradients */}
            <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]">
                <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="container flex flex-col items-center text-center"
            >
                <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-secondary/50 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
                    <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                    v1.0 is now live
                </div>

                <h1 className="max-w-[1000px] text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                    The Modern Frontend for <br className="hidden sm:inline" />
                    <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                        Proxmox Virtual Environment
                    </span>
                </h1>

                <p className="mt-6 max-w-[700px] text-lg text-muted-foreground md:text-xl">
                    Uma provides a seamless, secure, and beautiful interface for managing your Proxmox clusters.
                    Experience the future of virtualization management.
                </p>

                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:gap-6">
                    <Button asChild size="lg" className="h-12 min-w-[150px] rounded-full text-base">
                        <Link href="/login">
                            Get Started <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="h-12 min-w-[150px] rounded-full px-8 text-base">
                        <Link href="/docs">
                            Documentation
                        </Link>
                    </Button>
                </div>

                {/* Feature Grid Mini */}
                <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
                    <FeatureItem icon={Terminal} title="Modern API" description="Built ensuring type-safety and performance." />
                    <FeatureItem icon={Server} title="Resource Pools" description="Manage access with granular ACLs." />
                    <FeatureItem icon={Shield} title="Secure by Design" description="Enterprise-grade security defaults." />
                </div>
            </motion.div>
        </div>
    )
}

function FeatureItem({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
    return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-muted p-6 transition-all hover:bg-muted/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    )
}
