"use client";

import { useEffect, useRef } from "react";

export default function ThemeSphere() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frameId = 0;
    let gazeX = 0;
    let gazeY = 0;
    let targetGazeX = 0;
    let targetGazeY = 0;
    let blinkProgress = 0;
    let blinkDirection = 0;
    let idleBlinkTimer: ReturnType<typeof setTimeout> | null = null;

    const eyeColors = {
      foreground: "#f5f5f5",
      background: "#0a0a0a",
      muted: "#8a8a8a",
    };

    const triggerBlink = () => {
      if (blinkDirection !== 0 || blinkProgress > 0) return;
      blinkDirection = 1;
    };

    const scheduleIdleBlink = () => {
      if (idleBlinkTimer) clearTimeout(idleBlinkTimer);
      idleBlinkTimer = setTimeout(() => {
        triggerBlink();
        scheduleIdleBlink();
      }, 5000);
    };

    const handlePointerMove = (event: MouseEvent) => {
      const viewportWidth = Math.max(1, window.innerWidth);
      const viewportHeight = Math.max(1, window.innerHeight);

      const normalizedX = (event.clientX / viewportWidth) * 2 - 1;
      const normalizedY = (event.clientY / viewportHeight) * 2 - 1;

      targetGazeX = Math.max(-1, Math.min(1, normalizedX));
      targetGazeY = Math.max(-1, Math.min(1, normalizedY));
      scheduleIdleBlink();
    };

    const handlePointerLeaveWindow = () => {
      targetGazeX = 0;
      targetGazeY = 0;
    };

    const handleEyeClick = () => {
      triggerBlink();
      scheduleIdleBlink();
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseleave", handlePointerLeaveWindow);
    canvas.addEventListener("click", handleEyeClick);
    scheduleIdleBlink();

    const draw = () => {
      const { width, height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      const eyeRadius = Math.min(width, height) * 0.28;
      const irisRadius = eyeRadius * 0.45;
      const pupilRadius = irisRadius * 0.45;
      const { foreground, background, muted } = eyeColors;

      gazeX += (targetGazeX - gazeX) * 0.08;
      gazeY += (targetGazeY - gazeY) * 0.08;

      if (blinkDirection !== 0) {
        blinkProgress += blinkDirection * 0.16;
        if (blinkProgress >= 1) {
          blinkProgress = 1;
          blinkDirection = -1;
        } else if (blinkProgress <= 0) {
          blinkProgress = 0;
          blinkDirection = 0;
        }
      }

      const eyelidOpen = 1 - blinkProgress;
      const gazeDistanceX = Math.max(0, eyeRadius - irisRadius - 4);
      const gazeDistanceY = Math.max(0, eyeRadius * 0.5 - irisRadius - 2);
      const irisX = centerX + gazeX * gazeDistanceX;
      const irisY = centerY + gazeY * gazeDistanceY;
      const lidHeight = Math.max(4, eyeRadius * Math.max(0.08, eyelidOpen));
      const leftX = centerX - eyeRadius;
      const rightX = centerX + eyeRadius;
      const topY = centerY;
      const bottomY = centerY;
      const topControlY = centerY - lidHeight * 1.35;
      const bottomControlY = centerY + lidHeight * 1.2;

      context.clearRect(0, 0, width, height);

      context.save();
      context.beginPath();
      context.moveTo(leftX, topY);
      context.quadraticCurveTo(centerX, topControlY, rightX, topY);
      context.quadraticCurveTo(centerX, bottomControlY, leftX, bottomY);
      context.closePath();
      context.clip();

      context.fillStyle = foreground;
      context.beginPath();
      context.moveTo(leftX, topY);
      context.quadraticCurveTo(centerX, topControlY, rightX, topY);
      context.quadraticCurveTo(centerX, bottomControlY, leftX, bottomY);
      context.closePath();
      context.fill();

      const irisGradient = context.createRadialGradient(
        irisX - irisRadius * 0.25,
        irisY - irisRadius * 0.25,
        irisRadius * 0.1,
        irisX,
        irisY,
        irisRadius
      );
      irisGradient.addColorStop(0, muted);
      irisGradient.addColorStop(1, background);

      context.fillStyle = irisGradient;
      context.beginPath();
      context.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = background;
      context.beginPath();
      context.arc(irisX, irisY, pupilRadius, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = foreground;
      context.globalAlpha = 0.9;
      context.beginPath();
      context.arc(irisX - pupilRadius * 0.35, irisY - pupilRadius * 0.35, pupilRadius * 0.28, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;

      context.restore();

      context.strokeStyle = muted;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(leftX, topY);
      context.quadraticCurveTo(centerX, topControlY, rightX, topY);
      context.stroke();

      context.lineWidth = 2.4;
      context.beginPath();
      context.moveTo(leftX, bottomY);
      context.quadraticCurveTo(centerX, bottomControlY, rightX, bottomY);
      context.stroke();

      frameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (idleBlinkTimer) clearTimeout(idleBlinkTimer);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseleave", handlePointerLeaveWindow);
      canvas.removeEventListener("click", handleEyeClick);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="p-0">
      <canvas
        ref={canvasRef}
        width={220}
        height={220}
        className="block h-[170px] w-[170px] cursor-pointer sm:h-[220px] sm:w-[220px]"
        aria-label="Interactive eye"
      />
    </div>
  );
}
