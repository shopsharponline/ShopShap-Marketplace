export default function BagMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bagGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <path
        d="M17 17v-3.5a7 7 0 0 1 14 0V17"
        fill="none"
        stroke="url(#bagGrad)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M9.5 15.5h29a1.5 1.5 0 0 1 1.5 1.65l-2.6 24A5 5 0 0 1 32.44 45.5H15.56a5 5 0 0 1-4.97-4.35l-2.6-24A1.5 1.5 0 0 1 9.5 15.5Z"
        fill="url(#bagGrad)"
      />
      <circle cx="16.5" cy="21" r="1.8" fill="#ffffff" opacity="0.95" />
      <circle cx="31.5" cy="21" r="1.8" fill="#ffffff" opacity="0.95" />
      <text
        x="24"
        y="38"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="22"
        fill="#ffffff"
      >
        S
      </text>
    </svg>
  );
}
