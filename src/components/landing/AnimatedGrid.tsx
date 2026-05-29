'use client'

import { useEffect, useRef } from 'react'

export function AnimatedGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animationId = 0
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Dot = {
      x: number
      y: number
      baseAlpha: number
      phase: number
      speed: number
    }
    const dots: Dot[] = []
    const spacing = 60

    const initDots = () => {
      dots.length = 0
      const cols = Math.ceil(canvas.width / spacing) + 1
      const rows = Math.ceil(canvas.height / spacing) + 1
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          dots.push({
            x: i * spacing,
            y: j * spacing,
            baseAlpha: Math.random() * 0.3 + 0.05,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.5 + 0.3,
          })
        }
      }
    }
    initDots()

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      time += 0.01

      const cx = canvas.width / 2
      const cy = canvas.height / 2

      dots.forEach((dot) => {
        const dx = dot.x - cx
        const dy = dot.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxDist = Math.sqrt(cx * cx + cy * cy)
        const proximity = 1 - dist / maxDist

        const pulse = Math.sin(time * dot.speed + dot.phase) * 0.5 + 0.5
        const wave = Math.sin(dist * 0.005 - time * 2) * 0.5 + 0.5
        const alpha =
          dot.baseAlpha *
          (0.3 + proximity * 0.7) *
          (0.5 + pulse * 0.3 + wave * 0.2)

        const size = 1 + proximity * 1.5 * pulse

        // Cyan tint for center dots, white for edges
        const isCyan = proximity > 0.5 && pulse > 0.6

        ctx.beginPath()
        ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2)
        if (isCyan) {
          ctx.fillStyle = `hsla(185, 90%, 55%, ${alpha * 1.5})`
        } else {
          ctx.fillStyle = `hsla(210, 20%, 80%, ${alpha})`
        }
        ctx.fill()
      })

      // Draw occasional connecting lines
      ctx.strokeStyle = 'hsla(185, 90%, 55%, 0.03)'
      ctx.lineWidth = 0.5
      for (let i = 0; i < dots.length; i += 7) {
        const dot = dots[i]
        const pulse = Math.sin(time * dot.speed + dot.phase)
        if (pulse > 0.8) {
          const nextIdx = i + 1 < dots.length ? i + 1 : 0
          ctx.beginPath()
          ctx.moveTo(dot.x, dot.y)
          ctx.lineTo(dots[nextIdx].x, dots[nextIdx].y)
          ctx.stroke()
        }
      }

      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 0.6 }}
    />
  )
}
