import React from 'react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        let bg = 'bg-[#1a3a3a]';
        if (toast.type === 'error') bg = 'bg-[#c0392b]';
        if (toast.type === 'success') bg = 'bg-[#27ae60]';
        if (toast.type === 'info') bg = 'bg-[#2980b9]';

        return (
          <div
            key={toast.id}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium text-white shadow-xl transition-all duration-300 animate-bounce-short pointer-events-auto ${bg}`}
          >
            {toast.text}
          </div>
        );
      })}
    </div>
  );
};
