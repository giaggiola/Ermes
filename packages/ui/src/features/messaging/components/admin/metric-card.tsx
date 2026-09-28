import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";

export function MetricCard({
  detail,
  icon,
  label,
  value,
}: {
  detail?: ReactNode;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <Card className="rounded-lg py-4">
      <CardHeader className="flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-2xl font-semibold">{value}</div>
        {detail ? (
          <div className="mt-1 text-xs font-normal text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
