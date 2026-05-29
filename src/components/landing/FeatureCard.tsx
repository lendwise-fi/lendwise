'use client'

import { motion } from 'motion/react'
import type { ComponentType, ReactNode, SVGProps } from 'react'

type Feature = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  desc?: string
}

export type FeatureCardProps = {
  label: string
  title: string
  description: string
  features?: Feature[]
  visual: ReactNode
  reversed?: boolean
  accentColor?: 'primary' | 'accent'
}

export function FeatureCard({
  label,
  title,
  description,
  features,
  visual,
  reversed = false,
  accentColor = 'primary',
}: FeatureCardProps) {
  const textGlowClass =
    accentColor === 'primary' ? 'text-primary' : 'text-accent'
  const borderClass =
    accentColor === 'primary' ? 'border-primary/20' : 'border-accent/20'
  const bgClass = accentColor === 'primary' ? 'bg-primary/5' : 'bg-accent/5'
  const dotClass = accentColor === 'primary' ? 'bg-primary' : 'bg-accent'
  const iconBg = accentColor === 'primary' ? 'bg-primary/10' : 'bg-accent/10'
  const iconBorder =
    accentColor === 'primary' ? 'border-primary/20' : 'border-accent/20'

  return (
    <section
      id={label?.toLowerCase().replace(/\s/g, '')}
      className="px-6 py-48"
    >
      <div
        className={`mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2 ${reversed ? 'lg:direction-rtl' : ''}`}
      >
        {/* Content */}
        <motion.div
          initial={{ opacity: 0, x: reversed ? 40 : -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className={
            reversed ? 'lg:direction-ltr lg:order-2' : 'lg:direction-ltr'
          }
        >
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${borderClass} ${bgClass} mb-6`}
          >
            <div className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
            <span
              className={`text-xs font-medium ${textGlowClass} tracking-wide uppercase`}
            >
              {label}
            </span>
          </div>

          <h3 className="font-inter mb-5 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            {title}
          </h3>

          <p className="text-muted-foreground mb-8 text-base leading-relaxed">
            {description}
          </p>

          {features && (
            <div className="space-y-4">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div
                    className={`h-7 w-7 rounded-lg ${iconBg} border ${iconBorder} mt-0.5 flex shrink-0 items-center justify-center`}
                  >
                    <feature.icon className={`h-3.5 w-3.5 ${textGlowClass}`} />
                  </div>
                  <div>
                    <span className="text-foreground text-sm font-medium">
                      {feature.label}
                    </span>
                    {feature.desc && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {feature.desc}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, x: reversed ? -40 : 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className={reversed ? 'lg:order-1' : ''}
        >
          {visual}
        </motion.div>
      </div>
    </section>
  )
}
