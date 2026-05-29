"use client";

import { ArrowRight, Play } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedGrid } from "./AnimatedGrid";

export function HeroSection() {
	return (
		<section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
			{/* Background layers */}
			<AnimatedGrid />
			<div className="from-background via-background/90 to-background pointer-events-none absolute inset-0 bg-linear-to-b" />

			{/* Radial glow */}
			<div className="bg-primary/5 pointer-events-none absolute top-1/3 left-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" />
			<div className="bg-accent/5 pointer-events-none absolute top-1/2 left-1/3 h-[400px] w-[400px] rounded-full blur-[100px]" />

			<div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
				{/* Badge */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6 }}
					className="border-primary/20 bg-primary/5 mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
				>
					<div className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
					<span className="text-primary text-xs font-medium tracking-wide uppercase">
						DeFi Yield Aggregator
					</span>
				</motion.div>

				{/* Heading */}
				<motion.h1
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.1 }}
					className="font-inter mb-6 text-5xl leading-[0.95] font-bold tracking-tight sm:text-6xl lg:text-8xl"
				>
					One view for
					<br />
					<span className="text-primary text-glow-cyan">all DeFi</span> yields
				</motion.h1>

				{/* Subtitle */}
				<motion.p
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.2 }}
					className="text-muted-foreground mx-auto mb-10 max-w-2xl text-lg leading-relaxed font-light sm:text-xl"
				>
					Track, compare and optimize yields across hundreds of DeFi protocols.
					Normalize APY data and find the best opportunities in seconds.
				</motion.p>

				{/* CTAs */}
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.3 }}
					className="flex flex-col items-center justify-center gap-4 sm:flex-row"
				>
					<Link
						href="/portfolio"
						className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan group px-6 py-4 rounded-xl text-sm font-semibold"
					>
						Start Optimizing
						<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
					</Link>
					<Button
						size="lg"
						variant="outline"
						className="border-border/60 text-muted-foreground hover:text-foreground hover:border-border group px-6 h-13 rounded-xl text-sm font-medium"
					>
						<Play className="group-hover:text-primary mr-2 h-4 w-4 transition-colors" />
						Watch Demo
					</Button>
				</motion.div>

				{/* Stats row */}
				<motion.div
					initial={{ opacity: 0, y: 40 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.5 }}
					className="mt-20 flex items-center justify-center gap-8 sm:gap-16"
				>
					{[
						{ value: "20+", label: "Blockchains" },
						{ value: "6K+", label: "Protocols" },
						{ value: "<1s", label: "Latency" },
					].map((stat, i) => (
						<div key={i} className="text-center">
							<div className="font-inter text-foreground text-2xl font-bold sm:text-3xl">
								{stat.value}
							</div>
							<div className="text-muted-foreground mt-1 text-xs tracking-wide uppercase">
								{stat.label}
							</div>
						</div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
