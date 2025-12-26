/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}',
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                // Maxton theme palette
                primary: {
                    DEFAULT: "#7c3aed", // purple
                    foreground: "#ffffff",
                },
                secondary: {
                    DEFAULT: "#3b82f6", // blue
                    foreground: "#ffffff",
                },
                accent: {
                    DEFAULT: "#f59e0b", // amber/orange
                    foreground: "#ffffff",
                },
                background: "#0f172a", // dark slate
                foreground: "#e2e8f0", // light slate
                card: {
                    DEFAULT: "#1e293b",
                    foreground: "#e2e8f0",
                },
                border: "#334155",
                input: "#1e293b",
                ring: "#7c3aed",
                destructive: {
                    DEFAULT: "#ef4444",
                    foreground: "#ffffff",
                },
                muted: {
                    DEFAULT: "#64748b",
                    foreground: "#e2e8f0",
                },
                popover: {
                    DEFAULT: "#1e293b",
                    foreground: "#e2e8f0",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
}
