'use client'

import { useEffect, useRef } from 'react'

const QUERIES = [
  'query { yields { protocol apy normalized } }',
  'query { optimize(risk: BALANCED) { allocations } }',
  'query { history(token:"USDC") { date apy } }',
]

const NODES = [
  { label: 'Hedge Fund', color: '#F59E0B', angleDeg: 270 },
  { label: 'DeFi App', color: '#3B82F6', angleDeg: 30 },
  { label: 'Blockchain', color: '#00D395', angleDeg: 150 },
]

interface Packet {
  nodeIdx: number
  progress: number
  dir: number
}

export default function ApiCanvas() {
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
    const packets: Packet[] = []
    let packetTimer = 0

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      if (W === 0 || H === 0) { raf = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, W, H)
      t += 0.016
      packetTimer += 0.016

      const cx = W * 0.5
      const cy = H * 0.5
      const orbitR = Math.min(W, H) * 0.32
      const centerR = 34

      if (packetTimer > 1.0) {
        packetTimer = 0
        const ni = Math.floor(Math.random() * NODES.length)
        packets.push({ nodeIdx: ni, progress: 0, dir: Math.random() > 0.5 ? 1 : -1 })
      }

      const nodePositions = NODES.map(n => {
        const rad = (n.angleDeg * Math.PI) / 180
        return { x: cx + Math.cos(rad) * orbitR, y: cy + Math.sin(rad) * orbitR, ...n }
      })

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2)
      ctx.strokeStyle = '#6378ff30'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      nodePositions.forEach(node => {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(node.x, node.y)
        ctx.strokeStyle = node.color + '30'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      })

      for (let idx = packets.length - 1; idx >= 0; idx--) {
        const pkt = packets[idx]
        pkt.progress += 0.009
        const node = nodePositions[pkt.nodeIdx]
        const sx = pkt.dir > 0 ? node.x : cx
        const sy = pkt.dir > 0 ? node.y : cy
        const ex = pkt.dir > 0 ? cx : node.x
        const ey = pkt.dir > 0 ? cy : node.y
        const px = sx + (ex - sx) * pkt.progress
        const py = sy + (ey - sy) * pkt.progress

        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = NODES[pkt.nodeIdx].color
        ctx.shadowColor = NODES[pkt.nodeIdx].color
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.restore()

        if (pkt.progress >= 1) packets.splice(idx, 1)
      }

      nodePositions.forEach(node => {
        const nodeR = 24
        ctx.save()
        ctx.beginPath()
        ctx.arc(node.x, node.y, nodeR, 0, Math.PI * 2)
        ctx.fillStyle = node.color + '20'
        ctx.strokeStyle = node.color + '90'
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = node.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const words = node.label.split(' ')
        ctx.fillText(words[0], node.x, node.y - (words[1] ? 5 : 0))
        if (words[1]) {
          ctx.font = '7px sans-serif'
          ctx.fillStyle = '#aaa'
          ctx.fillText(words[1], node.x, node.y + 5)
        }
        ctx.restore()
      })

      const pulse = 1 + 0.05 * Math.sin(t * 2)
      const hubGrd = ctx.createRadialGradient(cx, cy, 2, cx, cy, centerR * pulse)
      hubGrd.addColorStop(0, '#6378ff')
      hubGrd.addColorStop(1, '#06b6d4')

      ctx.save()
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t)
      ctx.beginPath()
      ctx.arc(cx, cy, (centerR + 18) * pulse, 0, Math.PI * 2)
      ctx.fillStyle = '#6378ff'
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, centerR * pulse, 0, Math.PI * 2)
      ctx.fillStyle = hubGrd
      ctx.fill()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('GraphQL', cx, cy - 5)
      ctx.font = '8px sans-serif'
      ctx.fillText('API', cx, cy + 7)
      ctx.restore()

      const qIdx = Math.floor(t / 3.5) % QUERIES.length
      const query = QUERIES[qIdx]
      const charProgress = Math.min(((t % 3.5) / 3.5) * query.length * 1.2, query.length)
      const displayed = query.slice(0, Math.floor(charProgress))

      ctx.save()
      ctx.font = '8px monospace'
      ctx.fillStyle = '#6378ffaa'
      ctx.textAlign = 'center'
      ctx.fillText(displayed + (Math.floor(t * 3) % 2 === 0 ? '|' : ''), cx, H - 16)
      ctx.restore()

      const rtX = W * 0.84
      const rtY = H * 0.14
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(rtX - 30, rtY - 10, 68, 20, 10)
      ctx.fillStyle = '#00D39520'
      ctx.strokeStyle = '#00D39560'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = '#00D395'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`<${Math.round(80 + 15 * Math.sin(t))}ms`, rtX + 4, rtY)
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
