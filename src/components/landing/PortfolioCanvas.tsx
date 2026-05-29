'use client'

import { useEffect, useRef } from 'react'

const SUPPLY_POSITIONS = [
  {
    protocol: 'Morpho',
    network: 'Ethereum',
    token: 'USDC',
    amount: '$124,500',
    apy: '6.84%',
    health: null,
    color: '#3B82F6',
    type: 'supply',
  },
  {
    protocol: 'Aave v3',
    network: 'Arbitrum',
    token: 'WETH',
    amount: '$87,200',
    apy: '3.21%',
    health: null,
    color: '#B382E8',
    type: 'supply',
  },
  {
    protocol: 'Compound',
    network: 'Ethereum',
    token: 'DAI',
    amount: '$43,100',
    apy: '5.93%',
    health: null,
    color: '#00D395',
    type: 'supply',
  },
]

const BORROW_POSITIONS = [
  {
    protocol: 'Aave v3',
    network: 'Ethereum',
    token: 'USDT',
    amount: '$38,000',
    rate: '3.18%',
    health: 1.82,
    color: '#B382E8',
    type: 'borrow',
  },
  {
    protocol: 'Morpho',
    network: 'Linea',
    token: 'WBTC',
    amount: '$21,500',
    rate: '4.50%',
    health: 2.41,
    color: '#3B82F6',
    type: 'borrow',
  },
]

const COL_W = [90, 72, 56, 88, 70, 66]
const ROW_H = 34
const HEADER_H = 26

function getHealthColor(h: number) {
  if (h >= 2) return '#00D395'
  if (h >= 1.5) return '#F59E0B'
  return '#EF4444'
}

type RowKind = 'supply' | 'borrow'

interface SupplyRow {
  protocol: string
  network: string
  token: string
  amount: string
  apy: string
  health: null
  color: string
  type: string
}
interface BorrowRow {
  protocol: string
  network: string
  token: string
  amount: string
  rate: string
  health: number
  color: string
  type: string
}

export default function PortfolioCanvas() {
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
    let highlightRow = -1
    let highlightTimer = 0

    const drawTable = (
      rows: (SupplyRow | BorrowRow)[],
      startX: number,
      startY: number,
      headers: string[],
      colorKey: RowKind,
      label: string,
      labelColor: string
    ) => {
      const W = canvas.width
      const totalW = COL_W.reduce((s, v) => s + v, 0)
      const scale = Math.min(1, (W - 40) / totalW)
      const scaledCols = COL_W.map((c) => c * scale)
      const scaledRow = ROW_H * scale
      const scaledHeader = HEADER_H * scale

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(startX, startY - 22, 90, 18, 9)
      ctx.fillStyle = labelColor + '25'
      ctx.fill()
      ctx.font = `bold ${Math.max(8, 9 * scale)}px sans-serif`
      ctx.fillStyle = labelColor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, startX + 10, startY - 13)
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(startX, startY, totalW * scale, scaledHeader, [6, 6, 0, 0])
      ctx.fillStyle = '#ffffff08'
      ctx.fill()
      ctx.restore()

      let cx = startX
      headers.forEach((h, i) => {
        ctx.save()
        ctx.font = `${Math.max(7, 8 * scale)}px sans-serif`
        ctx.fillStyle = '#666'
        ctx.textAlign = i === 0 ? 'left' : 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          h.toUpperCase(),
          i === 0 ? cx + 10 : cx + scaledCols[i] / 2,
          startY + scaledHeader / 2
        )
        ctx.restore()
        cx += scaledCols[i]
      })

      rows.forEach((row, ri) => {
        const ry = startY + scaledHeader + ri * scaledRow
        const isHighlight =
          highlightRow === (colorKey === 'supply' ? ri : ri + 10)

        ctx.save()
        ctx.fillStyle = isHighlight
          ? row.color + '18'
          : ri % 2 === 0
            ? '#ffffff04'
            : 'transparent'
        ctx.fillRect(startX, ry, totalW * scale, scaledRow)
        ctx.restore()

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(startX, ry + scaledRow - 0.5)
        ctx.lineTo(startX + totalW * scale, ry + scaledRow - 0.5)
        ctx.strokeStyle = '#ffffff08'
        ctx.lineWidth = 0.5
        ctx.stroke()
        ctx.restore()

        let x = startX
        const cells =
          colorKey === 'supply'
            ? [
                row.protocol,
                row.network,
                row.token,
                row.amount,
                (row as SupplyRow).apy,
                '—',
              ]
            : [
                row.protocol,
                row.network,
                row.token,
                row.amount,
                (row as BorrowRow).rate,
                (row as BorrowRow).health.toFixed(2),
              ]

        cells.forEach((cell, ci) => {
          const cellCx = ci === 0 ? x + 10 : x + scaledCols[ci] / 2
          ctx.save()
          ctx.textAlign = ci === 0 ? 'left' : 'center'
          ctx.textBaseline = 'middle'

          if (ci === 0) {
            ctx.beginPath()
            ctx.arc(x + 5, ry + scaledRow / 2, 3.5, 0, Math.PI * 2)
            ctx.fillStyle = row.color
            ctx.fill()
            ctx.font = `${Math.max(8, 9 * scale)}px sans-serif`
            ctx.fillStyle = '#ddd'
            ctx.fillText(cell, x + 14, ry + scaledRow / 2)
          } else if (ci === 1) {
            ctx.font = `${Math.max(7, 8 * scale)}px sans-serif`
            ctx.fillStyle = '#aaa'
            ctx.fillText(cell, cellCx, ry + scaledRow / 2)
          } else if (ci === 2) {
            ctx.beginPath()
            ctx.roundRect(
              x + scaledCols[ci] / 2 - 18,
              ry + scaledRow / 2 - 9,
              36,
              17,
              4
            )
            ctx.fillStyle = row.color + '22'
            ctx.fill()
            ctx.font = `bold ${Math.max(7, 8 * scale)}px monospace`
            ctx.fillStyle = row.color
            ctx.fillText(cell, cellCx, ry + scaledRow / 2)
          } else if (ci === 3) {
            ctx.font = `bold ${Math.max(8, 10 * scale)}px monospace`
            ctx.fillStyle = '#e5e5e5'
            ctx.fillText(cell, cellCx, ry + scaledRow / 2)
          } else if (ci === 4) {
            ctx.font = `bold ${Math.max(8, 9 * scale)}px monospace`
            ctx.fillStyle = colorKey === 'supply' ? '#00D395' : '#F59E0B'
            ctx.fillText(cell, cellCx, ry + scaledRow / 2)
          } else if (ci === 5 && colorKey === 'borrow') {
            const hval = parseFloat(cell)
            const hcol = getHealthColor(hval)
            const barW = scaledCols[ci] * 0.55
            const barH = 4
            const barX = x + (scaledCols[ci] - barW) / 2
            const barY = ry + scaledRow / 2 + 5
            ctx.beginPath()
            ctx.roundRect(barX, barY, barW, barH, 2)
            ctx.fillStyle = '#ffffff15'
            ctx.fill()
            ctx.beginPath()
            ctx.roundRect(barX, barY, barW * Math.min(hval / 3, 1), barH, 2)
            ctx.fillStyle = hcol
            ctx.fill()
            ctx.font = `bold ${Math.max(7, 8 * scale)}px monospace`
            ctx.fillStyle = hcol
            ctx.fillText(cell, cellCx, ry + scaledRow / 2 - 4)
          } else {
            ctx.font = `${Math.max(7, 8 * scale)}px sans-serif`
            ctx.fillStyle = '#777'
            ctx.fillText(cell, cellCx, ry + scaledRow / 2)
          }
          ctx.restore()
          x += scaledCols[ci]
        })
      })

      return startY + scaledHeader + rows.length * scaledRow
    }

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      if (W === 0 || H === 0) {
        raf = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, W, H)
      t += 0.016
      highlightTimer += 0.016

      if (highlightTimer > 1.8) {
        highlightTimer = 0
        const total = SUPPLY_POSITIONS.length + BORROW_POSITIONS.length
        highlightRow = Math.floor(Math.random() * total)
      }

      const totalW = COL_W.reduce((s, v) => s + v, 0)
      const scale = Math.min(1, (W - 40) / totalW)
      const tableX = (W - totalW * scale) / 2

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(tableX - 10, 10, totalW * scale + 20, 48, 10)
      ctx.fillStyle = '#ffffff08'
      ctx.fill()
      ctx.strokeStyle = '#ffffff12'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.font = `bold ${Math.max(9, 11 * scale)}px monospace`
      ctx.fillStyle = '#6378ff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('0x3f4a...d7c2', tableX, 34)
      ctx.restore()

      const badges = [
        { label: 'Net Position', val: '+$195,300', color: '#00D395' },
        { label: 'Weighted APY', val: '5.12%', color: '#6378ff' },
        { label: 'Health', val: '2.12', color: '#F59E0B' },
      ]
      let bx = tableX + totalW * scale - 20
      badges
        .slice()
        .reverse()
        .forEach((b) => {
          const bw = 96
          bx -= bw
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(bx, 18, bw, 22, 6)
          ctx.fillStyle = b.color + '18'
          ctx.strokeStyle = b.color + '50'
          ctx.lineWidth = 0.8
          ctx.fill()
          ctx.stroke()
          ctx.font = `bold ${Math.max(8, 9 * scale)}px monospace`
          ctx.fillStyle = b.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(b.val, bx + bw / 2, 29)
          ctx.restore()
          bx -= 8
        })

      const headers = [
        'Protocol',
        'Network',
        'Token',
        'Amount',
        'APY / Rate',
        'Health',
      ]

      let y = 74
      y =
        drawTable(
          SUPPLY_POSITIONS,
          tableX,
          y,
          headers,
          'supply',
          '↑ Supplying (3 positions)',
          '#00D395'
        ) + 28
      drawTable(
        BORROW_POSITIONS,
        tableX,
        y,
        headers,
        'borrow',
        '↓ Borrowing (2 positions)',
        '#F59E0B'
      )

      const scanY = (t * 30) % H
      const scanGrd = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20)
      scanGrd.addColorStop(0, 'transparent')
      scanGrd.addColorStop(0.5, 'rgba(99,120,255,0.04)')
      scanGrd.addColorStop(1, 'transparent')
      ctx.save()
      ctx.fillStyle = scanGrd
      ctx.fillRect(0, scanY - 20, W, 40)
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{
        background: 'linear-gradient(135deg, #0d0f1a 0%, #111827 100%)',
      }}
    />
  )
}
