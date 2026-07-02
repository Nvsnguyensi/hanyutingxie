import React from "react";

interface ClickableChineseProps {
  text: string;
  onLookup: (word: string) => void;
  className?: string;
}

export default function ClickableChinese({ text, onLookup, className = "" }: ClickableChineseProps) {
  if (!text) return null;

  // Regex to match Chinese characters
  const chineseRegex = /[\u4e00-\u9fa5]/;

  const characters = Array.from(text);

  return (
    <span className={`inline-flex flex-wrap items-center ${className}`}>
      {characters.map((char, index) => {
        const isChinese = chineseRegex.test(char);
        if (isChinese) {
          return (
            <span
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                onLookup(char);
              }}
              className="cursor-pointer hover:bg-indigo-100 hover:text-indigo-800 hover:scale-110 active:scale-95 px-0.5 rounded transition-all select-none font-sans"
              title={`Nhấp để tra nghĩa: "${char}"`}
            >
              {char}
            </span>
          );
        }
        return (
          <span key={index} className="select-none text-slate-400">
            {char}
          </span>
        );
      })}
    </span>
  );
}
