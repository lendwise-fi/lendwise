# Protocol Icons Component

## Overview

The `ProtocolIcon` component displays protocol logos from the `/public/icons/protocol/` directory with automatic fallback to protocol initials if the logo file doesn't exist.

## Component

**Location:** `src/components/ProtocolIcon.tsx`

## Usage

```tsx
import { ProtocolIcon } from '@/components/ProtocolIcon'

// Basic usage
<ProtocolIcon protocol="morpho" size={32} />

// In a table cell
<ProtocolIcon protocol="aave" size={40} />

// With custom className
<ProtocolIcon protocol="compound" size={24} className="border-2" />
```

## Props

```typescript
type ProtocolIconProps = {
  protocol: string // Protocol name (e.g., "morpho", "aave", "compound")
  size?: number // Icon size in pixels (default: 32)
  className?: string // Additional CSS classes
}
```

## File Structure

```
public/
└── icons/
    └── protocol/
        ├── morpho.svg      ✅ Added
        ├── aave.svg        ⏳ To add
        ├── compound.svg    ⏳ To add
        └── README.md
```

## Adding New Protocol Icons

### Step 1: Get the Logo

Download the official SVG logo from:

- **Morpho**: https://morpho.org (press kit)
- **Aave**: https://aave.com (brand assets)
- **Compound**: https://compound.finance (media kit)

### Step 2: Save the File

1. Save as `{protocol}.svg` in `/public/icons/protocol/`
2. Use lowercase protocol name
3. Ensure it's a clean SVG file

### Step 3: Optimize (Optional)

```bash
npx svgo -f public/icons/protocol
```

### Step 4: Use in Code

The component will automatically load the icon:

```tsx
<ProtocolIcon protocol="morpho" size={40} />
```

## Features

### ✅ Automatic Loading

- Normalizes protocol name to lowercase
- Loads from `/public/icons/protocol/{protocol}.svg`

### ✅ Graceful Fallback

- If logo file doesn't exist, shows protocol initials
- Example: "morpho" → "MO" in a styled box

### ✅ Consistent Styling

- Rounded corners (`rounded-lg`)
- Configurable size
- Custom className support

## Implementation in Portfolio

The protocol column in `src/app/portfolio/columns.tsx` now uses `ProtocolIcon`:

```tsx
<div className="flex items-center gap-3">
  <ProtocolIcon protocol={protocol} size={40} />
  <div>
    <div className="font-semibold">{protocol}</div>
    <Badge variant="secondary" className="mt-1 text-xs">
      {assetSymbol}
    </Badge>
  </div>
</div>
```

## Supported Protocols

Based on `src/config/protocols.ts`:

- ✅ **Morpho** - Logo added
- ⏳ **Aave** - Logo needed
- ⏳ **Compound** - Logo needed

## Fallback Behavior

If a protocol logo is missing:

```tsx
<ProtocolIcon protocol="unknown" size={32} />
```

Displays:

```
┌────────┐
│   UN   │  ← Protocol initials
└────────┘
```

## Best Practices

### File Naming

- ✅ `morpho.svg`
- ✅ `aave.svg`
- ❌ `Morpho.svg` (uppercase)
- ❌ `morpho-logo.svg` (extra suffix)

### File Format

- **Preferred**: SVG (scalable, small size)
- **Alternative**: PNG with transparent background
- **Size**: Square aspect ratio

### Image Quality

- High resolution
- Clean edges
- Original brand colors
- Optimized file size

## Troubleshooting

### Icon Not Showing

1. **Check file exists**: Verify `/public/icons/protocol/{protocol}.svg` exists
2. **Check filename**: Must be lowercase and match protocol name exactly
3. **Check console**: Look for 404 errors in browser DevTools
4. **Clear cache**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Wrong Icon Displayed

1. **Check protocol name**: Ensure it matches the filename
2. **Check normalization**: Component converts to lowercase automatically

### Fallback Always Shows

1. **File missing**: Add the SVG file to `/public/icons/protocol/`
2. **Wrong path**: Ensure file is in correct directory
3. **Invalid SVG**: Check if SVG file is corrupted

## Related Components

- **TokenIcon** (`src/components/TokenIcon.tsx`) - For token/currency icons
- **CurrencyIcon** (removed) - Replaced by TokenIcon

## Next Steps

1. Add Aave logo to `/public/icons/protocol/aave.svg`
2. Add Compound logo to `/public/icons/protocol/compound.svg`
3. Update as new protocols are added to the app

## Resources

- [Morpho Brand Assets](https://morpho.org)
- [Aave Brand Guidelines](https://aave.com)
- [Compound Media Kit](https://compound.finance)
- [SVGO Optimizer](https://github.com/svg/svgo)
