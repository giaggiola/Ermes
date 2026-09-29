"use client";

import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../../components/ui/select";
import { Switch } from "../../../../../../components/ui/switch";

export interface DiscountDetailData {
  discount_type: "percentage" | "fixed";
  discount_value: number;
  code_prefix: string;
  currency_code?: string;
  usage_limit: number;
  expires_in_days?: number;
  min_purchase?: number;
}

interface DiscountDetailPanelProps {
  data: DiscountDetailData;
  onChange: (updates: Partial<DiscountDetailData>) => void;
}

export function DiscountDetailPanel({
  data,
  onChange,
}: DiscountDetailPanelProps) {
  const hasExpiry = (data.expires_in_days ?? 0) > 0;
  const hasMinPurchase = (data.min_purchase ?? 0) > 0;

  return (
    <div className="divide-y divide-border">
      {/* Discount Type */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Discount type</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generate a unique discount code and inject it into the flow context
            as {"{{discount_code}}"}.
          </p>
        </div>

        <Select
          value={data.discount_type || "percentage"}
          onValueChange={(value) =>
            onChange({ discount_type: value as "percentage" | "fixed" })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentage off</SelectItem>
            <SelectItem value="fixed">Fixed amount off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Discount Value */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">
            {data.discount_type === "percentage" ? "Percentage" : "Amount"}
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={data.discount_value ?? 10}
            onChange={(e) =>
              onChange({ discount_value: parseFloat(e.target.value) || 0 })
            }
            className="w-24"
            min={0}
          />
          <span className="text-sm">
            {data.discount_type === "percentage"
              ? "%"
              : (data.currency_code || "USD").toUpperCase()}
          </span>
        </div>

        {data.discount_type === "fixed" ? (
          <div>
            <Label className="text-xs">Currency</Label>
            <Select
              value={data.currency_code || "usd"}
              onValueChange={(value) => onChange({ currency_code: value })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD</SelectItem>
                <SelectItem value="eur">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Code Prefix */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Code prefix</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A prefix for the generated code (e.g., WELCOME → WELCOME-A3F9B2)
          </p>
        </div>

        <Input
          value={data.code_prefix || ""}
          onChange={(e) =>
            onChange({
              code_prefix: e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, ""),
            })
          }
          placeholder="e.g., SAVE, WELCOME, VIP"
        />

        {data.code_prefix ? (
          <div className="rounded bg-muted p-2">
            <p className="text-xs text-muted-foreground">Preview:</p>
            <p className="mt-0.5 font-mono text-sm">
              {data.code_prefix}-XXXXXX
            </p>
          </div>
        ) : null}
      </div>

      {/* Usage Limit */}
      <div className="space-y-3 p-4">
        <div>
          <Label className="text-sm font-medium">Usage limit</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How many times can this code be used?
          </p>
        </div>

        <Input
          type="number"
          value={data.usage_limit ?? 1}
          onChange={(e) =>
            onChange({ usage_limit: parseInt(e.target.value) || 1 })
          }
          className="w-24"
          min={1}
        />
      </div>

      {/* Expiry */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Expiry</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Set an expiration for the code
            </p>
          </div>
          <Switch
            checked={hasExpiry}
            onCheckedChange={(checked) =>
              onChange({ expires_in_days: checked ? 7 : undefined })
            }
          />
        </div>

        {hasExpiry ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Expires in</span>
            <Input
              type="number"
              value={data.expires_in_days ?? 7}
              onChange={(e) =>
                onChange({ expires_in_days: parseInt(e.target.value) || 7 })
              }
              className="w-20"
              min={1}
            />
            <span className="text-sm">days</span>
          </div>
        ) : null}
      </div>

      {/* Minimum Purchase */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Minimum purchase</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Require a minimum order amount
            </p>
          </div>
          <Switch
            checked={hasMinPurchase}
            onCheckedChange={(checked) =>
              onChange({ min_purchase: checked ? 50 : undefined })
            }
          />
        </div>

        {hasMinPurchase ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Minimum</span>
            <Input
              type="number"
              value={data.min_purchase ?? 50}
              onChange={(e) =>
                onChange({ min_purchase: parseFloat(e.target.value) || 0 })
              }
              className="w-24"
              min={0}
            />
          </div>
        ) : null}
      </div>

      {/* Template Variables */}
      <div className="p-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-medium text-foreground">
            Available in email templates:
          </p>
          <div className="mt-2 space-y-1">
            <p className="font-mono text-xs text-muted-foreground">
              {"{{discount_code}}"} — The unique code
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {"{{discount_value}}"} — The amount/percentage
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {"{{discount_type}}"} — &quot;percentage&quot; or
              &quot;fixed&quot;
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {"{{discount_expires}}"} — Expiry date (if set)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiscountDetailPanel;
