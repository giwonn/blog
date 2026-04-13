"use client";

import * as React from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type PresetKey, getPresetRange } from "@/lib/date-range-presets";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  preset?: PresetKey;
  onChange: (range: { from: Date; to: Date }, preset: PresetKey) => void;
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "yesterday", label: "전날" },
  { key: "week", label: "일주일" },
  { key: "month", label: "한달" },
  { key: "custom", label: "커스텀" },
];

export function DateRangePicker({ from, to, preset = "month", onChange }: DateRangePickerProps) {
  const [openFrom, setOpenFrom] = React.useState(false);
  const [openTo, setOpenTo] = React.useState(false);

  function handlePresetClick(key: PresetKey) {
    if (key === "custom") return;
    const range = getPresetRange(key);
    onChange(range, key);
  }

  function handleFromSelect(selected: Date | undefined) {
    if (!selected) return;
    const newFrom = selected > to ? to : selected;
    onChange({ from: newFrom, to }, "custom");
    setOpenFrom(false);
  }

  function handleToSelect(selected: Date | undefined) {
    if (!selected) return;
    const newTo = selected < from ? from : selected;
    onChange({ from, to: newTo }, "custom");
    setOpenTo(false);
  }

  return (
    <div className="flex items-center gap-2">
      {/* 프리셋 버튼 */}
      <div className="flex gap-1">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handlePresetClick(key)}
            className={cn(
              "px-3 py-2 text-sm rounded-md transition-colors",
              preset === key
                ? "bg-blue-600 text-white"
                : key === "custom"
                  ? "bg-gray-100 text-gray-400 cursor-default"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 캘린더 (커스텀 날짜 선택) */}
      <Popover open={openFrom} onOpenChange={setOpenFrom}>
        <PopoverTrigger
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {format(from, "yyyy.MM.dd", { locale: ko })}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            defaultMonth={from}
            selected={from}
            onSelect={handleFromSelect}
            locale={ko}
            disabled={{ after: to }}
          />
        </PopoverContent>
      </Popover>

      <span className="text-sm text-gray-500">~</span>

      <Popover open={openTo} onOpenChange={setOpenTo}>
        <PopoverTrigger
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {format(to, "yyyy.MM.dd", { locale: ko })}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            defaultMonth={to}
            selected={to}
            onSelect={handleToSelect}
            locale={ko}
            disabled={{ before: from, after: new Date() }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
