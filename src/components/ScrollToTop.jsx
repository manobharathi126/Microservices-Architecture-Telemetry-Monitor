// ============================================================
// ScrollToTop Component
// ============================================================
import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Floating scroll-to-top button that appears after scrolling down
 */
const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = document.querySelector('.page-content');
    if (!container) return;

    const handleScroll = () => {
      setVisible(container.scrollTop > 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const container = document.querySelector('.page-content');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        width: 44,
        height: 44,
        background: 'var(--gradient-primary)',
        border: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
        zIndex: 999,
        animation: 'fadeIn 0.3s ease',
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <ArrowUp size={18} color="white" />
    </button>
  );
};

export default ScrollToTop;
