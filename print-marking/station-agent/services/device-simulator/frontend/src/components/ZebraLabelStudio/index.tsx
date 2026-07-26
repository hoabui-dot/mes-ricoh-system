import React, { useState } from 'react'
import TemplatesPanel from './TemplatesPanel'
import LabelDesigner from './LabelDesigner'
import PreviewPanel from './PreviewPanel'
import PrintHistoryPanel from './PrintHistoryPanel'
import type { LabelTemplate } from '../../types/label'

type StudioTab = 'templates' | 'designer' | 'preview' | 'history'

const TAB_CONFIG: Array<{ id: StudioTab; label: string; icon: string }> = [
  { id: 'templates', label: 'Templates', icon: '📋' },
  { id: 'designer', label: 'Label Designer', icon: '🎨' },
  { id: 'preview', label: 'Preview & Print', icon: '👁️' },
  { id: 'history', label: 'Print History', icon: '📊' },
]

export default function ZebraLabelStudio() {
  const [activeTab, setActiveTab] = useState<StudioTab>('templates')
  const [selectedTemplate, setSelectedTemplate] = useState<LabelTemplate | null>(null)

  const handleOpenInDesigner = (template: LabelTemplate) => {
    setSelectedTemplate(template)
    setActiveTab('designer')
  }

  const handleOpenInPreview = (template: LabelTemplate) => {
    setSelectedTemplate(template)
    setActiveTab('preview')
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Studio Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🦓</span>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Zebra Label Studio</h2>
            <p className="text-[11px] text-gray-500">Design · Render · Test · Inspect</p>
          </div>
        </div>
        {selectedTemplate && (
          <div className="ml-auto flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5">
            <span className="text-[10px] text-gray-500">Active template:</span>
            <span className="text-xs font-semibold text-indigo-400">{selectedTemplate.name}</span>
            <span className="text-[10px] text-gray-600">v{selectedTemplate.version}</span>
          </div>
        )}
      </div>

      {/* Studio Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t transition-all border-t border-x -mb-[1px] whitespace-nowrap
              ${activeTab === tab.id
                ? 'bg-gray-900 text-white border-gray-800 border-b-gray-900'
                : 'text-gray-500 hover:text-gray-300 border-transparent hover:bg-gray-900/50'}`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'templates' && (
          <TemplatesPanel
            onOpenDesigner={handleOpenInDesigner}
            onOpenPreview={handleOpenInPreview}
          />
        )}
        {activeTab === 'designer' && (
          <LabelDesigner template={selectedTemplate} />
        )}
        {activeTab === 'preview' && (
          <PreviewPanel template={selectedTemplate} />
        )}
        {activeTab === 'history' && (
          <PrintHistoryPanel />
        )}
      </div>
    </div>
  )
}
