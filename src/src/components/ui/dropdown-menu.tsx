"use client";

import * as React from "react";

const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block text-left">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ open?: boolean; setOpen?: (v: boolean) => void }>, { open, setOpen });
        }
        return child;
      })}
    </div>
  );
};

const DropdownMenuTrigger = ({ 
  children, 
  open, 
  setOpen,
  asChild 
}: { 
  children: React.ReactNode; 
  open?: boolean; 
  setOpen?: (v: boolean) => void;
  asChild?: boolean;
}) => {
  return (
    <div onClick={() => setOpen?.(!open)}>
      {children}
    </div>
  );
};

const DropdownMenuContent = ({ 
  children, 
  open,
  align = "end"
}: { 
  children: React.ReactNode; 
  open?: boolean;
  align?: "start" | "center" | "end";
}) => {
  if (!open) return null;
  const alignClass = align === "end" ? "right-0" : align === "start" ? "left-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className={`absolute ${alignClass} z-50 mt-2 w-48 origin-top-right rounded-md bg-card py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none`}>
      {children}
    </div>
  );
};

const DropdownMenuItem = ({ 
  children, 
  onClick,
  className 
}: { 
  children: React.ReactNode; 
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent ${className || ""}`}
    >
      {children}
    </button>
  );
};

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
