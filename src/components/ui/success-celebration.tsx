'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessCelebrationProps {
  message: string;
  className?: string;
  showSparkles?: boolean;
}

export function SuccessCelebration({ message, className, showSparkles = true }: Readonly<SuccessCelebrationProps>) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  const containerVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 } };

  const iconVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { scale: 0 }, animate: { scale: 1 } };

  const sparkleVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, scale: 0 }, animate: { opacity: 1, scale: 1 } };

  return (
    <motion.div
      initial={containerVariants.initial}
      animate={containerVariants.animate}
      transition={shouldReduceMotion ? {} : {
        type: "spring",
        stiffness: 300,
        damping: 20,
        duration: 0.5
      }}
      className={cn(
        "flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg text-primary",
        className
      )}
    >
      <motion.div
        initial={iconVariants.initial}
        animate={iconVariants.animate}
        transition={shouldReduceMotion ? {} : {
          type: "spring",
          stiffness: 400,
          damping: 10,
          delay: 0.1
        }}
      >
        <CheckCircle className="w-6 h-6" />
      </motion.div>

      <span className="font-medium">{message}</span>

      {showSparkles && (
        <motion.div
          initial={sparkleVariants.initial}
          animate={sparkleVariants.animate}
          transition={shouldReduceMotion ? {} : {
            type: "spring",
            stiffness: 300,
            damping: 15,
            delay: 0.3
          }}
          className="ml-auto"
        >
          <Sparkles className="w-5 h-5 text-primary/60" />
        </motion.div>
      )}
    </motion.div>
  );
}
