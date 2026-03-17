'use client';

import Link from "next/link";
import { Server } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";

export function NavbarLogo() {
    const [isAnimated, setIsAnimated] = useState(false);

    useEffect(() => {
        const savedMode = localStorage.getItem('navbar-icon-mode');
        if (savedMode === 'animated') {
            setIsAnimated(true);
        }
    }, []);

    const toggleIconMode = () => {
        const newMode = !isAnimated;
        setIsAnimated(newMode);
        localStorage.setItem('navbar-icon-mode', newMode ? 'animated' : 'static');
    };

    return (
        <Link href="/" className="flex items-center space-x-2">
            <div
                onClick={(e) => {
                    e.preventDefault();
                    toggleIconMode();
                }}
                className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                title="Click for a surprise!"
            >
                {isAnimated ? (
                    <Image
                        src="/umamusume-satono-diamond.gif"
                        alt="Uma"
                        width={24}
                        height={24}
                        unoptimized
                    />
                ) : (
                    <Server className="h-6 w-6" />
                )}
            </div>
            <span className="hidden font-bold sm:inline-block">
                Uma
            </span>
        </Link>
    );
}
