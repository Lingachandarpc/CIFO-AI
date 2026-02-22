'use client';

import { useEffect, useRef } from 'react';

export default function NanobotCanvas({ isActive }: { isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const getThemeColors = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const foreground = rootStyles.getPropertyValue('--foreground').trim() || '#ffffff';
      const muted = rootStyles.getPropertyValue('--muted').trim() || '#888888';
      const surface = rootStyles.getPropertyValue('--surface').trim() || '#111111';
      return { foreground, muted, surface };
    };

    let frameId = 0;
    let tick = 0;

    const draw = () => {
      tick += isActive ? 0.05 : 0.02;

      const { width, height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      const { foreground, muted, surface } = getThemeColors();

      context.clearRect(0, 0, width, height);
      context.fillStyle = surface;
      context.fillRect(0, 0, width, height);

      const coreRadius = 8 + Math.sin(tick * 2.4) * (isActive ? 2.5 : 1.2);
      const ringRadius = 14 + Math.sin(tick * 1.5) * (isActive ? 3 : 1.5);
      const orbitRadius = 20;

      context.strokeStyle = muted;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = foreground;
      context.beginPath();
      context.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      context.fill();

      const nodeCount = 3;
      for (let index = 0; index < nodeCount; index++) {
        const angle = tick * (isActive ? 2 : 1) + (Math.PI * 2 * index) / nodeCount;
        const nodeX = centerX + Math.cos(angle) * orbitRadius;
        const nodeY = centerY + Math.sin(angle) * orbitRadius;

        context.fillStyle = foreground;
        context.beginPath();
        context.arc(nodeX, nodeY, 2.5, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = muted;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(nodeX, nodeY);
        context.stroke();
      }

      frameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isActive]);

  return (
    <div className="w-fit rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">Nanobot</div>
      <canvas ref={canvasRef} width={72} height={72} className="block" aria-label="Nanobot canvas visualization" />
    </div>
  );
}
