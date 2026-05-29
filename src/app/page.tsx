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
		label: "Features",
		title: "APY Normalization",
		description:
			"Our engine normalizes yields across every protocol, adjusting for compounding frequency, fee structures, and impermanent loss. Compare apples to apples for the first time.",
		features: [
			{
				icon: GitCompare,
				label: "Cross-protocol comparison",
				desc: "Standardized APY across all DeFi",
			},
			{
				icon: Layers,
				label: "Multi-chain support",
				desc: "20+ chains aggregated in real-time",
			},
			{
				icon: RefreshCw,
				label: "Auto-refresh",
				desc: "Data updated every 60 seconds",
			},
			{
				icon: BarChart3,
				label: "Historical trends",
				desc: "30-day APY history for every pool",
			},
		],
		visual: <APYNormVisual />,
		accentColor: "primary",
		reversed: false,
	},
	{
		label: "Optimizer",
		title: "Powerful Optimizer",
		description:
			"Input your risk tolerance and portfolio size. Our optimizer allocates across protocols to maximize risk-adjusted yield automatically.",
		features: [
			{
				icon: PieChart,
				label: "Smart allocation",
				desc: "ML-driven portfolio optimization",
			},
			{
				icon: Lock,
				label: "Risk-adjusted",
				desc: "Configurable risk parameters",
			},
			{
				icon: RefreshCw,
				label: "Auto-rebalance",
				desc: "Continuous rebalancing on-chain",
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
			"Build on top of our data with a powerful, well-documented GraphQL API. Query pools, yields, protocols, and historical data programmatically.",
		features: [
			{
				icon: Code2,
				label: "GraphQL & REST",
				desc: "Flexible query interface",
			},
			{
				icon: Globe,
				label: "99.9% uptime SLA",
				desc: "Enterprise-grade reliability",
			},
			{
				icon: Webhook,
				label: "Webhooks",
				desc: "Real-time yield change notifications",
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
			"Connect your wallets and get a unified view of all your DeFi positions, PnL tracking, and yield performance over time.",
		features: [
			{
				icon: Wallet,
				label: "Multi-wallet support",
				desc: "Connect unlimited addresses",
			},
			{
				icon: Bell,
				label: "Smart alerts",
				desc: "Yield drop & opportunity notifications",
			},
			{
				icon: History,
				label: "Full history",
				desc: "Complete transaction & yield history",
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
					<React.Fragment key={i}>
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
