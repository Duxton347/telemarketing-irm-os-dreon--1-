import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ content }) => {
  return (
    <div className="group relative inline-flex items-center justify-center ml-2 cursor-help text-gray-400 hover:text-blue-500 transition-colors">
      <HelpCircle size={16} />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-center pointer-events-none">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
};
