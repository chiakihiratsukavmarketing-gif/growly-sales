import type { ReactNode } from 'react';

type InfoBannerVariant = 'info' | 'warn' | 'success' | 'danger';

interface InfoBannerProps {
  variant?: InfoBannerVariant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<InfoBannerVariant, string> = {
  info: 'info-banner info',
  warn: 'info-banner warn',
  success: 'info-banner success',
  danger: 'info-banner danger',
};

export function InfoBanner({ variant = 'info', children }: InfoBannerProps) {
  return <div className={VARIANT_CLASS[variant]}>{children}</div>;
}
