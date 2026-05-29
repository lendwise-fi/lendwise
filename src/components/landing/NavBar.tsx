"use client";

import { Menu, X, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function NavBar() {
	const [scrolled, setScrolled] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 20);
		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const links = ["Features", "API", "Portfolio", "Docs"];

	return (
		<motion.nav
			initial={{ y: -20, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.6, ease: "easeOut" }}
			className={`fixed top-0 right-0 left-0 z-50 transition-all duration-500 ${
				scrolled
					? "bg-background/80 border-border/50 border-b backdrop-blur-xl"
					: "bg-transparent"
			}`}
		>
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
				<div className="flex items-center gap-2">
					<div className="bg-primary/10 border-primary/20 glow-cyan flex h-8 w-8 items-center justify-center rounded-lg border">
						<Zap className="text-primary h-4 w-4" />
					</div>
					<span className="font-inter text-lg font-bold tracking-tight">
						Lend<span className="text-primary">wise</span>
					</span>
				</div>

				<div className="hidden items-center gap-8 md:flex">
					{links.map((link) => (
						<a
							key={link}
							href={`#${link.toLowerCase()}`}
							className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-300"
						>
							{link}
						</a>
					))}
				</div>

				<div className="hidden items-center gap-3 md:flex">
					<Link
						href="/portfolio"
						className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2 text-sm font-medium"
					>
						Launch App
					</Link>
				</div>

				<button
					type="button"
					className="text-muted-foreground md:hidden"
					onClick={() => setMobileOpen(!mobileOpen)}
				>
					{mobileOpen ? (
						<X className="h-5 w-5" />
					) : (
						<Menu className="h-5 w-5" />
					)}
				</button>
			</div>

			{mobileOpen && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="bg-card/95 border-border border-b px-6 pt-2 pb-6 backdrop-blur-xl md:hidden"
				>
					{links.map((link) => (
						<a
							key={link}
							href={`#${link.toLowerCase()}`}
							className="text-muted-foreground hover:text-foreground block py-3 text-sm"
							onClick={() => setMobileOpen(false)}
						>
							{link}
						</a>
					))}
					<Button
						className="bg-primary text-primary-foreground mt-4 w-full"
						size="sm"
					>
						Get Started
					</Button>
				</motion.div>
			)}
		</motion.nav>
	);
}
