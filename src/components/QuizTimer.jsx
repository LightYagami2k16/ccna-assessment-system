import { useEffect, useMemo, useState } from 'react';

function calculateRemainingSeconds(expiresAt) {
  if (!expiresAt) {
    return 0;
  }

  const expirationTime = new Date(expiresAt).getTime();
  const currentTime = Date.now();

  return Math.max(
    0,
    Math.floor((expirationTime - currentTime) / 1000)
  );
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor(
    (safeSeconds % 3600) / 60
  );
  const seconds = safeSeconds % 60;

  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${String(hours).padStart(
      2,
      '0'
    )}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

export default function QuizTimer({
  expiresAt,
  onTimeExpired
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(
    () => calculateRemainingSeconds(expiresAt)
  );

  useEffect(() => {
    setRemainingSeconds(
      calculateRemainingSeconds(expiresAt)
    );
  }, [expiresAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRemainingSeconds(
        calculateRemainingSeconds(expiresAt)
      );
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (
      remainingSeconds === 0 &&
      typeof onTimeExpired === 'function'
    ) {
      onTimeExpired();
    }
  }, [remainingSeconds, onTimeExpired]);

  const timerClassName = useMemo(() => {
    if (remainingSeconds <= 60) {
      return 'quiz-timer quiz-timer--danger';
    }

    if (remainingSeconds <= 300) {
      return 'quiz-timer quiz-timer--warning';
    }

    return 'quiz-timer';
  }, [remainingSeconds]);

  return (
    <div
      className={timerClassName}
      role="timer"
      aria-live="polite"
    >
      <span>Time remaining</span>
      <strong>{formatTime(remainingSeconds)}</strong>
    </div>
  );
}