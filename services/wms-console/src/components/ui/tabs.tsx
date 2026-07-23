import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => <TabsPrimitive.List className={cn('inline-flex h-10 items-center rounded-md bg-secondary p-1', className)} {...props} />;
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => <TabsPrimitive.Trigger className={cn('inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm', className)} {...props} />;
export const TabsContent = TabsPrimitive.Content;
