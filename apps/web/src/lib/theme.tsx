import { Moon, Sun } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("bf-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("bf-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
