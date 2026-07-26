// Utility helper types

export type Nullable<T> = T | null
export type Optional<T> = T | undefined
export type Maybe<T> = T | null | undefined

// DeepPartial
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// Selector
export type Selector<T, K extends keyof T> = Pick<T, K>

// Form state
export type FormMode = 'create' | 'edit' | 'view'

// Table column definition type helper
export type ColumnId<T extends object> = keyof T & string

// Route params
export interface IdParam {
  id: string
}

// Common UI state
export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// Language
export type Language = 'en' | 'vi'

// Theme
export type Theme = 'dark' | 'light'
