import React from 'react';

/**
 * HudIcons Component
 * 
 * Provides SVG-based icons for the game HUD (Hearts and Coins).
 * SVGs ensure perfect transparency and crisp scaling across all devices.
 */

export const HeartIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="heartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#ff4b4b', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#ff0000', stopOpacity: 1 }} />
            </linearGradient>
            <filter id="heartShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
                <feOffset dx="1" dy="1" result="offsetblur" />
                <feComponentTransfer>
                    <feFuncA type="linear" slope="0.5" />
                </feComponentTransfer>
                <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="url(#heartGradient)"
            filter="url(#heartShadow)"
        />
    </svg>
);

export const HeartEmptyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <path
            d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
            fill="rgba(255, 255, 255, 0.4)"
            stroke="rgba(255, 255, 255, 0.8)"
            strokeWidth="0.5"
        />
    </svg>
);

export const CoinIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="coinGradient" cx="50%" cy="50%" r="50%" fx="30%" fy="30%">
                <stop offset="0%" style={{ stopColor: '#ffeb3b', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#fbc02d', stopOpacity: 1 }} />
            </radialGradient>
            <filter id="coinShadow">
                <feDropShadow dx="1" dy="1" stdDeviation="0.5" floodOpacity="0.5" />
            </filter>
        </defs>
        <circle cx="12" cy="12" r="10" fill="url(#coinGradient)" filter="url(#coinShadow)" stroke="#d4af37" strokeWidth="1" />
        <text
            x="12"
            y="16"
            fontSize="12"
            fontWeight="900"
            textAnchor="middle"
            fill="#d4af37"
            style={{ fontFamily: 'Arial Black, sans-serif' }}
        >
            $
        </text>
    </svg>
);
