"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

const codeLines = [
	{ text: "query {", indent: 0, color: "text-accent" },
	{ text: "pools(", indent: 1, color: "text-primary" },
	{ text: 'chain: "ethereum"', indent: 2, color: "text-chart-4" },
	{ text: "orderBy: apy", indent: 2, color: "text-chart-4" },
	{ text: "first: 5", indent: 2, color: "text-chart-4" },
	{ text: ") {", indent: 1, color: "text-primary" },
	{ text: "protocol", indent: 2, color: "text-foreground" },
	{ text: "tvl", indent: 2, color: "text-foreground" },
	{ text: "apy", indent: 2, color: "text-foreground" },
	{ text: "apyNormalized", indent: 2, color: "text-primary" },
	{ text: "}", indent: 1, color: "text-primary" },
	{ text: "}", indent: 0, color: "text-accent" },
];

export function APIVisual() {
	const [visibleLines, setVisibleLines] = useState(0);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					let count = 0;
					const interval = setInterval(() => {
						count++;
						setVisibleLines(count);
						if (count >= codeLines.length) clearInterval(interval);
					}, 80);
				}
			},
			{ threshold: 0.3 },
		);

		const el = document.getElementById("api-visual");
		if (el) observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			id="api-visual"
			className="border-border/50 bg-card/80 glow-cyan relative overflow-hidden rounded-2xl border backdrop-blur-sm"
		>
			{/* Header */}
			<div className="border-border/50 flex items-center justify-between border-b px-6 py-4">
				<div className="flex items-center gap-3">
					<div className="flex gap-1.5">
						<div className="bg-destructive/60 h-2.5 w-2.5 rounded-full" />
						<div className="bg-chart-4/60 h-2.5 w-2.5 rounded-full" />
						<div className="bg-chart-3/60 h-2.5 w-2.5 rounded-full" />
					</div>
					<span className="text-muted-foreground font-mono text-xs">
						GraphQL Playground
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<div className="bg-chart-3 h-1.5 w-1.5 animate-pulse rounded-full" />
					<span className="text-chart-3 font-mono text-[10px]">Connected</span>
				</div>
			</div>

			{/* Code */}
			<div className="p-6 font-mono text-sm leading-7">
				{codeLines.map((line, i) => (
					<div
						key={Math.random()}
						className={`transition-all duration-300 ${
							i < visibleLines
								? "translate-y-0 opacity-100"
								: "translate-y-2 opacity-0"
						}`}
						style={{ paddingLeft: `${line.indent * 24}px` }}
					>
						<span className={line.color}>{line.text}</span>
						{i === visibleLines - 1 && (
							<span className="bg-primary ml-1 inline-block h-4 w-2 animate-pulse" />
						)}
					</div>
				))}
			</div>

			{/* Response preview */}
			<motion.div
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.5, delay: 1.5 }}
				className="bg-secondary/50 border-border/30 mx-6 mb-6 rounded-xl border p-4"
			>
				<div className="mb-2 flex items-center gap-2">
					<div className="bg-chart-3 h-1.5 w-1.5 rounded-full" />
					<span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
						Response · 42ms
					</span>
				</div>
				<div className="text-muted-foreground font-mono text-xs">
					<span className="text-accent">{"{"}</span> pools:{" "}
					<span className="text-primary">[</span>
					<span className="text-chart-4"> 5 results</span>
					<span className="text-primary"> ]</span>{" "}
					<span className="text-accent">{"}"}</span>
				</div>
			</motion.div>
		</div>
	);
}
