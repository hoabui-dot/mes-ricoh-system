import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { DesignerElement, ElementType, LabelTemplate } from '../types/label'

// ── Default sizes for newly added elements ────────────────────────────────────

const ELEMENT_DEFAULTS: Record<ElementType, Partial<DesignerElement>> = {
  text: { width: 150, height: 30, font: 'Arial', fontSize: 18, text: 'Label Text' } as any,
  barcode: { width: 200, height: 80, symbology: 'Code128' } as any,
  qr: { width: 80, height: 80, errorCorrection: 'M', magnification: 4 } as any,
  rect: { width: 120, height: 60, stroke: '#000', strokeWidth: 2, fill: 'transparent' } as any,
  circle: { width: 60, height: 60, stroke: '#000', strokeWidth: 2, fill: 'transparent' } as any,
  line: { width: 100, height: 2, stroke: '#000', strokeWidth: 2 } as any,
  image: { width: 80, height: 80 } as any,
}

// ── Store State ───────────────────────────────────────────────────────────────

export interface LabelDesignerState {
  // Active template metadata
  activeTemplate: LabelTemplate | null
  isDirty: boolean

  // Canvas
  elements: DesignerElement[]
  selectedIds: string[]
  zoom: number
  snapToGrid: boolean
  gridSize: number

  // Canvas dimensions (from template)
  canvasWidth: number   // px at 96dpi
  canvasHeight: number  // px at 96dpi

  // Actions
  setActiveTemplate: (template: LabelTemplate | null) => void
  loadElements: (elements: DesignerElement[]) => void
  addElement: (type: ElementType) => void
  updateElement: (id: string, changes: Partial<DesignerElement>) => void
  removeElement: (id: string) => void
  removeSelected: () => void
  duplicateElement: (id: string) => void
  setSelected: (ids: string[]) => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
  moveLayer: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void
  setZoom: (zoom: number) => void
  setSnapToGrid: (snap: boolean) => void
  setGridSize: (size: number) => void
  markClean: () => void
  getTemplateJson: () => string
  alignSelected: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void
}

// ── Store Implementation ──────────────────────────────────────────────────────

export const useLabelDesignerStore = create<LabelDesignerState>()(
  subscribeWithSelector((set, get) => ({
    activeTemplate: null,
    isDirty: false,
    elements: [],
    selectedIds: [],
    zoom: 1.0,
    snapToGrid: true,
    gridSize: 8,
    canvasWidth: 400,
    canvasHeight: 250,

    setActiveTemplate: (template) => {
      if (!template) {
        set({ activeTemplate: null, elements: [], selectedIds: [], isDirty: false })
        return
      }
      try {
        const doc = JSON.parse(template.templateJson)
        
        let width = doc.width;
        let height = doc.height;
        let dpi = doc.dpi;
        if (doc.label && typeof doc.label === 'object') {
          width = width ?? doc.label.width;
          height = height ?? doc.label.height;
          dpi = dpi ?? doc.label.dpi;
        }
        width = width ?? template.labelWidth ?? 100;
        height = height ?? template.labelHeight ?? 50;

        const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96)

        const rawElements = doc.elements ?? [];
        const elements: DesignerElement[] = rawElements.map((el: any, index: number) => {
          const type = el.type ?? 'text';
          const x = typeof el.x === 'number' ? el.x : 20;
          const y = typeof el.y === 'number' ? el.y : 20;
          const rotation = typeof el.rotation === 'number' ? el.rotation : 0;
          const layer = typeof el.layer === 'number' ? el.layer : index;

          let font = 'Arial';
          let fontSize = 16;
          if (el.font) {
            if (typeof el.font === 'string') {
              font = el.font;
            } else if (typeof el.font === 'object') {
              font = el.font.family ?? 'Arial';
              fontSize = el.font.height ?? el.font.width ?? 16;
            }
          }
          if (typeof el.fontSize === 'number') {
            fontSize = el.fontSize;
          }

          let defaultWidth = 100;
          let defaultHeight = 30;
          if (type === 'barcode') {
            defaultWidth = 200;
            defaultHeight = 80;
          } else if (type === 'qr') {
            defaultWidth = 80;
            defaultHeight = 80;
          } else if (type === 'circle') {
            defaultWidth = 60;
            defaultHeight = 60;
          }

          const widthVal = el.width ?? defaultWidth;
          const heightVal = el.height ?? defaultHeight;

          const text = el.text ?? el.defaultValue ?? el.value ?? '';
          const binding = el.binding ?? '';

          return {
            ...el,
            id: el.id ?? `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            x,
            y,
            width: widthVal,
            height: heightVal,
            rotation,
            layer,
            font,
            fontSize,
            text,
            binding
          };
        });

        set({
          activeTemplate: template,
          elements,
          selectedIds: [],
          isDirty: false,
          canvasWidth: mmToPx(width),
          canvasHeight: mmToPx(height),
        })
      } catch {
        set({ activeTemplate: template, elements: [], selectedIds: [], isDirty: false })
      }
    },

    loadElements: (elements) => set({ elements, isDirty: true }),

    addElement: (type) => {
      const state = get()
      const newLayer = state.elements.length
      const defaults = ELEMENT_DEFAULTS[type] ?? {}
      const newEl: DesignerElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        x: 20 + newLayer * 4,
        y: 20 + newLayer * 4,
        width: 100,
        height: 40,
        rotation: 0,
        layer: newLayer,
        ...defaults,
      } as DesignerElement
      set(s => ({ elements: [...s.elements, newEl], isDirty: true }))
    },

    updateElement: (id, changes) =>
      set(s => ({
        elements: s.elements.map(el => el.id === id ? { ...el, ...changes } as DesignerElement : el),
        isDirty: true,
      })),

    removeElement: (id) =>
      set(s => ({
        elements: s.elements.filter(el => el.id !== id),
        selectedIds: s.selectedIds.filter(sid => sid !== id),
        isDirty: true,
      })),

    removeSelected: () =>
      set(s => ({
        elements: s.elements.filter(el => !s.selectedIds.includes(el.id)),
        selectedIds: [],
        isDirty: true,
      })),

    duplicateElement: (id) => {
      const state = get()
      const original = state.elements.find(el => el.id === id)
      if (!original) return
      const copy: DesignerElement = {
        ...original,
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: original.x + 10,
        y: original.y + 10,
        layer: state.elements.length,
      }
      set(s => ({ elements: [...s.elements, copy], selectedIds: [copy.id], isDirty: true }))
    },

    setSelected: (ids) => set({ selectedIds: ids }),

    toggleSelected: (id) =>
      set(s => ({
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter(sid => sid !== id)
          : [...s.selectedIds, id],
      })),

    clearSelection: () => set({ selectedIds: [] }),

    selectAll: () => set(s => ({ selectedIds: s.elements.map(el => el.id) })),

    moveLayer: (id, direction) =>
      set(s => {
        const els = [...s.elements]
        const idx = els.findIndex(el => el.id === id)
        if (idx === -1) return s
        const el = els[idx]
        if (direction === 'up' && idx < els.length - 1) {
          ;[els[idx], els[idx + 1]] = [els[idx + 1], els[idx]]
        } else if (direction === 'down' && idx > 0) {
          ;[els[idx], els[idx - 1]] = [els[idx - 1], els[idx]]
        } else if (direction === 'top') {
          els.splice(idx, 1)
          els.push(el)
        } else if (direction === 'bottom') {
          els.splice(idx, 1)
          els.unshift(el)
        }
        return { elements: els.map((e, i) => ({ ...e, layer: i })), isDirty: true }
      }),

    setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
    setSnapToGrid: (snap) => set({ snapToGrid: snap }),
    setGridSize: (size) => set({ gridSize: size }),
    markClean: () => set({ isDirty: false }),

    getTemplateJson: () => {
      const state = get()
      if (!state.activeTemplate) return '{}'
      const pxToMm = (px: number) => parseFloat(((px / 96) * 25.4).toFixed(2))
      const doc = {
        width: pxToMm(state.canvasWidth),
        height: pxToMm(state.canvasHeight),
        dpi: state.activeTemplate.dpi,
        elements: state.elements,
      }
      return JSON.stringify(doc, null, 2)
    },

    alignSelected: (alignment) =>
      set(s => {
        if (s.selectedIds.length < 2) return s
        const selected = s.elements.filter(el => s.selectedIds.includes(el.id))
        let updatedEls = [...s.elements]

        if (alignment === 'left') {
          const minX = Math.min(...selected.map(el => el.x))
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, x: minX } : el)
        } else if (alignment === 'right') {
          const maxX = Math.max(...selected.map(el => el.x + el.width))
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, x: maxX - el.width } : el)
        } else if (alignment === 'center') {
          const avgX = selected.reduce((sum, el) => sum + el.x + el.width / 2, 0) / selected.length
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, x: avgX - el.width / 2 } : el)
        } else if (alignment === 'top') {
          const minY = Math.min(...selected.map(el => el.y))
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, y: minY } : el)
        } else if (alignment === 'bottom') {
          const maxY = Math.max(...selected.map(el => el.y + el.height))
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, y: maxY - el.height } : el)
        } else if (alignment === 'middle') {
          const avgY = selected.reduce((sum, el) => sum + el.y + el.height / 2, 0) / selected.length
          updatedEls = updatedEls.map(el =>
            s.selectedIds.includes(el.id) ? { ...el, y: avgY - el.height / 2 } : el)
        }
        return { elements: updatedEls, isDirty: true }
      }),
  }))
)
