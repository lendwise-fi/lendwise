# Borrowing Components

This folder contains UI components related to borrowing positions and risk monitoring.

## HealthFactorBar

A visual monitoring bar component that displays the health factor of a borrowing position across three zones:

- **Liquidation Zone** (HF < 1.0): Red zone indicating imminent liquidation risk
- **At Risk Zone** (1.0 ≤ HF < 2.0): Orange zone indicating elevated risk
- **Safe Zone** (HF ≥ 2.0): Green zone indicating healthy position

### Features

- **Shiny vertical indicator**: An animated, gradient-styled vertical line shows the current health factor position
- **Zone boundaries**: Dashed lines mark the thresholds between zones
- **Responsive design**: Adapts to different screen sizes
- **Dark mode support**: Automatically adjusts colors for dark theme
- **Smooth transitions**: The indicator animates when the health factor changes

### Usage

```tsx
import { HealthFactorBar } from '@/components/borrowing'

function MyComponent() {
  return (
    <HealthFactorBar
      healthFactor={2.5}
      minValue={0.5}
      maxValue={3.0}
      liquidationThreshold={1.0}
      riskThreshold={2.0}
    />
  )
}
```

### Props

| Prop                   | Type     | Default      | Description                               |
| ---------------------- | -------- | ------------ | ----------------------------------------- |
| `healthFactor`         | `number` | **required** | Current health factor value               |
| `minValue`             | `number` | `0.5`        | Minimum value on the scale                |
| `maxValue`             | `number` | `3.0`        | Maximum value on the scale                |
| `liquidationThreshold` | `number` | `1.0`        | Threshold below which liquidation occurs  |
| `riskThreshold`        | `number` | `2.0`        | Threshold below which position is at risk |

### Demo

See `HealthFactorBarDemo.tsx` for an interactive example with multiple scenarios.

## Design Reference

The component design is based on the Health Factor monitoring bar specification from the project documentation, featuring three distinct color-coded zones with clear visual indicators.
