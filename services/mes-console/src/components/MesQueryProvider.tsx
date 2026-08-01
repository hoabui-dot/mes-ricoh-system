import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { mesQueryClient } from '../lib/queryClient';

export const MesQueryProvider: React.FC<React.PropsWithChildren> = ({ children }) => (
  <QueryClientProvider client={mesQueryClient}>{children}</QueryClientProvider>
);
