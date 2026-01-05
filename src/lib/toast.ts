import { createElement } from 'react';

import { toast } from '@/components/ui/use-toast';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';

type ToastActionConfig = {
  label: string;
  onClick: () => void | Promise<void>;
  altText?: string;
};

type ToastOptions = {
  title: string;
  description?: string;
  duration?: number;
  action?: ToastActionConfig;
};

const buildActionElement = (action?: ToastActionConfig): ToastActionElement | undefined => {
  if (!action) {
    return undefined;
  }
  return createElement(
    ToastAction,
    {
      altText: action.altText ?? action.label,
      onClick: action.onClick,
    },
    action.label,
  ) as unknown as ToastActionElement;
};

const show = (variant: 'default' | 'destructive', options: ToastOptions) => {
  toast({
    variant,
    title: options.title,
    description: options.description,
    duration: options.duration ?? 10000,
    action: buildActionElement(options.action),
  });
};

const toastService = {
  success: (options: ToastOptions) =>
    show('default', {
      ...options,
      duration: options.duration ?? 5000,
    }),
  error: (options: ToastOptions) =>
    show('destructive', {
      ...options,
      duration: options.duration ?? 10000,
    }),
  info: (options: ToastOptions) => show('default', options),
};

export { toastService };
export type { ToastOptions };
