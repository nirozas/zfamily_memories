import { cn } from '../../lib/utils';
import React from 'react';

interface SliderProps {
    value: number[];
    min: number;
    max: number;
    step?: number;
    onValueChange: (value: number[]) => void;
    className?: string;
    disabled?: boolean;
    orientation?: 'horizontal' | 'vertical';
}

export function Slider({ value, min, max, step = 1, onValueChange, className, disabled, orientation = 'horizontal' }: SliderProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;
        onValueChange([parseFloat(e.target.value)]);
    };

    const percentage = ((value[0] - min) / (max - min)) * 100;

    const isVertical = orientation === 'vertical';

    return (
        <div
            className={cn(
                "relative flex items-center group",
                isVertical ? "h-full w-4 flex-col justify-center" : "w-full h-4",
                className,
                disabled && "opacity-50 grayscale pointer-events-none"
            )}
        >
            {/* Track */}
            <div className={cn(
                "absolute bg-gray-200 rounded-full overflow-hidden",
                isVertical ? "w-1.5 h-full" : "w-full h-1.5"
            )}>
                <div
                    className={cn(
                        "bg-catalog-accent transition-all duration-75 shadow-[0_0_10px_rgba(194,65,12,0.3)]",
                        isVertical ? "w-full" : "h-full"
                    )}
                    style={{
                        [isVertical ? 'height' : 'width']: `${percentage}%`,
                        [isVertical ? 'bottom' : 'left']: 0,
                        position: 'absolute'
                    }}
                />
            </div>

            {/* Hidden Input */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value[0]}
                onChange={handleChange}
                disabled={disabled}
                className={cn(
                    "absolute opacity-0 z-10",
                    isVertical ? "h-full w-full" : "w-full h-full",
                    !disabled && "cursor-pointer"
                )}
                style={{
                    writingMode: isVertical ? 'vertical-lr' : undefined,
                    direction: isVertical ? 'rtl' : undefined
                }}
            />

            {/* Thumb */}
            <div
                className="absolute w-4 h-4 bg-white border-2 border-catalog-accent rounded-full shadow-lg pointer-events-none transition-all group-hover:scale-110 z-20 flex items-center justify-center p-0.5"
                style={{
                    [isVertical ? 'bottom' : 'left']: `calc(${percentage}% - 8px)`,
                    [isVertical ? 'left' : 'top']: '50%',
                    transform: isVertical ? 'translateX(-50%)' : 'translateY(-50%)'
                }}
            >
                <div className="w-1 h-1 bg-catalog-accent rounded-full" />
            </div>
        </div>
    );
}
