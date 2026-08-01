import React from 'react';

export function BaseForm(props: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className={`space-y-4 ${props.className || ''}`} />;
}

export function BaseTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${props.className || ''}`} />;
}
