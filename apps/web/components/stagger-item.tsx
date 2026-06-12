"use client";

import { motion } from "framer-motion";

// Same entrance values as activity-feed rows so list reveals feel uniform.
export function StaggerItem({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: Math.min(index * 0.03, 0.18),
        type: "spring",
        stiffness: 400,
        damping: 28,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
