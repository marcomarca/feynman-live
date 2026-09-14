import type React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  ...props
}) => {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...props}>
      {icon && <span className="btn-icon-wrapper">{icon}</span>}
      {children}
    </button>
  );
};
