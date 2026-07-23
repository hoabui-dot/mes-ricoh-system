import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Dialog, DialogContent, Input } from '../ui';

const routes = [
  ['nav.dashboard', '/dashboard'],
  ['nav.map', '/warehouse-map'],
  ['nav.warehouses', '/master-data/warehouses'],
  ['nav.locations', '/master-data/locations'],
  ['nav.balances', '/inventory/balances'],
  ['nav.receipts', '/inbound/receipts'],
  ['nav.requests', '/outbound/requests'],
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button className="flex h-10 w-72 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        {t('topbar.search')}
        <span className="ml-auto rounded border px-1.5 py-0.5 text-[10px]">Ctrl K</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0">
          <Command className="overflow-hidden rounded-md">
            <div className="border-b p-3">
              <Command.Input asChild>
                <Input autoFocus placeholder={t('command.placeholder')} />
              </Command.Input>
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="p-4 text-sm text-muted-foreground">{t('common.empty')}</Command.Empty>
              {routes.map(([label, path]) => (
                <Command.Item
                  key={path}
                  value={`${t(label)} ${path}`}
                  className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary"
                  onSelect={() => {
                    navigate(path);
                    setOpen(false);
                  }}
                >
                  {t(label)}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
