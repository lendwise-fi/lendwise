import '@tanstack/react-table'

declare module '@tanstack/react-table' {
  interface ColumnMeta<_TData, _TValue> {
    isMobileHidden?: boolean
  }
}
