import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium font-mono transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary border-primary/30",
        secondary: "border-transparent bg-secondary/15 text-secondary border-secondary/30",
        destructive: "border-transparent bg-destructive/15 text-destructive border-destructive/30",
        success: "border-transparent bg-success/15 text-success border-success/30",
        warning: "border-transparent bg-warning/15 text-warning border-warning/30",
        info: "border-transparent bg-info/15 text-info border-info/30",
        outline: "text-foreground border-border bg-transparent",
        muted: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
