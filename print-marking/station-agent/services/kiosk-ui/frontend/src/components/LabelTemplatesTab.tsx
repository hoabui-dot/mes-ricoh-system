import { useCallback, useEffect, useState } from 'react'
import { templateApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, FileText } from 'lucide-react'

type LabelTemplate = {
  id: string
  name: string
  description?: string
  status: string
  dpi: number
  labelWidth: number
  labelHeight: number
  version: number
  isDefault?: boolean
}

export function LabelTemplatesTab() {
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await templateApi.list()
      setTemplates(response.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load label templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Label templates</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading templates...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && templates.length === 0 && <p className="text-sm text-muted-foreground">No label templates found.</p>}
        {!loading && !error && templates.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map(template => (
              <div key={template.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{template.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{template.description || 'No description'}</p>
                  </div>
                  <span className="text-xs uppercase text-muted-foreground">{template.status}</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {template.labelWidth} x {template.labelHeight} mm · {template.dpi} DPI · v{template.version}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
