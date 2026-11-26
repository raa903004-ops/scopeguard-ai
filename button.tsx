import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
const variants = cva(
  "sg-button inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "sg-solid",
        outline: "sg-outline",
        secondary: "sg-outline",
        ghost: "sg-ghost",
        destructive: "sg-danger",
      },
      size: { default: "", sm: "sg-small", icon: "sg-icon", lg: "sg-large" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return (
    <button className={variants({ variant, size, className })} {...props} />
  );
}
export default Button;
