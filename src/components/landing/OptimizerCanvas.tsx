'use client'

import { useEffect, useRef } from 'react'

const PROTOCOLS = [
  { name: 'Morpho', apy: 6.84, color: '#3B82F6' },
  { name: 'Aave v3', apy: 3.19, color: '#B382E8' },
  { name: 'Compound', apy: 5.93, color: '#00D395' },
  { name: 'Yearn', apy: 10.12, color: '#F59E0B' },
  { name: 'Spark', apy: 4.8, color: '#EF4444' },
]

const BASE_ALLOC = [0.35, 0.1, 0.2, 0.25, 0.1]

export default function OptimizerCanvas() {
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
      t += 0.015

      const animAlloc = BASE_ALLOC.map((a, i) => Math.max(0.05, a + 0.06 * Math.sin(t + i * 1.3)))
      const total = animAlloc.reduce((s, v) => s + v, 0)
      const normAlloc = animAlloc.map(v => v / total)

      const cx = W * 0.46
      const cy = H * 0.5
      const donutR = Math.min(W, H) * 0.3
      const donutInner = donutR * 0.54

      let startAngle = -Math.PI / 2
      normAlloc.forEach((alloc, i) => {
        const sweep = alloc * Math.PI * 2
        const endAngle = startAngle + sweep
        const mid = startAngle + sweep / 2

        const gx = cx + Math.cos(mid) * donutR * 0.72
        const gy = cy + Math.sin(mid) * donutR * 0.72
        const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, donutR * 0.25)
        grd.addColorStop(0, PROTOCOLS[i].color + '50')
        grd.addColorStop(1, 'transparent')
        ctx.save()
        ctx.beginPath()
        ctx.arc(gx, gy, donutR * 0.25, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, donutR, startAngle, endAngle)
        ctx.closePath()
        ctx.fillStyle = PROTOCOLS[i].color
        ctx.globalAlpha = 0.85
        ctx.fill()

        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath()
        ctx.arc(cx, cy, donutInner, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        ctx.restore()

        if (alloc > 0.08) {
          const lx = cx + Math.cos(mid) * (donutR + 16)
          const ly = cy + Math.sin(mid) * (donutR + 16)
          ctx.save()
          ctx.font = 'bold 9px sans-serif'
          ctx.fillStyle = PROTOCOLS[i].color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.globalAlpha = 0.9
          ctx.fillText(`${Math.round(normAlloc[i] * 100)}%`, lx, ly)
          ctx.restore()
        }

        startAngle = endAngle
      })

      const weightedApy = PROTOCOLS.reduce((s, p, i) => s + p.apy * normAlloc[i], 0)
      ctx.save()
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${weightedApy.toFixed(2)}%`, cx, cy - 7)
      ctx.font = '9px sans-serif'
      ctx.fillStyle = '#aaa'
      ctx.fillText('blended APY', cx, cy + 9)
      ctx.restore()

      const legendX = W * 0.76
      const barMaxW = W * 0.16
      PROTOCOLS.forEach((p, i) => {
        const y = H * 0.14 + i * (H * 0.71 / (PROTOCOLS.length - 1))
        const barLen = normAlloc[i] * barMaxW * 3

        ctx.save()
        if (barLen > 0) {
          ctx.beginPath()
          ctx.roundRect(legendX, y - 5, barLen, 10, 3)
          ctx.fillStyle = p.color
          ctx.globalAlpha = 0.8
          ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.font = '9px sans-serif'
        ctx.fillStyle = p.color
        ctx.textAlign = 'left'
        ctx.fillText(p.name, legendX, y - 9)
        ctx.fillStyle = '#888'
        ctx.font = '8px monospace'
        ctx.fillText(`${p.apy}%`, legendX + Math.max(barLen, 4) + 4, y + 1)
        ctx.restore()
      })

      const inputs = [
        { label: 'Risk', val: 'Balanced', color: '#6378ff' },
        { label: 'Horizon', val: '3M', color: '#06b6d4' },
        { label: 'Capital', val: '$50K', color: '#00D395' },
      ]
      inputs.forEach((inp, i) => {
        const y = H * 0.28 + i * (H * 0.21)
        const x = W * 0.09
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x - 28, y - 14, 70, 26, 6)
        ctx.fillStyle = inp.color + '18'
        ctx.strokeStyle = inp.color + '70'
        ctx.lineWidth = 1
        ctx.fill()
        ctx.stroke()
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#888'
        ctx.textAlign = 'center'
        ctx.fillText(inp.label, x + 7, y - 4)
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = inp.color
        ctx.fillText(inp.val, x + 7, y + 8)
        ctx.restore()
      })

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
