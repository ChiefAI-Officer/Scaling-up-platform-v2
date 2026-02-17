"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Animated wrapper components for server-rendered pages.
 * Import these in server components to add entrance animations.
 */

/** Fade-up entrance for page sections */
export function FadeUp({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Fade-in entrance */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Scale-in entrance for cards and modals */
export function ScaleIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const staggerContainerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const staggerItemVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/** Stagger container — children animate in sequence */
export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="initial"
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Stagger item — use inside StaggerContainer */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/** Animated number counter */
export function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      {value}
    </motion.span>
  );
}

/** Hover card with lift effect */
export function HoverCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(className)}
      whileHover={{ y: -2, boxShadow: "0 8px 25px -5px rgb(0 0 0 / 0.1)" }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
