// ============================================================
// ThemeContext.jsx — Dark / Light Theme State & Management
// ============================================================
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('telemetry_theme') || 'dark';
  });

  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('telemetry_accent') || '#6366f1';
  });

  const [compactMode, setCompactMode] = useState(() => {
    return localStorage.getItem('telemetry_compact') === 'true';
  });

  const [animations, setAnimations] = useState(() => {
    return localStorage.getItem('telemetry_animations') !== 'false';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('telemetry_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-primary', accentColor);
    document.documentElement.style.setProperty(
      '--gradient-primary',
      `linear-gradient(135deg, ${accentColor} 0%, #8b5cf6 100%)`
    );
    localStorage.setItem('telemetry_accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.body.classList.toggle('compact-mode', compactMode);
    localStorage.setItem('telemetry_compact', String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    document.body.classList.toggle('no-animations', !animations);
    localStorage.setItem('telemetry_animations', String(animations));
  }, [animations]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const resetAppearance = () => {
    setTheme('dark');
    setAccentColor('#6366f1');
    setCompactMode(false);
    setAnimations(true);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
        accentColor,
        setAccentColor,
        compactMode,
        setCompactMode,
        animations,
        setAnimations,
        resetAppearance,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
