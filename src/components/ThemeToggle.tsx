import { forwardRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';

export const ThemeToggle = forwardRef<HTMLButtonElement, object>(
  function ThemeToggle(_, ref) {
    const { theme, toggleTheme } = useTheme();

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="h-10 w-10 rounded-full"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? (
          <Moon className="h-5 w-5" />
        ) : (
          <Sun className="h-5 w-5" />
        )}
      </Button>
    );
  }
);
