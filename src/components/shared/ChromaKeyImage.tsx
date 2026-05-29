import React, { useRef, useEffect, useState } from 'react';

interface ChromaKeyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    chromaKeyColors?: string[];
    chromaKeyTolerance?: number;
}

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

export const ChromaKeyImage: React.FC<ChromaKeyImageProps> = ({ 
    chromaKeyColors, 
    chromaKeyTolerance = 30, 
    src,
    crossOrigin = "anonymous",
    ...props 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!src || !chromaKeyColors || chromaKeyColors.length === 0) return;

        const img = new Image();
        img.crossOrigin = crossOrigin as string;
        img.src = src;

        img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const targets = chromaKeyColors.map(c => hexToRgb(c)).filter(Boolean);

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                if (a === 0) continue;

                for (const target of targets) {
                    if (!target) continue;
                    const dist = Math.sqrt(
                        Math.pow(r - target.r, 2) +
                        Math.pow(g - target.g, 2) +
                        Math.pow(b - target.b, 2)
                    );
                    if (dist < chromaKeyTolerance) {
                        data[i + 3] = 0; // Make transparent
                        break;
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
            setIsLoaded(true);
        };
    }, [src, chromaKeyColors, chromaKeyTolerance, crossOrigin]);

    // If no chroma key is needed, just render a standard image
    if (!chromaKeyColors || chromaKeyColors.length === 0) {
        return <img src={src} crossOrigin={crossOrigin as any} {...props} />;
    }

    // Render a canvas that behaves like an image
    return (
        <canvas
            ref={canvasRef}
            className={props.className}
            style={{
                ...props.style,
                opacity: isLoaded ? props.style?.opacity ?? 1 : 0,
                transition: 'opacity 0.3s'
            }}
            onClick={props.onClick as any}
            draggable={props.draggable}
        />
    );
};
