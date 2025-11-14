import { motion } from "motion/react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  // Initialize from localStorage or system preference
  const getInitialTheme = () => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const [theme, setTheme] = useState<string>(getInitialTheme);

  // Apply theme to document and save to localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ✅ Auto-sync with OS preference
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      // Only auto-switch if user hasn't manually chosen
      if (!localStorage.getItem("theme")) {
        setTheme(media.matches ? "dark" : "light");
      }
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return (
    <motion.button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="theme-toggle"
      aria-label="Toggle color scheme"
      whileHover={{cursor: 'pointer'}}
    >
      {theme === "dark" ? "🌞" : "🌙"}
    </motion.button>
  );
}
