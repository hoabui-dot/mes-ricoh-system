import { AlertCircle, PackageOpen } from 'lucide-react';
import { Card } from '../ui';

export function EmptyState({ title, body, backendGap = false }: { title: string; body: string; backendGap?: boolean }) {
  const Icon = backendGap ? AlertCircle : PackageOpen;
  return (
    <Card className="flex min-h-[220px] items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-action/30 bg-action/10 text-action">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </Card>
  );
}
