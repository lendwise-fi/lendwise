"use client";

import {
	BarChart3,
	Bell,
	Code2,
	GitCompare,
	Globe,
	History,
	Layers,
	Lock,
	PieChart,
	RefreshCw,
	Wallet,
	Webhook,
} from "lucide-react";
import React from "react";

import { CTASection } from "@/components/landing/CTASection";
import {
	FeatureCard,
	type FeatureCardProps,
} from "@/components/landing/FeatureCard";
import { Footer } from "@/components/landing/Footer";
import { HeroSection } from "@/components/landing/HeroSection";
import { NavBar } from "@/components/landing/NavBar";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { APIVisual } from "@/components/landing/visuals/APIVisual";
import { APYNormVisual } from "@/components/landing/visuals/APYNormVisual";
import { OptimizerVisual } from "@/components/landing/visuals/OptimizerVisual";
import { PortfolioVisual } from "@/components/landing/visuals/PortfolioVisual";

const features: FeatureCardProps[] = [
	{
		label: "Stnadard",
		title: "Market intelligence",
		description:
			"Our engine standardizes lending yield data across protocols, vaults and chains, adjusting for rate conventions and averaging windows. Compare protocols, vaults and chains using standardized metrics, historical trends and market context.",
		features: [
			{
				icon: GitCompare,
				label: "Cross-protocol analytics",
				desc: "Standardized yields across AAVE, Morpho, Compound and more.",
			},
			{
				icon: Layers,
				label: "Multi-chain coverage",
				desc: "Lending opportunities across 10+ blockchains.",
			},
			{
				icon: RefreshCw,
				label: "Live market data",
				desc: "APYs and market conditions updated every 60 seconds.",
			},
			{
				icon: BarChart3,
				label: "Historical trends",
				desc: "Compare APY trends across markets and vaults.",
			},
		],
		visual: <APYNormVisual />,
		accentColor: "primary",
		reversed: false,
	},
	{
		label: "Optimizer",
		title: "Optimization engine",
		description:
			"Optimize lending and borrowing strategies across protocols, vaults and chains using configurable risk preferences and market constraints.",
		features: [
			{
				icon: PieChart,
				label: "Smart strategy",
				desc: "Identify opportunities based on yield, risk and market conditions.",
			},
			{
				icon: Lock,
				label: "Risk-aware",
				desc: "Configure risk preferences and diversification levels.",
			},
			{
				icon: RefreshCw,
				label: "Auto-rebalance",
				desc: "Automated on-chain rebalancing as markets evolve.",
			},
		],
		visual: <OptimizerVisual />,
		accentColor: "accent",
		reversed: true,
	},
	{
		label: "API",
		title: "GraphQL API",
		description:
			"Access standardized lending yield, protocol and market data through a simple API built for production",
		features: [
			{
				icon: Code2,
				label: "GraphQL & REST",
				desc: "Flexible query interface.",
			},
			{
				icon: Globe,
				label: "99.9% uptime SLA",
				desc: "Enterprise-grade reliability.",
			},
			{
				icon: Webhook,
				label: "Webhooks",
				desc: "Real-time yield change notifications.",
			},
		],
		visual: <APIVisual />,
		accentColor: "primary",
		reversed: false,
	},
	{
		label: "Portfolio",
		title: "Portfolio Tracker",
		description:
			"Connect your wallets and monitor lending positions, PnL and yield performance from a unified dashboard.",
		features: [
			{
				icon: Wallet,
				label: "Multi-wallet support",
				desc: "Connect unlimited addresses.",
			},
			{
				icon: Bell,
				label: "Smart alerts",
				desc: "Stay informed on market movements.",
			},
			{
				icon: History,
				label: "Full history",
				desc: "Access historical yields and transactions.",
			},
		],
		visual: <PortfolioVisual />,
		accentColor: "accent",
		reversed: true,
	},
];

export default function Home() {
	return (
		<div className="bg-background text-foreground noise-overlay relative overflow-hidden">
			<div className="relative z-10">
				<NavBar />
				<HeroSection />
				<ProblemSection />

				{/* Divider */}
				<div className="mx-auto max-w-6xl px-6">
					<div className="via-border h-px bg-linear-to-r from-transparent to-transparent" />
				</div>

				{features.map((feature, i) => (
					<React.Fragment key={feature.label}>
						<FeatureCard {...feature} />
						{i < features.length - 1 && (
							<div className="mx-auto max-w-6xl px-6">
								<div className="via-border/50 h-px bg-linear-to-r from-transparent to-transparent" />
							</div>
						)}
					</React.Fragment>
				))}

				<CTASection />
				<Footer />
			</div>
		</div>
	);
}
