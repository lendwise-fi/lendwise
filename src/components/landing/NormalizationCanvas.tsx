'use client'

import { useEffect, useRef } from 'react'

const PROTOCOLS = [
  { name: 'Morpho', rawLabel: '7.37% APR', color: '#3B82F6' },
  { name: 'Aave v3', rawLabel: '3.21% Net', color: '#B382E8' },
  { name: 'Compound', rawLabel: '6.12% Borrow', color: '#00D395' },
  { name: 'Yearn', rawLabel: '~12% Est.', color: '#F59E0B' },
]

export default function NormalizationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number

    const setSize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }
    setSize()

    const ro = new ResizeObserver(setSize)
    ro.observe(canvas)

    let t = 0

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      if (W === 0 || H === 0) { raf = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, W, H)
      t += 0.012

      const progress = (Math.sin(t * 0.6) + 1) / 2

      const leftX = W * 0.22
      const rightX = W * 0.78
      const centerX = W * 0.5
      const centerY = H * 0.5

      PROTOCOLS.forEach((p, i) => {
        const y = H * 0.18 + i * (H * 0.64 / (PROTOCOLS.length - 1))
        const alpha = 0.7 + 0.3 * Math.sin(t + i)
        const bw = 100, bh = 34

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.roundRect(leftX - bw / 2, y - bh / 2, bw, bh, 8)
        ctx.fillStyle = p.color + '20'
        ctx.fill()
        ctx.strokeStyle = p.color + '90'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = p.color
        ctx.font = 'bold 11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(p.name, leftX, y - 4)
        ctx.font = '9px monospace'
        ctx.globalAlpha = alpha * 0.65
        ctx.fillText(p.rawLabel, leftX, y + 9)
        ctx.restore()

        const arrowProgress = Math.min(progress * 1.5, 1)
        const ax = leftX + bw / 2 + 6
        const ex = centerX - 36 - (1 - arrowProgress) * 60
        ctx.save()
        ctx.globalAlpha = 0.2 + 0.35 * arrowProgress
        ctx.beginPath()
        ctx.moveTo(ax, y)
        ctx.lineTo(ex, centerY)
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      })

      const engineR = 30 + 4 * Math.sin(t * 1.5)
      const grd = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, engineR)
      grd.addColorStop(0, '#6378ff')
      grd.addColorStop(1, '#06b6d4')

      ctx.save()
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t)
      ctx.beginPath()
      ctx.arc(centerX, centerY, engineR + 18, 0, Math.PI * 2)
      ctx.fillStyle = '#6378ff'
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.arc(centerX, centerY, engineR, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
      ctx.font = 'bold 10px sans-serif'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('ENGINE', centerX, centerY - 5)
      ctx.font = '8px sans-serif'
      ctx.fillText('Normalize', centerX, centerY + 7)
      ctx.restore()

      const normalizedApys = [6.84, 3.19, 5.93, 10.12]
      const maxApy = Math.max(...normalizedApys)

      normalizedApys.forEach((apy, i) => {
        const y = H * 0.18 + i * (H * 0.64 / (normalizedApys.length - 1))
        const barMaxW = 80
        const barLen = (apy / maxApy) * barMaxW * progress
        const col = PROTOCOLS[i].color
        const bx = rightX - barMaxW / 2

        ctx.save()
        ctx.globalAlpha = 0.2 + 0.3 * progress
        ctx.beginPath()
        ctx.moveTo(centerX + 34, centerY)
        ctx.lineTo(bx - 8, y)
        ctx.strokeStyle = col
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        ctx.save()
        ctx.globalAlpha = progress * 0.9
        if (barLen > 0) {
          ctx.beginPath()
          ctx.roundRect(bx, y - 7, barLen, 12, 3)
          ctx.fillStyle = col
          ctx.fill()
        }
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = col
        ctx.textAlign = 'left'
        ctx.fillText(`${apy.toFixed(2)}%`, bx + barLen + 4, y + 1)
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#888'
        ctx.fillText('norm. APY', bx, y + 14)
        ctx.restore()
      })

      ctx.save()
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.globalAlpha = 0.6
      ctx.fillStyle = '#6378ff'
      ctx.fillText('RAW INPUT', leftX, H * 0.08)
      ctx.fillStyle = '#06b6d4'
      ctx.fillText('NORMALIZED', rightX, H * 0.08)
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
