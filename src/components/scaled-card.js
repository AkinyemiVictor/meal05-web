"use client";

import { useEffect, useRef } from "react";

export default function ScaledCard({ children, baseWidth = 220 }) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return undefined;

    const resize = () => {
      const scale = Math.min(1, frame.clientWidth / baseWidth);
      canvas.style.transform = `scale(${scale})`;
      frame.style.height = `${Math.ceil(canvas.scrollHeight * scale)}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    observer.observe(canvas);
    window.addEventListener("resize", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [baseWidth]);

  return (
    <div ref={frameRef} className="relative min-w-0 overflow-visible">
      <div
        ref={canvasRef}
        className="absolute left-0 top-0"
        style={{ width: `${baseWidth}px`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
