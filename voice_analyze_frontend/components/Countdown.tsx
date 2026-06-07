import React, { useEffect, useState, useRef } from "react";

interface CountdownProps {
  isActive: boolean;
  onComplete: () => void;
  duration?: number; // Countdown duration in seconds (default: 5)
  showAudioCue?: boolean; // Whether to play beep sound
  onCancel?: () => void; // Optional cancel callback
}


/**
 * Countdown Component
 *
 * Displays a visual countdown (5-4-3-2-1) before starting practice mode.
 * Features:
 * - Large animated numbers
 * - Optional audio beep
 * - Auto-completes after countdown
 * - Can be cancelled
 */
const Countdown: React.FC<CountdownProps> = ({
  isActive,
  onComplete,
  duration = 5,
  showAudioCue = true,
  onCancel,
}) => {
  const [count, setCount] = useState(duration);
  const [isVisible, setIsVisible] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio context for beep sound
  useEffect(() => {
    if (showAudioCue && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("AudioContext not available, beep will be disabled:", e);
      }
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [showAudioCue]);

  // Play beep sound
  const playBeep = (frequency: number = 800, duration: number = 100) => {
    if (!showAudioCue || !audioContextRef.current) return;

    try {
      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + duration / 1000
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
      console.warn("Failed to play beep:", e);
    }
  };

  // Start countdown when active
  useEffect(() => {
    if (!isActive) {
      // Reset when not active
      setCount(duration);
      setIsVisible(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (beepTimeoutRef.current) {
        clearTimeout(beepTimeoutRef.current);
        beepTimeoutRef.current = null;
      }
      return;
    }

    // Show countdown
    setIsVisible(true);
    setCount(duration);

    // Play initial beep
    if (showAudioCue) {
      playBeep(600, 150); // Lower pitch for start
    }

    // Countdown interval
    intervalRef.current = setInterval(() => {
      setCount((prev) => {
        const nextCount = prev - 1;

        if (nextCount <= 0) {
          // Countdown complete - show "GO!" first
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          // Show "GO!" (count = 0)
          // Play final beep (higher pitch)
          if (showAudioCue) {
            playBeep(1000, 200); // Higher pitch for start
          }

          // Small delay before completing to show "GO!"
          setTimeout(() => {
            setIsVisible(false);
            onComplete();
          }, 500); // Slightly longer to see "GO!"

          return 0; // 0 triggers "GO!" display
        }

        // Play beep for each number
        if (showAudioCue) {
          playBeep(800, 100);
        }

        return nextCount;
      });
    }, 1000); // Update every second

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (beepTimeoutRef.current) {
        clearTimeout(beepTimeoutRef.current);
        beepTimeoutRef.current = null;
      }
    };
  }, [isActive, duration, onComplete, showAudioCue]);

  // Handle escape key to cancel
  useEffect(() => {
    if (!isActive || !isVisible || !onCancel) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isActive, isVisible, onCancel]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm'>
      <div className='relative'>
        {/* Countdown Number */}
        <div
          className={`text-9xl font-bold text-white transition-all duration-300 ${
            count > 0 ? "scale-100 opacity-100" : "scale-110 opacity-100"
          }`}
          style={{
            textShadow: "0 0 40px rgba(255, 255, 255, 0.5)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {count > 0 ? count : "GO!"}
        </div>

        {/* Cancel button */}
        {onCancel && (
          <button
            onClick={onCancel}
            className='absolute w-[100px] -bottom-16 left-1/2 transform -translate-x-1/2 px-4 py-2 text-sm text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors'
          >
            Press ESC to cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default Countdown;
