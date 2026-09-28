"use client";

import { Checkbox } from "../../../../../../components/ui/checkbox";
import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../../components/ui/select";

export interface DelayDetailData {
  duration: number;
  unit: "minutes" | "hours" | "days";
  // Delay until specific time of day
  until_time_of_day?: boolean;
  time_of_day?: string; // "09:00" format
  // Delay until specific days of week
  until_days_of_week?: boolean;
  days_of_week?: number[]; // 0=Sun, 1=Mon, etc.
}

interface DelayDetailPanelProps {
  data: DelayDetailData;
  onChange: (updates: Partial<DelayDetailData>) => void;
}

const daysOfWeek = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
];

const timeOptions = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
];

export function DelayDetailPanel({ data, onChange }: DelayDetailPanelProps) {
  const toggleDayOfWeek = (day: number) => {
    const currentDays = data.days_of_week || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    onChange({ days_of_week: newDays });
  };

  const formatTime = (time: string) => {
    const [hours] = time.split(":");
    const hour = parseInt(hours);
    if (hour === 0) return "12:00 AM";
    if (hour === 12) return "12:00 PM";
    if (hour > 12) return `${hour - 12}:00 PM`;
    return `${hour}:00 AM`;
  };

  return (
    <div className="divide-y divide-border">
      {/* Basic Duration */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Settings</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Set the time delay for this step</p>
        </div>

        <div>
          <Label className="text-xs">Set time delay</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              value={data.duration || 1}
              onChange={(e) => onChange({ duration: parseInt(e.target.value) || 1 })}
              className="w-24"
              min={1}
            />
            <Select value={data.unit || "days"} onValueChange={(value) => onChange({ unit: value as "minutes" | "hours" | "days" })}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Delay until specific time */}
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={data.until_time_of_day ?? false}
            onCheckedChange={(checked) =>
              onChange({
                until_time_of_day: checked === true,
                time_of_day: checked ? data.time_of_day || "09:00" : undefined,
              })
            }
            id="until-time"
            className="mt-0.5"
          />
          <div className="flex-1">
            <Label htmlFor="until-time" className="cursor-pointer text-sm">
              Delay until a specific time of day
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">After the duration, wait until this time before proceeding</p>
          </div>
        </div>

        {data.until_time_of_day ? (
          <div className="pl-7">
            <Label className="text-xs">Time of day</Label>
            <Select value={data.time_of_day || "09:00"} onValueChange={(value) => onChange({ time_of_day: value })}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {timeOptions.map((time) => (
                  <SelectItem key={time} value={time}>
                    {formatTime(time)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Emails will be sent at this time in the recipient&apos;s timezone (if available) or UTC.
            </p>
          </div>
        ) : null}
      </div>

      {/* Delay until specific days */}
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={data.until_days_of_week ?? false}
            onCheckedChange={(checked) =>
              onChange({
                until_days_of_week: checked === true,
                days_of_week: checked ? data.days_of_week || [1, 2, 3, 4, 5] : undefined,
              })
            }
            id="until-days"
            className="mt-0.5"
          />
          <div className="flex-1">
            <Label htmlFor="until-days" className="cursor-pointer text-sm">
              Delay until specific days of the week
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Only proceed on selected days</p>
          </div>
        </div>

        {data.until_days_of_week ? (
          <div className="pl-7">
            <Label className="text-xs">Days of week</Label>
            <div className="mt-2 flex gap-1">
              {daysOfWeek.map((day) => {
                const isSelected = (data.days_of_week || []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDayOfWeek(day.value)}
                    className={`size-10 rounded-lg text-xs font-medium transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                    title={day.fullLabel}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {(data.days_of_week || []).length === 0
                ? "Select at least one day"
                : `Will proceed on: ${(data.days_of_week || []).map((d) => daysOfWeek[d].fullLabel).join(", ")}`}
            </p>
          </div>
        ) : null}
      </div>

      {/* Summary */}
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Summary:</strong> Wait {data.duration} {data.unit}
          {data.until_time_of_day ? `, then until ${formatTime(data.time_of_day || "09:00")}` : ""}
          {data.until_days_of_week && data.days_of_week && data.days_of_week.length > 0
            ? `, only on ${data.days_of_week.map((d) => daysOfWeek[d].label).join(", ")}`
            : ""}
        </p>
      </div>
    </div>
  );
}

export default DelayDetailPanel;
